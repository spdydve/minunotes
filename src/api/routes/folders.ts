import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { db } from '../db/client';
import { folderShareLinks, folders, notes, templateFolderAssignments } from '../db/schema';
import { createDocument, listDocuments, listFolders } from '../harness/commands';
import type { auth } from '../lib/auth';
import {
  isFolderEffectivelyPrivate,
  loadFolderAccessTree,
  validateFolderMove,
  validateFolderParent,
} from '../lib/folder-access';
import { createId } from '../lib/id';
import { buildFolderShareUrl, generateShareToken, hashShareToken } from '../lib/share-tokens';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const folderRoutes = new Hono<{ Variables: Variables }>();

function getUser(c: Context<{ Variables: Variables }>) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

function activeFolderShareWhere(folderId: string, userId: string) {
  const now = new Date();
  return and(
    eq(folderShareLinks.folderId, folderId),
    eq(folderShareLinks.userId, userId),
    isNull(folderShareLinks.revokedAt),
    or(isNull(folderShareLinks.expiresAt), gt(folderShareLinks.expiresAt, now))
  );
}

function serializeFolderShareLink(shareLink: typeof folderShareLinks.$inferSelect, url?: string | null) {
  return {
    id: shareLink.id,
    folderId: shareLink.folderId,
    permission: shareLink.permission,
    createdAt: shareLink.createdAt,
    updatedAt: shareLink.updatedAt,
    expiresAt: shareLink.expiresAt,
    revokedAt: shareLink.revokedAt,
    url: url ?? (shareLink.token ? buildFolderShareUrl(shareLink.token) : null),
  };
}

async function getShareableFolder(userId: string, folderId: string) {
  const tree = await loadFolderAccessTree(userId);
  const folder = tree.byId.get(folderId);
  if (!folder) return { ok: false as const, status: 404 as const, error: 'Folder not found' };
  if (isFolderEffectivelyPrivate(folder.id, tree.byId))
    return { ok: false as const, status: 403 as const, error: 'Private folders cannot be shared' };
  return { ok: true as const, folder };
}

folderRoutes.get('/', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const result = await listFolders({ userId: user.id });
  return c.json(result.value);
});

folderRoutes.post('/', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => null)) as { title?: string; parentFolderId?: string | null } | null;
  const title = body?.title?.trim();
  if (!title) return c.json({ error: 'Folder title is required' }, 400);

  const parent = await validateFolderParent({ userId: user.id, parentFolderId: body?.parentFolderId ?? null });
  if (!parent.ok) return c.json({ error: parent.error }, parent.status);

  const folder = {
    id: createId('folder'),
    userId: user.id,
    parentFolderId: body?.parentFolderId ?? null,
    title,
    isPrivate: false,
    isAgentReadOnly: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.insert(folders).values(folder);
  return c.json({ folder }, 201);
});

folderRoutes.patch('/:folderId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    title?: string;
    isPrivate?: boolean;
    isAgentReadOnly?: boolean;
    parentFolderId?: string | null;
  } | null;
  const title = body?.title?.trim();
  if (body?.title !== undefined && !title) return c.json({ error: 'Folder title is required' }, 400);
  if (
    !body ||
    (title === undefined &&
      body.isPrivate === undefined &&
      body.isAgentReadOnly === undefined &&
      body.parentFolderId === undefined)
  )
    return c.json({ error: 'No folder updates provided' }, 400);

  if (body.parentFolderId !== undefined) {
    const move = await validateFolderMove({
      userId: user.id,
      folderId: c.req.param('folderId'),
      parentFolderId: body.parentFolderId,
    });
    if (!move.ok) return c.json({ error: move.error }, move.status);
  }

  const [folder] = await db
    .update(folders)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(body.isPrivate !== undefined ? { isPrivate: body.isPrivate } : {}),
      ...(body.isAgentReadOnly !== undefined ? { isAgentReadOnly: body.isAgentReadOnly } : {}),
      ...(body.parentFolderId !== undefined ? { parentFolderId: body.parentFolderId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(folders.id, c.req.param('folderId')), eq(folders.userId, user.id)))
    .returning();

  if (!folder) return c.json({ error: 'Folder not found' }, 404);
  return c.json({ folder });
});

