import { and, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db } from "../db/client";
import { agentApiKeys, user } from "../db/schema";
import { hashApiKey } from "../lib/api-keys";
import { auth } from "../lib/auth";

export const authenticationMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  c.set("agentApiKey", null);
  await next();
});

export const harnessAuthenticationMiddleware = createMiddleware(async (c, next) => {
  const authorization = c.req.header("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : null;

  if (bearer) {
    const keyHash = hashApiKey(bearer);
    const [row] = await db.select({ apiKey: agentApiKeys, user }).from(agentApiKeys)
      .innerJoin(user, eq(agentApiKeys.userId, user.id))
      .where(and(eq(agentApiKeys.keyHash, keyHash), isNull(agentApiKeys.revokedAt)))
      .limit(1);

    if (row) {
      await db.update(agentApiKeys).set({ lastUsedAt: new Date() }).where(eq(agentApiKeys.id, row.apiKey.id));
      c.set("user", row.user);
      c.set("session", null);
      c.set("agentApiKey", row.apiKey);
      await next();
      return;
    }
  }

  await authenticationMiddleware(c, next);
});
