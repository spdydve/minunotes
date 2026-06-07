import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { syncNoteAttachmentReferences } from "../attachments/references";
import { db } from "../db/client";
import { folders, noteEvents, notes, type Note } from "../db/schema";
import { createId } from "../lib/id";
import { applyDocumentEdits, type DocumentEdit } from "./edits";
import { hashMarkdown } from "./hash";
import { getLineRange, searchLines } from "./line-search";

export type ActorType = "user" | "agent" | "system";
export type NoteEventType = "create" | "update" | "edit_patch" | "move" | "toggle_api_editable";

export type DocumentCommandResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400; error: string }
  | { ok: false; status: 403; error: string }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 409; error: string; currentHash: string };

export async function listFolders(input: { userId: string }) {
  const rows = await db.select().from(folders).where(eq(folders.userId, input.userId)).orderBy(asc(folders.title));
  return { ok: true, value: { folders: rows } } satisfies DocumentCommandResult<{ folders: typeof rows }>;
}

export type NoteType = "note" | "template";

export async function listDocuments(input: { userId: string; folderId?: string; type?: NoteType }) {
  const type = input.type ?? "note";
  const where = input.folderId
    ? and(eq(notes.userId, input.userId), eq(notes.folderId, input.folderId), eq(notes.type, type))
    : and(eq(notes.userId, input.userId), eq(notes.type, type));
  const rows = await db.select().from(notes).where(where).orderBy(desc(notes.updatedAt), asc(notes.title));
  return { ok: true, value: { documents: rows } } satisfies DocumentCommandResult<{ documents: typeof rows }>;
}

export async function listNoteEvents(input: { documentId: string; userId: string; limit?: number }) {
  const current = await readDocument({ documentId: input.documentId, userId: input.userId });
  if (!current.ok) return current;

  const events = await db.select().from(noteEvents)
    .where(and(eq(noteEvents.noteId, input.documentId), eq(noteEvents.userId, input.userId)))
    .orderBy(desc(noteEvents.createdAt))
    .limit(input.limit ?? 50);

  return { ok: true, value: { noteId: current.value.note.id, events } } satisfies DocumentCommandResult<{ noteId: string; events: typeof events }>;
}

export async function readDocumentLines(input: { documentId: string; userId: string; from?: number; to?: number }) {
  const current = await readDocument({ documentId: input.documentId, userId: input.userId });
  if (!current.ok) return current;

  const range = getLineRange(current.value.note.content, input.from ?? 1, input.to ?? 80);
  return {
    ok: true,
    value: {
      noteId: current.value.note.id,
      contentHash: current.value.contentHash,
      noteSizeBytes: new TextEncoder().encode(current.value.note.content).length,
      ...range,
    },
  } satisfies DocumentCommandResult<{ noteId: string; contentHash: string; noteSizeBytes: number; from: number; to: number; lineCount: number; lines: ReturnType<typeof getLineRange>["lines"] }>;
}

export async function searchDocumentLines(input: { documentId: string; userId: string; query: string; context?: number; limit?: number; caseSensitive?: boolean }) {
  const current = await readDocument({ documentId: input.documentId, userId: input.userId });
  if (!current.ok) return current;

  const result = searchLines(current.value.note.content, input);
  return {
    ok: true,
    value: {
      noteId: current.value.note.id,
      title: current.value.note.title,
      folderId: current.value.note.folderId,
      contentHash: current.value.contentHash,
      noteSizeBytes: new TextEncoder().encode(current.value.note.content).length,
      ...result,
    },
  } satisfies DocumentCommandResult<{ noteId: string; title: string; folderId: string; contentHash: string; noteSizeBytes: number; lineCount: number; matches: ReturnType<typeof searchLines>["matches"] }>;
}

export async function searchAllDocumentLines(input: { userId: string; query: string; folderId?: string; context?: number; limit?: number; caseSensitive?: boolean }) {
  const query = input.query.trim();
  if (!query) return { ok: true, value: { query, matches: [] } } satisfies DocumentCommandResult<{ query: string; matches: Array<never> }>;

  const pattern = `%${query}%`;
  const where = input.folderId
    ? and(eq(notes.userId, input.userId), eq(notes.folderId, input.folderId), or(like(notes.title, pattern), like(notes.content, pattern)))
    : and(eq(notes.userId, input.userId), or(like(notes.title, pattern), like(notes.content, pattern)));
  const rows = await db.select().from(notes).where(where).orderBy(desc(notes.updatedAt), asc(notes.title)).limit(50);
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
  const matches: Array<ReturnType<typeof searchLines>["matches"][number] & { noteId: string; title: string; folderId: string; contentHash: string; noteSizeBytes: number; lineCount: number }> = [];

  for (const note of rows) {
    const contentHash = hashMarkdown(note.content);
    const result = searchLines(note.content, { query, context: input.context, limit: limit - matches.length, caseSensitive: input.caseSensitive });
    matches.push(...result.matches.map((match) => ({
      ...match,
      noteId: note.id,
      title: note.title,
      folderId: note.folderId,
      contentHash,
      noteSizeBytes: new TextEncoder().encode(note.content).length,
      lineCount: result.lineCount,
    })));
    if (matches.length >= limit) break;
  }

  return { ok: true, value: { query, matches } } satisfies DocumentCommandResult<{ query: string; matches: typeof matches }>;
}

