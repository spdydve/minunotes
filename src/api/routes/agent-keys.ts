import { Hono, type Context } from "hono";
import { desc, eq, and, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { agentApiKeys, type AgentApiKey } from "../db/schema";
import { generateApiKey, hashApiKey } from "../lib/api-keys";
import { auth } from "../lib/auth";
import { createId } from "../lib/id";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  agentApiKey: AgentApiKey | null;
};

export const agentKeyRoutes = new Hono<{ Variables: Variables }>();

function getUser(c: Context<{ Variables: Variables }>) {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

agentKeyRoutes.get("/", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const keys = await db.select({
    id: agentApiKeys.id,
    name: agentApiKeys.name,
    createdAt: agentApiKeys.createdAt,
    lastUsedAt: agentApiKeys.lastUsedAt,
    revokedAt: agentApiKeys.revokedAt,
  }).from(agentApiKeys).where(eq(agentApiKeys.userId, user.id)).orderBy(desc(agentApiKeys.createdAt));

  return c.json({ keys });
});

agentKeyRoutes.post("/", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null) as { name?: string } | null;
  const name = body?.name?.trim();
  if (!name) return c.json({ error: "API key name is required" }, 400);

  const key = generateApiKey();
  const apiKey = {
    id: createId("agent_key"),
    userId: user.id,
    name,
    keyHash: hashApiKey(key),
    createdAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
  };

  await db.insert(agentApiKeys).values(apiKey);
  return c.json({ key, apiKey: { id: apiKey.id, name: apiKey.name, createdAt: apiKey.createdAt, lastUsedAt: apiKey.lastUsedAt, revokedAt: apiKey.revokedAt } }, 201);
});

agentKeyRoutes.delete("/:keyId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const [key] = await db.update(agentApiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(agentApiKeys.id, c.req.param("keyId")), eq(agentApiKeys.userId, user.id), isNull(agentApiKeys.revokedAt)))
    .returning({ id: agentApiKeys.id });

  if (!key) return c.json({ error: "API key not found" }, 404);
  return c.json({ ok: true });
});
