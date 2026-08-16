import { eq, inArray } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { db } from '../db/client';
import {
  type ApiKey,
  authorizationFolderRules,
  folders,
  type Note,
  notes,
  type OAuthAuthorization,
} from '../db/schema';
import {
  type ActorType,
  canvasDocumentFromSyntax,
  createDocument,
  type DocumentEdit,
  type DocumentType,
  editDocument,
  type LineSearchCursor,
  linkCanvasNodeToNote,
  listFolders,
  listNoteEvents,
  moveDocuments,
  type NoteSearchCursor,
  readDocument,
  readDocumentLines,
  replaceCanvasDocument,
  searchAllDocumentLines,
  searchDocumentLines,
  searchDocuments,
  serializeCanvasDocument,
  unlinkCanvasNode,
} from '../harness/commands';
import {
  compareTitleIdPositions,
  decodeCursor,
  InvalidCursorError,
  isTitleIdPosition,
  paginateItems,
  paginationScope,
  parsePageLimit,
} from '../harness/pagination';
import { findSection, parseSections } from '../harness/sections';
import type { auth } from '../lib/auth';
import {
  canIntegrationAccessFolder,
  getIntegrationAccessibleFolderIds,
  validateFolderParent,
} from '../lib/folder-access';
import { createId } from '../lib/id';
import {
  addCommentReply,
  type CommentActor,
  type CommentAnchorInput,
  createCommentThread,
  deleteCommentMessage,
  deleteCommentThread,
  listCommentThreads,
  setCommentThreadStatus,
  toggleCommentReaction,
  updateCommentAnchor,
  updateCommentMessage,
} from '../notes/comments';
import { listBacklinks, listOrphanNotes, listOutgoingLinks } from '../notes/links';
import { listNoteTags, listUserTags, setNoteTags } from '../notes/tags';
import { activeNoteWhere } from '../trash/policy';

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
type HarnessFolderSummary = Pick<
  typeof folders.$inferSelect,
  'id' | 'parentFolderId' | 'title' | 'isPrivate' | 'isAgentReadOnly' | 'createdAt' | 'updatedAt'
>;

type SummarizableNote = HarnessNoteSummary & { content?: string; userId?: string };

