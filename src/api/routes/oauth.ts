import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { db } from "../db/client";
import { oauthAuthorizationCodes, oauthAuthorizationFolderPermissions, oauthAuthorizations, oauthClients, oauthTokens, type ApiKey, type OAuthAuthorization } from "../db/schema";
import { auth } from "../lib/auth";
import { filterSelectablePermissionRows } from "../lib/folder-access";
import { AUTHORIZATION_CODE_TTL_MS, ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS, findOAuthClient, generateOAuthToken, hashOAuthToken, isRedirectUriAllowed, oauthError, validateDcrRedirectUri, validateOAuthRedirectUri, verifyPkce } from "../lib/oauth";
import { createId } from "../lib/id";
import { getApiRuntimeConfig } from "../lib/env";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  apiKey: ApiKey | null;
  oauthAuthorization: OAuthAuthorization | null;
};

export const oauthRoutes = new Hono<{ Variables: Variables }>();

const { frontendUrl } = getApiRuntimeConfig();

function getOrigin(c: Context<{ Variables: Variables }>) {
  return new URL(c.req.url).origin;
}

function textParam(value: FormDataEntryValue | string | undefined | null) {
  return typeof value === "string" ? value : undefined;
}

function authorizationServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}

function appendErrorRedirect(redirectUri: string, error: string, state?: string | null) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

async function validateAuthorizeRequest(input: { clientId?: string; redirectUri?: string; responseType?: string; codeChallenge?: string; codeChallengeMethod?: string }) {
  if (input.responseType !== "code") return { ok: false as const, status: 400 as const, error: oauthError("unsupported_response_type") };
  if (!input.clientId || !input.redirectUri || !input.codeChallenge) return { ok: false as const, status: 400 as const, error: oauthError("invalid_request", "client_id, redirect_uri, and code_challenge are required") };
  if (input.codeChallengeMethod !== "S256") return { ok: false as const, status: 400 as const, error: oauthError("invalid_request", "Only S256 PKCE is supported") };

  const client = await findOAuthClient(input.clientId);
  if (!client) return { ok: false as const, status: 400 as const, error: oauthError("invalid_client") };
  if (!isRedirectUriAllowed(client, input.redirectUri)) return { ok: false as const, status: 400 as const, error: oauthError("invalid_request", "redirect_uri is not registered for this client") };
  return { ok: true as const, client, redirectUri: input.redirectUri, clientId: input.clientId, codeChallenge: input.codeChallenge, codeChallengeMethod: input.codeChallengeMethod };
}

oauthRoutes.get("/.well-known/oauth-authorization-server", (c) => c.json(authorizationServerMetadata(getOrigin(c))));

oauthRoutes.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null) as { redirect_uris?: unknown; client_name?: unknown; token_endpoint_auth_method?: unknown; grant_types?: unknown; response_types?: unknown; scope?: unknown } | null;
  if (!body) return c.json(oauthError("invalid_client_metadata", "Invalid JSON"), 400);

  const redirectUris = Array.isArray(body.redirect_uris) ? [...new Set(body.redirect_uris.filter((uri): uri is string => typeof uri === "string").map((uri) => uri.trim()).filter(Boolean))] : [];
  if (redirectUris.length === 0) return c.json(oauthError("invalid_redirect_uri", "redirect_uris is required"), 400);
  for (const uri of redirectUris) {
    const result = validateDcrRedirectUri(uri);
    if (!result.ok) return c.json(oauthError("invalid_redirect_uri", result.error), 400);
  }

  const tokenEndpointAuthMethod = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  if (tokenEndpointAuthMethod !== "none") return c.json(oauthError("invalid_client_metadata", "Only token_endpoint_auth_method=none is supported"), 400);
  const grantTypes = Array.isArray(body.grant_types) ? body.grant_types.filter((value): value is string => typeof value === "string") : ["authorization_code", "refresh_token"];
  if (!grantTypes.includes("authorization_code")) return c.json(oauthError("invalid_client_metadata", "authorization_code grant is required"), 400);
  const responseTypes = Array.isArray(body.response_types) ? body.response_types.filter((value): value is string => typeof value === "string") : ["code"];
  if (!responseTypes.includes("code")) return c.json(oauthError("invalid_client_metadata", "code response type is required"), 400);

  const now = new Date();
  const clientName = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim() : "Dynamically registered MCP client";
  const [client] = await db.insert(oauthClients).values({
    id: createId("oauth_client"),
    userId: null,
    name: clientName,
    description: "Dynamically registered OAuth client",
    redirectUris: JSON.stringify(redirectUris),
    clientType: "public",
    createdAt: now,
    updatedAt: now,
  }).returning();

  return c.json({
    client_id: client.id,
    client_id_issued_at: Math.floor(now.getTime() / 1000),
    client_name: client.name,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: typeof body.scope === "string" ? body.scope : "notes.read notes.create notes.edit",
  }, 201);
});

