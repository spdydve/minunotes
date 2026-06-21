import { Hono, type Context } from "hono";
import { and, desc, eq, inArray, isNull, or, gt } from "drizzle-orm";
import { db } from "../db/client";
import { apiKeys, folders, noteShareLinks, notes, templateFolderAssignments } from "../db/schema";
import { editDocument, listNoteEvents, readDocument, searchDocuments, updateDocument, type DocumentEdit } from "../harness/commands";
import { findSection, parseSections } from "../harness/sections";
import { auth } from "../lib/auth";
import { createId } from "../lib/id";
import { listBacklinks } from "../notes/links";
import { listNoteTags, listUserTags, noteIdsForTag, setNoteTags } from "../notes/tags";
import { buildShareUrl, generateShareToken, hashShareToken } from "../lib/share-tokens";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const noteRoutes = new Hono<{ Variables: Variables }>();

function getUser(c: Context<{ Variables: Variables }>) {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

async function withPublicActorUid<T extends { userId: string; updatedByActorType: string | null; updatedByActorId: string | null }>(note: T) {
  if (note.updatedByActorType !== "agent" || !note.updatedByActorId) return { ...note, updatedByActorUid: null };
  const [key] = await db.select({ uid: apiKeys.uid }).from(apiKeys).where(and(eq(apiKeys.id, note.updatedByActorId), eq(apiKeys.userId, note.userId))).limit(1);
  return { ...note, updatedByActorUid: key?.uid ?? null };
}

function activeShareWhere(noteId: string, userId: string) {
  const now = new Date();
  return and(
    eq(noteShareLinks.noteId, noteId),
    eq(noteShareLinks.userId, userId),
    isNull(noteShareLinks.revokedAt),
    or(isNull(noteShareLinks.expiresAt), gt(noteShareLinks.expiresAt, now)),
  );
}

function serializeShareLink(shareLink: typeof noteShareLinks.$inferSelect, url?: string | null) {
  return {
    id: shareLink.id,
    noteId: shareLink.noteId,
    permission: shareLink.permission,
    createdAt: shareLink.createdAt,
    updatedAt: shareLink.updatedAt,
    expiresAt: shareLink.expiresAt,
    revokedAt: shareLink.revokedAt,
    url: url ?? (shareLink.token ? buildShareUrl(shareLink.token) : null),
  };
}

noteRoutes.get("/tags", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  return c.json({ tags: await listUserTags({ userId: user.id }) });
});

noteRoutes.get("/templates", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const rows = await db.select().from(notes).where(and(eq(notes.userId, user.id), eq(notes.type, "template")));
  return c.json({ templates: rows });
});

noteRoutes.get("/templates/:templateId/folders", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const rows = await db.select({ folder: folders }).from(templateFolderAssignments)
    .innerJoin(folders, eq(templateFolderAssignments.folderId, folders.id))
    .where(and(eq(templateFolderAssignments.userId, user.id), eq(templateFolderAssignments.templateId, c.req.param("templateId"))));
  return c.json({ folders: rows.map((row) => row.folder) });
});

noteRoutes.put("/templates/:templateId/folders", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const templateId = c.req.param("templateId");
  const [template] = await db.select().from(notes).where(and(eq(notes.id, templateId), eq(notes.userId, user.id), eq(notes.type, "template"))).limit(1);
  if (!template) return c.json({ error: "Template not found" }, 404);
  const body = await c.req.json().catch(() => null) as { folderIds?: string[] } | null;
  const folderIds = [...new Set(body?.folderIds ?? [])];
  if (folderIds.length) {
    const valid = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.userId, user.id), inArray(folders.id, folderIds)));
    if (valid.length !== folderIds.length) return c.json({ error: "One or more folders were not found" }, 400);
  }
  await db.delete(templateFolderAssignments).where(and(eq(templateFolderAssignments.userId, user.id), eq(templateFolderAssignments.templateId, templateId)));
  if (folderIds.length) {
    await db.insert(templateFolderAssignments).values(folderIds.map((folderId) => ({ id: crypto.randomUUID(), userId: user.id, templateId, folderId, createdAt: new Date() })));
  }
  return c.json({ ok: true });
});