function summarizeHarnessFolder(folder: HarnessFolderSummary): HarnessFolderSummary {
  return {
    id: folder.id,
    parentFolderId: folder.parentFolderId,
    title: folder.title,
    isPrivate: folder.isPrivate,
    isAgentReadOnly: folder.isAgentReadOnly,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

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

function isValidCursorDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isNoteSearchCursor(value: unknown): value is NoteSearchCursor {
  if (!value || typeof value !== 'object') return false;
  const cursor = value as Partial<NoteSearchCursor>;
  return (
    typeof cursor.rank === 'number' &&
    Number.isInteger(cursor.rank) &&
    cursor.rank >= 0 &&
    cursor.rank <= 5 &&
    isValidCursorDate(cursor.updatedAt) &&
    typeof cursor.title === 'string' &&
    typeof cursor.id === 'string'
  );
}

function isLineSearchCursor(value: unknown): value is LineSearchCursor {
  if (!value || typeof value !== 'object') return false;
  const cursor = value as Partial<LineSearchCursor>;
  return (
    isValidCursorDate(cursor.noteUpdatedAt) &&
    typeof cursor.title === 'string' &&
    typeof cursor.noteId === 'string' &&
    typeof cursor.line === 'number' &&
    Number.isInteger(cursor.line) &&
    cursor.line >= 1 &&
    typeof cursor.column === 'number' &&
    Number.isInteger(cursor.column) &&
    cursor.column >= 1
  );
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
  permission: 'read' | 'create' | 'edit' | 'comment'
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

function getCommentActor(c: Context<{ Variables: Variables }>): CommentActor {
  const user = c.get('user');
  const key = c.get('apiKey');
  const oauthAuthorization = c.get('oauthAuthorization');
  if (key) return { type: 'agent', id: key.id };
  if (oauthAuthorization) return { type: 'agent', id: oauthAuthorization.id };
  return { type: 'user', id: user?.id ?? 'owner' };
}

async function requireCommentAccess(c: Context<{ Variables: Variables }>, noteId: string, _operation: 'read' | 'edit') {
  const user = c.get('user');
  if (!user) return { ok: false as const, status: 401 as const, error: 'Unauthorized' };
  const [note] = await db
    .select({ id: notes.id, folderId: notes.folderId })
    .from(notes)
    .where(activeNoteWhere(user.id, eq(notes.id, noteId)))
    .limit(1);
  if (!note) return { ok: false as const, status: 404 as const, error: 'Note not found' };
  if (!(await hasFolderPermission(c, note.folderId, 'comment')))
    return { ok: false as const, status: 403 as const, error: 'Forbidden' };
  return { ok: true as const, note };
}

function commentErrorResponse(
  c: Context<{ Variables: Variables }>,
  result: { status: 400 | 403 | 404 | 409; error: string; currentHash?: string }
) {
  return c.json(
    { error: result.error, ...(result.currentHash ? { currentHash: result.currentHash } : {}) },
    result.status
  );
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

function paginateTags(c: Context<{ Variables: Variables }>, tags: Array<{ id: string; name: string }>, scope: string) {
  const limit = parsePageLimit(c.req.query('limit'));
  try {
    const page = paginateItems(
      tags,
      limit,
      c.req.query('cursor'),
      scope,
      (tag) => ({ title: tag.name, id: tag.id }),
      compareTitleIdPositions,
      isTitleIdPosition
    );
    return c.json({ tags: page.items, pageInfo: page.pageInfo });
  } catch (error) {
    if (error instanceof InvalidCursorError) return c.json({ error: error.message }, 400);
    throw error;
  }
}

harnessRoutes.get('/tags', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const readableFolderIds = await getReadableFolderIds(c);
  const scope = paginationScope('tags', user.id, readableFolderIds ? [...readableFolderIds].sort().join(',') : 'owner');
  if (!readableFolderIds) {
    const visibleTags = await listUserTags({ userId: user.id });
    visibleTags.sort((left, right) =>
      compareTitleIdPositions({ title: left.name, id: left.id }, { title: right.name, id: right.id })
    );
    return paginateTags(c, visibleTags, scope);
  }

  const readableIds = [...readableFolderIds];
  if (readableIds.length === 0) return c.json({ tags: [], pageInfo: { hasMore: false, nextCursor: null } });
  const visibleTags = await listUserTags({ userId: user.id, folderIds: readableIds });
  visibleTags.sort((left, right) =>
    compareTitleIdPositions({ title: left.name, id: left.id }, { title: right.name, id: right.id })
  );
  return paginateTags(c, visibleTags, scope);
});

harnessRoutes.get('/folders', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const result = await listFolders({ userId: user.id });
  const readableFolderIds = await getReadableFolderIds(c);
  const foldersInScope = readableFolderIds
    ? result.value.folders.filter((folder) => readableFolderIds.has(folder.id))
    : result.value.folders;
  foldersInScope.sort((left, right) =>
    compareTitleIdPositions({ title: left.title, id: left.id }, { title: right.title, id: right.id })
  );
  const limit = parsePageLimit(c.req.query('limit'));
  let page: { items: typeof foldersInScope; pageInfo: { hasMore: boolean; nextCursor: string | null } };
  try {
    page = paginateItems(
      foldersInScope,
      limit,
      c.req.query('cursor'),
      paginationScope('folders', user.id, readableFolderIds ? [...readableFolderIds].sort().join(',') : 'owner'),
      (folder) => ({ title: folder.title, id: folder.id }),
      compareTitleIdPositions,
      isTitleIdPosition
    );
  } catch (error) {
    if (error instanceof InvalidCursorError) return c.json({ error: error.message }, 400);
    throw error;
  }
  return c.json({ folders: page.items.map(summarizeHarnessFolder), pageInfo: page.pageInfo });
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
  await db.transaction(async (tx) => {
    await tx.insert(folders).values(folder);

    const actor = key ?? oauthAuthorization;
    const integrationAuthorizationId = key?.authorizationId ?? oauthAuthorization?.integrationAuthorizationId;
    if (actor?.accessMode === 'specific' && integrationAuthorizationId) {
      await tx
        .insert(authorizationFolderRules)
        .values({
          id: createId('auth_rule'),
          authorizationId: integrationAuthorizationId,
          userId: user.id,
          folderId: folder.id,
          canRead: actor.canRead,
          canCreate: actor.canCreate,
          canEdit: actor.canEdit,
          canComment: actor.canComment,
          canCreateFolders: actor.canCreateFolders,
          appliesTo: 'exact',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [authorizationFolderRules.authorizationId, authorizationFolderRules.folderId],
        });
    }
  });

  return c.json({ folder: summarizeHarnessFolder(folder) }, 201);
});

harnessRoutes.get('/notes/search', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const q = c.req.query('q')?.trim();
  if (!q) return c.json({ notes: [], pageInfo: { hasMore: false, nextCursor: null } });

  const tag = c.req.query('tag')?.trim();
  const readableFolderIds = await getReadableFolderIds(c);
  const scope = paginationScope(
    'note-search',
    user.id,
    q,
    tag ?? '',
    readableFolderIds ? [...readableFolderIds].sort().join(',') : 'owner'
  );
  let cursor: NoteSearchCursor | null;
  try {
    cursor = decodeCursor(c.req.query('cursor'), scope, isNoteSearchCursor);
  } catch (error) {
    if (error instanceof InvalidCursorError) return c.json({ error: error.message }, 400);
    throw error;
  }
  const result = await searchDocuments({
    userId: user.id,
    query: q,
    limit: parsePageLimit(c.req.query('limit')),
    tag,
    folderIds: readableFolderIds,
    cursor,
    cursorScope: scope,
  });
  return c.json({
    notes: result.value.documents.map(summarizeHarnessNote),
    pageInfo: result.value.pageInfo,
  });
});

harnessRoutes.get('/notes/search-lines', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const q = c.req.query('q')?.trim();
  if (!q) return c.json({ query: '', matches: [], pageInfo: { hasMore: false, nextCursor: null } });

  const readableFolderIds = await getReadableFolderIds(c);
  const folderId = c.req.query('folderId');
  const context = Number.parseInt(c.req.query('context') ?? '', 10);
  const caseSensitive = c.req.query('caseSensitive') === 'true';
  const scope = paginationScope(
    'line-search',
    user.id,
    q,
    folderId ?? '',
    String(Number.isFinite(context) ? context : ''),
    String(caseSensitive),
    readableFolderIds ? [...readableFolderIds].sort().join(',') : 'owner'
  );
  let cursor: LineSearchCursor | null;
  try {
    cursor = decodeCursor(c.req.query('cursor'), scope, isLineSearchCursor);
  } catch (error) {
    if (error instanceof InvalidCursorError) return c.json({ error: error.message }, 400);
    throw error;
  }
  const result = await searchAllDocumentLines({
    userId: user.id,
    query: q,
    folderId,
    folderIds: readableFolderIds,
    context,
    limit: parsePageLimit(c.req.query('limit')),
    caseSensitive,
    cursor,
    cursorScope: scope,
  });
  return c.json(result.value);
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
  const visible = readableFolderIds ? rows.filter((note) => readableFolderIds.has(note.folderId)) : rows;
  visible.sort((left, right) =>
    compareTitleIdPositions({ title: left.title, id: left.id }, { title: right.title, id: right.id })
  );
  const scope = paginationScope(
    'orphans',
    user.id,
    readableFolderIds ? [...readableFolderIds].sort().join(',') : 'owner'
  );
  try {
    const page = paginateItems(
      visible,
      parsePageLimit(c.req.query('limit')),
      c.req.query('cursor'),
      scope,
      (note) => ({ title: note.title, id: note.id }),
      compareTitleIdPositions,
      isTitleIdPosition
    );
    return c.json({ notes: page.items.map(summarizeHarnessNote), pageInfo: page.pageInfo });
  } catch (error) {
    if (error instanceof InvalidCursorError) return c.json({ error: error.message }, 400);
    throw error;
  }
});

