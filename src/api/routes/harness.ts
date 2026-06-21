import { Hono, type Context } from "hono";
import { db } from "../db/client";
import { apiKeyFolderPermissions, folders, notes, type ApiKey } from "../db/schema";
import { createDocument, editDocument, listFolders, listNoteEvents, readDocument, readDocumentLines, searchAllDocumentLines, searchDocumentLines, searchDocuments, type ActorType, type DocumentEdit } from "../harness/commands";
import { findSection, parseSections } from "../harness/sections";
import { listBacklinks } from "../notes/links";
import { listNoteTags, listUserTags, noteIdsForTag, setNoteTags } from "../notes/tags";
import { auth } from "../lib/auth";
import { canApiKeyAccessFolder, getApiKeyAccessibleFolderIds, validateFolderParent } from "../lib/folder-access";
import { createId } from "../lib/id";
import { and, eq, inArray } from "drizzle-orm";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  apiKey: ApiKey | null;
};

export const harnessRoutes = new Hono<{ Variables: Variables }>();

function getUser(c: Context<{ Variables: Variables }>) {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

function getActor(c: Context<{ Variables: Variables }>): { actorType: ActorType; actorId?: string } {
  const key = c.get("apiKey");
  return key ? { actorType: "agent", actorId: key.id } : { actorType: "user" };
}

async function hasFolderPermission(c: Context<{ Variables: Variables }>, folderId: string, permission: "read" | "create" | "edit") {
  const user = c.get("user");
  if (!user) return false;
  return canApiKeyAccessFolder({ apiKey: c.get("apiKey"), userId: user.id, folderId, permission });
}

async function getReadableFolderIds(c: Context<{ Variables: Variables }>) {
  const user = c.get("user");
  if (!user) return null;
  return getApiKeyAccessibleFolderIds({ apiKey: c.get("apiKey"), userId: user.id, permission: "read" });
}

harnessRoutes.get("/tags", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const readableFolderIds = await getReadableFolderIds(c);
  if (!readableFolderIds) return c.json({ tags: await listUserTags({ userId: user.id }) });

  const readableIds = [...readableFolderIds];
  if (readableIds.length === 0) return c.json({ tags: [] });
  const visibleNotes = await db.select({ id: notes.id }).from(notes)
    .where(and(eq(notes.userId, user.id), inArray(notes.folderId, readableIds)));
  return c.json({ tags: await listUserTags({ userId: user.id, noteIds: visibleNotes.map((note) => note.id) }) });
});

harnessRoutes.get("/folders", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const result = await listFolders({ userId: user.id });
  const readableFolderIds = await getReadableFolderIds(c);
  if (!readableFolderIds) return c.json(result.value);
  return c.json({ folders: result.value.folders.filter((folder) => readableFolderIds.has(folder.id)) });
});

harnessRoutes.post("/folders", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const key = c.get("apiKey");
  if (key && !key.canCreateFolders) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json().catch(() => null) as { title?: string; parentFolderId?: string | null } | null;
  const title = body?.title?.trim();
  if (!title) return c.json({ error: "Folder title is required" }, 400);

  const parent = await validateFolderParent({ userId: user.id, parentFolderId: body?.parentFolderId ?? null });
  if (!parent.ok) return c.json({ error: parent.error }, parent.status);
  if (key && body?.parentFolderId && !(await hasFolderPermission(c, body.parentFolderId, "create"))) return c.json({ error: "Forbidden" }, 403);

  const folder = { id: createId("folder"), userId: user.id, parentFolderId: body?.parentFolderId ?? null, title, isPrivate: false, isAgentReadOnly: false, createdAt: new Date(), updatedAt: new Date() };
  await db.insert(folders).values(folder);

  if (key && key.accessMode === "specific") {
    await db.insert(apiKeyFolderPermissions).values({
      id: createId("agent_perm"),
      apiKeyId: key.id,
      folderId: folder.id,
      canRead: key.canRead,
      canCreate: key.canCreate,
      canEdit: key.canEdit,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return c.json({ folder }, 201);
});

harnessRoutes.get("/notes/search", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ notes: [] });

  const result = await searchDocuments({ userId: user.id, query: q, limit: 25 });
  const tag = c.req.query("tag")?.trim();
  const taggedIds = tag ? new Set((await noteIdsForTag({ userId: user.id, tag })).map((row) => row.noteId)) : null;
  const readableFolderIds = await getReadableFolderIds(c);
  const filtered = result.value.documents.filter((note) => (!taggedIds || taggedIds.has(note.id)) && (!readableFolderIds || readableFolderIds.has(note.folderId)));
  return c.json({ notes: filtered });
});

harnessRoutes.get("/notes/search-lines", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ query: "", matches: [] });

  const readableFolderIds = await getReadableFolderIds(c);
  const result = await searchAllDocumentLines({
    userId: user.id,
    query: q,
    folderId: c.req.query("folderId"),
    context: Number.parseInt(c.req.query("context") ?? "", 10),
    limit: Number.parseInt(c.req.query("limit") ?? "", 10),
    caseSensitive: c.req.query("caseSensitive") === "true",
  });
  if (!readableFolderIds) return c.json(result.value);
  return c.json({ query: result.value.query, matches: result.value.matches.filter((match) => readableFolderIds.has(match.folderId)) });
});

harnessRoutes.post("/notes", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null) as { folderId?: string; title?: string; content?: string } | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  if (!body.folderId) return c.json({ error: "Folder id is required" }, 400);

  if (!(await hasFolderPermission(c, body.folderId, "create"))) return c.json({ error: "Forbidden" }, 403);

  const actor = getActor(c);
  const result = await createDocument({
    userId: user.id,
    folderId: body.folderId,
    title: body.title,
    markdown: body.content,
    actorType: actor.actorType,
    actorId: actor.actorId,
  });

  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.value, 201);
});

