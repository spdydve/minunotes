import { and, eq, inArray } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { db } from '../db/client';
import {
  type ApiKey,
  apiKeyFolderPermissions,
  folders,
  type Note,
  notes,
  type OAuthAuthorization,
  oauthAuthorizationFolderPermissions,
} from '../db/schema';
import {
  type ActorType,
  canvasDocumentFromSyntax,
  createDocument,
  type DocumentEdit,
  type DocumentType,
  editDocument,
  listFolders,
  listNoteEvents,
  readDocument,
  readDocumentLines,
  replaceCanvasDocument,
  searchAllDocumentLines,
  searchDocumentLines,
  searchDocuments,
  serializeCanvasDocument,
} from '../harness/commands';
import { findSection, parseSections } from '../harness/sections';
import type { auth } from '../lib/auth';
import {
  canIntegrationAccessFolder,
  getIntegrationAccessibleFolderIds,
  validateFolderParent,
} from '../lib/folder-access';
import { createId } from '../lib/id';
import { listBacklinks, listOrphanNotes, listOutgoingLinks } from '../notes/links';
import { listNoteTags, listUserTags, noteIdsForTag, setNoteTags } from '../notes/tags';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  apiKey: ApiKey | null;
  oauthAuthorization: OAuthAuthorization | null;
};

export const harnessRoutes = new Hono<{ Variables: Variables }>();

function getUser(c: Context<{ Variables: Variables }>) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

function getActor(c: Context<{ Variables: Variables }>): { actorType: ActorType; actorId?: string } {
  const key = c.get('apiKey');
  const oauthAuthorization = c.get('oauthAuthorization');
  return key
    ? { actorType: 'agent', actorId: key.id }
    : oauthAuthorization
      ? { actorType: 'agent', actorId: oauthAuthorization.id }
      : { actorType: 'user' };
}

type HarnessNoteSummary = Pick<Note, 'id' | 'folderId' | 'title' | 'documentType' | 'type' | 'createdAt' | 'updatedAt'>;

type SummarizableNote = HarnessNoteSummary & { content?: string; userId?: string };

function summarizeHarnessNote(note: SummarizableNote): HarnessNoteSummary {
  return {
    id: note.id,
    folderId: note.folderId,
    title: note.title,
    documentType: note.documentType,
    type: note.type,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

function summarizeHarnessDocumentResult<T extends { note: SummarizableNote; contentHash: string }>(result: T) {
  return {
    ...result,
    note: summarizeHarnessNote(result.note),
  };
}

async function hasFolderPermission(
  c: Context<{ Variables: Variables }>,
  folderId: string,
  permission: 'read' | 'create' | 'edit'
) {
  const user = c.get('user');
  if (!user) return false;
  return canIntegrationAccessFolder({
    apiKey: c.get('apiKey'),
    oauthAuthorization: c.get('oauthAuthorization'),
    userId: user.id,
    folderId,
    permission,
  });
}

async function getReadableFolderIds(c: Context<{ Variables: Variables }>) {
  const user = c.get('user');
  if (!user) return null;
  return getIntegrationAccessibleFolderIds({
    apiKey: c.get('apiKey'),
    oauthAuthorization: c.get('oauthAuthorization'),
    userId: user.id,
    permission: 'read',
  });
}

harnessRoutes.get('/tags', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const readableFolderIds = await getReadableFolderIds(c);
  if (!readableFolderIds) return c.json({ tags: await listUserTags({ userId: user.id }) });

  const readableIds = [...readableFolderIds];
  if (readableIds.length === 0) return c.json({ tags: [] });
  const visibleNotes = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.userId, user.id), inArray(notes.folderId, readableIds)));
  return c.json({ tags: await listUserTags({ userId: user.id, noteIds: visibleNotes.map((note) => note.id) }) });
});

harnessRoutes.get('/folders', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const result = await listFolders({ userId: user.id });
  const readableFolderIds = await getReadableFolderIds(c);
  if (!readableFolderIds) return c.json(result.value);
  return c.json({ folders: result.value.folders.filter((folder) => readableFolderIds.has(folder.id)) });
});

