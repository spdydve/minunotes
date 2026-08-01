import { and, asc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../db/client';
import { folderShareLinks, folders, noteShareLinks, notes } from '../db/schema';
import { hashShareToken } from '../lib/share-tokens';

const NOTE_ID_PATTERN = /^note_[a-zA-Z0-9]+$/;
const MAX_TARGET_LENGTH = 256;
const MAX_TARGETS = 500;

export type WikilinkResolution = {
  target: string;
  shareToken: string | null;
};

export type ResolverShareContext =
  | { kind: 'note'; noteId: string; userId: string; token: string }
  | { kind: 'folder'; folderId: string; userId: string; token: string };

export type TargetCandidate = {
  noteId: string;
  folderId: string;
};

export class ResolverError extends Error {
  constructor(
    public code: 'invalid_token' | 'too_many_targets' | 'target_too_long' | 'invalid_targets',
    message: string
  ) {
    super(message);
    this.name = 'ResolverError';
  }
}

export async function resolveShareContext(token: string): Promise<ResolverShareContext | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const tokenHash = hashShareToken(trimmed);
  const now = new Date();
  const activeShareFilter = and(
    isNull(noteShareLinks.revokedAt),
    or(isNull(noteShareLinks.expiresAt), gt(noteShareLinks.expiresAt, now))
  );

  const [noteShare] = await db
    .select({ noteId: noteShareLinks.noteId, userId: noteShareLinks.userId })
    .from(noteShareLinks)
    .where(and(eq(noteShareLinks.tokenHash, tokenHash), activeShareFilter))
    .limit(1);

  if (noteShare) {
    return { kind: 'note', noteId: noteShare.noteId, userId: noteShare.userId, token: trimmed };
  }

  const [folderShare] = await db
    .select({ folderId: folderShareLinks.folderId, userId: folderShareLinks.userId })
    .from(folderShareLinks)
    .where(
      and(
        eq(folderShareLinks.tokenHash, tokenHash),
        isNull(folderShareLinks.revokedAt),
        or(isNull(folderShareLinks.expiresAt), gt(folderShareLinks.expiresAt, now))
      )
    )
    .limit(1);

  if (folderShare) {
    return { kind: 'folder', folderId: folderShare.folderId, userId: folderShare.userId, token: trimmed };
  }

  return null;
}

