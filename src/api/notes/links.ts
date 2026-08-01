import { and, eq, isNull, sql } from 'drizzle-orm';
import { getMinuNotesNodeLink } from '../../shared/canvas-links';
import { NOTE_ID_PATTERN, normalizeWikilinkTitle, parseWikilinks } from '../../shared/wikilinks';
import { db } from '../db/client';
import { noteLinks, notes } from '../db/schema';
import { createId } from '../lib/id';

export type ParsedNoteLink = {
  targetTitle: string;
  targetNoteId: string | null;
  label: string | null;
  linkType: 'wikilink' | 'internal-url' | 'markdown-internal-url' | 'canvas-note';
  raw: string;
  from: number;
  to: number;
};

const NOTE_URL_PATTERN = String.raw`(?:https?:\/\/)?[^\s)]+\/notes\/(note_[a-zA-Z0-9]+)|\/notes\/(note_[a-zA-Z0-9]+)`;
const MARKDOWN_INTERNAL_URL_PATTERN = new RegExp(String.raw`\[([^\]\n]+)\]\((${NOTE_URL_PATTERN})\)`, 'g');
const RAW_INTERNAL_URL_PATTERN = new RegExp(String.raw`(?<!\]\()(?:${NOTE_URL_PATTERN})`, 'g');

export function normalizeNoteTitle(title: string) {
  return normalizeWikilinkTitle(title);
}

export function parseWikiLinks(markdown: string): ParsedNoteLink[] {
  return parseWikilinks(markdown).map((link) => ({
    targetTitle: link.target,
    targetNoteId: NOTE_ID_PATTERN.test(link.target) ? link.target : null,
    label: link.label,
    linkType: 'wikilink',
    raw: link.raw,
    from: link.from,
    to: link.to,
  }));
}

export function parseInternalNoteUrls(markdown: string): ParsedNoteLink[] {
  const links: ParsedNoteLink[] = [];
  const markdownRanges: Array<{ from: number; to: number }> = [];

  for (const match of markdown.matchAll(MARKDOWN_INTERNAL_URL_PATTERN)) {
    const from = match.index ?? 0;
    const raw = match[0];
    const targetNoteId = match[3] ?? match[4];
    markdownRanges.push({ from, to: from + raw.length });
    links.push({
      targetTitle: match[1]?.trim() || targetNoteId,
      targetNoteId,
      label: match[1]?.trim() || null,
      linkType: 'markdown-internal-url',
      raw,
      from,
      to: from + raw.length,
    });
  }

  for (const match of markdown.matchAll(RAW_INTERNAL_URL_PATTERN)) {
    const from = match.index ?? 0;
    const raw = match[0];
    const to = from + raw.length;
    const targetNoteId = match[1] ?? match[2];
    if (markdownRanges.some((range) => from >= range.from && to <= range.to)) continue;
    links.push({
      targetTitle: targetNoteId,
      targetNoteId,
      label: null,
      linkType: 'internal-url',
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

export function parseCanvasNoteLinks(content: string): ParsedNoteLink[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { nodes?: unknown }).nodes)) return [];

  const links: ParsedNoteLink[] = [];
  for (const [index, node] of (parsed as { nodes: unknown[] }).nodes.entries()) {
    const link = getMinuNotesNodeLink(node);
    if (!link) continue;
    const nodeValue = node as { text?: unknown; label?: unknown };
    const text = typeof nodeValue.text === 'string' ? nodeValue.text.trim() : '';
    const label = typeof nodeValue.label === 'string' ? nodeValue.label.trim() : '';
    links.push({
      targetTitle: link.id,
      targetNoteId: link.id,
      label: text || label || null,
      linkType: 'canvas-note',
      raw: link.id,
      from: index,
      to: index,
    });
  }
  return links;
}

async function resolveUniqueTargetNote(input: { userId: string; sourceNoteId: string; targetTitle: string }) {
  const normalized = normalizeNoteTitle(input.targetTitle);
  const rows = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.userId, input.userId), sql`lower(${notes.title}) = ${normalized}`))
    .limit(2);
  const candidates = rows.filter((row) => row.id !== input.sourceNoteId);
  return candidates.length === 1 ? candidates[0].id : null;
}

