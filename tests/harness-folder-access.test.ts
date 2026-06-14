import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

type TestContext = Awaited<ReturnType<typeof setupHarnessApp>>;

const tempDirs: string[] = [];

async function runMigrations(libsql: { executeMultiple: (sql: string) => Promise<unknown> }) {
  for (let index = 0; index <= 13; index += 1) {
    const [file] = await Array.fromAsync((await import("node:fs/promises")).glob(`drizzle/${String(index).padStart(4, "0")}_*.sql`));
    if (!file) throw new Error(`Missing migration ${index}`);
    await libsql.executeMultiple(await readFile(file, "utf8"));
  }
}

async function setupHarnessApp(input: { canCreateFolders: boolean; accessMode?: "all" | "selected" }) {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), "notes-harness-folders-"));
  tempDirs.push(dir);
  vi.stubEnv("TURSO_DB_URL", `file:${path.join(dir, "test.db")}`);

  const [{ db, libsql }, schema, { harnessRoutes }] = await Promise.all([
    import("../src/api/db/client"),
    import("../src/api/db/schema"),
    import("../src/api/routes/harness"),
  ]);

  await runMigrations(libsql);

  const user = { id: "user_test", name: "Test User", email: "test@example.com", emailVerified: true, image: null, createdAt: new Date(), updatedAt: new Date() };
  const apiKey = {
    id: "agent_key_test",
    userId: user.id,
    name: "Test key",
    uid: "ABCDEFGH",
    hash: "hash",
    salt: "salt",
    canCreateFolders: input.canCreateFolders,
    accessMode: input.accessMode ?? ("selected" as const),
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
  };

  await db.insert(schema.user).values(user);
  await db.insert(schema.apiKeys).values(apiKey);

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", user);
    c.set("session", null);
    c.set("apiKey", apiKey);
    await next();
  });
  app.route("/api/harness", harnessRoutes);

  return { app, db, schema, apiKey };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("agent-created folder access", () => {
  it("rejects API keys without folder creation permission", async () => {
    const { app } = await setupHarnessApp({ canCreateFolders: false });

    const response = await app.request("/api/harness/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Agent Workspace" }),
    });

    expect(response.status).toBe(403);
  });

  it("auto-grants scoped permissions for folders created by an allowed API key", async () => {
    const { app, db, schema, apiKey } = await setupHarnessApp({ canCreateFolders: true });

    const createFolderResponse = await app.request("/api/harness/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Agent Workspace" }),
    });

    expect(createFolderResponse.status).toBe(201);
    const { folder } = await createFolderResponse.json() as { folder: { id: string; title: string } };
    expect(folder.title).toBe("Agent Workspace");

    const permissions = await db.select().from(schema.apiKeyFolderPermissions);
    expect(permissions).toEqual([
      expect.objectContaining({
        apiKeyId: apiKey.id,
        folderId: folder.id,
        canRead: true,
        canCreate: true,
        canEdit: true,
      }),
    ]);

    const createNoteResponse = await app.request("/api/harness/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: folder.id, title: "Agent note", content: "Created by agent" }),
    });

    expect(createNoteResponse.status).toBe(201);
    const { note } = await createNoteResponse.json() as { note: { folderId: string; title: string } };
    expect(note).toEqual(expect.objectContaining({ folderId: folder.id, title: "Agent note" }));
  });

  it("allows all-access keys to read non-private folders but excludes private folders", async () => {
    const { app, db, schema } = await setupHarnessApp({ canCreateFolders: true, accessMode: "all" });

    const publicFolder = { id: "folder_public", userId: "user_test", parentFolderId: null, title: "Public", isPrivate: false, createdAt: new Date(), updatedAt: new Date() };
    const privateFolder = { id: "folder_private", userId: "user_test", parentFolderId: null, title: "Private", isPrivate: true, createdAt: new Date(), updatedAt: new Date() };
    await db.insert(schema.folders).values([publicFolder, privateFolder]);

    const response = await app.request("/api/harness/folders");
    expect(response.status).toBe(200);
    const body = await response.json() as { folders: Array<{ id: string }> };
    expect(body.folders.map((folder) => folder.id)).toContain(publicFolder.id);
    expect(body.folders.map((folder) => folder.id)).not.toContain(privateFolder.id);
  });

  it("treats selected folder permissions as non-private branch access", async () => {
    const { app, db, schema, apiKey } = await setupHarnessApp({ canCreateFolders: false, accessMode: "selected" });

    const parent = { id: "folder_parent", userId: "user_test", parentFolderId: null, title: "Parent", isPrivate: false, createdAt: new Date(), updatedAt: new Date() };
    const child = { id: "folder_child", userId: "user_test", parentFolderId: parent.id, title: "Child", isPrivate: false, createdAt: new Date(), updatedAt: new Date() };
    const privateChild = { id: "folder_private_child", userId: "user_test", parentFolderId: parent.id, title: "Private child", isPrivate: true, createdAt: new Date(), updatedAt: new Date() };
    await db.insert(schema.folders).values([parent, child, privateChild]);
    await db.insert(schema.apiKeyFolderPermissions).values({
      id: "agent_perm_parent",
      apiKeyId: apiKey.id,
      folderId: parent.id,
      canRead: true,
      canCreate: true,
      canEdit: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await app.request("/api/harness/folders");
    expect(response.status).toBe(200);
    const body = await response.json() as { folders: Array<{ id: string }> };
    expect(body.folders.map((folder) => folder.id)).toContain(parent.id);
    expect(body.folders.map((folder) => folder.id)).toContain(child.id);
    expect(body.folders.map((folder) => folder.id)).not.toContain(privateChild.id);
  });
});
