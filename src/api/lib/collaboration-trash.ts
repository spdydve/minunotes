import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../db/client';
import { collaborationGrants, collaborationInvitations, folderShareLinks, noteShareLinks, notes } from '../db/schema';
import { activeNoteWhere } from '../trash/policy';
import {
  type CollaborationAccess,
  collaborationRoleAllows,
  resolveFolderCollaborationAccess,
  resolveFolderCollaborationAccessBatch,
  resolveNoteCollaborationAccess,
} from './collaboration-access';
import { isDescendantOrSelf, loadFolderAccessTree } from './folder-access';

export type CreatorScopedTrashEligibility =
  | { allowed: true; resourceOwnerUserId: string }
  | { allowed: false; reason: 'not_found' | 'forbidden' | 'sharing_conflict' };

async function noteHasOwnerManagedSharing(ownerUserId: string, noteId: string) {
  const now = new Date();
  const [grant, invitation, publicLink] = await Promise.all([
    db
      .select({ id: collaborationGrants.id })
      .from(collaborationGrants)
      .where(and(eq(collaborationGrants.ownerUserId, ownerUserId), eq(collaborationGrants.noteId, noteId)))
      .limit(1),
    db
      .select({ id: collaborationInvitations.id })
      .from(collaborationInvitations)
      .where(
        and(
          eq(collaborationInvitations.ownerUserId, ownerUserId),
          eq(collaborationInvitations.noteId, noteId),
          isNull(collaborationInvitations.acceptedAt),
          isNull(collaborationInvitations.revokedAt)
        )
      )
      .limit(1),
    db
      .select({ id: noteShareLinks.id })
      .from(noteShareLinks)
      .where(
        and(
          eq(noteShareLinks.userId, ownerUserId),
          eq(noteShareLinks.noteId, noteId),
          isNull(noteShareLinks.revokedAt),
          or(isNull(noteShareLinks.expiresAt), gt(noteShareLinks.expiresAt, now))
        )
      )
      .limit(1),
  ]);
  return Boolean(grant[0] || invitation[0] || publicLink[0]);
}

