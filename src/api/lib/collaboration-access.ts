import { and, eq, inArray, isNull, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { authorizationCollaborationScopes, collaborationGrants, folders, notes, user } from '../db/schema';
import { publicCollaborationAccessKey, serializeCollaborationUserIdentity } from './collaboration-identity';
import { isDescendantOrSelf, loadFolderAccessTree } from './folder-access';

export type CollaborationRole = 'viewer' | 'commenter' | 'editor';
export type EffectiveCollaborationRole = CollaborationRole | 'owner';
export type CollaborationCapability = 'read' | 'comment' | 'edit' | 'create';
export type CollaborationAccessSource = 'owner' | 'note_grant' | 'folder_grant';
export type SharedAccessMode = 'none' | 'specific' | 'all';

export type CollaborationAccess = {
  actorUserId: string;
  resourceOwnerUserId: string;
  role: EffectiveCollaborationRole;
  source: CollaborationAccessSource;
  applicableGrantIds: string[];
};

export function serializeCollaborationAccess(access: CollaborationAccess) {
  return { role: access.role, source: access.source };
}

const ROLE_RANK: Record<EffectiveCollaborationRole, number> = {
  viewer: 1,
  commenter: 2,
  editor: 3,
  owner: 4,
};

const CAPABILITY_MINIMUM_ROLE: Record<CollaborationCapability, EffectiveCollaborationRole> = {
  read: 'viewer',
  comment: 'commenter',
  edit: 'editor',
  create: 'editor',
};

export function highestCollaborationRole(roles: CollaborationRole[]): CollaborationRole | null {
  let highest: CollaborationRole | null = null;
  for (const role of roles) {
    if (!highest || ROLE_RANK[role] > ROLE_RANK[highest]) highest = role;
  }
  return highest;
}

export function collaborationRoleAllows(role: EffectiveCollaborationRole | null, capability: CollaborationCapability) {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[CAPABILITY_MINIMUM_ROLE[capability]];
}

function grantRolesForCapability(capability: CollaborationCapability) {
  if (capability === 'read') return sql`('viewer', 'commenter', 'editor')`;
  if (capability === 'comment') return sql`('commenter', 'editor')`;
  return sql`('editor')`;
}

export function hasFolderCollaborationAccessSql(input: {
  actorUserId: string;
  folderId: SQLWrapper;
  ownerUserId: SQLWrapper;
  capability?: CollaborationCapability;
}) {
  const roles = grantRolesForCapability(input.capability ?? 'read');
  return sql<boolean>`(
    ${input.ownerUserId} = ${input.actorUserId}
    or exists (
      with recursive collaboration_folder_path(id, parent_folder_id) as (
        select access_folder.id, access_folder.parent_folder_id
        from ${folders} as access_folder
        where access_folder.id = ${input.folderId}
          and access_folder.user_id = ${input.ownerUserId}
        union
        select access_parent.id, access_parent.parent_folder_id
        from ${folders} as access_parent
        inner join collaboration_folder_path as access_child on access_parent.id = access_child.parent_folder_id
        where access_parent.user_id = ${input.ownerUserId}
      )
      select 1
      from collaboration_folder_path
      inner join ${collaborationGrants} as access_grant on access_grant.folder_id = collaboration_folder_path.id
      where access_grant.owner_user_id = ${input.ownerUserId}
        and access_grant.grantee_user_id = ${input.actorUserId}
        and access_grant.role in ${roles}
    )
  )`;
}

export function integrationAccessibleNoteWhere(
  input: {
    actorUserId: string;
    authorizationId: string;
    sharedAccessMode: SharedAccessMode;
    capability?: CollaborationCapability;
    ownedFolderIds?: ReadonlySet<string> | null;
  },
  ...conditions: Array<SQL | undefined>
) {
  const capability = input.capability ?? 'read';
  const roles = grantRolesForCapability(capability);
  const selectedDirectScope =
    input.sharedAccessMode === 'specific'
      ? sql`and exists (
          select 1 from ${authorizationCollaborationScopes} as direct_scope
          where direct_scope.authorization_id = ${input.authorizationId}
            and direct_scope.user_id = ${input.actorUserId}
            and direct_scope.collaboration_grant_id = integration_note_grant.id
        )`
      : sql``;
  const selectedFolderScope =
    input.sharedAccessMode === 'specific'
      ? sql`and exists (
          select 1 from ${authorizationCollaborationScopes} as folder_scope
          where folder_scope.authorization_id = ${input.authorizationId}
            and folder_scope.user_id = ${input.actorUserId}
            and folder_scope.collaboration_grant_id = integration_folder_grant.id
        )`
      : sql``;
  const ownedFolderIds = input.ownedFolderIds ? [...input.ownedFolderIds] : null;
  const ownedAccess = and(
    eq(notes.userId, input.actorUserId),
    ownedFolderIds ? (ownedFolderIds.length > 0 ? inArray(notes.folderId, ownedFolderIds) : sql`0`) : undefined
  );
  const sharedAccess =
    input.sharedAccessMode === 'none'
      ? sql<boolean>`0`
      : sql<boolean>`(
          ${notes.userId} <> ${input.actorUserId}
          and not exists (
            with recursive integration_private_path(id, parent_folder_id, is_private) as (
              select private_folder.id, private_folder.parent_folder_id, private_folder.is_private
              from ${folders} as private_folder
              where private_folder.id = ${notes.folderId} and private_folder.user_id = ${notes.userId}
              union
              select private_parent.id, private_parent.parent_folder_id, private_parent.is_private
              from ${folders} as private_parent
              inner join integration_private_path as private_child
                on private_parent.id = private_child.parent_folder_id
              where private_parent.user_id = ${notes.userId}
            )
            select 1 from integration_private_path where is_private = 1
          )
          and (
            exists (
              select 1 from ${collaborationGrants} as integration_note_grant
              where integration_note_grant.note_id = ${notes.id}
                and integration_note_grant.owner_user_id = ${notes.userId}
                and integration_note_grant.grantee_user_id = ${input.actorUserId}
                and integration_note_grant.role in ${roles}
                ${selectedDirectScope}
            )
            or exists (
              with recursive integration_folder_path(id, parent_folder_id) as (
                select integration_folder.id, integration_folder.parent_folder_id
                from ${folders} as integration_folder
                where integration_folder.id = ${notes.folderId}
                  and integration_folder.user_id = ${notes.userId}
                union
                select integration_parent.id, integration_parent.parent_folder_id
                from ${folders} as integration_parent
                inner join integration_folder_path as integration_child
                  on integration_parent.id = integration_child.parent_folder_id
                where integration_parent.user_id = ${notes.userId}
              )
              select 1
              from integration_folder_path
              inner join ${collaborationGrants} as integration_folder_grant
                on integration_folder_grant.folder_id = integration_folder_path.id
              where integration_folder_grant.owner_user_id = ${notes.userId}
                and integration_folder_grant.grantee_user_id = ${input.actorUserId}
                and integration_folder_grant.role in ${roles}
                ${selectedFolderScope}
            )
          )
        )`;
  return and(
    collaborationAccessibleNoteWhere(input.actorUserId, capability),
    or(ownedAccess, sharedAccess),
    ...conditions
  );
}

export function integrationAccessibleFolderWhere(
  input: {
    actorUserId: string;
    authorizationId: string;
    sharedAccessMode: SharedAccessMode;
    capability?: CollaborationCapability;
    ownedFolderIds?: ReadonlySet<string> | null;
  },
  ...conditions: Array<SQL | undefined>
) {
  const roles = grantRolesForCapability(input.capability ?? 'read');
  const selectedScope =
    input.sharedAccessMode === 'specific'
      ? sql`and exists (
          select 1 from ${authorizationCollaborationScopes} as folder_scope
          where folder_scope.authorization_id = ${input.authorizationId}
            and folder_scope.user_id = ${input.actorUserId}
            and folder_scope.collaboration_grant_id = integration_folder_grant.id
        )`
      : sql``;
  const ownedFolderIds = input.ownedFolderIds ? [...input.ownedFolderIds] : null;
  const ownedAccess = and(
    eq(folders.userId, input.actorUserId),
    ownedFolderIds ? (ownedFolderIds.length > 0 ? inArray(folders.id, ownedFolderIds) : sql`0`) : undefined
  );
  const sharedAccess =
    input.sharedAccessMode === 'none'
      ? sql<boolean>`0`
      : sql<boolean>`(
          ${folders.userId} <> ${input.actorUserId}
          and not exists (
            with recursive integration_private_path(id, parent_folder_id, is_private) as (
              select private_folder.id, private_folder.parent_folder_id, private_folder.is_private
              from ${folders} as private_folder
              where private_folder.id = ${folders.id} and private_folder.user_id = ${folders.userId}
              union
              select private_parent.id, private_parent.parent_folder_id, private_parent.is_private
              from ${folders} as private_parent
              inner join integration_private_path as private_child
                on private_parent.id = private_child.parent_folder_id
              where private_parent.user_id = ${folders.userId}
            )
            select 1 from integration_private_path where is_private = 1
          )
          and exists (
            with recursive integration_folder_path(id, parent_folder_id) as (
              select integration_folder.id, integration_folder.parent_folder_id
              from ${folders} as integration_folder
              where integration_folder.id = ${folders.id}
                and integration_folder.user_id = ${folders.userId}
              union
              select integration_parent.id, integration_parent.parent_folder_id
              from ${folders} as integration_parent
              inner join integration_folder_path as integration_child
                on integration_parent.id = integration_child.parent_folder_id
              where integration_parent.user_id = ${folders.userId}
            )
            select 1
            from integration_folder_path
            inner join ${collaborationGrants} as integration_folder_grant
              on integration_folder_grant.folder_id = integration_folder_path.id
            where integration_folder_grant.owner_user_id = ${folders.userId}
              and integration_folder_grant.grantee_user_id = ${input.actorUserId}
              and integration_folder_grant.role in ${roles}
              ${selectedScope}
          )
        )`;
  return and(
    isNull(folders.deletedAt),
    sql`exists (
      with recursive active_integration_folder_path(id, parent_folder_id, deleted_at) as (
        select active_folder.id, active_folder.parent_folder_id, active_folder.deleted_at
        from ${folders} as active_folder
        where active_folder.id = ${folders.id} and active_folder.user_id = ${folders.userId}
        union
        select active_parent.id, active_parent.parent_folder_id, active_parent.deleted_at
        from ${folders} as active_parent
        inner join active_integration_folder_path as active_child on active_parent.id = active_child.parent_folder_id
        where active_parent.user_id = ${folders.userId}
      )
      select 1
      where exists (select 1 from active_integration_folder_path where parent_folder_id is null)
        and not exists (select 1 from active_integration_folder_path where deleted_at is not null)
    )`,
    or(ownedAccess, sharedAccess),
    ...conditions
  );
}

export function collaborationAccessibleNoteWhere(
  actorUserId: string,
  capability: CollaborationCapability = 'read',
  ...conditions: Array<SQL | undefined>
) {
  const roles = grantRolesForCapability(capability);
  return and(
    isNull(notes.deletedAt),
    sql`exists (
      with recursive active_collaboration_path(id, parent_folder_id, deleted_at) as (
        select active_folder.id, active_folder.parent_folder_id, active_folder.deleted_at
        from ${folders} as active_folder
        where active_folder.id = ${notes.folderId} and active_folder.user_id = ${notes.userId}
        union
        select active_parent.id, active_parent.parent_folder_id, active_parent.deleted_at
        from ${folders} as active_parent
        inner join active_collaboration_path as active_child on active_parent.id = active_child.parent_folder_id
        where active_parent.user_id = ${notes.userId}
      )
      select 1
      where exists (select 1 from active_collaboration_path where parent_folder_id is null)
        and not exists (select 1 from active_collaboration_path where deleted_at is not null)
    )`,
    or(
      eq(notes.userId, actorUserId),
      sql`exists (
        select 1 from ${collaborationGrants} as direct_note_grant
        where direct_note_grant.note_id = ${notes.id}
          and direct_note_grant.owner_user_id = ${notes.userId}
          and direct_note_grant.grantee_user_id = ${actorUserId}
          and direct_note_grant.role in ${roles}
      )`,
      hasFolderCollaborationAccessSql({
        actorUserId,
        folderId: notes.folderId,
        ownerUserId: notes.userId,
        capability,
      })
    ),
    ...conditions
  );
}

function accessFromGrants(input: {
  actorUserId: string;
  resourceOwnerUserId: string;
  grants: Array<{ id: string; role: CollaborationRole; noteId: string | null }>;
}): CollaborationAccess | null {
  const role = highestCollaborationRole(input.grants.map((grant) => grant.role));
  if (!role) return null;
  const highestGrants = input.grants.filter((grant) => grant.role === role);
  return {
    actorUserId: input.actorUserId,
    resourceOwnerUserId: input.resourceOwnerUserId,
    role,
    source: highestGrants.some((grant) => grant.noteId !== null) ? 'note_grant' : 'folder_grant',
    applicableGrantIds: input.grants.map((grant) => grant.id),
  };
}

function ownerAccess(actorUserId: string): CollaborationAccess {
  return {
    actorUserId,
    resourceOwnerUserId: actorUserId,
    role: 'owner',
    source: 'owner',
    applicableGrantIds: [],
  };
}

export async function resolveFolderCollaborationAccess(input: {
  actorUserId: string;
  folderId: string;
}): Promise<CollaborationAccess | null> {
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, input.folderId), isNull(folders.deletedAt)))
    .limit(1);
  if (!folder) return null;

  const tree = await loadFolderAccessTree(folder.userId);
  if (!tree.byId.has(folder.id)) return null;
  if (folder.userId === input.actorUserId) return ownerAccess(input.actorUserId);

  const ancestorIds = tree.folders
    .filter((candidate) => isDescendantOrSelf(folder.id, candidate.id, tree.byId))
    .map((candidate) => candidate.id);
  if (ancestorIds.length === 0) return null;

  const grants = await db
    .select({
      id: collaborationGrants.id,
      role: collaborationGrants.role,
      noteId: collaborationGrants.noteId,
    })
    .from(collaborationGrants)
    .where(
      and(
        eq(collaborationGrants.granteeUserId, input.actorUserId),
        eq(collaborationGrants.ownerUserId, folder.userId),
        inArray(collaborationGrants.folderId, ancestorIds)
      )
    );

  return accessFromGrants({ actorUserId: input.actorUserId, resourceOwnerUserId: folder.userId, grants });
}

