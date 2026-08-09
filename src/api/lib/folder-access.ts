import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  type ApiKey,
  type ApiKeyFolderPermission,
  apiKeyFolderPermissions,
  type Folder,
  folders,
  type OAuthAuthorization,
  oauthAuthorizationFolderPermissions,
} from '../db/schema';
import { activeFolderWhere, filterActiveFolderHierarchy } from '../trash/policy';

export type FolderPermissionKind = 'read' | 'create' | 'edit' | 'comment';

export type FolderAccessTree = {
  folders: Folder[];
  byId: Map<string, Folder>;
  privateFolderIds: Set<string>;
  agentReadOnlyFolderIds: Set<string>;
};

export async function loadFolderAccessTree(userId: string): Promise<FolderAccessTree> {
  const selected = await db.select().from(folders).where(activeFolderWhere(userId));
  const rows = filterActiveFolderHierarchy(selected);
  const byId = new Map(rows.map((folder) => [folder.id, folder]));
  const privateFolderIds = new Set<string>();
  const agentReadOnlyFolderIds = new Set<string>();

  for (const folder of rows) {
    if (isFolderEffectivelyPrivate(folder.id, byId)) privateFolderIds.add(folder.id);
    if (isFolderEffectivelyAgentReadOnly(folder.id, byId)) agentReadOnlyFolderIds.add(folder.id);
  }

  return { folders: rows, byId, privateFolderIds, agentReadOnlyFolderIds };
}

