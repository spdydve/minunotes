import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { NOTE_ID_PATTERN, normalizeWikilinkTitle, parseWikilinks } from '../../shared/wikilinks';
import { db } from '../db/client';
import { folders, noteShareLinks, notes } from '../db/schema';
import { activeNoteWhere, filterActiveFolderHierarchy } from '../trash/policy';

const DEFAULT_MAX_WIKILINKS = 100;

export type SharedWikilinkResolution = {
  target: string;
  href: string | null;
};

type SharedSourceNote = {
  id: string;
  userId: string;
  title: string;
  content: string;
  documentType: string;
};

export type SharedWikilinkContext =
  | { kind: 'note'; token: string; source: SharedSourceNote }
  | { kind: 'folder'; token: string; folderId: string; source: SharedSourceNote };

type CandidateNote = {
  id: string;
  folderId: string;
  title: string;
};

type ActiveNoteShare = {
  noteId: string;
  token: string;
};

type FolderRow = {
  id: string;
  parentFolderId: string | null;
};

export type SharedWikilinkRepository = {
  findCandidateNotes(userId: string, idTargets: string[], titleTargets: string[]): Promise<CandidateNote[]>;
  findActiveNoteShares(userId: string, noteIds: string[]): Promise<ActiveNoteShare[]>;
  listFolders(userId: string): Promise<FolderRow[]>;
};

export const databaseSharedWikilinkRepository: SharedWikilinkRepository = {
  async findCandidateNotes(userId, idTargets, titleTargets) {
    if (idTargets.length === 0 && titleTargets.length === 0) return [];

    const idFilter = idTargets.length > 0 ? inArray(notes.id, idTargets) : undefined;
    const normalizedTitleTargets = titleTargets.map((target) => target.trim().toLowerCase());
    const titleFilter =
      normalizedTitleTargets.length > 0
        ? inArray(sql<string>`lower(trim(${notes.title}))`, normalizedTitleTargets)
        : undefined;
    const targetFilter = idFilter && titleFilter ? or(idFilter, titleFilter) : (idFilter ?? titleFilter);
    if (!targetFilter) return [];

    return db
      .select({ id: notes.id, folderId: notes.folderId, title: notes.title })
      .from(notes)
      .where(activeNoteWhere(userId, eq(notes.type, 'note'), targetFilter))
      .orderBy(asc(notes.id));
  },

  async findActiveNoteShares(userId, noteIds) {
    if (noteIds.length === 0) return [];
    const now = new Date();
    const rows = await db
      .select({ noteId: noteShareLinks.noteId, token: noteShareLinks.token })
      .from(noteShareLinks)
      .where(
        and(
          eq(noteShareLinks.userId, userId),
          inArray(noteShareLinks.noteId, noteIds),
          isNotNull(noteShareLinks.token),
          isNull(noteShareLinks.revokedAt),
          or(isNull(noteShareLinks.expiresAt), gt(noteShareLinks.expiresAt, now))
        )
      )
      .orderBy(desc(noteShareLinks.updatedAt), asc(noteShareLinks.id));
    return rows.flatMap((row) => (row.token ? [{ noteId: row.noteId, token: row.token }] : []));
  },

  async listFolders(userId) {
    const rows = await db
      .select({ id: folders.id, parentFolderId: folders.parentFolderId })
      .from(folders)
      .where(and(eq(folders.userId, userId), isNull(folders.deletedAt)));
    return filterActiveFolderHierarchy(rows);
  },
};

function publicNoteHref(token: string): string {
  return `/share/${encodeURIComponent(token)}`;
}

function publicFolderNoteHref(token: string, noteId: string): string {
  const search = new URLSearchParams({ note: noteId });
  return `/share/folders/${encodeURIComponent(token)}?${search.toString()}`;
}

function collectFolderTreeIds(rootFolderId: string, rows: FolderRow[]): Set<string> {
  const ids = new Set([rootFolderId]);
  let added = true;
  while (added) {
    added = false;
    for (const row of rows) {
      if (row.parentFolderId && ids.has(row.parentFolderId) && !ids.has(row.id)) {
        ids.add(row.id);
        added = true;
      }
    }
  }
  return ids;
}

function authoredTargets(source: SharedSourceNote, maxWikilinks: number): string[] {
  if (source.documentType !== 'markdown') return [];
  const unique = new Set<string>();
  for (const link of parseWikilinks(source.content)) {
    unique.add(link.target);
    if (unique.size >= maxWikilinks) break;
  }
  return [...unique];
}

export async function resolveSourceWikilinks(
  context: SharedWikilinkContext,
  options: { repository?: SharedWikilinkRepository; maxWikilinks?: number } = {}
): Promise<SharedWikilinkResolution[]> {
  const repository = options.repository ?? databaseSharedWikilinkRepository;
  const maxWikilinks = options.maxWikilinks ?? DEFAULT_MAX_WIKILINKS;
  const targets = authoredTargets(context.source, maxWikilinks);
  if (targets.length === 0) return [];

  const idTargets = targets.filter((target) => NOTE_ID_PATTERN.test(target));
  const titleTargets = targets.filter((target) => !NOTE_ID_PATTERN.test(target));
  const candidates = await repository.findCandidateNotes(context.source.userId, idTargets, titleTargets);

  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const candidatesByTitle = new Map<string, CandidateNote[]>();
  for (const candidate of candidates) {
    const key = normalizeWikilinkTitle(candidate.title);
    const rows = candidatesByTitle.get(key) ?? [];
    rows.push(candidate);
    candidatesByTitle.set(key, rows);
  }

  const candidateForTarget = new Map<string, CandidateNote>();
  for (const target of targets) {
    const candidate = NOTE_ID_PATTERN.test(target)
      ? candidatesById.get(target)
      : (() => {
          const matches = candidatesByTitle.get(normalizeWikilinkTitle(target)) ?? [];
          return matches.length === 1 ? matches[0] : undefined;
        })();
    if (candidate) candidateForTarget.set(target, candidate);
  }

  const candidateIds = [...new Set([...candidateForTarget.values()].map((candidate) => candidate.id))];
  const [activeShares, folderRows] = await Promise.all([
    repository.findActiveNoteShares(context.source.userId, candidateIds),
    context.kind === 'folder' ? repository.listFolders(context.source.userId) : Promise.resolve([]),
  ]);
  const activeShareByNoteId = new Map<string, string>();
  for (const share of activeShares) {
    if (!activeShareByNoteId.has(share.noteId)) activeShareByNoteId.set(share.noteId, share.token);
  }
  const sharedFolderIds = context.kind === 'folder' ? collectFolderTreeIds(context.folderId, folderRows) : null;

  return targets.map((target) => {
    const candidate = candidateForTarget.get(target);
    if (!candidate) return { target, href: null };

    if (context.kind === 'note' && candidate.id === context.source.id) {
      return { target, href: publicNoteHref(context.token) };
    }
    if (context.kind === 'folder' && sharedFolderIds?.has(candidate.folderId)) {
      return { target, href: publicFolderNoteHref(context.token, candidate.id) };
    }

    const noteShareToken = activeShareByNoteId.get(candidate.id);
    return { target, href: noteShareToken ? publicNoteHref(noteShareToken) : null };
  });
}
