import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { apiKeyFolderPermissions, folders, type ApiKey, type Folder } from "../db/schema";

export type FolderPermissionKind = "read" | "create" | "edit";

export type FolderAccessTree = {
  folders: Folder[];
  byId: Map<string, Folder>;
  privateFolderIds: Set<string>;
};

export async function loadFolderAccessTree(userId: string): Promise<FolderAccessTree> {
  const rows = await db.select().from(folders).where(eq(folders.userId, userId));
  const byId = new Map(rows.map((folder) => [folder.id, folder]));
  const privateFolderIds = new Set<string>();

  for (const folder of rows) {
    if (isFolderEffectivelyPrivate(folder.id, byId)) privateFolderIds.add(folder.id);
  }

  return { folders: rows, byId, privateFolderIds };
}

export function getFolderDepth(folderId: string, byId: Map<string, Pick<Folder, "id" | "parentFolderId">>) {
  let depth = 0;
  let current = byId.get(folderId);
  const seen = new Set<string>();

  while (current?.parentFolderId) {
    if (seen.has(current.id)) return Number.POSITIVE_INFINITY;
    seen.add(current.id);
    depth += 1;
    current = byId.get(current.parentFolderId);
  }

  return depth;
}

export function isDescendantOrSelf(folderId: string, rootFolderId: string, byId: Map<string, Pick<Folder, "id" | "parentFolderId">>) {
  let current: Pick<Folder, "id" | "parentFolderId"> | undefined = byId.get(folderId);
  const seen = new Set<string>();

  while (current) {
    if (current.id === rootFolderId) return true;
    if (!current.parentFolderId || seen.has(current.id)) return false;
    seen.add(current.id);
    current = byId.get(current.parentFolderId);
  }

  return false;
}

export function isFolderEffectivelyPrivate(folderId: string, byId: Map<string, Pick<Folder, "id" | "parentFolderId" | "isPrivate">>) {
  let current: Pick<Folder, "id" | "parentFolderId" | "isPrivate"> | undefined = byId.get(folderId);
  const seen = new Set<string>();

  while (current) {
    if (current.isPrivate) return true;
    if (!current.parentFolderId || seen.has(current.id)) return false;
    seen.add(current.id);
    current = byId.get(current.parentFolderId);
  }

  return false;
}

export async function validateFolderParent(input: { userId: string; parentFolderId?: string | null }) {
  if (!input.parentFolderId) return { ok: true as const, parent: null, depth: 0 };

  const tree = await loadFolderAccessTree(input.userId);
  const parent = tree.byId.get(input.parentFolderId);
  if (!parent) return { ok: false as const, status: 404 as const, error: "Parent folder not found" };
  if (tree.privateFolderIds.has(parent.id)) return { ok: false as const, status: 403 as const, error: "Cannot create subfolders under a private folder" };

  const parentDepth = getFolderDepth(parent.id, tree.byId);
  if (!Number.isFinite(parentDepth) || parentDepth >= 2) return { ok: false as const, status: 400 as const, error: "Maximum folder depth reached" };

  return { ok: true as const, parent, depth: parentDepth + 1 };
}

export async function canApiKeyAccessFolder(input: { apiKey: ApiKey | null; userId: string; folderId: string; permission: FolderPermissionKind }) {
  if (!input.apiKey) return true;

  const tree = await loadFolderAccessTree(input.userId);
  if (!tree.byId.has(input.folderId)) return false;
  if (tree.privateFolderIds.has(input.folderId)) return false;

  if (input.apiKey.accessMode === "all") return true;

  const rows = await db.select().from(apiKeyFolderPermissions).where(eq(apiKeyFolderPermissions.apiKeyId, input.apiKey.id));
  return rows.some((row) => {
    if (!permissionAllowed(row, input.permission)) return false;
    if (tree.privateFolderIds.has(row.folderId)) return false;
    return isDescendantOrSelf(input.folderId, row.folderId, tree.byId);
  });
}

export async function getApiKeyAccessibleFolderIds(input: { apiKey: ApiKey | null; userId: string; permission: FolderPermissionKind }) {
  if (!input.apiKey) return null;

  const tree = await loadFolderAccessTree(input.userId);
  const nonPrivateFolders = tree.folders.filter((folder) => !tree.privateFolderIds.has(folder.id));
  if (input.apiKey.accessMode === "all") return new Set(nonPrivateFolders.map((folder) => folder.id));

  const rows = await db.select().from(apiKeyFolderPermissions)
    .where(and(eq(apiKeyFolderPermissions.apiKeyId, input.apiKey.id), permissionColumn(input.permission)));

  return new Set(nonPrivateFolders
    .filter((folder) => rows.some((row) => !tree.privateFolderIds.has(row.folderId) && isDescendantOrSelf(folder.id, row.folderId, tree.byId)))
    .map((folder) => folder.id));
}

export async function filterSelectablePermissionRows(input: { userId: string; permissions: Array<{ folderId?: string; canRead?: boolean; canCreate?: boolean; canEdit?: boolean }> }) {
  const tree = await loadFolderAccessTree(input.userId);
  return input.permissions.filter((permission) => permission.folderId && tree.byId.has(permission.folderId) && !tree.privateFolderIds.has(permission.folderId));
}

function permissionAllowed(row: typeof apiKeyFolderPermissions.$inferSelect, permission: FolderPermissionKind) {
  if (permission === "read") return row.canRead;
  if (permission === "create") return row.canCreate;
  return row.canEdit;
}

function permissionColumn(permission: FolderPermissionKind) {
  if (permission === "read") return eq(apiKeyFolderPermissions.canRead, true);
  if (permission === "create") return eq(apiKeyFolderPermissions.canCreate, true);
  return eq(apiKeyFolderPermissions.canEdit, true);
}