export async function listDirectCollaborationsPage(input: {
  actorUserId: string;
  type: 'note' | 'folder';
  cursor?: string;
  limit?: number;
}) {
  const limit = Math.min(50, Math.max(1, input.limit ?? 25));
  const collaborations = (await listDirectCollaborations(input.actorUserId))
    .filter((item) => item.type === input.type)
    .toSorted((left, right) => {
      const leftUpdatedAt = (left.type === 'note' ? left.note.updatedAt : left.folder.updatedAt).getTime();
      const rightUpdatedAt = (right.type === 'note' ? right.note.updatedAt : right.folder.updatedAt).getTime();
      return rightUpdatedAt - leftUpdatedAt || left.grantId.localeCompare(right.grantId);
    });
  let start = 0;
  if (input.cursor) {
    const decoded = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')) as {
      grantId?: unknown;
      updatedAt?: unknown;
    };
    if (
      typeof decoded.grantId !== 'string' ||
      typeof decoded.updatedAt !== 'number' ||
      !Number.isFinite(decoded.updatedAt)
    )
      throw new Error('Invalid collaboration cursor');
    const cursorGrantId = decoded.grantId;
    const cursorUpdatedAt = decoded.updatedAt;
    const nextIndex = collaborations.findIndex((item) => {
      const updatedAt = (item.type === 'note' ? item.note.updatedAt : item.folder.updatedAt).getTime();
      return updatedAt < cursorUpdatedAt || (updatedAt === cursorUpdatedAt && item.grantId > cursorGrantId);
    });
    start = nextIndex < 0 ? collaborations.length : nextIndex;
  }
  const items = collaborations.slice(start, start + limit);
  const hasMore = start + items.length < collaborations.length;
  const last = items.at(-1);
  const lastUpdatedAt = last ? (last.type === 'note' ? last.note.updatedAt : last.folder.updatedAt).getTime() : null;
  return {
    items,
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last && lastUpdatedAt !== null
          ? Buffer.from(JSON.stringify({ grantId: last.grantId, updatedAt: lastUpdatedAt })).toString('base64url')
          : null,
    },
  };
}

