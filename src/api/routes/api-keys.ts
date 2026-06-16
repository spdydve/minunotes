import { Hono, type Context } from "hono";
import { desc, eq, and, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { apiKeyFolderPermissions, apiKeys, folders, type ApiKey } from "../db/schema";
import { generateApiKey, hashApiKey } from "../lib/api-keys";
import { auth } from "../lib/auth";
import { filterSelectablePermissionRows } from "../lib/folder-access";
import { createId } from "../lib/id";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  apiKey: ApiKey | null;
};

type PermissionInput = { folderId?: string; canRead?: boolean; canCreate?: boolean; canEdit?: boolean };
type AccessMode = "all" | "top_level" | "specific";

export const apiKeyRoutes = new Hono<{ Variables: Variables }>();

function getUser(c: Context<{ Variables: Variables }>) {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

function parseAccessMode(value: unknown): AccessMode | undefined {
  if (value === "selected") return "specific";
  return value === "specific" || value === "top_level" || value === "all" ? value : undefined;
}

function permissionValue(body: { canRead?: boolean; canCreate?: boolean; canEdit?: boolean } | null | undefined) {
  return {
    canRead: body?.canRead ?? true,
    canCreate: body?.canCreate ?? false,
    canEdit: body?.canEdit ?? false,
  };
}

function permissionRowsFromFolders(input: { keyId: string; permissions: PermissionInput[]; canRead: boolean; canCreate: boolean; canEdit: boolean }) {
  return input.permissions.flatMap((permission) => permission.folderId ? [{
    id: createId("agent_perm"),
    apiKeyId: input.keyId,
    folderId: permission.folderId,
    canRead: input.canRead,
    canCreate: input.canCreate,
    canEdit: input.canEdit,
    createdAt: new Date(),
    updatedAt: new Date(),
  }] : []);
}

apiKeyRoutes.get("/", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const keys = await db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    uid: apiKeys.uid,
    canCreateFolders: apiKeys.canCreateFolders,
    canRead: apiKeys.canRead,
    canCreate: apiKeys.canCreate,
    canEdit: apiKeys.canEdit,
    accessMode: apiKeys.accessMode,
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

  const body = await c.req.json().catch(() => null) as { name?: string; accessMode?: AccessMode | "selected"; canCreateFolders?: boolean; canRead?: boolean; canCreate?: boolean; canEdit?: boolean; permissions?: PermissionInput[] } | null;
  const name = body?.name?.trim();
  if (!name) return c.json({ error: "API key name is required" }, 400);

  const accessMode = parseAccessMode(body?.accessMode) ?? "all";
  const keyPermissions = permissionValue(body);
  const { key, uid } = generateApiKey();
  const { hash, salt } = hashApiKey(key);
  const apiKey = {
    id: createId("agent_key"),
    userId: user.id,
    name,
    uid,
    hash,
    salt,
    canCreateFolders: body?.canCreateFolders ?? false,
    ...keyPermissions,
    accessMode,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
  };

  await db.insert(apiKeys).values(apiKey);

  const requestedPermissions = accessMode !== "all" ? await filterSelectablePermissionRows({ userId: user.id, accessMode, permissions: body?.permissions ?? [] }) : [];
  const permissionRows = permissionRowsFromFolders({ keyId: apiKey.id, permissions: requestedPermissions, ...keyPermissions });
  if (permissionRows.length > 0) await db.insert(apiKeyFolderPermissions).values(permissionRows);

  return c.json({ key, apiKey: { id: apiKey.id, name: apiKey.name, uid: apiKey.uid, canCreateFolders: apiKey.canCreateFolders, ...keyPermissions, accessMode: apiKey.accessMode, createdAt: apiKey.createdAt, lastUsedAt: apiKey.lastUsedAt, revokedAt: apiKey.revokedAt, permissions: permissionRows } }, 201);
});

apiKeyRoutes.patch("/:keyId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null) as { name?: string; accessMode?: AccessMode | "selected"; canCreateFolders?: boolean; canRead?: boolean; canCreate?: boolean; canEdit?: boolean; permissions?: PermissionInput[] } | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const name = body.name?.trim();
  if (body.name !== undefined && !name) return c.json({ error: "API key name is required" }, 400);

  const keyId = c.req.param("keyId");
  const [existing] = await db.select().from(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt))).limit(1);
  if (!existing) return c.json({ error: "API key not found" }, 404);

  const accessMode = parseAccessMode(body.accessMode);
  const nextPermissions = {
    canRead: body.canRead ?? existing.canRead,
    canCreate: body.canCreate ?? existing.canCreate,
    canEdit: body.canEdit ?? existing.canEdit,
  };
  if (name !== undefined || body.canCreateFolders !== undefined || accessMode !== undefined || body.canRead !== undefined || body.canCreate !== undefined || body.canEdit !== undefined) {
    await db.update(apiKeys).set({
      ...(name !== undefined ? { name } : {}),
      ...(body.canCreateFolders !== undefined ? { canCreateFolders: body.canCreateFolders } : {}),
      ...(body.canRead !== undefined ? { canRead: body.canRead } : {}),
      ...(body.canCreate !== undefined ? { canCreate: body.canCreate } : {}),
      ...(body.canEdit !== undefined ? { canEdit: body.canEdit } : {}),
      ...(accessMode !== undefined ? { accessMode } : {}),
      updatedAt: new Date(),
    }).where(eq(apiKeys.id, keyId));
  }

  const effectiveAccessMode = accessMode ?? existing.accessMode;
  let permissionRows: Array<typeof apiKeyFolderPermissions.$inferInsert> | undefined;
  if (body.permissions !== undefined || accessMode === "all" || body.canRead !== undefined || body.canCreate !== undefined || body.canEdit !== undefined) {
    const requestedPermissions = effectiveAccessMode !== "all" ? await filterSelectablePermissionRows({ userId: user.id, accessMode: effectiveAccessMode, permissions: body.permissions ?? (await db.select().from(apiKeyFolderPermissions).where(eq(apiKeyFolderPermissions.apiKeyId, keyId))) }) : [];
    permissionRows = permissionRowsFromFolders({ keyId, permissions: requestedPermissions, ...nextPermissions });
    await db.delete(apiKeyFolderPermissions).where(eq(apiKeyFolderPermissions.apiKeyId, keyId));
    if (permissionRows.length > 0) await db.insert(apiKeyFolderPermissions).values(permissionRows);
  }

  const [updated] = await db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    uid: apiKeys.uid,
    canCreateFolders: apiKeys.canCreateFolders,
    canRead: apiKeys.canRead,
    canCreate: apiKeys.canCreate,
    canEdit: apiKeys.canEdit,
    accessMode: apiKeys.accessMode,
    createdAt: apiKeys.createdAt,
    lastUsedAt: apiKeys.lastUsedAt,
    revokedAt: apiKeys.revokedAt,
  }).from(apiKeys).where(eq(apiKeys.id, keyId)).limit(1);

  const permissions = await db.select().from(apiKeyFolderPermissions).where(eq(apiKeyFolderPermissions.apiKeyId, keyId));
  return c.json({ apiKey: { ...updated, permissions } });
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
