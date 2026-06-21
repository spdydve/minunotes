import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const tempDirs: string[] = [];

async function runMigrations(libsql: { executeMultiple: (sql: string) => Promise<unknown> }) {
  for (let index = 0; index <= 20; index += 1) {
    const [file] = await Array.fromAsync((await import("node:fs/promises")).glob(`drizzle/${String(index).padStart(4, "0")}_*.sql`));
    if (!file) throw new Error(`Missing migration ${index}`);
    await libsql.executeMultiple(await readFile(file, "utf8"));
  }
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function setupApp() {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), "notes-oauth-"));
  tempDirs.push(dir);
  vi.stubEnv("TURSO_DB_URL", `file:${path.join(dir, "test.db")}`);

  const [{ db, libsql }, schema, { oauthRoutes }, { harnessRoutes }, { harnessAuthenticationMiddleware }, { hashOAuthToken }] = await Promise.all([
    import("../src/api/db/client"),
    import("../src/api/db/schema"),
    import("../src/api/routes/oauth"),
    import("../src/api/routes/harness"),
    import("../src/api/middleware/authentication"),
    import("../src/api/lib/oauth"),
  ]);

  await runMigrations(libsql);

  const user = { id: "user_a", name: "User A", email: "a@example.com", emailVerified: true, image: null, createdAt: new Date(), updatedAt: new Date() };
  await db.insert(schema.user).values(user);
  await db.insert(schema.oauthClients).values({
    id: "client_a",
    name: "Client A",
    description: "Test client",
    redirectUris: JSON.stringify(["https://client.example/callback"]),
    clientType: "public",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", user);
    c.set("session", { id: "session_user_a", userId: user.id });
    c.set("apiKey", null);
    await next();
  });
  app.route("/api/oauth", oauthRoutes);

  const authApp = new Hono();
  authApp.use("/api/harness/*", harnessAuthenticationMiddleware);
  authApp.route("/api/harness", harnessRoutes);

  return { app, authApp, db, schema, user, hashOAuthToken };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("oauth foundations", () => {
  it("uses bearer tokens for harness access with API-key-style permissions", async () => {
    const { authApp, db, schema, user, hashOAuthToken } = await setupApp();
    const token = "mnoac_test_token";
    const publicFolder = { id: "folder_public", userId: user.id, parentFolderId: null, title: "Public", isPrivate: false, isAgentReadOnly: false, createdAt: new Date(), updatedAt: new Date() };
    const privateFolder = { id: "folder_private", userId: user.id, parentFolderId: null, title: "Private", isPrivate: true, isAgentReadOnly: false, createdAt: new Date(), updatedAt: new Date() };
    await db.insert(schema.folders).values([publicFolder, privateFolder]);
    const [authorization] = await db.insert(schema.oauthAuthorizations).values({
      id: "oauth_auth_all",
      userId: user.id,
      clientId: "client_a",
      scope: "notes",
      accessMode: "all",
      canRead: true,
      canCreate: false,
      canEdit: false,
      canCreateFolders: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    await db.insert(schema.oauthTokens).values({
      id: "oauth_token_all",
      authorizationId: authorization.id,
      accessTokenHash: hashOAuthToken(token),
      refreshTokenHash: hashOAuthToken("refresh"),
      scope: "notes",
      accessTokenExpiresAt: new Date(Date.now() + 60_000),
      refreshTokenExpiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const folders = await authApp.request("/api/harness/folders", { headers: { authorization: `Bearer ${token}` } });
    expect(folders.status).toBe(200);
    const foldersBody = await folders.json() as { folders: Array<{ id: string }> };
    expect(foldersBody.folders.map((folder) => folder.id)).toContain(publicFolder.id);
    expect(foldersBody.folders.map((folder) => folder.id)).not.toContain(privateFolder.id);

    const createNote = await authApp.request("/api/harness/notes", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ folderId: publicFolder.id, title: "Blocked" }),
    });
    expect(createNote.status).toBe(403);
  });

  it("lists and revokes connected apps", async () => {
    const { app, db, schema, user } = await setupApp();
    await db.insert(schema.oauthAuthorizations).values({
      id: "oauth_auth_connected",
      userId: user.id,
      clientId: "client_a",
      scope: "notes",
      accessMode: "specific",
      canRead: true,
      canCreate: false,
      canEdit: false,
      canCreateFolders: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const list = await app.request("/api/oauth/authorizations");
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({ authorizations: [{ id: "oauth_auth_connected", client: { name: "Client A" } }] });

    const revoke = await app.request("/api/oauth/authorizations/oauth_auth_connected", { method: "DELETE" });
    expect(revoke.status).toBe(200);

    const after = await app.request("/api/oauth/authorizations");
    const afterBody = await after.json() as { authorizations: Array<{ id: string; revokedAt: string | null }> };
    expect(afterBody.authorizations.find((authorization) => authorization.id === "oauth_auth_connected")?.revokedAt).toBeTruthy();
  });

  it("serves authorization server metadata", async () => {
    const { app } = await setupApp();
    const response = await app.request("/api/oauth/.well-known/oauth-authorization-server");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_endpoint: "http://localhost/api/oauth/authorize",
      token_endpoint: "http://localhost/api/oauth/token",
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("exchanges an authorization code with PKCE and revokes a token", async () => {
    const { app } = await setupApp();
    const verifier = "a".repeat(64);
    const authorize = await app.request(`/api/oauth/authorize?response_type=code&client_id=client_a&redirect_uri=${encodeURIComponent("https://client.example/callback")}&code_challenge=${encodeURIComponent(pkceChallenge(verifier))}&code_challenge_method=S256&state=abc`);
    expect(authorize.status).toBe(302);
    const location = authorize.headers.get("location");
    expect(location).toBeTruthy();
    const redirected = new URL(location!);
    expect(redirected.searchParams.get("state")).toBe("abc");
    const code = redirected.searchParams.get("code");
    expect(code).toBeTruthy();

    const token = await app.request("/api/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: "client_a", redirect_uri: "https://client.example/callback", code: code!, code_verifier: verifier }),
    });
    expect(token.status).toBe(200);
    const tokenBody = await token.json() as { access_token: string; refresh_token: string; token_type: string };
    expect(tokenBody.token_type).toBe("Bearer");
    expect(tokenBody.access_token).toMatch(/^mnoac_/);
    expect(tokenBody.refresh_token).toMatch(/^mnort_/);

    const reuse = await app.request("/api/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: "client_a", redirect_uri: "https://client.example/callback", code: code!, code_verifier: verifier }),
    });
    expect(reuse.status).toBe(400);

    const revoke = await app.request("/api/oauth/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: tokenBody.access_token }),
    });
    expect(revoke.status).toBe(200);
  });
});