harnessRoutes.post('/folders', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const key = c.get('apiKey');
  const oauthAuthorization = c.get('oauthAuthorization');
  if (key && !key.canCreateFolders) return c.json({ error: 'Forbidden' }, 403);
  if (oauthAuthorization && !oauthAuthorization.canCreateFolders) return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => null)) as { title?: string; parentFolderId?: string | null } | null;
  const title = body?.title?.trim();
  if (!title) return c.json({ error: 'Folder title is required' }, 400);

  const parent = await validateFolderParent({ userId: user.id, parentFolderId: body?.parentFolderId ?? null });
  if (!parent.ok) return c.json({ error: parent.error }, parent.status);
  if (key && body?.parentFolderId && !(await hasFolderPermission(c, body.parentFolderId, 'create')))
    return c.json({ error: 'Forbidden' }, 403);

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

  if (key && key.accessMode === 'specific') {
    await db.insert(apiKeyFolderPermissions).values({
      id: createId('agent_perm'),
      apiKeyId: key.id,
      folderId: folder.id,
      canRead: key.canRead,
      canCreate: key.canCreate,
      canEdit: key.canEdit,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (oauthAuthorization && oauthAuthorization.accessMode === 'specific') {
    await db.insert(oauthAuthorizationFolderPermissions).values({
      id: createId('oauth_perm'),
      authorizationId: oauthAuthorization.id,
      folderId: folder.id,
      canRead: oauthAuthorization.canRead,
      canCreate: oauthAuthorization.canCreate,
      canEdit: oauthAuthorization.canEdit,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return c.json({ folder }, 201);
});

harnessRoutes.get('/notes/search', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const q = c.req.query('q')?.trim();
  if (!q) return c.json({ notes: [] });

  const result = await searchDocuments({ userId: user.id, query: q, limit: 25 });
  const tag = c.req.query('tag')?.trim();
  const taggedIds = tag ? new Set((await noteIdsForTag({ userId: user.id, tag })).map((row) => row.noteId)) : null;
  const readableFolderIds = await getReadableFolderIds(c);
  const filtered = result.value.documents.filter(
    (note) => (!taggedIds || taggedIds.has(note.id)) && (!readableFolderIds || readableFolderIds.has(note.folderId))
  );
  return c.json({ notes: filtered });
});

harnessRoutes.get('/notes/search-lines', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const q = c.req.query('q')?.trim();
  if (!q) return c.json({ query: '', matches: [] });

  const readableFolderIds = await getReadableFolderIds(c);
  const result = await searchAllDocumentLines({
    userId: user.id,
    query: q,
    folderId: c.req.query('folderId'),
    context: Number.parseInt(c.req.query('context') ?? '', 10),
    limit: Number.parseInt(c.req.query('limit') ?? '', 10),
    caseSensitive: c.req.query('caseSensitive') === 'true',
  });
  if (!readableFolderIds) return c.json(result.value);
  return c.json({
    query: result.value.query,
    matches: result.value.matches.filter((match) => readableFolderIds.has(match.folderId)),
  });
});

harnessRoutes.post('/notes', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    folderId?: string;
    title?: string;
    content?: string;
    documentType?: DocumentType;
  } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (!body.folderId) return c.json({ error: 'Folder id is required' }, 400);

  if (!(await hasFolderPermission(c, body.folderId, 'create'))) return c.json({ error: 'Forbidden' }, 403);

  const actor = getActor(c);
  const result = await createDocument({
    userId: user.id,
    folderId: body.folderId,
    title: body.title,
    markdown: body.content,
    documentType: body.documentType,
    actorType: actor.actorType,
    actorId: actor.actorId,
  });

  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(summarizeHarnessDocumentResult(result.value), 201);
});

