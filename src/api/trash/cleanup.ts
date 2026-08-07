import { and, asc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { db } from '../db/client';
import { folders, notes } from '../db/schema';
import { permanentlyDeleteTrashedFolder, permanentlyDeleteTrashedNote } from './operations';
import { getTrashAutoPurgeMode, getTrashPurgeLimit, type TrashAutoPurgeMode } from './retention';

export type TrashCleanupFailure = {
  kind: 'note' | 'folder';
  id: string;
  error: string;
};

export type TrashCleanupResult = {
  mode: TrashAutoPurgeMode;
  scanned: number;
  eligibleNotes: number;
  eligibleFolders: number;
  deletedNotes: number;
  deletedFolders: number;
  deletedAttachments: number;
  skipped: number;
  candidates: Array<{ kind: 'note' | 'folder'; id: string }>;
  failures: TrashCleanupFailure[];
  cutoff: Date;
};

export async function cleanupExpiredTrash(
  input: { mode?: TrashAutoPurgeMode; now?: Date; limit?: number } = {}
): Promise<TrashCleanupResult> {
  const mode = input.mode ?? getTrashAutoPurgeMode();
  const cutoff = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? getTrashPurgeLimit(), 500));
  const empty = {
    mode,
    scanned: 0,
    eligibleNotes: 0,
    eligibleFolders: 0,
    deletedNotes: 0,
    deletedFolders: 0,
    deletedAttachments: 0,
    skipped: 0,
    candidates: [],
    failures: [],
    cutoff,
  } satisfies TrashCleanupResult;
  if (mode === 'disabled') return empty;

  const noteCandidates = await db
    .select({ id: notes.id, userId: notes.userId })
    .from(notes)
    .where(
      and(
        isNotNull(notes.deletedAt),
        isNotNull(notes.purgeAfter),
        lte(notes.purgeAfter, cutoff),
        isNull(notes.trashBatchId)
      )
    )
    .orderBy(asc(notes.purgeAfter), asc(notes.id))
    .limit(limit);

  const remaining = limit - noteCandidates.length;
  const folderCandidates =
    remaining > 0
      ? await db
          .select({ id: folders.id, userId: folders.userId })
          .from(folders)
          .where(
            and(
              isNotNull(folders.deletedAt),
              isNotNull(folders.purgeAfter),
              lte(folders.purgeAfter, cutoff),
              eq(folders.trashBatchId, folders.id)
            )
          )
          .orderBy(asc(folders.purgeAfter), asc(folders.id))
          .limit(remaining)
      : [];

  const result: TrashCleanupResult = {
    ...empty,
    scanned: noteCandidates.length + folderCandidates.length,
    eligibleNotes: noteCandidates.length,
    eligibleFolders: folderCandidates.length,
    candidates: [
      ...noteCandidates.map((candidate) => ({ kind: 'note' as const, id: candidate.id })),
      ...folderCandidates.map((candidate) => ({ kind: 'folder' as const, id: candidate.id })),
    ],
  };
  if (mode === 'dry-run') return result;

  for (const candidate of noteCandidates) {
    try {
      const deleted = await permanentlyDeleteTrashedNote({
        userId: candidate.userId,
        noteId: candidate.id,
        purgeBefore: cutoff,
      });
      if (!deleted.ok) {
        result.skipped += 1;
        continue;
      }
      result.deletedNotes += 1;
      result.deletedAttachments += deleted.value.deletedAttachmentCount;
    } catch (error) {
      result.failures.push({
        kind: 'note',
        id: candidate.id,
        error: error instanceof Error ? error.message : 'Unknown purge failure',
      });
    }
  }

  for (const candidate of folderCandidates) {
    try {
      const deleted = await permanentlyDeleteTrashedFolder({
        userId: candidate.userId,
        folderId: candidate.id,
        purgeBefore: cutoff,
      });
      if (!deleted.ok) {
        result.skipped += 1;
        continue;
      }
      result.deletedFolders += deleted.value.deletedFolderCount;
      result.deletedNotes += deleted.value.deletedNoteCount;
      result.deletedAttachments += deleted.value.deletedAttachmentCount;
    } catch (error) {
      result.failures.push({
        kind: 'folder',
        id: candidate.id,
        error: error instanceof Error ? error.message : 'Unknown purge failure',
      });
    }
  }

  return result;
}
