import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { folders, notes } from "../db/schema";
import { hashMarkdown } from "./hash";

export type ActorType = "user" | "agent" | "system";

export type DocumentCommandResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 409; error: string; currentHash: string };

export async function readDocument(input: { documentId: string; userId: string }) {
  const [note] = await db.select().from(notes).where(and(eq(notes.id, input.documentId), eq(notes.userId, input.userId))).limit(1);
  if (!note) return { ok: false, status: 404, error: "Note not found" } satisfies DocumentCommandResult<never>;

  return {
    ok: true,
    value: { note, contentHash: hashMarkdown(note.content) },
  } satisfies DocumentCommandResult<{ note: typeof note; contentHash: string }>;
}

export async function updateDocument(input: {
  documentId: string;
  userId: string;
  title?: string;
  markdown?: string;
  folderId?: string;
  baseHash?: string;
  actorType?: ActorType;
  actorId?: string;
}) {
  const current = await readDocument({ documentId: input.documentId, userId: input.userId });
  if (!current.ok) return current;

  const currentHash = current.value.contentHash;
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
      updatedAt: new Date(),
    })
    .where(and(eq(notes.id, input.documentId), eq(notes.userId, input.userId)))
    .returning();

  if (!note) return { ok: false, status: 404, error: "Note not found" } satisfies DocumentCommandResult<never>;
  return { ok: true, value: { note, contentHash: hashMarkdown(note.content) } } satisfies DocumentCommandResult<{ note: typeof note; contentHash: string }>;
}
