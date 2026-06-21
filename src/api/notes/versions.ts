import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { syncNoteAttachmentReferences } from "../attachments/references";
import { db } from "../db/client";
import { folders, noteEvents, noteVersions, notes, type Note, type NoteVersion } from "../db/schema";
import { hashMarkdown } from "../harness/hash";
import { createId } from "../lib/id";
import { reindexNoteLinks, resolveUnresolvedNoteLinks } from "./links";

export type NoteVersionReason = "create" | "autosave_checkpoint" | "before_agent_edit" | "before_restore" | "manual";
export type VersionActorType = "user" | "agent" | "system";

const MAX_VERSIONS_PER_NOTE = 100;
const USER_CHECKPOINT_INTERVAL_MS = 10 * 60 * 1000;

function versionState(note: Pick<Note, "title" | "content" | "folderId" | "createdAt" | "isApiEditable">) {
  return {
    title: note.title,
    content: note.content,
    folderId: note.folderId,
    createdAt: note.createdAt.toISOString(),
    isApiEditable: note.isApiEditable,
  };
}

function hashState(note: Pick<Note, "title" | "content" | "folderId" | "createdAt" | "isApiEditable">) {
  return createHash("sha256").update(JSON.stringify(versionState(note))).digest("hex");
}

async function latestVersion(input: { userId: string; noteId: string }) {
  const [version] = await db.select().from(noteVersions)
    .where(and(eq(noteVersions.userId, input.userId), eq(noteVersions.noteId, input.noteId)))
    .orderBy(desc(noteVersions.createdAt))
    .limit(1);
  return version ?? null;
}

async function pruneVersions(input: { userId: string; noteId: string; keep?: number }) {
  const excess = await db.select({ id: noteVersions.id }).from(noteVersions)
    .where(and(eq(noteVersions.userId, input.userId), eq(noteVersions.noteId, input.noteId)))
    .orderBy(desc(noteVersions.createdAt))
    .limit(10_000)
    .offset(input.keep ?? MAX_VERSIONS_PER_NOTE);
  if (excess.length === 0) return;
  await db.delete(noteVersions).where(inArray(noteVersions.id, excess.map((row) => row.id)));
}

export async function shouldCreateUserCheckpoint(input: { userId: string; noteId: string }) {
  const latest = await latestVersion(input);
  if (!latest) return true;
  return Date.now() - latest.createdAt.getTime() >= USER_CHECKPOINT_INTERVAL_MS;
}

export async function createNoteVersion(input: {
  note: Note;
  reason: NoteVersionReason;
  actorType: VersionActorType;
  actorId?: string | null;
}) {
  const stateHash = await hashState(input.note);
  const latest = await latestVersion({ userId: input.note.userId, noteId: input.note.id });
  if (latest?.stateHash === stateHash) return latest;

  const [version] = await db.insert(noteVersions).values({
    id: createId("note_version"),
    userId: input.note.userId,
    noteId: input.note.id,
    title: input.note.title,
    content: input.note.content,
    folderId: input.note.folderId,
    createdAtValue: input.note.createdAt,
    isApiEditable: input.note.isApiEditable,
    stateHash,
    reason: input.reason,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    createdAt: new Date(),
  }).returning();

  await pruneVersions({ userId: input.note.userId, noteId: input.note.id });
  return version;
}

export async function maybeCreateUserCheckpoint(input: { note: Note; actorId?: string | null }) {
  if (!(await shouldCreateUserCheckpoint({ userId: input.note.userId, noteId: input.note.id }))) return null;
  return createNoteVersion({ note: input.note, reason: "autosave_checkpoint", actorType: "user", actorId: input.actorId });
}

export async function listNoteVersions(input: { userId: string; noteId: string; limit?: number }) {
  const [note] = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.id, input.noteId), eq(notes.userId, input.userId))).limit(1);
  if (!note) return null;

  return db.select({
    id: noteVersions.id,
    noteId: noteVersions.noteId,
    title: noteVersions.title,
    reason: noteVersions.reason,
    actorType: noteVersions.actorType,
    actorId: noteVersions.actorId,
    stateHash: noteVersions.stateHash,
    createdAt: noteVersions.createdAt,
  }).from(noteVersions)
    .where(and(eq(noteVersions.userId, input.userId), eq(noteVersions.noteId, input.noteId)))
    .orderBy(desc(noteVersions.createdAt))
    .limit(input.limit ?? 100);
}

export async function getNoteVersion(input: { userId: string; noteId: string; versionId: string }) {
  const [version] = await db.select().from(noteVersions)
    .where(and(eq(noteVersions.id, input.versionId), eq(noteVersions.noteId, input.noteId), eq(noteVersions.userId, input.userId)))
    .limit(1);
  return version ?? null;
}

export async function restoreNoteVersion(input: { userId: string; noteId: string; versionId: string; actorType: VersionActorType; actorId?: string | null }) {
  const [current] = await db.select().from(notes).where(and(eq(notes.id, input.noteId), eq(notes.userId, input.userId))).limit(1);
  if (!current) return { ok: false, status: 404, error: "Note not found" } as const;

  const version = await getNoteVersion(input);
  if (!version) return { ok: false, status: 404, error: "Version not found" } as const;

  const [folder] = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.id, version.folderId), eq(folders.userId, input.userId))).limit(1);
  if (!folder) return { ok: false, status: 404, error: "Version folder no longer exists" } as const;

  await createNoteVersion({ note: current, reason: "before_restore", actorType: input.actorType, actorId: input.actorId });

  const now = new Date();
  const [note] = await db.update(notes).set({
    title: version.title,
    content: version.content,
    folderId: version.folderId,
    createdAt: version.createdAtValue,
    isApiEditable: version.isApiEditable,
    updatedByActorType: input.actorType,
    updatedByActorId: input.actorId ?? null,
    updatedAt: now,
  }).where(and(eq(notes.id, input.noteId), eq(notes.userId, input.userId))).returning();

  if (!note) return { ok: false, status: 404, error: "Note not found" } as const;

  if (current.content !== note.content) {
    await syncNoteAttachmentReferences({ noteId: note.id, userId: note.userId, markdown: note.content });
    await reindexNoteLinks({ noteId: note.id, userId: note.userId, markdown: note.content });
  }
  if (current.title !== note.title) await resolveUnresolvedNoteLinks({ noteId: note.id, userId: note.userId, title: note.title });

  const beforeHash = hashMarkdown(current.content);
  const afterHash = hashMarkdown(note.content);
  await db.insert(noteEvents).values({
    id: createId("note_event"),
    noteId: note.id,
    userId: note.userId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    eventType: "restore",
    summary: "Restored note version",
    beforeHash,
    afterHash,
    createdAt: now,
  });

  return { ok: true, value: { note, contentHash: afterHash, version: serializeVersion(version) } } as const;
}

export function serializeVersion(version: NoteVersion) {
  return {
    id: version.id,
    noteId: version.noteId,
    title: version.title,
    content: version.content,
    folderId: version.folderId,
    createdAtValue: version.createdAtValue,
    isApiEditable: version.isApiEditable,
    stateHash: version.stateHash,
    reason: version.reason,
    actorType: version.actorType,
    actorId: version.actorId,
    createdAt: version.createdAt,
  };
}
