import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { noteLinks, notes } from "../db/schema";
import { createId } from "../lib/id";

export type ParsedNoteLink = {
  targetTitle: string;
  targetNoteId: string | null;
  label: string | null;
  linkType: "wikilink" | "internal-url" | "markdown-internal-url";
  raw: string;
  from: number;
  to: number;
};

const WIKILINK_PATTERN = /\[\[([^\]\n]+)\]\]/g;
const NOTE_ID_PATTERN = /^note_[a-zA-Z0-9]+$/;
const MARKDOWN_INTERNAL_URL_PATTERN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+\/notes\/(note_[a-zA-Z0-9]+))\)/g;
const RAW_INTERNAL_URL_PATTERN = /(?<!\]\()https?:\/\/[^\s)]+\/notes\/(note_[a-zA-Z0-9]+)/g;

export function normalizeNoteTitle(title: string) {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseWikiLinks(markdown: string): ParsedNoteLink[] {
  const links: ParsedNoteLink[] = [];
  for (const match of markdown.matchAll(WIKILINK_PATTERN)) {
    const rawInner = match[1]?.trim();
    if (!rawInner) continue;

    const [rawTitle, ...labelParts] = rawInner.split("|");
    const targetTitle = rawTitle?.trim().replace(/\s+/g, " ") ?? "";
    if (!targetTitle) continue;

    const label = labelParts.length > 0 ? labelParts.join("|").trim() || null : null;
    links.push({
      targetTitle,
      targetNoteId: NOTE_ID_PATTERN.test(targetTitle) ? targetTitle : null,
      label,
      linkType: "wikilink",
      raw: match[0],
      from: match.index ?? 0,
      to: (match.index ?? 0) + match[0].length,
    });
  }
  return links;
}

export function parseInternalNoteUrls(markdown: string): ParsedNoteLink[] {
  const links: ParsedNoteLink[] = [];
  const markdownRanges: Array<{ from: number; to: number }> = [];

  for (const match of markdown.matchAll(MARKDOWN_INTERNAL_URL_PATTERN)) {
    const from = match.index ?? 0;
    const raw = match[0];
    markdownRanges.push({ from, to: from + raw.length });
    links.push({
      targetTitle: match[1]?.trim() || match[3],
      targetNoteId: match[3],
      label: match[1]?.trim() || null,
      linkType: "markdown-internal-url",
      raw,
      from,
      to: from + raw.length,
    });
  }

  for (const match of markdown.matchAll(RAW_INTERNAL_URL_PATTERN)) {
    const from = match.index ?? 0;
    const raw = match[0];
    const to = from + raw.length;
    if (markdownRanges.some((range) => from >= range.from && to <= range.to)) continue;
    links.push({
      targetTitle: match[1],
      targetNoteId: match[1],
      label: null,
      linkType: "internal-url",
      raw,
      from,
      to,
    });
  }

  return links;
}

export function parseNoteLinks(markdown: string): ParsedNoteLink[] {
  return [...parseWikiLinks(markdown), ...parseInternalNoteUrls(markdown)].sort((a, b) => a.from - b.from);
}

async function resolveUniqueTargetNote(input: { userId: string; sourceNoteId: string; targetTitle: string }) {
  const normalized = normalizeNoteTitle(input.targetTitle);
  const rows = await db.select({ id: notes.id }).from(notes)
    .where(and(eq(notes.userId, input.userId), sql`lower(${notes.title}) = ${normalized}`))
    .limit(2);
  const candidates = rows.filter((row) => row.id !== input.sourceNoteId);
  return candidates.length === 1 ? candidates[0].id : null;
}

async function resolveTargetNoteById(input: { userId: string; sourceNoteId: string; targetNoteId: string }) {
  if (input.targetNoteId === input.sourceNoteId) return null;
  const [target] = await db.select({ id: notes.id, title: notes.title }).from(notes)
    .where(and(eq(notes.id, input.targetNoteId), eq(notes.userId, input.userId)))
    .limit(1);
  return target ?? null;
}

export async function reindexNoteLinks(input: { userId: string; noteId: string; markdown: string }) {
  const parsed = parseNoteLinks(input.markdown);
  await db.delete(noteLinks).where(and(eq(noteLinks.userId, input.userId), eq(noteLinks.sourceNoteId, input.noteId)));
  if (parsed.length === 0) return { links: [] };

  const now = new Date();
  const values = [];
  for (const link of parsed) {
    const target = link.targetNoteId
      ? await resolveTargetNoteById({ userId: input.userId, sourceNoteId: input.noteId, targetNoteId: link.targetNoteId })
      : null;
    const targetNoteId = target?.id ?? (link.linkType === "wikilink" ? await resolveUniqueTargetNote({ userId: input.userId, sourceNoteId: input.noteId, targetTitle: link.targetTitle }) : null);
    values.push({
      id: createId("note_link"),
      userId: input.userId,
      sourceNoteId: input.noteId,
      targetNoteId,
      targetTitle: target?.title ?? link.targetTitle,
      label: link.label,
      linkType: link.linkType,
      createdAt: now,
      updatedAt: now,
    });
  }
  await db.insert(noteLinks).values(values);
  return { links: values };
}

export async function resolveUnresolvedNoteLinks(input: { userId: string; title: string; noteId: string }) {
  const normalized = normalizeNoteTitle(input.title);
  const candidates = await db.select({ id: notes.id }).from(notes)
    .where(and(eq(notes.userId, input.userId), sql`lower(${notes.title}) = ${normalized}`))
    .limit(2);
  if (candidates.length !== 1) return;

  await db.update(noteLinks)
    .set({ targetNoteId: input.noteId, updatedAt: new Date() })
    .where(and(eq(noteLinks.userId, input.userId), isNull(noteLinks.targetNoteId), sql`lower(${noteLinks.targetTitle}) = ${normalized}`));
}

export async function listBacklinks(input: { userId: string; noteId: string }) {
  const target = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.id, input.noteId), eq(notes.userId, input.userId))).limit(1);
  if (target.length === 0) return null;

  return db.select({
    id: noteLinks.id,
    sourceNoteId: noteLinks.sourceNoteId,
    sourceTitle: notes.title,
    sourceFolderId: notes.folderId,
    targetTitle: noteLinks.targetTitle,
    label: noteLinks.label,
    linkType: noteLinks.linkType,
    createdAt: noteLinks.createdAt,
    updatedAt: noteLinks.updatedAt,
  }).from(noteLinks)
    .innerJoin(notes, eq(noteLinks.sourceNoteId, notes.id))
    .where(and(eq(noteLinks.userId, input.userId), eq(noteLinks.targetNoteId, input.noteId)))
    .orderBy(notes.title);
}