async function resolveTargetNoteById(input: { userId: string; sourceNoteId: string; targetNoteId: string }) {
  if (input.targetNoteId === input.sourceNoteId) return null;
  const [target] = await db
    .select({ id: notes.id, title: notes.title })
    .from(notes)
    .where(and(eq(notes.id, input.targetNoteId), eq(notes.userId, input.userId)))
    .limit(1);
  return target ?? null;
}

export async function reindexNoteLinks(input: {
  userId: string;
  noteId: string;
  markdown: string;
  documentType?: string;
}) {
  const parsed = input.documentType?.startsWith('canvas.')
    ? parseCanvasNoteLinks(input.markdown)
    : parseNoteLinks(input.markdown);
  await db.delete(noteLinks).where(and(eq(noteLinks.userId, input.userId), eq(noteLinks.sourceNoteId, input.noteId)));
  if (parsed.length === 0) return { links: [] };

  const now = new Date();
  const values = [];
  for (const link of parsed) {
    const target = link.targetNoteId
      ? await resolveTargetNoteById({
          userId: input.userId,
          sourceNoteId: input.noteId,
          targetNoteId: link.targetNoteId,
        })
      : null;
    const targetNoteId =
      target?.id ??
      (link.linkType === 'wikilink'
        ? await resolveUniqueTargetNote({
            userId: input.userId,
            sourceNoteId: input.noteId,
            targetTitle: link.targetTitle,
          })
        : null);
    values.push({
      id: createId('note_link'),
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
  const candidates = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.userId, input.userId), sql`lower(${notes.title}) = ${normalized}`))
    .limit(2);
  if (candidates.length !== 1) return;

  await db
    .update(noteLinks)
    .set({ targetNoteId: input.noteId, updatedAt: new Date() })
    .where(
      and(
        eq(noteLinks.userId, input.userId),
        isNull(noteLinks.targetNoteId),
        sql`lower(${noteLinks.targetTitle}) = ${normalized}`
      )
    );
}

export async function listOutgoingLinks(input: { userId: string; noteId: string }) {
  const source = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, input.noteId), eq(notes.userId, input.userId)))
    .limit(1);
  if (source.length === 0) return null;

  return db
    .select({
      id: noteLinks.id,
      sourceNoteId: noteLinks.sourceNoteId,
      targetNoteId: noteLinks.targetNoteId,
      targetTitle: noteLinks.targetTitle,
      label: noteLinks.label,
      linkType: noteLinks.linkType,
      createdAt: noteLinks.createdAt,
      updatedAt: noteLinks.updatedAt,
    })
    .from(noteLinks)
    .where(and(eq(noteLinks.userId, input.userId), eq(noteLinks.sourceNoteId, input.noteId)))
    .orderBy(noteLinks.targetTitle);
}

export async function listOrphanNotes(input: { userId: string }) {
  return db
    .select({
      id: notes.id,
      folderId: notes.folderId,
      title: notes.title,
      type: notes.type,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(
      and(
        eq(notes.userId, input.userId),
        eq(notes.type, 'note'),
        sql`not exists (select 1 from ${noteLinks} where ${noteLinks.targetNoteId} = ${notes.id} and ${noteLinks.userId} = ${input.userId})`
      )
    )
    .orderBy(notes.title);
}

export async function listBacklinks(input: { userId: string; noteId: string }) {
  const target = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, input.noteId), eq(notes.userId, input.userId)))
    .limit(1);
  if (target.length === 0) return null;

  return db
    .select({
      id: noteLinks.id,
      sourceNoteId: noteLinks.sourceNoteId,
      sourceTitle: notes.title,
      sourceFolderId: notes.folderId,
      targetTitle: noteLinks.targetTitle,
      label: noteLinks.label,
      linkType: noteLinks.linkType,
      createdAt: noteLinks.createdAt,
      updatedAt: noteLinks.updatedAt,
    })
    .from(noteLinks)
    .innerJoin(notes, eq(noteLinks.sourceNoteId, notes.id))
    .where(and(eq(noteLinks.userId, input.userId), eq(noteLinks.targetNoteId, input.noteId)))
    .orderBy(notes.title);
}