async function subtreeHasOwnerManagedSharing(ownerUserId: string, folderIds: string[], noteIds: string[]) {
  const now = new Date();
  const targetConditions = [
    folderIds.length > 0 ? inArray(collaborationGrants.folderId, folderIds) : undefined,
    noteIds.length > 0 ? inArray(collaborationGrants.noteId, noteIds) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const invitationTargetConditions = [
    folderIds.length > 0 ? inArray(collaborationInvitations.folderId, folderIds) : undefined,
    noteIds.length > 0 ? inArray(collaborationInvitations.noteId, noteIds) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const [grant, invitation, notePublicLink, folderPublicLink] = await Promise.all([
    targetConditions.length > 0
      ? db
          .select({ id: collaborationGrants.id })
          .from(collaborationGrants)
          .where(and(eq(collaborationGrants.ownerUserId, ownerUserId), or(...targetConditions)))
          .limit(1)
      : [],
    invitationTargetConditions.length > 0
      ? db
          .select({ id: collaborationInvitations.id })
          .from(collaborationInvitations)
          .where(
            and(
              eq(collaborationInvitations.ownerUserId, ownerUserId),
              isNull(collaborationInvitations.acceptedAt),
              isNull(collaborationInvitations.revokedAt),
              or(...invitationTargetConditions)
            )
          )
          .limit(1)
      : [],
    noteIds.length > 0
      ? db
          .select({ id: noteShareLinks.id })
          .from(noteShareLinks)
          .where(
            and(
              eq(noteShareLinks.userId, ownerUserId),
              inArray(noteShareLinks.noteId, noteIds),
              isNull(noteShareLinks.revokedAt),
              or(isNull(noteShareLinks.expiresAt), gt(noteShareLinks.expiresAt, now))
            )
          )
          .limit(1)
      : [],
    folderIds.length > 0
      ? db
          .select({ id: folderShareLinks.id })
          .from(folderShareLinks)
          .where(
            and(
              eq(folderShareLinks.userId, ownerUserId),
              inArray(folderShareLinks.folderId, folderIds),
              isNull(folderShareLinks.revokedAt),
              or(isNull(folderShareLinks.expiresAt), gt(folderShareLinks.expiresAt, now))
            )
          )
          .limit(1)
      : [],
  ]);
  return Boolean(grant[0] || invitation[0] || notePublicLink[0] || folderPublicLink[0]);
}

export async function listTrashableNoteIds(input: {
  actorUserId: string;
  noteIds: string[];
  access: CollaborationAccess;
}) {
  const noteIds = [...new Set(input.noteIds)];
  if (noteIds.length === 0) return new Set<string>();
  if (input.access.role === 'owner') return new Set(noteIds);
  if (!collaborationRoleAllows(input.access.role, 'edit')) return new Set<string>();

  const creatorRows = await db
    .select({ id: notes.id })
    .from(notes)
    .where(
      activeNoteWhere(
        input.access.resourceOwnerUserId,
        inArray(notes.id, noteIds),
        eq(notes.type, 'note'),
        eq(notes.createdByUserId, input.actorUserId)
      )
    );
  const candidates = creatorRows.map((note) => note.id);
  if (candidates.length === 0) return new Set<string>();
  const now = new Date();
  const [grantRows, invitationRows, publicLinkRows] = await Promise.all([
    db
      .select({ noteId: collaborationGrants.noteId })
      .from(collaborationGrants)
      .where(
        and(
          eq(collaborationGrants.ownerUserId, input.access.resourceOwnerUserId),
          inArray(collaborationGrants.noteId, candidates)
        )
      ),
    db
      .select({ noteId: collaborationInvitations.noteId })
      .from(collaborationInvitations)
      .where(
        and(
          eq(collaborationInvitations.ownerUserId, input.access.resourceOwnerUserId),
          inArray(collaborationInvitations.noteId, candidates),
          isNull(collaborationInvitations.acceptedAt),
          isNull(collaborationInvitations.revokedAt)
        )
      ),
    db
      .select({ noteId: noteShareLinks.noteId })
      .from(noteShareLinks)
      .where(
        and(
          eq(noteShareLinks.userId, input.access.resourceOwnerUserId),
          inArray(noteShareLinks.noteId, candidates),
          isNull(noteShareLinks.revokedAt),
          or(isNull(noteShareLinks.expiresAt), gt(noteShareLinks.expiresAt, now))
        )
      ),
  ]);
  const blocked = new Set([
    ...grantRows.flatMap((row) => (row.noteId ? [row.noteId] : [])),
    ...invitationRows.flatMap((row) => (row.noteId ? [row.noteId] : [])),
    ...publicLinkRows.map((row) => row.noteId),
  ]);
  return new Set(candidates.filter((noteId) => !blocked.has(noteId)));
}

export async function listTrashableFolderIds(input: {
  actorUserId: string;
  resources: ReadonlyArray<{ id: string; userId: string }>;
}) {
  const resources = [...new Map(input.resources.map((resource) => [resource.id, resource])).values()];
  if (resources.length === 0) return new Set<string>();
  if (resources.every((resource) => resource.userId === input.actorUserId))
    return new Set(resources.map((resource) => resource.id));

  const ownerIds = [...new Set(resources.map((resource) => resource.userId))];
  if (ownerIds.length !== 1) return new Set<string>();
  const ownerUserId = ownerIds[0];
  const [tree, accessByFolderId] = await Promise.all([
    loadFolderAccessTree(ownerUserId),
    resolveFolderCollaborationAccessBatch({ actorUserId: input.actorUserId, resources }),
  ]);
  const eligibleResources = resources.filter((resource) => {
    const access = accessByFolderId.get(resource.id);
    const folder = tree.byId.get(resource.id);
    return access && collaborationRoleAllows(access.role, 'edit') && folder?.createdByUserId === input.actorUserId;
  });
  if (eligibleResources.length === 0) return new Set<string>();

  const eligibleSubtrees = eligibleResources.flatMap((resource) => {
    const subtreeFolders = tree.folders.filter((folder) => isDescendantOrSelf(folder.id, resource.id, tree.byId));
    return subtreeFolders.some((folder) => folder.createdByUserId !== input.actorUserId)
      ? []
      : [{ resource, subtreeFolders }];
  });
  if (eligibleSubtrees.length === 0) return new Set<string>();

  const relevantFolderIds = [
    ...new Set(eligibleSubtrees.flatMap(({ subtreeFolders }) => subtreeFolders.map((folder) => folder.id))),
  ];
  const activeNotes: Array<{ id: string; folderId: string; createdByUserId: string | null }> = [];
  for (let start = 0; start < relevantFolderIds.length; start += 500) {
    activeNotes.push(
      ...(await db
        .select({ id: notes.id, folderId: notes.folderId, createdByUserId: notes.createdByUserId })
        .from(notes)
        .where(
          and(
            eq(notes.userId, ownerUserId),
            isNull(notes.deletedAt),
            inArray(notes.folderId, relevantFolderIds.slice(start, start + 500))
          )
        ))
    );
  }

  const now = new Date();
  const [grantRows, invitationRows, notePublicLinkRows, folderPublicLinkRows] = await Promise.all([
    db
      .select({ folderId: collaborationGrants.folderId, noteId: collaborationGrants.noteId })
      .from(collaborationGrants)
      .where(eq(collaborationGrants.ownerUserId, ownerUserId)),
    db
      .select({ folderId: collaborationInvitations.folderId, noteId: collaborationInvitations.noteId })
      .from(collaborationInvitations)
      .where(
        and(
          eq(collaborationInvitations.ownerUserId, ownerUserId),
          isNull(collaborationInvitations.acceptedAt),
          isNull(collaborationInvitations.revokedAt)
        )
      ),
    db
      .select({ noteId: noteShareLinks.noteId })
      .from(noteShareLinks)
      .where(
        and(
          eq(noteShareLinks.userId, ownerUserId),
          isNull(noteShareLinks.revokedAt),
          or(isNull(noteShareLinks.expiresAt), gt(noteShareLinks.expiresAt, now))
        )
      ),
    db
      .select({ folderId: folderShareLinks.folderId })
      .from(folderShareLinks)
      .where(
        and(
          eq(folderShareLinks.userId, ownerUserId),
          isNull(folderShareLinks.revokedAt),
          or(isNull(folderShareLinks.expiresAt), gt(folderShareLinks.expiresAt, now))
        )
      ),
  ]);
  const sharedFolderIds = new Set([
    ...grantRows.flatMap((row) => (row.folderId ? [row.folderId] : [])),
    ...invitationRows.flatMap((row) => (row.folderId ? [row.folderId] : [])),
    ...folderPublicLinkRows.map((row) => row.folderId),
  ]);
  const sharedNoteIds = new Set([
    ...grantRows.flatMap((row) => (row.noteId ? [row.noteId] : [])),
    ...invitationRows.flatMap((row) => (row.noteId ? [row.noteId] : [])),
    ...notePublicLinkRows.map((row) => row.noteId),
  ]);
  const trashableIds = new Set<string>();

  for (const { resource, subtreeFolders } of eligibleSubtrees) {
    const subtreeFolderIds = new Set(subtreeFolders.map((folder) => folder.id));
    const subtreeNotes = activeNotes.filter((note) => subtreeFolderIds.has(note.folderId));
    if (subtreeNotes.some((note) => note.createdByUserId !== input.actorUserId)) continue;
    if (subtreeFolders.some((folder) => sharedFolderIds.has(folder.id))) continue;
    if (subtreeNotes.some((note) => sharedNoteIds.has(note.id))) continue;
    trashableIds.add(resource.id);
  }

  return trashableIds;
}

export async function resolveNoteTrashEligibility(input: {
  actorUserId: string;
  noteId: string;
  access?: CollaborationAccess | null;
}): Promise<CreatorScopedTrashEligibility> {
  const access =
    input.access ?? (await resolveNoteCollaborationAccess({ actorUserId: input.actorUserId, noteId: input.noteId }));
  if (!access) return { allowed: false, reason: 'not_found' };
  const [note] = await db
    .select({
      id: notes.id,
      userId: notes.userId,
      folderId: notes.folderId,
      type: notes.type,
      createdByUserId: notes.createdByUserId,
    })
    .from(notes)
    .where(activeNoteWhere(access.resourceOwnerUserId, eq(notes.id, input.noteId)))
    .limit(1);
  if (!note) return { allowed: false, reason: 'not_found' };
  if (access.role === 'owner') return { allowed: true, resourceOwnerUserId: note.userId };
  if (note.type !== 'note' || note.createdByUserId !== input.actorUserId)
    return { allowed: false, reason: 'forbidden' };
  const folderAccess = await resolveFolderCollaborationAccess({
    actorUserId: input.actorUserId,
    folderId: note.folderId,
  });
  if (
    !folderAccess ||
    folderAccess.resourceOwnerUserId !== note.userId ||
    !collaborationRoleAllows(folderAccess.role, 'edit')
  )
    return { allowed: false, reason: 'forbidden' };
  if (await noteHasOwnerManagedSharing(note.userId, note.id)) return { allowed: false, reason: 'sharing_conflict' };
  return { allowed: true, resourceOwnerUserId: note.userId };
}

export async function resolveFolderTrashEligibility(input: {
  actorUserId: string;
  folderId: string;
  access?: CollaborationAccess | null;
}): Promise<CreatorScopedTrashEligibility> {
  const access =
    input.access ??
    (await resolveFolderCollaborationAccess({ actorUserId: input.actorUserId, folderId: input.folderId }));
  if (!access) return { allowed: false, reason: 'not_found' };
  const tree = await loadFolderAccessTree(access.resourceOwnerUserId);
  const root = tree.byId.get(input.folderId);
  if (!root) return { allowed: false, reason: 'not_found' };
  if (access.role === 'owner') return { allowed: true, resourceOwnerUserId: root.userId };
  if (!collaborationRoleAllows(access.role, 'edit') || root.createdByUserId !== input.actorUserId)
    return { allowed: false, reason: 'forbidden' };

  const subtreeFolders = tree.folders.filter((folder) => isDescendantOrSelf(folder.id, root.id, tree.byId));
  if (subtreeFolders.some((folder) => folder.createdByUserId !== input.actorUserId))
    return { allowed: false, reason: 'forbidden' };
  const folderIds = subtreeFolders.map((folder) => folder.id);
  const subtreeNotes = await db
    .select({ id: notes.id, createdByUserId: notes.createdByUserId })
    .from(notes)
    .where(activeNoteWhere(root.userId, inArray(notes.folderId, folderIds)));
  if (subtreeNotes.some((note) => note.createdByUserId !== input.actorUserId))
    return { allowed: false, reason: 'forbidden' };
  if (
    await subtreeHasOwnerManagedSharing(
      root.userId,
      folderIds,
      subtreeNotes.map((note) => note.id)
    )
  )
    return { allowed: false, reason: 'sharing_conflict' };
  return { allowed: true, resourceOwnerUserId: root.userId };
}

export function trashEligibilityStatus(eligibility: CreatorScopedTrashEligibility) {
  if (eligibility.allowed) return null;
  if (eligibility.reason === 'not_found') return { status: 404 as const, error: 'Resource not found' };
  if (eligibility.reason === 'sharing_conflict')
    return {
      status: 409 as const,
      error: 'Owner-managed sharing must be removed before moving this resource to Trash',
    };
  return { status: 403 as const, error: 'You can only move resources you created in a shared folder to Trash' };
}
