import { Hono, type Context } from "hono";
import { desc, eq, and, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { apiKeyFolderPermissions, apiKeys, folders, type ApiKey } from "../db/schema";
import { generateApiKey, hashApiKey } from "../lib/api-keys";
import { auth } from "../lib/auth";
import { createId } from "../lib/id";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  apiKey: ApiKey | null;
};

export const apiKeyRoutes = new Hono<{ Variables: Variables }>();

function getUser(c: Context<{ Variables: Variables }>) {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

apiKeyRoutes.get("/", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const keys = await db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    uid: apiKeys.uid,
    createdAt: apiKeys.createdAt,
    lastUsedAt: apiKeys.lastUsedAt,
    revokedAt: apiKeys.revokedAt,
  }).from(apiKeys).where(eq(apiKeys.userId, user.id)).orderBy(desc(apiKeys.createdAt));

  const permissions = await db.select().from(apiKeyFolderPermissions).innerJoin(apiKeys, eq(apiKeyFolderPermissions.apiKeyId, apiKeys.id)).where(eq(apiKeys.userId, user.id));
  return c.json({
    keys: keys.map((key) => ({
      ...key,
      permissions: permissions.filter((row) => row.api_key_folder_permissions.apiKeyId === key.id).map((row) => row.api_key_folder_permissions),
    })),
  });
});

apiKeyRoutes.post("/", async (c) => {
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

  await db.insert(apiKeys).values(apiKey);

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
  if (permissionRows.length > 0) await db.insert(apiKeyFolderPermissions).values(permissionRows);

  return c.json({ key, apiKey: { id: apiKey.id, name: apiKey.name, uid: apiKey.uid, createdAt: apiKey.createdAt, lastUsedAt: apiKey.lastUsedAt, revokedAt: apiKey.revokedAt, permissions: permissionRows } }, 201);
});

apiKeyRoutes.delete("/:keyId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const [key] = await db.update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, c.req.param("keyId")), eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });

  if (!key) return c.json({ error: "API key not found" }, 404);
  return c.json({ ok: true });
});
