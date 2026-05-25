import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { db } from "../db/client";
import { folders, notes } from "../db/schema";
import { createId } from "../lib/id";
import { applyDocumentEdits, type DocumentEdit } from "./edits";
import { hashMarkdown } from "./hash";

export type ActorType = "user" | "agent" | "system";

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

export async function listDocuments(input: { userId: string; folderId?: string }) {
  const where = input.folderId
    ? and(eq(notes.userId, input.userId), eq(notes.folderId, input.folderId))
    : eq(notes.userId, input.userId);
  const rows = await db.select().from(notes).where(where).orderBy(desc(notes.updatedAt), asc(notes.title));
  return { ok: true, value: { documents: rows } } satisfies DocumentCommandResult<{ documents: typeof rows }>;
}

export async function searchDocuments(input: { userId: string; query: string; limit?: number }) {
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
  const rows = await db.select({
    id: notes.id,
    folderId: notes.folderId,
    userId: notes.userId,
    title: notes.title,
    content: notes.content,
    createdAt: notes.createdAt,
    updatedAt: notes.updatedAt,
    folderTitle: folders.title,
  })
    .from(notes)
    .innerJoin(folders, and(eq(notes.folderId, folders.id), eq(folders.userId, input.userId)))
    .where(and(eq(notes.userId, input.userId), or(like(notes.title, pattern), like(notes.content, pattern))))
    .orderBy(desc(notes.updatedAt), asc(notes.title))
    .limit(input.limit ?? 25);

  return { ok: true, value: { documents: rows } } satisfies DocumentCommandResult<{ documents: typeof rows }>;
}

export async function createDocument(input: {
  userId: string;
  folderId: string;
  title?: string;
  markdown?: string;
  actorType?: ActorType;
  actorId?: string;
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(notes).values(note);
  return { ok: true, value: { note, contentHash: hashMarkdown(note.content) } } satisfies DocumentCommandResult<{ note: typeof note; contentHash: string }>;
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
  isAgentEditable?: boolean;
  baseHash?: string;
  actorType?: ActorType;
  actorId?: string;
}

export async function updateDocument(input: UpdateDocumentInput) {
  const current = await readDocument({ documentId: input.documentId, userId: input.userId });
  if (!current.ok) return current;

  const currentHash = current.value.contentHash;
  const isAgentMutation = input.actorType === "agent" && (input.title !== undefined || input.markdown !== undefined || input.folderId !== undefined || input.isAgentEditable !== undefined);
  if (isAgentMutation && !current.value.note.isAgentEditable) {
    return { ok: false, status: 403, error: "Document is not editable by agents" } satisfies DocumentCommandResult<never>;
  }

  if (input.baseHash && input.baseHash !== currentHash) {
    return { ok: false, status: 409, error: "Document has changed since it was read", currentHash } satisfies DocumentCommandResult<never>;
  }

  if (input.folderId !== undefined) {
    const [folder] = await db.select().from(folders).where(and(eq(folders.id, input.folderId), eq(folders.userId, input.userId))).limit(1);
    if (!folder) return { ok: false, status: 404, error: "Destination folder not found" } satisfies DocumentCommandResult<never>;
  }

  const [note] = await db.update(notes)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.markdown !== undefined ? { content: input.markdown } : {}),
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
      ...(input.isAgentEditable !== undefined ? { isAgentEditable: input.isAgentEditable } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(notes.id, input.documentId), eq(notes.userId, input.userId)))
    .returning();

  if (!note) return { ok: false, status: 404, error: "Note not found" } satisfies DocumentCommandResult<never>;
  return { ok: true, value: { note, contentHash: hashMarkdown(note.content) } } satisfies DocumentCommandResult<{ note: typeof note; contentHash: string }>;
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
  });
}

export type { DocumentEdit };