export async function listDirectCollaborations(actorUserId: string) {
  const rows = await db
    .select({
      grant: collaborationGrants,
      owner: { id: user.id, name: user.name, email: user.email },
      note: {
        id: notes.id,
        folderId: notes.folderId,
        title: notes.title,
        documentType: notes.documentType,
        updatedAt: notes.updatedAt,
        deletedAt: notes.deletedAt,
      },
      folder: { id: folders.id, title: folders.title, updatedAt: folders.updatedAt, deletedAt: folders.deletedAt },
    })
    .from(collaborationGrants)
    .innerJoin(user, eq(collaborationGrants.ownerUserId, user.id))
    .leftJoin(notes, eq(collaborationGrants.noteId, notes.id))
    .leftJoin(folders, eq(collaborationGrants.folderId, folders.id))
    .where(eq(collaborationGrants.granteeUserId, actorUserId))
    .orderBy(user.name, folders.title, notes.title);

  const grantsByOwner = new Map<string, (typeof rows)[number]['grant'][]>();
  for (const row of rows) grantsByOwner.set(row.owner.id, [...(grantsByOwner.get(row.owner.id) ?? []), row.grant]);
  const folderTrees = new Map<string, ReturnType<typeof loadFolderAccessTree>>();
  const folderTreeForOwner = (ownerUserId: string) => {
    const cached = folderTrees.get(ownerUserId);
    if (cached) return cached;
    const tree = loadFolderAccessTree(ownerUserId);
    folderTrees.set(ownerUserId, tree);
    return tree;
  };

  const resolved = await Promise.all(
    rows.map(async (row) => {
      const tree = await folderTreeForOwner(row.owner.id);
      const ownerIdentity = serializeCollaborationUserIdentity({ ...row.owner, currentUserId: actorUserId });
      const ownerGrants = grantsByOwner.get(row.owner.id) ?? [];
      const targetNote = row.note;
      if (row.grant.noteId && targetNote && !targetNote.deletedAt && tree.byId.has(targetNote.folderId)) {
        const applicableGrants = ownerGrants.filter(
          (grant) =>
            grant.noteId === targetNote.id ||
            (grant.folderId !== null && isDescendantOrSelf(targetNote.folderId, grant.folderId, tree.byId))
        );
        const access = accessFromGrants({
          actorUserId,
          resourceOwnerUserId: row.owner.id,
          grants: applicableGrants,
        });
        if (!access) return null;
        return {
          type: 'note' as const,
          grantId: publicCollaborationAccessKey(row.grant.id),
          role: access.role,
          owner: ownerIdentity,
          note: {
            id: targetNote.id,
            title: targetNote.title,
            documentType: targetNote.documentType,
            updatedAt: targetNote.updatedAt,
          },
        };
      }
      const targetFolder = row.folder;
      if (row.grant.folderId && targetFolder && !targetFolder.deletedAt && tree.byId.has(targetFolder.id)) {
        const applicableGrants = ownerGrants.filter(
          (grant) => grant.folderId !== null && isDescendantOrSelf(targetFolder.id, grant.folderId, tree.byId)
        );
        const access = accessFromGrants({
          actorUserId,
          resourceOwnerUserId: row.owner.id,
          grants: applicableGrants,
        });
        if (!access) return null;
        return {
          type: 'folder' as const,
          grantId: publicCollaborationAccessKey(row.grant.id),
          role: access.role,
          owner: ownerIdentity,
          folder: { id: targetFolder.id, title: targetFolder.title, updatedAt: targetFolder.updatedAt },
        };
      }
      return null;
    })
  );

  return resolved.filter((item): item is NonNullable<typeof item> => item !== null);
}