export function getFolderDepth(folderId: string, byId: Map<string, Pick<Folder, 'id' | 'parentFolderId'>>) {
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

export function isDescendantOrSelf(
  folderId: string,
  rootFolderId: string,
  byId: Map<string, Pick<Folder, 'id' | 'parentFolderId'>>
) {
  let current: Pick<Folder, 'id' | 'parentFolderId'> | undefined = byId.get(folderId);
  const seen = new Set<string>();

  while (current) {
    if (current.id === rootFolderId) return true;
    if (!current.parentFolderId || seen.has(current.id)) return false;
    seen.add(current.id);
    current = byId.get(current.parentFolderId);
  }

  return false;
}

export function isFolderEffectivelyPrivate(
  folderId: string,
  byId: Map<string, Pick<Folder, 'id' | 'parentFolderId' | 'isPrivate'>>
) {
  let current: Pick<Folder, 'id' | 'parentFolderId' | 'isPrivate'> | undefined = byId.get(folderId);
  const seen = new Set<string>();

  while (current) {
    if (current.isPrivate) return true;
    if (!current.parentFolderId || seen.has(current.id)) return false;
    seen.add(current.id);
    current = byId.get(current.parentFolderId);
  }

  return false;
}

export function isFolderEffectivelyAgentReadOnly(
  folderId: string,
  byId: Map<string, Pick<Folder, 'id' | 'parentFolderId' | 'isAgentReadOnly'>>
) {
  let current: Pick<Folder, 'id' | 'parentFolderId' | 'isAgentReadOnly'> | undefined = byId.get(folderId);
  const seen = new Set<string>();

  while (current) {
    if (current.isAgentReadOnly) return true;
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
  if (!parent) return { ok: false as const, status: 404 as const, error: 'Parent folder not found' };
  if (tree.privateFolderIds.has(parent.id))
    return { ok: false as const, status: 403 as const, error: 'Cannot create subfolders under a private folder' };

  const parentDepth = getFolderDepth(parent.id, tree.byId);
  if (!Number.isFinite(parentDepth) || parentDepth >= 4)
    return { ok: false as const, status: 400 as const, error: 'Maximum folder depth reached' };

  return { ok: true as const, parent, depth: parentDepth + 1 };
}

export async function validateFolderMove(input: { userId: string; folderId: string; parentFolderId: string | null }) {
  const tree = await loadFolderAccessTree(input.userId);
  const folder = tree.byId.get(input.folderId);
  if (!folder) return { ok: false as const, status: 404 as const, error: 'Folder not found' };

  if (input.parentFolderId === folder.id)
    return { ok: false as const, status: 400 as const, error: 'Cannot move a folder into itself' };

  let newDepth = 0;
  if (input.parentFolderId) {
    const parent = tree.byId.get(input.parentFolderId);
    if (!parent) return { ok: false as const, status: 404 as const, error: 'Parent folder not found' };
    if (isDescendantOrSelf(parent.id, folder.id, tree.byId))
      return { ok: false as const, status: 400 as const, error: 'Cannot move a folder into one of its descendants' };
    if (tree.privateFolderIds.has(parent.id))
      return { ok: false as const, status: 403 as const, error: 'Cannot move folders under a private folder' };
    const parentDepth = getFolderDepth(parent.id, tree.byId);
    if (!Number.isFinite(parentDepth))
      return { ok: false as const, status: 400 as const, error: 'Invalid folder hierarchy' };
    newDepth = parentDepth + 1;
  }

  const subtreeHeight = getFolderSubtreeHeight(folder.id, tree.folders);
  if (newDepth + subtreeHeight > 4)
    return { ok: false as const, status: 400 as const, error: 'Maximum folder depth reached' };

  return { ok: true as const, folder, parentFolderId: input.parentFolderId };
}

function getFolderSubtreeHeight(folderId: string, rows: Pick<Folder, 'id' | 'parentFolderId'>[]) {
  const childrenByParent = new Map<string, Array<Pick<Folder, 'id' | 'parentFolderId'>>>();
  for (const row of rows) {
    if (!row.parentFolderId) continue;
    const children = childrenByParent.get(row.parentFolderId) ?? [];
    children.push(row);
    childrenByParent.set(row.parentFolderId, children);
  }

  const visit = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return Number.POSITIVE_INFINITY;
    const nextSeen = new Set(seen);
    nextSeen.add(id);
    const children = childrenByParent.get(id) ?? [];
    if (children.length === 0) return 0;
    return Math.max(...children.map((child) => 1 + visit(child.id, nextSeen)));
  };

  return visit(folderId, new Set());
}

function actorAllowsPermission(
  actor: Pick<ApiKey | OAuthAuthorization, 'canRead' | 'canCreate' | 'canEdit' | 'canComment'>,
  permission: FolderPermissionKind
) {
  if (permission === 'read') return actor.canRead;
  if (permission === 'create') return actor.canCreate;
  if (permission === 'edit') return actor.canEdit;
  return actor.canRead && actor.canComment;
}

function isWritePermission(permission: FolderPermissionKind) {
  return permission === 'create' || permission === 'edit' || permission === 'comment';
}

function permissionRowAllows(
  row: Pick<ApiKeyFolderPermission, 'canRead' | 'canCreate' | 'canEdit' | 'canComment'>,
  permission: FolderPermissionKind
) {
  if (permission === 'read') return row.canRead;
  if (permission === 'create') return row.canCreate;
  if (permission === 'edit') return row.canEdit;
  return row.canRead && row.canComment;
}

async function canScopedActorAccessFolder(input: {
  actor: Pick<ApiKey | OAuthAuthorization, 'id' | 'accessMode' | 'canRead' | 'canCreate' | 'canEdit' | 'canComment'>;
  permissionRows: Array<{
    folderId: string;
    canRead: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canComment: boolean;
  }>;
  userId: string;
  folderId: string;
  permission: FolderPermissionKind;
}) {
  if (!actorAllowsPermission(input.actor, input.permission)) return false;

  const tree = await loadFolderAccessTree(input.userId);
  if (!tree.byId.has(input.folderId)) return false;
  if (tree.privateFolderIds.has(input.folderId)) return false;

  if (input.actor.accessMode === 'all') {
    if (isWritePermission(input.permission) && tree.agentReadOnlyFolderIds.has(input.folderId)) return false;
    return true;
  }

  if (input.actor.accessMode === 'top_level') {
    const matchesRoot = input.permissionRows.some(
      (row) =>
        permissionRowAllows(row, input.permission) &&
        !tree.privateFolderIds.has(row.folderId) &&
        isDescendantOrSelf(input.folderId, row.folderId, tree.byId)
    );
    if (!matchesRoot) return false;
    if (isWritePermission(input.permission) && tree.agentReadOnlyFolderIds.has(input.folderId)) return false;
    return true;
  }

  return input.permissionRows.some(
    (row) =>
      permissionRowAllows(row, input.permission) &&
      row.folderId === input.folderId &&
      !tree.privateFolderIds.has(row.folderId)
  );
}

async function getScopedActorAccessibleFolderIds(input: {
  actor: Pick<ApiKey | OAuthAuthorization, 'id' | 'accessMode' | 'canRead' | 'canCreate' | 'canEdit' | 'canComment'>;
  permissionRows: Array<{
    folderId: string;
    canRead: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canComment: boolean;
  }>;
  userId: string;
  permission: FolderPermissionKind;
}) {
  if (!actorAllowsPermission(input.actor, input.permission)) return new Set<string>();

  const tree = await loadFolderAccessTree(input.userId);
  const nonPrivateFolders = tree.folders.filter((folder) => !tree.privateFolderIds.has(folder.id));
  const folderAllowedForPermission = (folder: Folder) =>
    !isWritePermission(input.permission) ||
    !tree.agentReadOnlyFolderIds.has(folder.id) ||
    input.actor.accessMode === 'specific';

  if (input.actor.accessMode === 'all') {
    return new Set(nonPrivateFolders.filter(folderAllowedForPermission).map((folder) => folder.id));
  }

  if (input.actor.accessMode === 'top_level') {
    return new Set(
      nonPrivateFolders
        .filter(
          (folder) =>
            folderAllowedForPermission(folder) &&
            input.permissionRows.some(
              (row) =>
                permissionRowAllows(row, input.permission) &&
                !tree.privateFolderIds.has(row.folderId) &&
                isDescendantOrSelf(folder.id, row.folderId, tree.byId)
            )
        )
        .map((folder) => folder.id)
    );
  }

  const nonPrivateFolderIds = new Set(nonPrivateFolders.map((folder) => folder.id));
  return new Set(
    input.permissionRows
      .filter((row) => permissionRowAllows(row, input.permission) && nonPrivateFolderIds.has(row.folderId))
      .map((row) => row.folderId)
  );
}

async function loadApiKeyPermissionRows(apiKeyId: string, permission: FolderPermissionKind) {
  const baseSelection = {
    folderId: apiKeyFolderPermissions.folderId,
    canRead: apiKeyFolderPermissions.canRead,
    canCreate: apiKeyFolderPermissions.canCreate,
    canEdit: apiKeyFolderPermissions.canEdit,
  };
  return permission === 'comment'
    ? db
        .select({ ...baseSelection, canComment: apiKeyFolderPermissions.canComment })
        .from(apiKeyFolderPermissions)
        .where(eq(apiKeyFolderPermissions.apiKeyId, apiKeyId))
    : db
        .select({ ...baseSelection, canComment: sql<boolean>`false` })
        .from(apiKeyFolderPermissions)
        .where(eq(apiKeyFolderPermissions.apiKeyId, apiKeyId));
}

async function loadOAuthPermissionRows(authorizationId: string, permission: FolderPermissionKind) {
  const baseSelection = {
    folderId: oauthAuthorizationFolderPermissions.folderId,
    canRead: oauthAuthorizationFolderPermissions.canRead,
    canCreate: oauthAuthorizationFolderPermissions.canCreate,
    canEdit: oauthAuthorizationFolderPermissions.canEdit,
  };
  return permission === 'comment'
    ? db
        .select({ ...baseSelection, canComment: oauthAuthorizationFolderPermissions.canComment })
        .from(oauthAuthorizationFolderPermissions)
        .where(eq(oauthAuthorizationFolderPermissions.authorizationId, authorizationId))
    : db
        .select({ ...baseSelection, canComment: sql<boolean>`false` })
        .from(oauthAuthorizationFolderPermissions)
        .where(eq(oauthAuthorizationFolderPermissions.authorizationId, authorizationId));
}

export async function canApiKeyAccessFolder(input: {
  apiKey: ApiKey | null;
  userId: string;
  folderId: string;
  permission: FolderPermissionKind;
}) {
  if (!input.apiKey) return true;
  const rows = await loadApiKeyPermissionRows(input.apiKey.id, input.permission);
  return canScopedActorAccessFolder({
    actor: input.apiKey,
    permissionRows: rows,
    userId: input.userId,
    folderId: input.folderId,
    permission: input.permission,
  });
}

export async function getApiKeyAccessibleFolderIds(input: {
  apiKey: ApiKey | null;
  userId: string;
  permission: FolderPermissionKind;
}) {
  if (!input.apiKey) return null;
  const rows = await loadApiKeyPermissionRows(input.apiKey.id, input.permission);
  return getScopedActorAccessibleFolderIds({
    actor: input.apiKey,
    permissionRows: rows,
    userId: input.userId,
    permission: input.permission,
  });
}

export async function canOAuthAuthorizationAccessFolder(input: {
  authorization: OAuthAuthorization | null;
  userId: string;
  folderId: string;
  permission: FolderPermissionKind;
}) {
  if (!input.authorization) return true;
  const rows = await loadOAuthPermissionRows(input.authorization.id, input.permission);
  return canScopedActorAccessFolder({
    actor: input.authorization,
    permissionRows: rows,
    userId: input.userId,
    folderId: input.folderId,
    permission: input.permission,
  });
}

export async function getOAuthAuthorizationAccessibleFolderIds(input: {
  authorization: OAuthAuthorization | null;
  userId: string;
  permission: FolderPermissionKind;
}) {
  if (!input.authorization) return null;
  const rows = await loadOAuthPermissionRows(input.authorization.id, input.permission);
  return getScopedActorAccessibleFolderIds({
    actor: input.authorization,
    permissionRows: rows,
    userId: input.userId,
    permission: input.permission,
  });
}

export async function canIntegrationAccessFolder(input: {
  apiKey: ApiKey | null;
  oauthAuthorization: OAuthAuthorization | null;
  userId: string;
  folderId: string;
  permission: FolderPermissionKind;
}) {
  if (input.apiKey)
    return canApiKeyAccessFolder({
      apiKey: input.apiKey,
      userId: input.userId,
      folderId: input.folderId,
      permission: input.permission,
    });
  if (input.oauthAuthorization)
    return canOAuthAuthorizationAccessFolder({
      authorization: input.oauthAuthorization,
      userId: input.userId,
      folderId: input.folderId,
      permission: input.permission,
    });
  return true;
}

export async function getIntegrationAccessibleFolderIds(input: {
  apiKey: ApiKey | null;
  oauthAuthorization: OAuthAuthorization | null;
  userId: string;
  permission: FolderPermissionKind;
}) {
  if (input.apiKey)
    return getApiKeyAccessibleFolderIds({ apiKey: input.apiKey, userId: input.userId, permission: input.permission });
  if (input.oauthAuthorization)
    return getOAuthAuthorizationAccessibleFolderIds({
      authorization: input.oauthAuthorization,
      userId: input.userId,
      permission: input.permission,
    });
  return null;
}

export async function filterSelectablePermissionRows(input: {
  userId: string;
  accessMode: ApiKey['accessMode'];
  permissions: Array<{
    folderId?: string;
    canRead?: boolean;
    canCreate?: boolean;
    canEdit?: boolean;
    canComment?: boolean;
  }>;
}) {
  const tree = await loadFolderAccessTree(input.userId);
  return input.permissions.filter((permission) => {
    if (!permission.folderId || !tree.byId.has(permission.folderId) || tree.privateFolderIds.has(permission.folderId))
      return false;
    if (input.accessMode === 'top_level') return tree.byId.get(permission.folderId)?.parentFolderId === null;
    return input.accessMode === 'specific';
  });
}

export async function isFolderAgentReadOnlyForUser(input: { userId: string; folderId: string }) {
  const tree = await loadFolderAccessTree(input.userId);
  return tree.agentReadOnlyFolderIds.has(input.folderId);
}