oauthRoutes.get("/clients", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const clients = await db.select().from(oauthClients)
    .where(eq(oauthClients.userId, user.id))
    .orderBy(desc(oauthClients.createdAt));
  return c.json({ clients });
});

oauthRoutes.post("/clients", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null) as { name?: string; description?: string | null; redirectUris?: string[] } | null;
  const name = body?.name?.trim();
  if (!name) return c.json({ error: "App name is required" }, 400);
  const redirectUris = [...new Set((body?.redirectUris ?? []).map((uri) => uri.trim()).filter(Boolean))];
  if (redirectUris.length === 0) return c.json({ error: "At least one redirect URI is required" }, 400);
  for (const uri of redirectUris) {
    try {
      const result = validateOAuthRedirectUri(uri);
      if (!result.ok) return c.json({ error: result.error }, 400);
    } catch {
      return c.json({ error: "Redirect URIs must be valid URLs" }, 400);
    }
  }

  const now = new Date();
  const [client] = await db.insert(oauthClients).values({
    id: createId("oauth_client"),
    userId: user.id,
    name,
    description: body?.description?.trim() || null,
    redirectUris: JSON.stringify(redirectUris),
    clientType: "public",
    createdAt: now,
    updatedAt: now,
  }).returning();
  return c.json({ client }, 201);
});