harnessRoutes.post('/notes/move', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => null)) as { noteIds?: string[]; targetFolderId?: string } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (!Array.isArray(body.noteIds)) return c.json({ error: 'Note ids array is required' }, 400);
  if (!body.noteIds.every((noteId) => typeof noteId === 'string'))
    return c.json({ error: 'Note ids must be strings' }, 400);
  if (!body.targetFolderId) return c.json({ error: 'Target folder id is required' }, 400);
  if (!(await hasFolderPermission(c, body.targetFolderId, 'create'))) return c.json({ error: 'Forbidden' }, 403);

  const documentIds = [...new Set(body.noteIds.map((id) => id.trim()).filter(Boolean))];
  for (const noteId of documentIds) {
    const current = await readDocument({ documentId: noteId, userId: user.id });
    if (!current.ok) return c.json({ error: current.error }, current.status);
    if (!(await hasFolderPermission(c, current.value.note.folderId, 'edit')))
      return c.json({ error: 'Forbidden' }, 403);
  }

  const actor = getActor(c);
  const result = await moveDocuments({
    documentIds,
    targetFolderId: body.targetFolderId,
    userId: user.id,
    actorType: actor.actorType,
    actorId: actor.actorId,
  });
  if (!result.ok) return c.json({ error: result.error }, result.status);

  return c.json({
    targetFolderId: body.targetFolderId,
    notes: result.value.notes.map((item) => summarizeHarnessNote(item.note)),
  });
});

