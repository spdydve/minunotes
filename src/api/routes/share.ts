import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { noteShareLinks, notes } from '../db/schema';
import { hashShareToken } from '../lib/share-tokens';

export const shareRoutes = new Hono();

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
