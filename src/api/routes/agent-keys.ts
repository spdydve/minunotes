import { Hono, type Context } from "hono";
import { desc, eq, and, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { agentApiKeyFolderPermissions, agentApiKeys, folders, type AgentApiKey } from "../db/schema";
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
    uid: agentApiKeys.uid,
    createdAt: agentApiKeys.createdAt,
    lastUsedAt: agentApiKeys.lastUsedAt,
    revokedAt: agentApiKeys.revokedAt,
  }).from(agentApiKeys).where(eq(agentApiKeys.userId, user.id)).orderBy(desc(agentApiKeys.createdAt));

  const permissions = await db.select().from(agentApiKeyFolderPermissions).innerJoin(agentApiKeys, eq(agentApiKeyFolderPermissions.apiKeyId, agentApiKeys.id)).where(eq(agentApiKeys.userId, user.id));
  return c.json({
    keys: keys.map((key) => ({
      ...key,
      permissions: permissions.filter((row) => row.agent_api_key_folder_permissions.apiKeyId === key.id).map((row) => row.agent_api_key_folder_permissions),
    })),
  });
});

agentKeyRoutes.post("/", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null) as { name?: string; permissions?: Array<{ folderId?: string; canRead?: boolean; canCreate?: boolean; canEdit?: boolean }> } | null;
  const name = body?.name?.trim();
  if (!name) return c.json({ error: "API key name is required" }, 400);

  const { key, uid } = generateApiKey();
  const { hash, salt } = hashApiKey(key);
  const apiKey = {
    id: createId("agent_key"),
    userId: user.id,
    name,
    uid,
    hash,
    salt,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
  };

  await db.insert(agentApiKeys).values(apiKey);

  const requestedPermissions = body?.permissions ?? [];
  const permissionRows = [];
  for (const permission of requestedPermissions) {
    if (!permission.folderId) continue;
    const [folder] = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.id, permission.folderId), eq(folders.userId, user.id))).limit(1);
    if (!folder) continue;
    permissionRows.push({
      id: createId("agent_perm"),
      apiKeyId: apiKey.id,
      folderId: folder.id,
      canRead: permission.canRead ?? false,
      canCreate: permission.canCreate ?? false,
      canEdit: permission.canEdit ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (permissionRows.length > 0) await db.insert(agentApiKeyFolderPermissions).values(permissionRows);

  return c.json({ key, apiKey: { id: apiKey.id, name: apiKey.name, uid: apiKey.uid, createdAt: apiKey.createdAt, lastUsedAt: apiKey.lastUsedAt, revokedAt: apiKey.revokedAt, permissions: permissionRows } }, 201);
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