harnessRoutes.post('/canvases', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    folderId?: string;
    title?: string;
    canvas?: unknown;
    documentType?: 'canvas.default' | 'canvas.mindmap';
  } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (!body.folderId) return c.json({ error: 'Folder id is required' }, 400);
  if (!(await hasFolderPermission(c, body.folderId, 'create'))) return c.json({ error: 'Forbidden' }, 403);

  const content = body.canvas === undefined ? undefined : serializeCanvasDocument(body.canvas);
  if (body.canvas !== undefined && !content)
    return c.json({ error: 'Canvas content must include nodes and edges arrays' }, 400);

  const actor = getActor(c);
  const result = await createDocument({
    userId: user.id,
    folderId: body.folderId,
    title: body.title,
    markdown: content ?? undefined,
    documentType: body.documentType ?? 'canvas.default',
    actorType: actor.actorType,
    actorId: actor.actorId,
  });

  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(summarizeHarnessDocumentResult(result.value), 201);
});

harnessRoutes.post('/canvases/from-syntax', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    folderId?: string;
    title?: string;
    syntax?: string;
    documentType?: 'canvas.default' | 'canvas.mindmap';
  } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (!body.folderId) return c.json({ error: 'Folder id is required' }, 400);
  if (!body.syntax?.trim()) return c.json({ error: 'Diagram syntax is required' }, 400);
  if (!(await hasFolderPermission(c, body.folderId, 'create'))) return c.json({ error: 'Forbidden' }, 403);

  const compiled = canvasDocumentFromSyntax({ syntax: body.syntax, documentType: body.documentType });
  if (!compiled.ok) return c.json({ error: 'Diagram syntax has errors', diagnostics: compiled.errors }, 400);

  const actor = getActor(c);
  const result = await createDocument({
    userId: user.id,
    folderId: body.folderId,
    title: body.title ?? compiled.title,
    markdown: JSON.stringify(compiled.canvas),
    documentType: compiled.documentType as 'canvas.default' | 'canvas.mindmap',
    actorType: actor.actorType,
    actorId: actor.actorId,
  });

  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ ...summarizeHarnessDocumentResult(result.value), diagnostics: compiled.diagnostics }, 201);
});

harnessRoutes.get('/notes/orphans', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const rows = await listOrphanNotes({ userId: user.id });
  const readableFolderIds = await getReadableFolderIds(c);
  return c.json({ notes: readableFolderIds ? rows.filter((note) => readableFolderIds.has(note.folderId)) : rows });
});

harnessRoutes.get('/notes/:noteId/tags', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const noteId = c.req.param('noteId');
  const [note] = await db
    .select({ id: notes.id, folderId: notes.folderId })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, user.id)))
    .limit(1);
  if (!note) return c.json({ error: 'Note not found' }, 404);
  if (!(await hasFolderPermission(c, note.folderId, 'read'))) return c.json({ error: 'Forbidden' }, 403);
  return c.json({ tags: await listNoteTags({ userId: user.id, noteId }) });
});

harnessRoutes.put('/notes/:noteId/tags', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const noteId = c.req.param('noteId');
  const [note] = await db
    .select({ id: notes.id, folderId: notes.folderId, isApiEditable: notes.isApiEditable })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, user.id)))
    .limit(1);
  if (!note) return c.json({ error: 'Note not found' }, 404);
  if (!(await hasFolderPermission(c, note.folderId, 'edit')) || !note.isApiEditable)
    return c.json({ error: 'Forbidden' }, 403);
  const body = (await c.req.json().catch(() => null)) as { tags?: string[] } | null;
  if (!body || !Array.isArray(body.tags)) return c.json({ error: 'Tags array is required' }, 400);
  return c.json({ tags: await setNoteTags({ userId: user.id, noteId, tags: body.tags }) });
});

harnessRoutes.get('/notes/:noteId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const result = await readDocument({ documentId: c.req.param('noteId'), userId: user.id });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  if (!(await hasFolderPermission(c, result.value.note.folderId, 'read'))) return c.json({ error: 'Forbidden' }, 403);
  return c.json(result.value);
});

