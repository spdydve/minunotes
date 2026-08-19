import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { attachments, folderShareLinks, folders, noteShareLinks, notes } from '../db/schema';
import { hashShareToken } from '../lib/share-tokens';
import { sanitizeCanvasNoteLinksForVisibleTargets } from '../notes/links';
import {
  databaseSharedWikilinkRepository,
  resolveSourceWikilinks,
  type SharedWikilinkRepository,
} from '../shared/wikilink-resolver';
import { getObjectStorage } from '../storage';
import { activeNoteWhere, filterActiveFolderHierarchy } from '../trash/policy';
import { attachmentContentResponse } from './attachments';

export const shareRoutes = new Hono();

async function loadActiveNoteShare(token: string) {
  const tokenHash = hashShareToken(token);
  const now = new Date();
  const [row] = await db
    .select({
      note: notes,
      share: {
        id: noteShareLinks.id,
        permission: noteShareLinks.permission,
        createdAt: noteShareLinks.createdAt,
      },
    })
    .from(noteShareLinks)
    .innerJoin(notes, eq(noteShareLinks.noteId, notes.id))
    .innerJoin(folders, eq(notes.folderId, folders.id))
    .where(
      and(
        eq(noteShareLinks.tokenHash, tokenHash),
        isNull(notes.deletedAt),
        isNull(folders.deletedAt),
        isNull(noteShareLinks.revokedAt),
        or(isNull(noteShareLinks.expiresAt), gt(noteShareLinks.expiresAt, now))
      )
    )
    .limit(1);
  if (!row) return null;
  const activeFolders = await loadUserFolders(row.note.userId);
  return activeFolders.some((folder) => folder.id === row.note.folderId) ? row : null;
}

async function loadActiveFolderShare(token: string) {
  const tokenHash = hashShareToken(token);
  const now = new Date();
  const [row] = await db
    .select({
      folder: folders,
      share: {
        id: folderShareLinks.id,
        permission: folderShareLinks.permission,
        createdAt: folderShareLinks.createdAt,
      },
    })
    .from(folderShareLinks)
    .innerJoin(folders, eq(folderShareLinks.folderId, folders.id))
    .where(
      and(
        eq(folderShareLinks.tokenHash, tokenHash),
        isNull(folders.deletedAt),
        isNull(folderShareLinks.revokedAt),
        or(isNull(folderShareLinks.expiresAt), gt(folderShareLinks.expiresAt, now))
      )
    )
    .limit(1);
  if (!row) return null;
  const activeFolders = await loadUserFolders(row.folder.userId);
  return activeFolders.some((folder) => folder.id === row.folder.id) ? row : null;
}

async function loadUserFolders(userId: string) {
  const rows = await db
    .select({
      id: folders.id,
      parentFolderId: folders.parentFolderId,
      title: folders.title,
      updatedAt: folders.updatedAt,
    })
    .from(folders)
    .where(and(eq(folders.userId, userId), isNull(folders.deletedAt)))
    .orderBy(asc(folders.title));
  return filterActiveFolderHierarchy(rows);
}

function collectFolderTreeIds(rootFolderId: string, userFolders: Array<{ id: string; parentFolderId: string | null }>) {
  const folderIds = new Set([rootFolderId]);
  let added = true;
  while (added) {
    added = false;
    for (const folder of userFolders) {
      if (folder.parentFolderId && folderIds.has(folder.parentFolderId) && !folderIds.has(folder.id)) {
        folderIds.add(folder.id);
        added = true;
      }
    }
  }
  return folderIds;
}

async function loadSharedAttachment(input: { userId: string; noteId: string; attachmentId: string }) {
  const [attachment] = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, input.attachmentId),
        eq(attachments.userId, input.userId),
        eq(attachments.noteId, input.noteId),
        isNull(attachments.deletedAt),
        eq(attachments.status, 'ready')
      )
    )
    .limit(1);
  if (!attachment) return null;
  const object = await getObjectStorage().getObject({ key: attachment.storageKey });
  return object ? { attachment, object } : null;
}

function sharedAttachmentResponse(result: NonNullable<Awaited<ReturnType<typeof loadSharedAttachment>>>) {
  return attachmentContentResponse({
    body: result.object.body,
    contentType: result.object.contentType ?? result.attachment.mimeType,
    cacheControl: 'no-store',
    sandbox: true,
  });
}