harnessRoutes.get('/notes/:noteId/tags', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const noteId = c.req.param('noteId');
  const [note] = await db
    .select({ id: notes.id, folderId: notes.folderId })
    .from(notes)
    .where(activeNoteWhere(user.id, eq(notes.id, noteId)))
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
    .where(activeNoteWhere(user.id, eq(notes.id, noteId)))
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

harnessRoutes.get('/notes/:noteId/comments', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const access = await requireCommentAccess(c, c.req.param('noteId'), 'read');
  if (!access.ok) return c.json({ error: access.error }, access.status);
  const result = await listCommentThreads({
    noteId: access.note.id,
    userId: user.id,
    actor: getCommentActor(c),
  });
  if (!result.ok) return commentErrorResponse(c, result);
  return c.json(result.value);
});

harnessRoutes.post('/notes/:noteId/comments', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const access = await requireCommentAccess(c, c.req.param('noteId'), 'edit');
  if (!access.ok) return c.json({ error: access.error }, access.status);
  const body = (await c.req.json().catch(() => null)) as {
    body?: string;
    anchor?: CommentAnchorInput;
  } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (typeof body.body !== 'string') return c.json({ error: 'Comment body is required' }, 400);
  if (!body.anchor) return c.json({ error: 'Comment anchor is required' }, 400);
  const result = await createCommentThread({
    noteId: access.note.id,
    userId: user.id,
    actor: getCommentActor(c),
    body: body.body,
    anchor: body.anchor,
  });
  if (!result.ok) return commentErrorResponse(c, result);
  return c.json(result.value, 201);
});

harnessRoutes.post('/notes/:noteId/comments/:threadId/replies', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const access = await requireCommentAccess(c, c.req.param('noteId'), 'edit');
  if (!access.ok) return c.json({ error: access.error }, access.status);
  const body = (await c.req.json().catch(() => null)) as { body?: string } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (typeof body.body !== 'string') return c.json({ error: 'Comment body is required' }, 400);
  const result = await addCommentReply({
    noteId: access.note.id,
    threadId: c.req.param('threadId'),
    userId: user.id,
    actor: getCommentActor(c),
    body: body.body,
  });
  if (!result.ok) return commentErrorResponse(c, result);
  return c.json(result.value, 201);
});

harnessRoutes.patch('/notes/:noteId/comments/:threadId/anchor', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const access = await requireCommentAccess(c, c.req.param('noteId'), 'edit');
  if (!access.ok) return c.json({ error: access.error }, access.status);
  const body = (await c.req.json().catch(() => null)) as { anchor?: CommentAnchorInput } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (!body.anchor) return c.json({ error: 'Comment anchor is required' }, 400);
  const result = await updateCommentAnchor({
    noteId: access.note.id,
    threadId: c.req.param('threadId'),
    userId: user.id,
    actor: getCommentActor(c),
    anchor: body.anchor,
  });
  if (!result.ok) return commentErrorResponse(c, result);
  return c.json(result.value);
});

for (const [path, status] of [
  ['resolve', 'resolved'],
  ['reopen', 'open'],
] as const) {
  harnessRoutes.post(`/notes/:noteId/comments/:threadId/${path}`, async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const access = await requireCommentAccess(c, c.req.param('noteId'), 'edit');
    if (!access.ok) return c.json({ error: access.error }, access.status);
    const result = await setCommentThreadStatus({
      noteId: access.note.id,
      threadId: c.req.param('threadId'),
      userId: user.id,
      actor: getCommentActor(c),
      status,
    });
    if (!result.ok) return commentErrorResponse(c, result);
    return c.json(result.value);
  });
}

