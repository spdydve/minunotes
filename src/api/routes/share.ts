import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { folderShareLinks, folders, noteShareLinks, notes } from '../db/schema';
import { hashShareToken } from '../lib/share-tokens';

export const shareRoutes = new Hono();

shareRoutes.get('/folders/:token', async (c) => {
  const token = c.req.param('token').trim();
  if (!token) return c.json({ error: 'Shared folder not found' }, 404);

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
        isNull(folderShareLinks.revokedAt),
        or(isNull(folderShareLinks.expiresAt), gt(folderShareLinks.expiresAt, now))
      )
    )
    .limit(1);

  if (!row) return c.json({ error: 'Shared folder not found' }, 404);

  const sharedNotes = await db
    .select({
      id: notes.id,
      title: notes.title,
      content: notes.content,
      documentType: notes.documentType,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(and(eq(notes.userId, row.folder.userId), eq(notes.folderId, row.folder.id), eq(notes.type, 'note')))
    .orderBy(asc(notes.title));

  return c.json({
    folder: {
      title: row.folder.title,
      updatedAt: row.folder.updatedAt,
    },
    notes: sharedNotes,
    share: row.share,
  });
});

shareRoutes.get('/:token', async (c) => {
  const token = c.req.param('token').trim();
  if (!token) return c.json({ error: 'Shared note not found' }, 404);

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
    .where(
      and(
        eq(noteShareLinks.tokenHash, tokenHash),
        isNull(noteShareLinks.revokedAt),
        or(isNull(noteShareLinks.expiresAt), gt(noteShareLinks.expiresAt, now))
      )
    )
    .limit(1);

  if (!row) return c.json({ error: 'Shared note not found' }, 404);

  return c.json({
    note: {
      title: row.note.title,
      content: row.note.content,
      documentType: row.note.documentType,
      updatedAt: row.note.updatedAt,
    },
    share: row.share,
  });
});