export async function searchDocuments(input: { userId: string; query: string; limit?: number; type?: NoteType }) {
  const query = input.query.trim();
  if (!query) return { ok: true, value: { documents: [] } } satisfies DocumentCommandResult<{ documents: Array<{
    id: string;
    folderId: string;
    userId: string;
    title: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    folderTitle: string;
  }> }>;

  const pattern = `%${query}%`;
  const type = input.type ?? "note";
  const rows = await db.select({
    id: notes.id,
    folderId: notes.folderId,
    userId: notes.userId,
    title: notes.title,
    content: notes.content,
    type: notes.type,
    createdAt: notes.createdAt,
    updatedAt: notes.updatedAt,
    folderTitle: folders.title,
  })
    .from(notes)
    .innerJoin(folders, and(eq(notes.folderId, folders.id), eq(folders.userId, input.userId)))
    .where(and(eq(notes.userId, input.userId), eq(notes.type, type), or(like(notes.title, pattern), like(notes.content, pattern))))
    .orderBy(desc(notes.updatedAt), asc(notes.title))
    .limit(input.limit ?? 25);

  return { ok: true, value: { documents: rows } } satisfies DocumentCommandResult<{ documents: typeof rows }>;
}

export function getUpdateEventType(input: Pick<UpdateDocumentInput, "title" | "markdown" | "folderId" | "isApiEditable">, current: Pick<Note, "title" | "content" | "folderId" | "isApiEditable">): NoteEventType {
  if (input.folderId !== undefined && input.folderId !== current.folderId && input.title === undefined && input.markdown === undefined && input.isApiEditable === undefined) {
    return "move";
  }

  if (input.isApiEditable !== undefined && input.isApiEditable !== current.isApiEditable && input.title === undefined && input.markdown === undefined && input.folderId === undefined) {
    return "toggle_api_editable";
  }

  return "update";
}

export function getNoteEventSummary(eventType: NoteEventType, details: {
  titleChanged?: boolean;
  contentChanged?: boolean;
  folderChanged?: boolean;
  isApiEditableChanged?: boolean;
  isApiEditable?: boolean;
}) {
  if (eventType === "create") return "Created note";
  if (eventType === "edit_patch") return "Patched note content";
  if (eventType === "move") return "Moved note to another folder";
  if (eventType === "toggle_api_editable") return details.isApiEditable ? "Enabled API editing" : "Disabled API editing";

  const changed = [
    details.titleChanged ? "title" : null,
    details.contentChanged ? "content" : null,
    details.folderChanged ? "folder" : null,
    details.isApiEditableChanged ? "API editability" : null,
  ].filter(Boolean);

  return changed.length > 0 ? `Updated ${changed.join(", ")}` : "Updated note";
}

async function insertNoteEvent(input: {
  noteId: string;
  userId: string;
  actorType: ActorType;
  actorId?: string;
  eventType: NoteEventType;
  summary: string;
  beforeHash?: string;
  afterHash?: string;
}) {
  await db.insert(noteEvents).values({
    id: createId("note_event"),
    noteId: input.noteId,
    userId: input.userId,
    actorType: input.actorType,
    actorId: input.actorId,
    eventType: input.eventType,
    summary: input.summary,
    beforeHash: input.beforeHash,
    afterHash: input.afterHash,
    createdAt: new Date(),
  });
}

