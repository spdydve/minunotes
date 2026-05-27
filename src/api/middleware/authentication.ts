import { and, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db } from "../db/client";
import { apiKeys, user } from "../db/schema";
import { getApiKeyFromHeaders, parseApiKey, verifyApiKey } from "../lib/api-keys";
import { auth } from "../lib/auth";

export const authenticationMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  c.set("apiKey", null);
  await next();
});

export const harnessAuthenticationMiddleware = createMiddleware(async (c, next) => {
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
      await next();
      return;
    }
  }

  await authenticationMiddleware(c, next);
});