shareRoutes.get('/folders/:token/notes/:noteId/attachments/:attachmentId/content', async (c) => {
  const token = c.req.param('token').trim();
  if (!token) return c.json({ error: 'Shared attachment not found' }, 404);

  const row = await loadActiveFolderShare(token);
  if (!row) return c.json({ error: 'Shared attachment not found' }, 404);
  const userFolders = await loadUserFolders(row.folder.userId);
  const folderIds = collectFolderTreeIds(row.folder.id, userFolders);
  const noteId = c.req.param('noteId');
  const [source] = await db
    .select({ id: notes.id, folderId: notes.folderId })
    .from(notes)
    .where(activeNoteWhere(row.folder.userId, eq(notes.id, noteId), eq(notes.type, 'note')))
    .limit(1);
  if (!source || !folderIds.has(source.folderId)) return c.json({ error: 'Shared attachment not found' }, 404);

  const result = await loadSharedAttachment({
    userId: row.folder.userId,
    noteId: source.id,
    attachmentId: c.req.param('attachmentId'),
  });
  return result ? sharedAttachmentResponse(result) : c.json({ error: 'Shared attachment not found' }, 404);
});

shareRoutes.get('/:token/attachments/:attachmentId/content', async (c) => {
  const token = c.req.param('token').trim();
  if (!token) return c.json({ error: 'Shared attachment not found' }, 404);

  const row = await loadActiveNoteShare(token);
  if (!row) return c.json({ error: 'Shared attachment not found' }, 404);
  const result = await loadSharedAttachment({
    userId: row.note.userId,
    noteId: row.note.id,
    attachmentId: c.req.param('attachmentId'),
  });
  return result ? sharedAttachmentResponse(result) : c.json({ error: 'Shared attachment not found' }, 404);
});

shareRoutes.get('/folders/:token/notes/:noteId/wikilinks', async (c) => {
  const token = c.req.param('token').trim();
  if (!token) return c.json({ error: 'Shared note not found' }, 404);

  const row = await loadActiveFolderShare(token);
  if (!row) return c.json({ error: 'Shared note not found' }, 404);
  const userFolders = await loadUserFolders(row.folder.userId);
  const folderIds = collectFolderTreeIds(row.folder.id, userFolders);
  const [source] = await db
    .select()
    .from(notes)
    .where(activeNoteWhere(row.folder.userId, eq(notes.id, c.req.param('noteId')), eq(notes.type, 'note')))
    .limit(1);
  if (!source || !folderIds.has(source.folderId)) return c.json({ error: 'Shared note not found' }, 404);

  const repository: SharedWikilinkRepository = {
    ...databaseSharedWikilinkRepository,
    listFolders: async () => userFolders,
  };
  const resolutions = await resolveSourceWikilinks(
    { kind: 'folder', token, folderId: row.folder.id, source },
    { repository }
  );
  return c.json({ resolutions });
});

shareRoutes.get('/folders/:token', async (c) => {
  const token = c.req.param('token').trim();
  if (!token) return c.json({ error: 'Shared folder not found' }, 404);

  const row = await loadActiveFolderShare(token);
  if (!row) return c.json({ error: 'Shared folder not found' }, 404);
  const userFolders = await loadUserFolders(row.folder.userId);
  const folderIds = collectFolderTreeIds(row.folder.id, userFolders);
  const sharedNotes = await db
    .select({
      id: notes.id,
      folderId: notes.folderId,
      title: notes.title,
      content: notes.content,
      documentType: notes.documentType,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(activeNoteWhere(row.folder.userId, eq(notes.type, 'note')))
    .orderBy(asc(notes.title));

  const visibleNotes = sharedNotes.filter((note) => folderIds.has(note.folderId));
  const visibleNoteIds = new Set(visibleNotes.map((note) => note.id));
  return c.json({
    folder: {
      id: row.folder.id,
      title: row.folder.title,
      updatedAt: row.folder.updatedAt,
    },
    folders: userFolders.filter((folder) => folder.id !== row.folder.id && folderIds.has(folder.id)),
    notes: visibleNotes.map((note) =>
      note.documentType.startsWith('canvas.')
        ? {
            ...note,
            content: sanitizeCanvasNoteLinksForVisibleTargets({
              content: note.content,
              visibleTargetIds: visibleNoteIds,
            }).content,
          }
        : note
    ),
    share: row.share,
  });
});

shareRoutes.get('/:token', async (c) => {
  const token = c.req.param('token').trim();
  if (!token) return c.json({ error: 'Shared note not found' }, 404);

  const row = await loadActiveNoteShare(token);
  if (!row) return c.json({ error: 'Shared note not found' }, 404);
  const resolutions = await resolveSourceWikilinks({ kind: 'note', token, source: row.note });
  const content = row.note.documentType.startsWith('canvas.')
    ? sanitizeCanvasNoteLinksForVisibleTargets({ content: row.note.content, visibleTargetIds: new Set() }).content
    : row.note.content;
  return c.json({
    note: {
      title: row.note.title,
      content,
      documentType: row.note.documentType,
      updatedAt: row.note.updatedAt,
    },
    share: row.share,
    resolutions,
  });
});