noteRoutes.get("/search", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ notes: [] });

  const type = c.req.query("type") === "template" ? "template" : "note";
  const requestedLimit = Number.parseInt(c.req.query("limit") ?? "", 10);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 50;
  const result = await searchDocuments({ userId: user.id, query: q, limit, type });
  const tag = c.req.query("tag")?.trim();
  if (!tag) return c.json({ notes: result.value.documents });

  const tagged = await noteIdsForTag({ userId: user.id, tag });
  const taggedIds = new Set(tagged.map((row) => row.noteId));
  return c.json({ notes: result.value.documents.filter((note) => taggedIds.has(note.id)) });
});

noteRoutes.get("/recent", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const limit = Number.parseInt(c.req.query("limit") ?? "", 10);
  const rows = await db.select().from(notes)
    .where(and(eq(notes.userId, user.id), eq(notes.type, "note")))
    .orderBy(desc(notes.updatedAt))
    .limit(Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10);

  return c.json({ notes: rows });
});

noteRoutes.get("/:noteId/tags", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const noteId = c.req.param("noteId");
  const [note] = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.id, noteId), eq(notes.userId, user.id))).limit(1);
  if (!note) return c.json({ error: "Note not found" }, 404);
  return c.json({ tags: await listNoteTags({ userId: user.id, noteId }) });
});

noteRoutes.put("/:noteId/tags", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const noteId = c.req.param("noteId");
  const [note] = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.id, noteId), eq(notes.userId, user.id))).limit(1);
  if (!note) return c.json({ error: "Note not found" }, 404);
  const body = await c.req.json().catch(() => null) as { tags?: string[] } | null;
  if (!body || !Array.isArray(body.tags)) return c.json({ error: "Tags array is required" }, 400);
  return c.json({ tags: await setNoteTags({ userId: user.id, noteId, tags: body.tags }) });
});

noteRoutes.get("/:noteId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const result = await readDocument({ documentId: c.req.param("noteId"), userId: user.id });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ ...result.value, note: await withPublicActorUid(result.value.note) });
});

noteRoutes.get("/:noteId/status", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const result = await readDocument({ documentId: c.req.param("noteId"), userId: user.id });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ noteId: result.value.note.id, contentHash: result.value.contentHash, updatedAt: result.value.note.updatedAt });
});

noteRoutes.get("/:noteId/share-link", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const noteId = c.req.param("noteId");
  const [note] = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.id, noteId), eq(notes.userId, user.id))).limit(1);
  if (!note) return c.json({ error: "Note not found" }, 404);

  const [shareLink] = await db.select().from(noteShareLinks).where(activeShareWhere(noteId, user.id)).limit(1);
  return c.json({ shareLink: shareLink ? serializeShareLink(shareLink) : null });
});

noteRoutes.post("/:noteId/share-link", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const noteId = c.req.param("noteId");
  const [note] = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.id, noteId), eq(notes.userId, user.id))).limit(1);
  if (!note) return c.json({ error: "Note not found" }, 404);

  const body = await c.req.json().catch(() => null) as { regenerate?: boolean } | null;
  const [existing] = await db.select().from(noteShareLinks).where(activeShareWhere(noteId, user.id)).limit(1);
  if (existing && !body?.regenerate && existing.token) return c.json({ shareLink: serializeShareLink(existing) });

  const token = generateShareToken();
  const now = new Date();
  if (existing && !body?.regenerate) {
    const [shareLink] = await db.update(noteShareLinks).set({ token, tokenHash: hashShareToken(token), updatedAt: now }).where(eq(noteShareLinks.id, existing.id)).returning();
    return c.json({ shareLink: serializeShareLink(shareLink) });
  }

  if (existing) await db.update(noteShareLinks).set({ revokedAt: now, updatedAt: now }).where(eq(noteShareLinks.id, existing.id));
  const [shareLink] = await db.insert(noteShareLinks).values({
    id: createId("share"),
    userId: user.id,
    noteId,
    tokenHash: hashShareToken(token),
    token,
    permission: "read",
    createdAt: now,
    updatedAt: now,
  }).returning();

  return c.json({ shareLink: serializeShareLink(shareLink) }, 201);
});

