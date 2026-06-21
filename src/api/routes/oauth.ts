import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { db } from "../db/client";
import { oauthAuthorizationCodes, oauthAuthorizationFolderPermissions, oauthAuthorizations, oauthClients, oauthTokens, type ApiKey, type OAuthAuthorization } from "../db/schema";
import { auth } from "../lib/auth";
import { AUTHORIZATION_CODE_TTL_MS, ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS, findOAuthClient, generateOAuthToken, hashOAuthToken, isRedirectUriAllowed, oauthError, verifyPkce } from "../lib/oauth";
import { createId } from "../lib/id";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  apiKey: ApiKey | null;
  oauthAuthorization: OAuthAuthorization | null;
};

export const oauthRoutes = new Hono<{ Variables: Variables }>();

function getOrigin(c: Context<{ Variables: Variables }>) {
  return new URL(c.req.url).origin;
}

function textParam(value: FormDataEntryValue | string | undefined | null) {
  return typeof value === "string" ? value : undefined;
}

function appendErrorRedirect(redirectUri: string, error: string, state?: string | null) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

oauthRoutes.get("/.well-known/oauth-authorization-server", (c) => {
  const issuer = getOrigin(c);
  return c.json({
    issuer,
    authorization_endpoint: `${issuer}/api/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

oauthRoutes.get("/authorizations", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const rows = await db.select({ authorization: oauthAuthorizations, client: oauthClients }).from(oauthAuthorizations)
    .innerJoin(oauthClients, eq(oauthAuthorizations.clientId, oauthClients.id))
    .where(eq(oauthAuthorizations.userId, user.id))
    .orderBy(desc(oauthAuthorizations.createdAt));
  const permissions = await db.select().from(oauthAuthorizationFolderPermissions)
    .innerJoin(oauthAuthorizations, eq(oauthAuthorizationFolderPermissions.authorizationId, oauthAuthorizations.id))
    .where(eq(oauthAuthorizations.userId, user.id));

  return c.json({
    authorizations: rows.map((row) => ({
      ...row.authorization,
      client: row.client,
      permissions: permissions.filter((permission) => permission.oauth_authorization_folder_permissions.authorizationId === row.authorization.id).map((permission) => permission.oauth_authorization_folder_permissions),
    })),
  });
});

oauthRoutes.delete("/authorizations/:authorizationId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const now = new Date();
  const [authorization] = await db.update(oauthAuthorizations).set({ revokedAt: now, updatedAt: now })
    .where(and(eq(oauthAuthorizations.id, c.req.param("authorizationId")), eq(oauthAuthorizations.userId, user.id), isNull(oauthAuthorizations.revokedAt)))
    .returning({ id: oauthAuthorizations.id });
  if (!authorization) return c.json({ error: "Connected app not found" }, 404);
  await db.update(oauthTokens).set({ revokedAt: now, updatedAt: now }).where(eq(oauthTokens.authorizationId, authorization.id));
  return c.json({ ok: true });
});

oauthRoutes.get("/authorize", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const clientId = c.req.query("client_id");
  const redirectUri = c.req.query("redirect_uri");
  const responseType = c.req.query("response_type");
  const codeChallenge = c.req.query("code_challenge");
  const codeChallengeMethod = c.req.query("code_challenge_method");
  const state = c.req.query("state") ?? null;
  const scope = c.req.query("scope") ?? "";

  if (responseType !== "code") return c.json(oauthError("unsupported_response_type"), 400);
  if (!clientId || !redirectUri || !codeChallenge) return c.json(oauthError("invalid_request", "client_id, redirect_uri, and code_challenge are required"), 400);
  if (codeChallengeMethod !== "S256") return c.json(oauthError("invalid_request", "Only S256 PKCE is supported"), 400);

  const client = await findOAuthClient(clientId);
  if (!client) return c.json(oauthError("invalid_client"), 400);
  if (!isRedirectUriAllowed(client, redirectUri)) return c.json(oauthError("invalid_request", "redirect_uri is not registered for this client"), 400);

  const now = new Date();
  const [authorization] = await db.insert(oauthAuthorizations).values({
    id: createId("oauth_auth"),
    userId: user.id,
    clientId,
    scope,
    accessMode: "specific",
    canRead: true,
    canCreate: false,
    canEdit: false,
    canCreateFolders: false,
    createdAt: now,
    updatedAt: now,
  }).returning();

  const code = generateOAuthToken("mnocd");
  await db.insert(oauthAuthorizationCodes).values({
    id: createId("oauth_code"),
    codeHash: hashOAuthToken(code),
    clientId,
    userId: user.id,
    redirectUri,
    scope,
    codeChallenge,
    codeChallengeMethod,
    authorizationId: authorization.id,
    expiresAt: new Date(now.getTime() + AUTHORIZATION_CODE_TTL_MS),
    createdAt: now,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  return c.redirect(url.toString(), 302);
});

oauthRoutes.post("/token", async (c) => {
  const body = await c.req.parseBody().catch(() => null);
  if (!body) return c.json(oauthError("invalid_request"), 400);

  const grantType = textParam(body.grant_type);
  if (grantType === "authorization_code") return exchangeAuthorizationCode(c, body);
  if (grantType === "refresh_token") return refreshAccessToken(c, body);
  return c.json(oauthError("unsupported_grant_type"), 400);
});

oauthRoutes.post("/revoke", async (c) => {
  const body = await c.req.parseBody().catch(() => null);
  const token = body ? textParam(body.token) : null;
  if (!token) return c.json(oauthError("invalid_request", "token is required"), 400);

  const tokenHash = hashOAuthToken(token);
  const now = new Date();
  await db.update(oauthTokens).set({ revokedAt: now, updatedAt: now }).where(eq(oauthTokens.accessTokenHash, tokenHash));
  await db.update(oauthTokens).set({ revokedAt: now, updatedAt: now }).where(eq(oauthTokens.refreshTokenHash, tokenHash));
  return c.body(null, 200);
});

async function exchangeAuthorizationCode(c: Context<{ Variables: Variables }>, body: Record<string, FormDataEntryValue | string>) {
  const code = textParam(body.code);
  const clientId = textParam(body.client_id);
  const redirectUri = textParam(body.redirect_uri);
  const verifier = textParam(body.code_verifier);
  if (!code || !clientId || !redirectUri || !verifier) return c.json(oauthError("invalid_request", "code, client_id, redirect_uri, and code_verifier are required"), 400);

  const [row] = await db.select().from(oauthAuthorizationCodes)
    .where(and(eq(oauthAuthorizationCodes.codeHash, hashOAuthToken(code)), eq(oauthAuthorizationCodes.clientId, clientId), eq(oauthAuthorizationCodes.redirectUri, redirectUri), isNull(oauthAuthorizationCodes.usedAt)))
    .limit(1);
  if (!row || row.expiresAt.getTime() <= Date.now()) return c.json(oauthError("invalid_grant"), 400);
  if (!verifyPkce({ verifier, challenge: row.codeChallenge, method: row.codeChallengeMethod })) return c.json(oauthError("invalid_grant", "PKCE verification failed"), 400);

  const now = new Date();
  await db.update(oauthAuthorizationCodes).set({ usedAt: now }).where(eq(oauthAuthorizationCodes.id, row.id));
  return issueTokens(c, row.authorizationId, row.scope, now);
}

async function refreshAccessToken(c: Context<{ Variables: Variables }>, body: Record<string, FormDataEntryValue | string>) {
  const refreshToken = textParam(body.refresh_token);
  if (!refreshToken) return c.json(oauthError("invalid_request", "refresh_token is required"), 400);

  const [token] = await db.select().from(oauthTokens)
    .where(and(eq(oauthTokens.refreshTokenHash, hashOAuthToken(refreshToken)), isNull(oauthTokens.revokedAt)))
    .limit(1);
  if (!token || token.refreshTokenExpiresAt.getTime() <= Date.now()) return c.json(oauthError("invalid_grant"), 400);

  const now = new Date();
  await db.update(oauthTokens).set({ revokedAt: now, updatedAt: now }).where(eq(oauthTokens.id, token.id));
  return issueTokens(c, token.authorizationId, token.scope, now);
}

async function issueTokens(c: Context<{ Variables: Variables }>, authorizationId: string, scope: string, now: Date) {
  const accessToken = generateOAuthToken("mnoac");
  const refreshToken = generateOAuthToken("mnort");
  const accessTokenExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_MS);
  const refreshTokenExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);

  await db.insert(oauthTokens).values({
    id: createId("oauth_token"),
    authorizationId,
    accessTokenHash: hashOAuthToken(accessToken),
    refreshTokenHash: hashOAuthToken(refreshToken),
    scope,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    createdAt: now,
    updatedAt: now,
  });
  await db.update(oauthAuthorizations).set({ lastUsedAt: now, updatedAt: now }).where(eq(oauthAuthorizations.id, authorizationId));

  return c.json({
    token_type: "Bearer",
    access_token: accessToken,
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope,
  });
}