oauthRoutes.delete("/clients/:clientId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const now = new Date();
  const [client] = await db.update(oauthClients).set({ revokedAt: now, updatedAt: now })
    .where(and(eq(oauthClients.id, c.req.param("clientId")), eq(oauthClients.userId, user.id), isNull(oauthClients.revokedAt)))
    .returning({ id: oauthClients.id });
  if (!client) return c.json({ error: "OAuth app not found" }, 404);

  const authorizations = await db.select({ id: oauthAuthorizations.id }).from(oauthAuthorizations).where(eq(oauthAuthorizations.clientId, client.id));
  await db.update(oauthAuthorizations).set({ revokedAt: now, updatedAt: now }).where(eq(oauthAuthorizations.clientId, client.id));
  for (const authorization of authorizations) await db.update(oauthTokens).set({ revokedAt: now, updatedAt: now }).where(eq(oauthTokens.authorizationId, authorization.id));
  return c.json({ ok: true });
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

oauthRoutes.get("/authorize/preview", async (c) => {
  const user = c.get("user");
  if (!user) {
    console.info("[OAUTH PREVIEW UNAUTHORIZED]", {
      path: new URL(c.req.url).pathname,
      origin: c.req.raw.headers.get("origin"),
      referer: c.req.raw.headers.get("referer"),
      hasCookieHeader: Boolean(c.req.raw.headers.get("cookie")),
    });
    return c.json({ error: "Unauthorized" }, 401);
  }

  const result = await validateAuthorizeRequest({
    clientId: c.req.query("client_id"),
    redirectUri: c.req.query("redirect_uri"),
    responseType: c.req.query("response_type"),
    codeChallenge: c.req.query("code_challenge"),
    codeChallengeMethod: c.req.query("code_challenge_method"),
  });
  if (!result.ok) return c.json(result.error, result.status);
  return c.json({ client: result.client, request: { scope: c.req.query("scope") ?? "", state: c.req.query("state") ?? null, redirectUri: result.redirectUri } });
});

oauthRoutes.post("/authorize/approve", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null) as { clientId?: string; redirectUri?: string; responseType?: string; codeChallenge?: string; codeChallengeMethod?: string; state?: string | null; scope?: string; accessMode?: "all" | "top_level" | "specific"; canRead?: boolean; canCreate?: boolean; canEdit?: boolean; canCreateFolders?: boolean; folderIds?: string[] } | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  const result = await validateAuthorizeRequest({ clientId: body.clientId, redirectUri: body.redirectUri, responseType: body.responseType, codeChallenge: body.codeChallenge, codeChallengeMethod: body.codeChallengeMethod });
  if (!result.ok) return c.json(result.error, result.status);

  const accessMode = body.accessMode === "all" || body.accessMode === "top_level" || body.accessMode === "specific" ? body.accessMode : "specific";
  const canRead = body.canRead ?? true;
  const canCreate = body.canCreate ?? false;
  const canEdit = body.canEdit ?? false;
  if (!canRead && !canCreate && !canEdit) return c.json({ error: "At least one permission is required" }, 400);
  const folderIds = [...new Set(body.folderIds ?? [])];
  if (accessMode !== "all" && folderIds.length === 0) return c.json({ error: "At least one folder is required" }, 400);
  const selectedPermissions = accessMode === "all" ? [] : await filterSelectablePermissionRows({ userId: user.id, accessMode, permissions: folderIds.map((folderId) => ({ folderId, canRead, canCreate, canEdit })) });
  if (accessMode !== "all" && selectedPermissions.length !== folderIds.length) return c.json({ error: "One or more folders cannot be selected" }, 400);

  const now = new Date();
  const [authorization] = await db.insert(oauthAuthorizations).values({
    id: createId("oauth_auth"),
    userId: user.id,
    clientId: result.clientId,
    scope: body.scope ?? "",
    accessMode,
    canRead,
    canCreate,
    canEdit,
    canCreateFolders: body.canCreateFolders ?? false,
    createdAt: now,
    updatedAt: now,
  }).returning();

  if (accessMode !== "all" && selectedPermissions.length > 0) {
    await db.insert(oauthAuthorizationFolderPermissions).values(selectedPermissions.flatMap(({ folderId }) => folderId ? [{
      id: createId("oauth_perm"),
      authorizationId: authorization.id,
      folderId,
      canRead,
      canCreate,
      canEdit,
      createdAt: now,
      updatedAt: now,
    }] : []));
  }

  const code = generateOAuthToken("mnocd");
  await db.insert(oauthAuthorizationCodes).values({
    id: createId("oauth_code"),
    codeHash: hashOAuthToken(code),
    clientId: result.clientId,
    userId: user.id,
    redirectUri: result.redirectUri,
    scope: body.scope ?? "",
    codeChallenge: result.codeChallenge,
    codeChallengeMethod: result.codeChallengeMethod,
    authorizationId: authorization.id,
    expiresAt: new Date(now.getTime() + AUTHORIZATION_CODE_TTL_MS),
    createdAt: now,
  });

  const url = new URL(result.redirectUri);
  url.searchParams.set("code", code);
  if (body.state) url.searchParams.set("state", body.state);
  return c.json({ redirectUrl: url.toString() });
});

oauthRoutes.get("/authorize", async (c) => {
  const result = await validateAuthorizeRequest({
    clientId: c.req.query("client_id"),
    redirectUri: c.req.query("redirect_uri"),
    responseType: c.req.query("response_type"),
    codeChallenge: c.req.query("code_challenge"),
    codeChallengeMethod: c.req.query("code_challenge_method"),
  });
  if (!result.ok) return c.json(result.error, result.status);
  const url = new URL("/oauth/authorize", frontendUrl);
  for (const [key, value] of new URL(c.req.url).searchParams.entries()) url.searchParams.set(key, value);
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