harnessRoutes.get('/notes/:noteId/events', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const current = await readDocument({ documentId: c.req.param('noteId'), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, 'read'))) return c.json({ error: 'Forbidden' }, 403);

  const limit = Number.parseInt(c.req.query('limit') ?? '', 10);
  const result = await listNoteEvents({
    documentId: c.req.param('noteId'),
    userId: user.id,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
  });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.value);
});

harnessRoutes.get('/notes/:noteId/links', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const noteId = c.req.param('noteId');
  const current = await readDocument({ documentId: noteId, userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, 'read'))) return c.json({ error: 'Forbidden' }, 403);

  const links = await listOutgoingLinks({ userId: user.id, noteId });
  if (!links) return c.json({ error: 'Note not found' }, 404);
  const readableFolderIds = await getReadableFolderIds(c);
  if (!readableFolderIds) return c.json({ noteId, links });

  const targetIds = links.map((link) => link.targetNoteId).filter((id): id is string => Boolean(id));
  const visibleTargets = targetIds.length
    ? await db
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(eq(notes.userId, user.id), inArray(notes.id, targetIds), inArray(notes.folderId, [...readableFolderIds]))
        )
    : [];
  const visibleTargetIds = new Set(visibleTargets.map((note) => note.id));
  return c.json({
    noteId,
    links: links.map((link) =>
      link.targetNoteId && !visibleTargetIds.has(link.targetNoteId) ? { ...link, targetNoteId: null } : link
    ),
  });
});

harnessRoutes.get('/notes/:noteId/backlinks', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const current = await readDocument({ documentId: c.req.param('noteId'), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, 'read'))) return c.json({ error: 'Forbidden' }, 403);

  const backlinks = await listBacklinks({ userId: user.id, noteId: c.req.param('noteId') });
  if (!backlinks) return c.json({ error: 'Note not found' }, 404);

  const readableFolderIds = await getReadableFolderIds(c);
  return c.json({
    noteId: c.req.param('noteId'),
    backlinks: readableFolderIds
      ? backlinks.filter((backlink) => readableFolderIds.has(backlink.sourceFolderId))
      : backlinks,
  });
});

harnessRoutes.get('/notes/:noteId/lines', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const current = await readDocument({ documentId: c.req.param('noteId'), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, 'read'))) return c.json({ error: 'Forbidden' }, 403);

  const result = await readDocumentLines({
    documentId: c.req.param('noteId'),
    userId: user.id,
    from: Number.parseInt(c.req.query('from') ?? '', 10),
    to: Number.parseInt(c.req.query('to') ?? '', 10),
  });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.value);
});

harnessRoutes.get('/notes/:noteId/search-lines', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const current = await readDocument({ documentId: c.req.param('noteId'), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, 'read'))) return c.json({ error: 'Forbidden' }, 403);

  const q = c.req.query('q')?.trim();
  if (!q) return c.json({ query: '', matches: [] });

  const result = await searchDocumentLines({
    documentId: c.req.param('noteId'),
    userId: user.id,
    query: q,
    context: Number.parseInt(c.req.query('context') ?? '', 10),
    limit: Number.parseInt(c.req.query('limit') ?? '', 10),
    caseSensitive: c.req.query('caseSensitive') === 'true',
  });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.value);
});

harnessRoutes.get('/notes/:noteId/outline', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const result = await readDocument({ documentId: c.req.param('noteId'), userId: user.id });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  if (!(await hasFolderPermission(c, result.value.note.folderId, 'read'))) return c.json({ error: 'Forbidden' }, 403);
  return c.json({
    noteId: result.value.note.id,
    contentHash: result.value.contentHash,
    sections: parseSections(result.value.note.content),
  });
});