harnessRoutes.patch('/notes/:noteId/comments/:threadId/messages/:messageId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const access = await requireCommentAccess(c, c.req.param('noteId'), 'edit');
  if (!access.ok) return c.json({ error: access.error }, access.status);
  const body = (await c.req.json().catch(() => null)) as { body?: string } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (typeof body.body !== 'string') return c.json({ error: 'Comment body is required' }, 400);
  const result = await updateCommentMessage({
    noteId: access.note.id,
    threadId: c.req.param('threadId'),
    messageId: c.req.param('messageId'),
    userId: user.id,
    actor: getCommentActor(c),
    body: body.body,
  });
  if (!result.ok) return commentErrorResponse(c, result);
  return c.json(result.value);
});

harnessRoutes.post('/notes/:noteId/comments/:threadId/messages/:messageId/reactions', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const access = await requireCommentAccess(c, c.req.param('noteId'), 'edit');
  if (!access.ok) return c.json({ error: access.error }, access.status);
  const body = (await c.req.json().catch(() => null)) as { emoji?: string } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (typeof body.emoji !== 'string') return c.json({ error: 'Reaction emoji is required' }, 400);
  const result = await toggleCommentReaction({
    noteId: access.note.id,
    threadId: c.req.param('threadId'),
    messageId: c.req.param('messageId'),
    userId: user.id,
    actor: getCommentActor(c),
    emoji: body.emoji,
  });
  if (!result.ok) return commentErrorResponse(c, result);
  return c.json(result.value);
});

harnessRoutes.delete('/notes/:noteId/comments/:threadId/messages/:messageId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const access = await requireCommentAccess(c, c.req.param('noteId'), 'edit');
  if (!access.ok) return c.json({ error: access.error }, access.status);
  const result = await deleteCommentMessage({
    noteId: access.note.id,
    threadId: c.req.param('threadId'),
    messageId: c.req.param('messageId'),
    userId: user.id,
    actor: getCommentActor(c),
  });
  if (!result.ok) return commentErrorResponse(c, result);
  return c.json(result.value);
});

harnessRoutes.delete('/notes/:noteId/comments/:threadId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const access = await requireCommentAccess(c, c.req.param('noteId'), 'edit');
  if (!access.ok) return c.json({ error: access.error }, access.status);
  const result = await deleteCommentThread({
    noteId: access.note.id,
    threadId: c.req.param('threadId'),
    userId: user.id,
    actor: getCommentActor(c),
  });
  if (!result.ok) return commentErrorResponse(c, result);
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
        .where(activeNoteWhere(user.id, inArray(notes.id, targetIds), inArray(notes.folderId, [...readableFolderIds])))
    : [];
  const visibleTargetIds = new Set(visibleTargets.map((note) => note.id));
  return c.json({
    noteId,
    links: links.map((link) =>
      link.targetNoteId && !visibleTargetIds.has(link.targetNoteId)
        ? {
            ...link,
            targetNoteId: null,
            targetTitle: link.label?.trim() || link.targetNoteId,
          }
        : link
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

harnessRoutes.post('/notes/:noteId/canvas/nodes/:nodeId/link-note', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => null)) as { targetNoteId?: string; baseHash?: string } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  if (!body.targetNoteId?.trim()) return c.json({ error: 'Target note id is required' }, 400);

  const current = await readDocument({ documentId: c.req.param('noteId'), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, 'edit'))) return c.json({ error: 'Forbidden' }, 403);

  const [target] = await db
    .select({ id: notes.id, folderId: notes.folderId })
    .from(notes)
    .where(activeNoteWhere(user.id, eq(notes.id, body.targetNoteId), eq(notes.type, 'note')))
    .limit(1);
  if (!target || !(await hasFolderPermission(c, target.folderId, 'read')))
    return c.json({ error: 'Target note not found' }, 404);

  const actor = getActor(c);
  const result = await linkCanvasNodeToNote({
    documentId: c.req.param('noteId'),
    userId: user.id,
    nodeId: c.req.param('nodeId'),
    targetNoteId: target.id,
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

harnessRoutes.delete('/notes/:noteId/canvas/nodes/:nodeId/link', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const current = await readDocument({ documentId: c.req.param('noteId'), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, 'edit'))) return c.json({ error: 'Forbidden' }, 403);

  const actor = getActor(c);
  const result = await unlinkCanvasNode({
    documentId: c.req.param('noteId'),
    userId: user.id,
    nodeId: c.req.param('nodeId'),
    baseHash: c.req.query('baseHash'),
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