async function integrationScopeAllows(input: {
  authorizationId: string;
  actorUserId: string;
  sharedAccessMode: SharedAccessMode;
  access: CollaborationAccess;
}) {
  if (input.access.source === 'owner') return true;
  if (input.sharedAccessMode === 'none') return false;
  if (input.sharedAccessMode === 'all') return true;
  if (input.access.applicableGrantIds.length === 0) return false;
  const [selected] = await db
    .select({ id: authorizationCollaborationScopes.id })
    .from(authorizationCollaborationScopes)
    .where(
      and(
        eq(authorizationCollaborationScopes.authorizationId, input.authorizationId),
        eq(authorizationCollaborationScopes.userId, input.actorUserId),
        inArray(authorizationCollaborationScopes.collaborationGrantId, input.access.applicableGrantIds)
      )
    )
    .limit(1);
  return Boolean(selected);
}

export async function resolveIntegrationNoteAccess(input: {
  actorUserId: string;
  authorizationId: string;
  sharedAccessMode: SharedAccessMode;
  noteId: string;
  capability: CollaborationCapability;
}) {
  const access = await resolveNoteCollaborationAccess({ actorUserId: input.actorUserId, noteId: input.noteId });
  if (!access || !collaborationRoleAllows(access.role, input.capability)) return null;
  if (!(await integrationScopeAllows({ ...input, access }))) return null;

  const [note] = await db
    .select({ folderId: notes.folderId, isApiEditable: notes.isApiEditable })
    .from(notes)
    .where(and(eq(notes.id, input.noteId), eq(notes.userId, access.resourceOwnerUserId)))
    .limit(1);
  if (!note) return null;
  const tree = await loadFolderAccessTree(access.resourceOwnerUserId);
  if (tree.privateFolderIds.has(note.folderId)) return null;
  if (
    (input.capability === 'edit' || input.capability === 'create') &&
    (tree.agentReadOnlyFolderIds.has(note.folderId) || !note.isApiEditable)
  )
    return null;
  return access;
}