harnessRoutes.get('/notes/:noteId/sections/:sectionId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const result = await readDocument({ documentId: c.req.param('noteId'), userId: user.id });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  if (!(await hasFolderPermission(c, result.value.note.folderId, 'read'))) return c.json({ error: 'Forbidden' }, 403);

  const section = findSection(result.value.note.content, c.req.param('sectionId'));
  if (!section) return c.json({ error: 'Section not found' }, 404);

  return c.json({
    noteId: result.value.note.id,
    contentHash: result.value.contentHash,
    section: {
      ...section,
      markdown: result.value.note.content.slice(section.from, section.to),
      content: result.value.note.content.slice(section.contentFrom, section.contentTo),
    },
  });
});

harnessRoutes.put('/notes/:noteId/canvas', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    canvas?: unknown;
    documentType?: 'canvas.default' | 'canvas.mindmap';
    title?: string;
    baseHash?: string;
  } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (body.canvas === undefined) return c.json({ error: 'Canvas content is required' }, 400);
  const canvas = serializeCanvasDocument(body.canvas);
  if (!canvas) return c.json({ error: 'Canvas content must include nodes and edges arrays' }, 400);

  const current = await readDocument({ documentId: c.req.param('noteId'), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, 'edit'))) return c.json({ error: 'Forbidden' }, 403);

  const actor = getActor(c);
  const result = await replaceCanvasDocument({
    documentId: c.req.param('noteId'),
    userId: user.id,
    title: body.title,
    canvas: JSON.parse(canvas),
    documentType: body.documentType,
    baseHash: body.baseHash,
    actorType: actor.actorType,
    actorId: actor.actorId,
  });

  if (!result.ok)
    return c.json(
      { error: result.error, ...('currentHash' in result ? { currentHash: result.currentHash } : {}) },
      result.status
    );
  return c.json(summarizeHarnessDocumentResult(result.value));
});

harnessRoutes.put('/notes/:noteId/canvas/from-syntax', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    syntax?: string;
    documentType?: 'canvas.default' | 'canvas.mindmap';
    title?: string;
    baseHash?: string;
  } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (!body.syntax?.trim()) return c.json({ error: 'Diagram syntax is required' }, 400);

  const current = await readDocument({ documentId: c.req.param('noteId'), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, 'edit'))) return c.json({ error: 'Forbidden' }, 403);

  const compiled = canvasDocumentFromSyntax({ syntax: body.syntax, documentType: body.documentType });
  if (!compiled.ok) return c.json({ error: 'Diagram syntax has errors', diagnostics: compiled.errors }, 400);

  const actor = getActor(c);
  const result = await replaceCanvasDocument({
    documentId: c.req.param('noteId'),
    userId: user.id,
    title: body.title ?? compiled.title,
    canvas: compiled.canvas,
    documentType: compiled.documentType as 'canvas.default' | 'canvas.mindmap',
    baseHash: body.baseHash,
    actorType: actor.actorType,
    actorId: actor.actorId,
  });

  if (!result.ok)
    return c.json(
      { error: result.error, ...('currentHash' in result ? { currentHash: result.currentHash } : {}) },
      result.status
    );
  return c.json({ ...summarizeHarnessDocumentResult(result.value), diagnostics: compiled.diagnostics });
});

harnessRoutes.post('/notes/:noteId/edit', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => null)) as { edits?: DocumentEdit[]; baseHash?: string } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (!Array.isArray(body.edits) || body.edits.length === 0)
    return c.json({ error: 'At least one edit is required' }, 400);

  const current = await readDocument({ documentId: c.req.param('noteId'), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, 'edit'))) return c.json({ error: 'Forbidden' }, 403);

  const actor = getActor(c);
  const result = await editDocument({
    documentId: c.req.param('noteId'),
    userId: user.id,
    edits: body.edits,
    baseHash: body.baseHash,
    actorType: actor.actorType,
    actorId: actor.actorId,
  });

  if (!result.ok)
    return c.json(
      { error: result.error, ...('currentHash' in result ? { currentHash: result.currentHash } : {}) },
      result.status
    );
  return c.json(summarizeHarnessDocumentResult(result.value));
});