export async function createDocument(input: {
  userId: string;
  folderId: string;
  title?: string;
  markdown?: string;
  actorType?: ActorType;
  actorId?: string;
  type?: NoteType;
}) {
  const [folder] = await db.select().from(folders).where(and(eq(folders.id, input.folderId), eq(folders.userId, input.userId))).limit(1);
  if (!folder) return { ok: false, status: 404, error: "Folder not found" } satisfies DocumentCommandResult<never>;

  const title = input.title?.trim() || "Untitled note";
  const note = {
    id: createId("note"),
    folderId: input.folderId,
    userId: input.userId,
    title,
    content: input.markdown ?? "",
    type: input.type ?? "note",
    updatedByActorType: input.actorType ?? "user",
    updatedByActorId: input.actorId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(notes).values(note);
  if (note.content.includes("/api/attachments/")) {
    await syncNoteAttachmentReferences({ noteId: note.id, userId: note.userId, markdown: note.content });
  }

  const contentHash = hashMarkdown(note.content);
  await insertNoteEvent({
    noteId: note.id,
    userId: note.userId,
    actorType: note.updatedByActorType ?? "user",
    actorId: note.updatedByActorId ?? undefined,
    eventType: "create",
    summary: getNoteEventSummary("create", {}),
    afterHash: contentHash,
  });

  return { ok: true, value: { note, contentHash } } satisfies DocumentCommandResult<{ note: typeof note; contentHash: string }>;
}

export async function readDocument(input: { documentId: string; userId: string }) {
  const [note] = await db.select().from(notes).where(and(eq(notes.id, input.documentId), eq(notes.userId, input.userId))).limit(1);
  if (!note) return { ok: false, status: 404, error: "Note not found" } satisfies DocumentCommandResult<never>;

  return {
    ok: true,
    value: { note, contentHash: hashMarkdown(note.content) },
  } satisfies DocumentCommandResult<{ note: typeof note; contentHash: string }>;
}

export interface UpdateDocumentInput {
  documentId: string;
  userId: string;
  title?: string;
  markdown?: string;
  folderId?: string;
  isApiEditable?: boolean;
  baseHash?: string;
  actorType?: ActorType;
  actorId?: string;
  eventType?: NoteEventType;
}

export async function updateDocument(input: UpdateDocumentInput) {
  const current = await readDocument({ documentId: input.documentId, userId: input.userId });
  if (!current.ok) return current;

  const currentHash = current.value.contentHash;
  const isApiMutation = input.actorType === "agent" && (input.title !== undefined || input.markdown !== undefined || input.folderId !== undefined || input.isApiEditable !== undefined);
  if (isApiMutation && current.value.note.type === "template") {
    return { ok: false, status: 403, error: "Templates cannot be edited through the API" } satisfies DocumentCommandResult<never>;
  }
  if (isApiMutation && !current.value.note.isApiEditable) {
    return { ok: false, status: 403, error: "Document is not editable through the API" } satisfies DocumentCommandResult<never>;
  }

  if (input.baseHash && input.baseHash !== currentHash) {
    return { ok: false, status: 409, error: "Document has changed since it was read", currentHash } satisfies DocumentCommandResult<never>;
  }

  if (input.folderId !== undefined) {
    const [folder] = await db.select().from(folders).where(and(eq(folders.id, input.folderId), eq(folders.userId, input.userId))).limit(1);
    if (!folder) return { ok: false, status: 404, error: "Destination folder not found" } satisfies DocumentCommandResult<never>;
  }

  const titleChanged = input.title !== undefined && input.title !== current.value.note.title;
  const contentChanged = input.markdown !== undefined && input.markdown !== current.value.note.content;
  const folderChanged = input.folderId !== undefined && input.folderId !== current.value.note.folderId;
  const isApiEditableChanged = input.isApiEditable !== undefined && input.isApiEditable !== current.value.note.isApiEditable;

  const [note] = await db.update(notes)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.markdown !== undefined ? { content: input.markdown } : {}),
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
      ...(input.isApiEditable !== undefined ? { isApiEditable: input.isApiEditable } : {}),
      updatedByActorType: input.actorType ?? "user",
      updatedByActorId: input.actorId,
      updatedAt: new Date(),
    })
    .where(and(eq(notes.id, input.documentId), eq(notes.userId, input.userId)))
    .returning();

  if (!note) return { ok: false, status: 404, error: "Note not found" } satisfies DocumentCommandResult<never>;

  if (contentChanged) {
    await syncNoteAttachmentReferences({ noteId: note.id, userId: note.userId, markdown: note.content });
  }

  const contentHash = hashMarkdown(note.content);
  const actorType = input.actorType ?? "user";
  if (titleChanged || contentChanged || folderChanged || isApiEditableChanged) {
    const eventType = input.eventType ?? getUpdateEventType(input, current.value.note);
    await insertNoteEvent({
      noteId: note.id,
      userId: note.userId,
      actorType,
      actorId: input.actorId,
      eventType,
      summary: getNoteEventSummary(eventType, {
        titleChanged,
        contentChanged,
        folderChanged,
        isApiEditableChanged,
        isApiEditable: note.isApiEditable,
      }),
      beforeHash: currentHash,
      afterHash: contentHash,
    });
  }

  return { ok: true, value: { note, contentHash } } satisfies DocumentCommandResult<{ note: typeof note; contentHash: string }>;
}

export async function editDocument(input: Omit<UpdateDocumentInput, "title" | "markdown" | "folderId"> & { edits: DocumentEdit[] }) {
  const current = await readDocument({ documentId: input.documentId, userId: input.userId });
  if (!current.ok) return current;

  const result = applyDocumentEdits(current.value.note.content, input.edits);
  if (!result.ok) return { ok: false, status: 400, error: result.error } satisfies DocumentCommandResult<never>;

  return updateDocument({
    documentId: input.documentId,
    userId: input.userId,
    markdown: result.markdown,
    baseHash: input.baseHash,
    actorType: input.actorType,
    actorId: input.actorId,
    eventType: "edit_patch",
  });
}

export type { DocumentEdit };
