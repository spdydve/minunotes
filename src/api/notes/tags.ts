import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { noteTags, tags } from "../db/schema";
import { createId } from "../lib/id";

export type SerializedTag = { id: string; name: string; normalizedName: string; noteCount?: number };

export function normalizeTagName(name: string) {
  return name
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function cleanTagName(name: string) {
  return normalizeTagName(name);
}

export function normalizeTagInput(input: string[]) {
  const seen = new Set<string>();
  const values: Array<{ name: string; normalizedName: string }> = [];
  for (const raw of input) {
    const name = cleanTagName(raw);
    const normalizedName = normalizeTagName(raw);
    if (!name || !normalizedName || seen.has(normalizedName)) continue;
    seen.add(normalizedName);
    values.push({ name, normalizedName });
  }
  return values.slice(0, 50);
}

export async function listUserTags(input: { userId: string; noteIds?: string[] }) {
  if (input.noteIds && input.noteIds.length === 0) return [];
  const rows = await db.select({
    id: tags.id,
    name: tags.name,
    normalizedName: tags.normalizedName,
    noteCount: sql<number>`count(${noteTags.id})`,
  }).from(tags)
    .leftJoin(noteTags, eq(noteTags.tagId, tags.id))
    .where(input.noteIds ? and(eq(tags.userId, input.userId), inArray(noteTags.noteId, input.noteIds)) : eq(tags.userId, input.userId))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));
  return rows satisfies SerializedTag[];
}

export async function listNoteTags(input: { userId: string; noteId: string }) {
  return db.select({ id: tags.id, name: tags.name, normalizedName: tags.normalizedName })
    .from(noteTags)
    .innerJoin(tags, eq(noteTags.tagId, tags.id))
    .where(and(eq(noteTags.userId, input.userId), eq(noteTags.noteId, input.noteId)))
    .orderBy(asc(tags.name));
}

async function ensureTags(input: { userId: string; tags: Array<{ name: string; normalizedName: string }> }) {
  if (input.tags.length === 0) return [];

  const normalizedNames = input.tags.map((tag) => tag.normalizedName);
  const existing = await db.select().from(tags)
    .where(and(eq(tags.userId, input.userId), inArray(tags.normalizedName, normalizedNames)));
  const existingNames = new Set(existing.map((tag) => tag.normalizedName));
  const now = new Date();
  const missing = input.tags.filter((tag) => !existingNames.has(tag.normalizedName));

  if (missing.length > 0) {
    await db.insert(tags).values(missing.map((tag) => ({
      id: createId("tag"),
      userId: input.userId,
      name: tag.name,
      normalizedName: tag.normalizedName,
      createdAt: now,
      updatedAt: now,
    })));
  }

  return db.select().from(tags)
    .where(and(eq(tags.userId, input.userId), inArray(tags.normalizedName, normalizedNames)));
}

export async function setNoteTags(input: { userId: string; noteId: string; tags: string[] }) {
  const cleaned = normalizeTagInput(input.tags);
  const tagRows = await ensureTags({ userId: input.userId, tags: cleaned });

  const previous = await listNoteTags(input);
  await db.delete(noteTags).where(and(eq(noteTags.userId, input.userId), eq(noteTags.noteId, input.noteId)));

  if (tagRows.length > 0) {
    const now = new Date();
    await db.insert(noteTags).values(tagRows.map((tag) => ({
      id: createId("note_tag"),
      userId: input.userId,
      noteId: input.noteId,
      tagId: tag.id,
      createdAt: now,
    })));
  }

  const current = await listNoteTags(input);
  const currentIds = new Set(current.map((tag) => tag.id));
  const removedIds = previous.map((tag) => tag.id).filter((id) => !currentIds.has(id));
  if (removedIds.length > 0) {
    await db.delete(tags).where(and(
      eq(tags.userId, input.userId),
      inArray(tags.id, removedIds),
      sql`not exists (select 1 from ${noteTags} where ${noteTags.tagId} = ${tags.id})`,
    ));
  }
  return current;
}

export async function noteIdsForTag(input: { userId: string; tag: string }) {
  const normalizedName = normalizeTagName(input.tag);
  if (!normalizedName) return [];
  return db.select({ noteId: noteTags.noteId })
    .from(noteTags)
    .innerJoin(tags, eq(noteTags.tagId, tags.id))
    .where(and(eq(noteTags.userId, input.userId), eq(tags.normalizedName, normalizedName)));
}
