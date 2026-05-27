import { Hono, type Context } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { apiKeyFolderPermissions, type ApiKey } from "../db/schema";
import { createDocument, editDocument, listFolders, listNoteEvents, readDocument, searchDocuments, type ActorType, type DocumentEdit } from "../harness/commands";
import { findSection, parseSections } from "../harness/sections";
import { auth } from "../lib/auth";

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
  const key = c.get("apiKey");
  if (!key) return true;

  const [row] = await db.select().from(apiKeyFolderPermissions)
    .where(and(eq(apiKeyFolderPermissions.apiKeyId, key.id), eq(apiKeyFolderPermissions.folderId, folderId)))
    .limit(1);
  if (!row) return false;
  if (permission === "read") return row.canRead;
  if (permission === "create") return row.canCreate;
  return row.canEdit;
}

async function getReadableFolderIds(c: Context<{ Variables: Variables }>) {
  const key = c.get("apiKey");
  if (!key) return null;
  const rows = await db.select().from(apiKeyFolderPermissions)
    .where(and(eq(apiKeyFolderPermissions.apiKeyId, key.id), eq(apiKeyFolderPermissions.canRead, true)));
  return new Set(rows.map((row) => row.folderId));
}

harnessRoutes.get("/folders", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const result = await listFolders({ userId: user.id });
  const readableFolderIds = await getReadableFolderIds(c);
  if (!readableFolderIds) return c.json(result.value);
  return c.json({ folders: result.value.folders.filter((folder) => readableFolderIds.has(folder.id)) });
});

harnessRoutes.get("/notes/search", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ notes: [] });

  const result = await searchDocuments({ userId: user.id, query: q, limit: 25 });
  const readableFolderIds = await getReadableFolderIds(c);
  if (!readableFolderIds) return c.json({ notes: result.value.documents });
  return c.json({ notes: result.value.documents.filter((note) => readableFolderIds.has(note.folderId)) });
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