async function getFolderIdsForUser(userId: string, rootFolderId: string): Promise<Set<string>> {
  const userFolders = await db
    .select({ id: folders.id, parentFolderId: folders.parentFolderId })
    .from(folders)
    .where(eq(folders.userId, userId));

  const ids = new Set([rootFolderId]);
  let added = true;
  while (added) {
    added = false;
    for (const folder of userFolders) {
      if (folder.parentFolderId && ids.has(folder.parentFolderId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        added = true;
      }
    }
  }
  return ids;
}

export async function lookupTargetNotes(userId: string, targets: string[]): Promise<Map<string, TargetCandidate>> {
  const result = new Map<string, TargetCandidate>();
  if (targets.length === 0) return result;

  const idTargets = targets.filter((t) => NOTE_ID_PATTERN.test(t));
  const titleTargets = targets.filter((t) => !NOTE_ID_PATTERN.test(t));

  if (idTargets.length > 0) {
    const rows = await db
      .select({ id: notes.id, folderId: notes.folderId })
      .from(notes)
      .where(and(eq(notes.userId, userId), inArray(notes.id, idTargets)));
    for (const row of rows) {
      result.set(row.id, { noteId: row.id, folderId: row.folderId });
    }
  }

  if (titleTargets.length > 0) {
    const rows = await db
      .select({ id: notes.id, folderId: notes.folderId, title: notes.title })
      .from(notes)
      .where(and(eq(notes.userId, userId), inArray(notes.title, titleTargets)))
      .orderBy(asc(notes.id));
    const byTitle = new Map<string, TargetCandidate[]>();
    for (const row of rows) {
      const list = byTitle.get(row.title) ?? [];
      list.push({ noteId: row.id, folderId: row.folderId });
      byTitle.set(row.title, list);
    }
    for (const [title, list] of byTitle) {
      if (list.length === 1) {
        result.set(title, list[0]);
      }
    }
  }

  return result;
}

async function findActiveNoteShareToken(userId: string, noteId: string): Promise<string | null> {
  const now = new Date();
  const [row] = await db
    .select({ token: noteShareLinks.token })
    .from(noteShareLinks)
    .where(
      and(
        eq(noteShareLinks.userId, userId),
        eq(noteShareLinks.noteId, noteId),
        isNull(noteShareLinks.revokedAt),
        or(isNull(noteShareLinks.expiresAt), gt(noteShareLinks.expiresAt, now))
      )
    )
    .limit(1);
  return row?.token ?? null;
}

async function findActiveFolderShareTokenForFolder(userId: string, folderId: string): Promise<string | null> {
  const now = new Date();
  const [row] = await db
    .select({ token: folderShareLinks.token })
    .from(folderShareLinks)
    .where(
      and(
        eq(folderShareLinks.userId, userId),
        eq(folderShareLinks.folderId, folderId),
        isNull(folderShareLinks.revokedAt),
        or(isNull(folderShareLinks.expiresAt), gt(folderShareLinks.expiresAt, now))
      )
    )
    .limit(1);
  return row?.token ?? null;
}

export async function checkReachability(
  context: ResolverShareContext,
  candidate: TargetCandidate,
  currentNoteFolderId?: string
): Promise<string | null> {
  if (context.kind === 'note') {
    if (candidate.noteId === context.noteId) {
      return context.token;
    }
    if (currentNoteFolderId && candidate.folderId) {
      const folderIds = await getFolderIdsForUser(context.userId, currentNoteFolderId);
      if (folderIds.has(candidate.folderId)) {
        const folderToken = await findActiveFolderShareTokenForFolder(context.userId, currentNoteFolderId);
        if (folderToken) return folderToken;
      }
    }
    return findActiveNoteShareToken(context.userId, candidate.noteId);
  }

  const folderIds = await getFolderIdsForUser(context.userId, context.folderId);
  if (folderIds.has(candidate.folderId)) {
    return context.token;
  }
  return findActiveNoteShareToken(context.userId, candidate.noteId);
}

export type ResolveOptions = {
  maxTargets?: number;
  maxTargetLength?: number;
};

export async function resolveWikilinks(
  token: string,
  targets: string[],
  options: ResolveOptions = {}
): Promise<WikilinkResolution[]> {
  const maxTargets = options.maxTargets ?? MAX_TARGETS;
  const maxTargetLength = options.maxTargetLength ?? MAX_TARGET_LENGTH;

  if (typeof token !== 'string' || !token.trim()) {
    throw new ResolverError('invalid_token', 'Token is required');
  }
  if (!Array.isArray(targets)) {
    throw new ResolverError('invalid_targets', 'Targets must be an array');
  }
  if (targets.length > maxTargets) {
    throw new ResolverError('too_many_targets', `Maximum ${maxTargets} targets allowed`);
  }
  for (const target of targets) {
    if (typeof target !== 'string') {
      throw new ResolverError('invalid_targets', 'Each target must be a string');
    }
    if (target.length > maxTargetLength) {
      throw new ResolverError('target_too_long', `Target exceeds ${maxTargetLength} characters`);
    }
  }

  const context = await resolveShareContext(token);
  if (!context) {
    return targets.map((target) => ({ target, shareToken: null }));
  }

  const candidates = await lookupTargetNotes(context.userId, targets);
  let currentNoteFolderId: string | undefined;
  if (context.kind === 'note') {
    const [row] = await db
      .select({ folderId: notes.folderId })
      .from(notes)
      .where(eq(notes.id, context.noteId))
      .limit(1);
    currentNoteFolderId = row?.folderId ?? undefined;
  }
  const resolutions: WikilinkResolution[] = [];
  for (const target of targets) {
    const candidate = candidates.get(target);
    if (!candidate) {
      resolutions.push({ target, shareToken: null });
      continue;
    }
    const shareToken = await checkReachability(context, candidate, currentNoteFolderId);
    resolutions.push({ target, shareToken });
  }
  return resolutions;
}