export async function resolveIntegrationFolderAccess(input: {
  actorUserId: string;
  authorizationId: string;
  sharedAccessMode: SharedAccessMode;
  folderId: string;
  capability: CollaborationCapability;
}) {
  const access = await resolveFolderCollaborationAccess({ actorUserId: input.actorUserId, folderId: input.folderId });
  if (!access || !collaborationRoleAllows(access.role, input.capability)) return null;
  if (!(await integrationScopeAllows({ ...input, access }))) return null;
  const tree = await loadFolderAccessTree(access.resourceOwnerUserId);
  if (tree.privateFolderIds.has(input.folderId)) return null;
  if ((input.capability === 'edit' || input.capability === 'create') && tree.agentReadOnlyFolderIds.has(input.folderId))
    return null;
  return access;
}

export async function resolveNoteCollaborationAccess(input: {
  actorUserId: string;
  noteId: string;
}): Promise<CollaborationAccess | null> {
  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, input.noteId), isNull(notes.deletedAt)))
    .limit(1);
  if (!note) return null;

  const tree = await loadFolderAccessTree(note.userId);
  if (!tree.byId.has(note.folderId)) return null;
  if (note.userId === input.actorUserId) return ownerAccess(input.actorUserId);

  const ancestorIds = tree.folders
    .filter((candidate) => isDescendantOrSelf(note.folderId, candidate.id, tree.byId))
    .map((candidate) => candidate.id);
  const grants = await db
    .select({
      id: collaborationGrants.id,
      role: collaborationGrants.role,
      noteId: collaborationGrants.noteId,
    })
    .from(collaborationGrants)
    .where(
      and(
        eq(collaborationGrants.granteeUserId, input.actorUserId),
        eq(collaborationGrants.ownerUserId, note.userId),
        or(
          eq(collaborationGrants.noteId, note.id),
          ancestorIds.length > 0 ? inArray(collaborationGrants.folderId, ancestorIds) : undefined
        )
      )
    );

  return accessFromGrants({ actorUserId: input.actorUserId, resourceOwnerUserId: note.userId, grants });
}
