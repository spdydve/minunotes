import { and, eq, gt, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db } from "../db/client";
import { apiKeys, oauthAuthorizations, oauthTokens, user } from "../db/schema";
import { getApiKeyFromHeaders, parseApiKey, verifyApiKey } from "../lib/api-keys";
import { hashOAuthToken } from "../lib/oauth";
import { auth } from "../lib/auth";

function cookieNames(headers: Headers) {
  const cookie = headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter(Boolean);
}

function logAuthDiagnostic(c: Parameters<Parameters<typeof createMiddleware>[0]>[0], session: Awaited<ReturnType<typeof auth.api.getSession>>) {
  const url = new URL(c.req.url);
  if (!url.pathname.includes("/oauth/authorize/preview")) return;

  const names = cookieNames(c.req.raw.headers);
  console.info("[AUTH DIAGNOSTIC]", {
    path: url.pathname,
    origin: c.req.raw.headers.get("origin"),
    referer: c.req.raw.headers.get("referer"),
    hasCookieHeader: names.length > 0,
    cookieNames: names,
    hasSession: Boolean(session?.session),
    hasUser: Boolean(session?.user),
    userId: session?.user?.id ?? null,
  });
}

export const authenticationMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  logAuthDiagnostic(c, session);
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  c.set("apiKey", null);
  c.set("oauthAuthorization", null);
  await next();
});

function mcpAuthChallenge(requestUrl: string) {
  const url = new URL(requestUrl);
  if (!url.pathname.startsWith("/mcp")) return undefined;
  return `Bearer resource_metadata="${url.origin}/mcp/.well-known/oauth-protected-resource"`;
}

export const harnessAuthenticationMiddleware = createMiddleware(async (c, next) => {
  const headerApiKey = c.req.raw.headers.get("x-api-key")?.trim() ?? null;
  const apiKey = getApiKeyFromHeaders(c.req.raw.headers);
  const parsed = apiKey ? parseApiKey(apiKey) : null;

  if (apiKey && parsed) {
    const [row] = await db.select({ apiKey: apiKeys, user }).from(apiKeys)
      .innerJoin(user, eq(apiKeys.userId, user.id))
      .where(and(eq(apiKeys.uid, parsed.uid), isNull(apiKeys.revokedAt)))
      .limit(1);

    if (row && verifyApiKey(apiKey, row.apiKey.hash, row.apiKey.salt)) {
      await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.apiKey.id));
      c.set("user", row.user);
      c.set("session", null);
      c.set("apiKey", row.apiKey);
      c.set("oauthAuthorization", null);
      await next();
      return;
    }
  }

  const authChallenge = mcpAuthChallenge(c.req.url);
  if (headerApiKey) return c.json({ error: "Invalid API key" }, 401, authChallenge ? { "WWW-Authenticate": authChallenge } : undefined);

  const authorization = c.req.raw.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    const [row] = await db.select({ token: oauthTokens, authorization: oauthAuthorizations, user }).from(oauthTokens)
      .innerJoin(oauthAuthorizations, eq(oauthTokens.authorizationId, oauthAuthorizations.id))
      .innerJoin(user, eq(oauthAuthorizations.userId, user.id))
      .where(and(
        eq(oauthTokens.accessTokenHash, hashOAuthToken(bearer)),
        isNull(oauthTokens.revokedAt),
        isNull(oauthAuthorizations.revokedAt),
        gt(oauthTokens.accessTokenExpiresAt, new Date()),
      ))
      .limit(1);

    if (row) {
      await db.update(oauthAuthorizations).set({ lastUsedAt: new Date() }).where(eq(oauthAuthorizations.id, row.authorization.id));
      c.set("user", row.user);
      c.set("session", null);
      c.set("apiKey", null);
      c.set("oauthAuthorization", row.authorization);
      await next();
      return;
    }

    return c.json({ error: "Invalid bearer token" }, 401, authChallenge ? { "WWW-Authenticate": authChallenge } : undefined);
  }

  await authenticationMiddleware(c, next);
});
