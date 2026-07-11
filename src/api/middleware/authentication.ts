import { and, eq, gt, isNull } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { db } from '../db/client';
import { apiKeys, oauthAuthorizations, oauthTokens, user } from '../db/schema';
import { getApiKeyFromHeaders, parseApiKey, verifyApiKey } from '../lib/api-keys';
import { auth } from '../lib/auth';
import { hashOAuthToken } from '../lib/oauth';

type SessionUser = typeof auth.$Infer.Session.user;
type Session = typeof auth.$Infer.Session.session;
type ApiKeyRow = typeof apiKeys.$inferSelect;
type OAuthAuthorizationRow = typeof oauthAuthorizations.$inferSelect;

export type AuthContext =
  | { type: 'anonymous' }
  | { type: 'session'; userId: string; sessionId: string }
  | { type: 'apiKey'; userId: string; apiKeyId: string }
  | { type: 'oauth'; userId: string; authorizationId: string };

function cookieNames(headers: Headers) {
  const cookie = headers.get('cookie') ?? '';
  return cookie
    .split(';')
    .map((part) => part.trim().split('=')[0])
    .filter(Boolean);
}

function logAuthDiagnostic(
  c: Parameters<Parameters<typeof createMiddleware>[0]>[0],
  session: Awaited<ReturnType<typeof auth.api.getSession>>
) {
  const url = new URL(c.req.url);
  if (!url.pathname.includes('/oauth/authorize/preview')) return;

  const names = cookieNames(c.req.raw.headers);
  console.info('[AUTH DIAGNOSTIC]', {
    path: url.pathname,
    origin: c.req.raw.headers.get('origin'),
    referer: c.req.raw.headers.get('referer'),
    hasCookieHeader: names.length > 0,
    cookieNames: names,
    hasSession: Boolean(session?.session),
    hasUser: Boolean(session?.user),
    userId: session?.user?.id ?? null,
  });
}

function setAuthState(
  c: Parameters<Parameters<typeof createMiddleware>[0]>[0],
  input: {
    user: SessionUser | null;
    session: Session | null;
    apiKey: ApiKeyRow | null;
    oauthAuthorization: OAuthAuthorizationRow | null;
    authContext: AuthContext;
  }
) {
  const context = c as any;
  context.set('user', input.user);
  context.set('session', input.session);
  context.set('apiKey', input.apiKey);
  context.set('oauthAuthorization', input.oauthAuthorization);
  context.set('authContext', input.authContext);
}

export const authenticationMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  logAuthDiagnostic(c, session);
  setAuthState(c, {
    user: session?.user ?? null,
    session: session?.session ?? null,
    apiKey: null,
    oauthAuthorization: null,
    authContext:
      session?.user && session.session
        ? { type: 'session', userId: session.user.id, sessionId: session.session.id }
        : { type: 'anonymous' },
  });
  await next();
});

function mcpAuthChallenge(requestUrl: string) {
  const url = new URL(requestUrl);
  if (!url.pathname.startsWith('/mcp')) return undefined;
  return `Bearer resource_metadata="${url.origin}/mcp/.well-known/oauth-protected-resource"`;
}

async function authenticateApiKey(rawKey: string) {
  const parsed = parseApiKey(rawKey);
  if (!parsed) return null;

  const [row] = await db
    .select({ apiKey: apiKeys, user })
    .from(apiKeys)
    .innerJoin(user, eq(apiKeys.userId, user.id))
    .where(and(eq(apiKeys.uid, parsed.uid), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!row || !verifyApiKey(rawKey, row.apiKey.hash, row.apiKey.salt)) return null;

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.apiKey.id));
  return row;
}

async function authenticateOAuthBearer(bearer: string) {
  const [row] = await db
    .select({ token: oauthTokens, authorization: oauthAuthorizations, user })
    .from(oauthTokens)
    .innerJoin(oauthAuthorizations, eq(oauthTokens.authorizationId, oauthAuthorizations.id))
    .innerJoin(user, eq(oauthAuthorizations.userId, user.id))
    .where(
      and(
        eq(oauthTokens.accessTokenHash, hashOAuthToken(bearer)),
        isNull(oauthTokens.revokedAt),
        isNull(oauthAuthorizations.revokedAt),
        gt(oauthTokens.accessTokenExpiresAt, new Date())
      )
    )
    .limit(1);

  if (!row) return null;

  await db
    .update(oauthAuthorizations)
    .set({ lastUsedAt: new Date() })
    .where(eq(oauthAuthorizations.id, row.authorization.id));
  return row;
}

function logIntegrationAuth(c: Parameters<Parameters<typeof createMiddleware>[0]>[0], authContext: AuthContext) {
  const path = new URL(c.req.url).pathname;
  if (!path.startsWith('/mcp') && !path.startsWith('/v1/harness')) return;
  console.info('[INTEGRATION AUTH]', {
    path,
    authType: authContext.type,
    authId:
      authContext.type === 'apiKey'
        ? authContext.apiKeyId
        : authContext.type === 'oauth'
          ? authContext.authorizationId
          : null,
  });
}

export const harnessApiKeyAuthenticationMiddleware = createMiddleware(async (c, next) => {
  const apiKey = getApiKeyFromHeaders(c.req.raw.headers);
  if (!apiKey) return c.json({ error: 'Unauthorized' }, 401);

  const row = await authenticateApiKey(apiKey);
  if (!row) return c.json({ error: 'Invalid API key' }, 401);

  const authContext: AuthContext = { type: 'apiKey', userId: row.user.id, apiKeyId: row.apiKey.id };
  setAuthState(c, { user: row.user, session: null, apiKey: row.apiKey, oauthAuthorization: null, authContext });
  logIntegrationAuth(c, authContext);
  await next();
});

export const mcpOAuthAuthenticationMiddleware = createMiddleware(async (c, next) => {
  const authChallenge = mcpAuthChallenge(c.req.url);
  const bearer = c.req.raw.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!bearer)
    return c.json({ error: 'Unauthorized' }, 401, authChallenge ? { 'WWW-Authenticate': authChallenge } : undefined);

  const row = await authenticateOAuthBearer(bearer);
  if (!row)
    return c.json(
      { error: 'Invalid bearer token' },
      401,
      authChallenge ? { 'WWW-Authenticate': authChallenge } : undefined
    );

  const authContext: AuthContext = { type: 'oauth', userId: row.user.id, authorizationId: row.authorization.id };
  setAuthState(c, { user: row.user, session: null, apiKey: null, oauthAuthorization: row.authorization, authContext });
  logIntegrationAuth(c, authContext);
  await next();
});

export const harnessAuthenticationMiddleware = harnessApiKeyAuthenticationMiddleware;
