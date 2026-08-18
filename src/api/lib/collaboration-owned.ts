import { and, asc, count, desc, eq, gt, inArray, isNull, lt, lte, or, type SQL, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  collaborationGrants,
  collaborationInvitations,
  folderShareLinks,
  folders,
  noteShareLinks,
  notes,
} from '../db/schema';
import { activeFolderWhere, activeNoteWhere } from '../trash/policy';

export type OwnedSharedResourceType = 'note' | 'folder';

type OwnedSharingCursor = {
  version: 1;
  type: OwnedSharedResourceType;
  query: string;
  resourceId: string;
  updatedAt: number;
};

function normalizeQuery(value: string | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function escapeLike(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

export class InvalidOwnedSharingCursorError extends Error {}

function decodeCursor(value: string | undefined, type: OwnedSharedResourceType, query: string) {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<OwnedSharingCursor>;
    if (
      decoded.version !== 1 ||
      decoded.type !== type ||
      decoded.query !== query ||
      typeof decoded.resourceId !== 'string' ||
      decoded.resourceId.length === 0 ||
      typeof decoded.updatedAt !== 'number' ||
      !Number.isSafeInteger(decoded.updatedAt) ||
      Number.isNaN(new Date(decoded.updatedAt).getTime())
    )
      throw new InvalidOwnedSharingCursorError();
    return decoded as OwnedSharingCursor;
  } catch (error) {
    if (error instanceof InvalidOwnedSharingCursorError) throw error;
    throw new InvalidOwnedSharingCursorError();
  }
}

function encodeCursor(cursor: OwnedSharingCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function sharingExpressions(input: {
  ownerUserId: string;
  resourceId: typeof notes.id | typeof folders.id;
  type: OwnedSharedResourceType;
}) {
  const grantTarget = input.type === 'note' ? collaborationGrants.noteId : collaborationGrants.folderId;
  const invitationTarget = input.type === 'note' ? collaborationInvitations.noteId : collaborationInvitations.folderId;
  const shareTable = input.type === 'note' ? noteShareLinks : folderShareLinks;
  const shareTarget = input.type === 'note' ? noteShareLinks.noteId : folderShareLinks.folderId;
  const now = new Date();
  const hasSharing = sql<boolean>`(
    exists (
      select 1
      from ${collaborationGrants}
      where ${collaborationGrants.ownerUserId} = ${input.ownerUserId}
        and ${grantTarget} = ${input.resourceId}
    )
    or exists (
      select 1
      from ${collaborationInvitations}
      where ${collaborationInvitations.ownerUserId} = ${input.ownerUserId}
        and ${invitationTarget} = ${input.resourceId}
        and ${collaborationInvitations.acceptedAt} is null
        and ${collaborationInvitations.revokedAt} is null
    )
    or exists (
      select 1
      from ${shareTable}
      where ${shareTable.userId} = ${input.ownerUserId}
        and ${shareTarget} = ${input.resourceId}
        and ${shareTable.revokedAt} is null
        and (${shareTable.expiresAt} is null or ${gt(shareTable.expiresAt, now)})
    )
  )`;
  return { hasSharing };
}

function cursorWhere(
  cursor: OwnedSharingCursor | null,
  resource: { id: typeof notes.id | typeof folders.id; updatedAt: typeof notes.updatedAt | typeof folders.updatedAt }
): SQL | undefined {
  if (!cursor) return undefined;
  const updatedAt = new Date(cursor.updatedAt);
  return or(
    lt(resource.updatedAt, updatedAt),
    and(eq(resource.updatedAt, updatedAt), gt(resource.id, cursor.resourceId))
  );
}

export async function listOwnedSharedResourcesPage(input: {
  ownerUserId: string;
  type: OwnedSharedResourceType;
  query?: string;
  cursor?: string;
  limit?: number;
}) {
  const limit = Math.min(50, Math.max(1, input.limit ?? 25));
  const query = normalizeQuery(input.query);
  const cursor = decodeCursor(input.cursor, input.type, query);
  const titleQuery = query ? `%${escapeLike(query)}%` : null;
  const expressions = sharingExpressions({
    ownerUserId: input.ownerUserId,
    type: input.type,
    resourceId: input.type === 'note' ? notes.id : folders.id,
  });

  const rows =
    input.type === 'note'
      ? await db
          .select({ id: notes.id, title: notes.title, updatedAt: notes.updatedAt })
          .from(notes)
          .where(
            activeNoteWhere(
              input.ownerUserId,
              eq(notes.type, 'note'),
              expressions.hasSharing,
              titleQuery ? sql`lower(${notes.title}) like ${titleQuery} escape '\\'` : undefined,
              cursorWhere(cursor, notes)
            )
          )
          .orderBy(desc(notes.updatedAt), asc(notes.id))
          .limit(limit + 1)
      : await db
          .select({ id: folders.id, title: folders.title, updatedAt: folders.updatedAt })
          .from(folders)
          .where(
            activeFolderWhere(
              input.ownerUserId,
              expressions.hasSharing,
              titleQuery ? sql`lower(${folders.title}) like ${titleQuery} escape '\\'` : undefined,
              cursorWhere(cursor, folders)
            )
          )
          .orderBy(desc(folders.updatedAt), asc(folders.id))
          .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visible = rows.slice(0, limit);
  const visibleIds = visible.map((row) => row.id);
  const grantTarget = input.type === 'note' ? collaborationGrants.noteId : collaborationGrants.folderId;
  const invitationTarget = input.type === 'note' ? collaborationInvitations.noteId : collaborationInvitations.folderId;
  const shareTable = input.type === 'note' ? noteShareLinks : folderShareLinks;
  const shareTarget = input.type === 'note' ? noteShareLinks.noteId : folderShareLinks.folderId;
  const now = new Date();
  const [grantCounts, invitationCounts, activeShares] =
    visibleIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          db
            .select({ resourceId: grantTarget, value: count() })
            .from(collaborationGrants)
            .where(
              and(
                eq(collaborationGrants.ownerUserId, input.ownerUserId),
                isNull(input.type === 'note' ? collaborationGrants.folderId : collaborationGrants.noteId),
                inArray(grantTarget, visibleIds)
              )
            )
            .groupBy(grantTarget),
          db
            .select({
              resourceId: invitationTarget,
              pending:
                sql<number>`sum(case when ${gt(collaborationInvitations.expiresAt, now)} then 1 else 0 end)`.mapWith(
                  Number
                ),
              expired:
                sql<number>`sum(case when ${lte(collaborationInvitations.expiresAt, now)} then 1 else 0 end)`.mapWith(
                  Number
                ),
            })
            .from(collaborationInvitations)
            .where(
              and(
                eq(collaborationInvitations.ownerUserId, input.ownerUserId),
                isNull(collaborationInvitations.acceptedAt),
                isNull(collaborationInvitations.revokedAt),
                isNull(input.type === 'note' ? collaborationInvitations.folderId : collaborationInvitations.noteId),
                inArray(invitationTarget, visibleIds)
              )
            )
            .groupBy(invitationTarget),
          db
            .selectDistinct({ resourceId: shareTarget })
            .from(shareTable)
            .where(
              and(
                eq(shareTable.userId, input.ownerUserId),
                isNull(shareTable.revokedAt),
                or(isNull(shareTable.expiresAt), gt(shareTable.expiresAt, now)),
                inArray(shareTarget, visibleIds)
              )
            ),
        ]);
  const grantsByResource = new Map(grantCounts.map((row) => [row.resourceId, row.value]));
  const invitationsByResource = new Map(invitationCounts.map((row) => [row.resourceId, row]));
  const publicResourceIds = new Set(activeShares.map((row) => row.resourceId));
  const items = visible.map((row) => ({
    type: input.type,
    resource: { id: row.id, title: row.title, updatedAt: row.updatedAt },
    activeCollaboratorCount: grantsByResource.get(row.id) ?? 0,
    pendingInvitationCount: invitationsByResource.get(row.id)?.pending ?? 0,
    expiredInvitationCount: invitationsByResource.get(row.id)?.expired ?? 0,
    publicLinkActive: publicResourceIds.has(row.id),
  }));
  const last = visible.at(-1);
  return {
    items,
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeCursor({
              version: 1,
              type: input.type,
              query,
              resourceId: last.id,
              updatedAt: last.updatedAt.getTime(),
            })
          : null,
    },
  };
}