noteRoutes.delete("/:noteId/share-link", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const noteId = c.req.param("noteId");
  const [note] = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.id, noteId), eq(notes.userId, user.id))).limit(1);
  if (!note) return c.json({ error: "Note not found" }, 404);

  const now = new Date();
  await db.update(noteShareLinks).set({ revokedAt: now, updatedAt: now }).where(activeShareWhere(noteId, user.id));
  return c.json({ ok: true });
});

noteRoutes.get("/:noteId/backlinks", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const backlinks = await listBacklinks({ userId: user.id, noteId: c.req.param("noteId") });
  if (!backlinks) return c.json({ error: "Note not found" }, 404);
  return c.json({ noteId: c.req.param("noteId"), backlinks });
});

noteRoutes.get("/:noteId/events", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const limit = Number.parseInt(c.req.query("limit") ?? "", 10);
  const result = await listNoteEvents({ documentId: c.req.param("noteId"), userId: user.id, limit: Number.isFinite(limit) && limit > 0 ? limit : undefined });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.value);
});

noteRoutes.get("/:noteId/outline", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const result = await readDocument({ documentId: c.req.param("noteId"), userId: user.id });
  if (!result.ok) return c.json({ error: result.error }, result.status);

  return c.json({
    noteId: result.value.note.id,
    contentHash: result.value.contentHash,
    sections: parseSections(result.value.note.content),
  });
});

noteRoutes.get("/:noteId/sections/:sectionId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const result = await readDocument({ documentId: c.req.param("noteId"), userId: user.id });
  if (!result.ok) return c.json({ error: result.error }, result.status);

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

noteRoutes.post("/:noteId/edit", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null) as { edits?: DocumentEdit[]; baseHash?: string } | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  if (!Array.isArray(body.edits) || body.edits.length === 0) return c.json({ error: "At least one edit is required" }, 400);

  const result = await editDocument({
    documentId: c.req.param("noteId"),
    userId: user.id,
    edits: body.edits,
    baseHash: body.baseHash,
    actorType: "user",
  });

  if (!result.ok) return c.json({ error: result.error, ...("currentHash" in result ? { currentHash: result.currentHash } : {}) }, result.status);
  return c.json(result.value);
});

noteRoutes.patch("/:noteId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null) as { title?: string; content?: string; folderId?: string; isApiEditable?: boolean; createdAt?: string; baseHash?: string } | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const title = body.title?.trim();
  if (body.title !== undefined && !title) return c.json({ error: "Note title is required" }, 400);
  const createdAt = body.createdAt !== undefined ? new Date(body.createdAt) : undefined;
  if (body.createdAt !== undefined && (!createdAt || Number.isNaN(createdAt.getTime()))) return c.json({ error: "Invalid created date" }, 400);

  const result = await updateDocument({
    documentId: c.req.param("noteId"),
    userId: user.id,
    title,
    markdown: body.content,
    folderId: body.folderId,
    isApiEditable: body.isApiEditable,
    createdAt,
    baseHash: body.baseHash,
    actorType: "user",
  });

  if (!result.ok) return c.json({ error: result.error, ...("currentHash" in result ? { currentHash: result.currentHash } : {}) }, result.status);
  return c.json(result.value);
});

noteRoutes.delete("/:noteId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  await db.delete(notes).where(and(eq(notes.id, c.req.param("noteId")), eq(notes.userId, user.id)));
  return c.json({ ok: true });
});