folderRoutes.get('/:folderId/share-link', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const result = await getShareableFolder(user.id, c.req.param('folderId'));
  if (!result.ok) return c.json({ error: result.error }, result.status);

  const [shareLink] = await db
    .select()
    .from(folderShareLinks)
    .where(activeFolderShareWhere(result.folder.id, user.id))
    .limit(1);
  return c.json({ shareLink: shareLink ? serializeFolderShareLink(shareLink) : null });
});

folderRoutes.post('/:folderId/share-link', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const result = await getShareableFolder(user.id, c.req.param('folderId'));
  if (!result.ok) return c.json({ error: result.error }, result.status);

  const body = (await c.req.json().catch(() => null)) as { regenerate?: boolean } | null;
  const [existing] = await db
    .select()
    .from(folderShareLinks)
    .where(activeFolderShareWhere(result.folder.id, user.id))
    .limit(1);
  if (existing && !body?.regenerate && existing.token) return c.json({ shareLink: serializeFolderShareLink(existing) });

  const token = generateShareToken();
  const now = new Date();
  if (existing && !body?.regenerate) {
    const [shareLink] = await db
      .update(folderShareLinks)
      .set({ token, tokenHash: hashShareToken(token), updatedAt: now })
      .where(eq(folderShareLinks.id, existing.id))
      .returning();
    return c.json({ shareLink: serializeFolderShareLink(shareLink) });
  }

  if (existing)
    await db
      .update(folderShareLinks)
      .set({ revokedAt: now, updatedAt: now })
      .where(eq(folderShareLinks.id, existing.id));
  const [shareLink] = await db
    .insert(folderShareLinks)
    .values({
      id: createId('folder_share'),
      userId: user.id,
      folderId: result.folder.id,
      tokenHash: hashShareToken(token),
      token,
      permission: 'read',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return c.json({ shareLink: serializeFolderShareLink(shareLink) }, 201);
});

folderRoutes.delete('/:folderId/share-link', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const [folder] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, c.req.param('folderId')), eq(folders.userId, user.id)))
    .limit(1);
  if (!folder) return c.json({ error: 'Folder not found' }, 404);

  const now = new Date();
  await db
    .update(folderShareLinks)
    .set({ revokedAt: now, updatedAt: now })
    .where(activeFolderShareWhere(folder.id, user.id));
  return c.json({ ok: true });
});

folderRoutes.get('/:folderId/notes', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const type = c.req.query('type') === 'template' ? 'template' : 'note';
  const result = await listDocuments({ userId: user.id, folderId: c.req.param('folderId'), type });
  return c.json({ notes: result.value.documents });
});

folderRoutes.get('/:folderId/templates', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const rows = await db
    .select({ template: notes })
    .from(templateFolderAssignments)
    .innerJoin(notes, eq(templateFolderAssignments.templateId, notes.id))
    .where(
      and(
        eq(templateFolderAssignments.userId, user.id),
        eq(templateFolderAssignments.folderId, c.req.param('folderId')),
        eq(notes.type, 'template')
      )
    );
  return c.json({ templates: rows.map((row) => row.template) });
});

folderRoutes.post('/:folderId/notes', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string;
    content?: string;
    type?: 'note' | 'template';
    documentType?: 'markdown' | 'canvas.default' | 'canvas.mindmap';
  };
  const documentType =
    body.documentType === 'canvas.default' || body.documentType === 'canvas.mindmap' ? body.documentType : 'markdown';
  if (body.type === 'template' && documentType !== 'markdown')
    return c.json({ error: 'Templates must be markdown documents' }, 400);
  const result = await createDocument({
    userId: user.id,
    folderId: c.req.param('folderId'),
    title: body.title,
    markdown: body.content,
    documentType,
    type: body.type === 'template' ? 'template' : 'note',
    actorType: 'user',
  });

  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ note: result.value.note }, 201);
});

folderRoutes.delete('/:folderId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const folderId = c.req.param('folderId');
  const childFolders = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.parentFolderId, folderId), eq(folders.userId, user.id)))
    .limit(1);
  if (childFolders.length > 0) return c.json({ error: 'Move or delete subfolders before deleting this folder' }, 400);

  await db.delete(notes).where(and(eq(notes.folderId, folderId), eq(notes.userId, user.id)));
  await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.userId, user.id)));
  return c.json({ ok: true });
});