harnessRoutes.get("/notes/:noteId/tags", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const noteId = c.req.param("noteId");
  const [note] = await db.select({ id: notes.id, folderId: notes.folderId }).from(notes).where(and(eq(notes.id, noteId), eq(notes.userId, user.id))).limit(1);
  if (!note) return c.json({ error: "Note not found" }, 404);
  if (!(await hasFolderPermission(c, note.folderId, "read"))) return c.json({ error: "Forbidden" }, 403);
  return c.json({ tags: await listNoteTags({ userId: user.id, noteId }) });
});

harnessRoutes.put("/notes/:noteId/tags", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const noteId = c.req.param("noteId");
  const [note] = await db.select({ id: notes.id, folderId: notes.folderId, isApiEditable: notes.isApiEditable }).from(notes).where(and(eq(notes.id, noteId), eq(notes.userId, user.id))).limit(1);
  if (!note) return c.json({ error: "Note not found" }, 404);
  if (!(await hasFolderPermission(c, note.folderId, "edit")) || !note.isApiEditable) return c.json({ error: "Forbidden" }, 403);
  const body = await c.req.json().catch(() => null) as { tags?: string[] } | null;
  if (!body || !Array.isArray(body.tags)) return c.json({ error: "Tags array is required" }, 400);
  return c.json({ tags: await setNoteTags({ userId: user.id, noteId, tags: body.tags }) });
});

harnessRoutes.get("/notes/:noteId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const result = await readDocument({ documentId: c.req.param("noteId"), userId: user.id });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  if (!(await hasFolderPermission(c, result.value.note.folderId, "read"))) return c.json({ error: "Forbidden" }, 403);
  return c.json(result.value);
});

harnessRoutes.get("/notes/:noteId/events", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const current = await readDocument({ documentId: c.req.param("noteId"), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, "read"))) return c.json({ error: "Forbidden" }, 403);

  const limit = Number.parseInt(c.req.query("limit") ?? "", 10);
  const result = await listNoteEvents({ documentId: c.req.param("noteId"), userId: user.id, limit: Number.isFinite(limit) && limit > 0 ? limit : undefined });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.value);
});

harnessRoutes.get("/notes/:noteId/backlinks", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const current = await readDocument({ documentId: c.req.param("noteId"), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, "read"))) return c.json({ error: "Forbidden" }, 403);

  const backlinks = await listBacklinks({ userId: user.id, noteId: c.req.param("noteId") });
  if (!backlinks) return c.json({ error: "Note not found" }, 404);

  const readableFolderIds = await getReadableFolderIds(c);
  return c.json({
    noteId: c.req.param("noteId"),
    backlinks: readableFolderIds ? backlinks.filter((backlink) => readableFolderIds.has(backlink.sourceFolderId)) : backlinks,
  });
});

harnessRoutes.get("/notes/:noteId/lines", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const current = await readDocument({ documentId: c.req.param("noteId"), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, "read"))) return c.json({ error: "Forbidden" }, 403);

  const result = await readDocumentLines({
    documentId: c.req.param("noteId"),
    userId: user.id,
    from: Number.parseInt(c.req.query("from") ?? "", 10),
    to: Number.parseInt(c.req.query("to") ?? "", 10),
  });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.value);
});

harnessRoutes.get("/notes/:noteId/search-lines", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const current = await readDocument({ documentId: c.req.param("noteId"), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, "read"))) return c.json({ error: "Forbidden" }, 403);

  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ query: "", matches: [] });

  const result = await searchDocumentLines({
    documentId: c.req.param("noteId"),
    userId: user.id,
    query: q,
    context: Number.parseInt(c.req.query("context") ?? "", 10),
    limit: Number.parseInt(c.req.query("limit") ?? "", 10),
    caseSensitive: c.req.query("caseSensitive") === "true",
  });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.value);
});

harnessRoutes.get("/notes/:noteId/outline", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const result = await readDocument({ documentId: c.req.param("noteId"), userId: user.id });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  if (!(await hasFolderPermission(c, result.value.note.folderId, "read"))) return c.json({ error: "Forbidden" }, 403);
  return c.json({ noteId: result.value.note.id, contentHash: result.value.contentHash, sections: parseSections(result.value.note.content) });
});

harnessRoutes.get("/notes/:noteId/sections/:sectionId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const result = await readDocument({ documentId: c.req.param("noteId"), userId: user.id });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  if (!(await hasFolderPermission(c, result.value.note.folderId, "read"))) return c.json({ error: "Forbidden" }, 403);

  const section = findSection(result.value.note.content, c.req.param("sectionId"));
  if (!section) return c.json({ error: "Section not found" }, 404);

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

harnessRoutes.post("/notes/:noteId/edit", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null) as { edits?: DocumentEdit[]; baseHash?: string } | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  if (!Array.isArray(body.edits) || body.edits.length === 0) return c.json({ error: "At least one edit is required" }, 400);

  const current = await readDocument({ documentId: c.req.param("noteId"), userId: user.id });
  if (!current.ok) return c.json({ error: current.error }, current.status);
  if (!(await hasFolderPermission(c, current.value.note.folderId, "edit"))) return c.json({ error: "Forbidden" }, 403);

  const actor = getActor(c);
  const result = await editDocument({
    documentId: c.req.param("noteId"),
    userId: user.id,
    edits: body.edits,
    baseHash: body.baseHash,
    actorType: actor.actorType,
    actorId: actor.actorId,
  });

  if (!result.ok) return c.json({ error: result.error, ...("currentHash" in result ? { currentHash: result.currentHash } : {}) }, result.status);
  return c.json(result.value);
});
