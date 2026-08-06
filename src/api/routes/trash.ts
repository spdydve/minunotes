import { type Context, Hono } from 'hono';
import type { auth } from '../lib/auth';
import {
  listTrashedFolderContents,
  listTrashedFolders,
  listTrashedNotes,
  permanentlyDeleteTrashedFolder,
  permanentlyDeleteTrashedNote,
  restoreTrashedFolder,
  restoreTrashedNote,
} from '../trash/operations';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const trashRoutes = new Hono<{ Variables: Variables }>();

function getUser(c: Context<{ Variables: Variables }>) {
  return c.get('user');
}

trashRoutes.get('/', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const [notes, folders] = await Promise.all([
    listTrashedNotes({ userId: user.id }),
    listTrashedFolders({ userId: user.id }),
  ]);
  return c.json({ notes, folders });
});

trashRoutes.get('/folders/:folderId/contents', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const result = await listTrashedFolderContents({ userId: user.id, folderId: c.req.param('folderId') });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.value);
});

trashRoutes.post('/notes/:noteId/restore', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { folderId?: string };
  const result = await restoreTrashedNote({
    userId: user.id,
    noteId: c.req.param('noteId'),
    folderId: body.folderId?.trim() || undefined,
  });
  if (!result.ok)
    return c.json(
      { error: result.error, ...('requiresDestination' in result ? { requiresDestination: true } : {}) },
      result.status
    );
  return c.json(result.value);
});

trashRoutes.post('/folders/:folderId/restore', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const result = await restoreTrashedFolder({ userId: user.id, folderId: c.req.param('folderId') });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.value);
});

trashRoutes.delete('/folders/:folderId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const result = await permanentlyDeleteTrashedFolder({ userId: user.id, folderId: c.req.param('folderId') });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ ok: true, ...result.value });
});

trashRoutes.delete('/notes/:noteId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const result = await permanentlyDeleteTrashedNote({ userId: user.id, noteId: c.req.param('noteId') });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ ok: true, ...result.value });
});
