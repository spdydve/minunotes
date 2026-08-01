import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '../db/client';
import { folderShareLinks, noteShareLinks, notes } from '../db/schema';
import { sharedLinkCache } from './cache';

async function activeNoteShareTokensForNote(noteId: string): Promise<string[]> {
  const rows = await db
    .select({ token: noteShareLinks.token })
    .from(noteShareLinks)
    .where(and(eq(noteShareLinks.noteId, noteId), isNotNull(noteShareLinks.token), isNull(noteShareLinks.revokedAt)));
  return rows.map((row) => row.token).filter((token): token is string => Boolean(token));
}

async function activeNoteShareTokensForFolder(folderId: string): Promise<string[]> {
  const rows = await db
    .select({ token: noteShareLinks.token })
    .from(noteShareLinks)
    .innerJoin(notes, eq(notes.id, noteShareLinks.noteId))
    .where(and(eq(notes.folderId, folderId), isNotNull(noteShareLinks.token), isNull(noteShareLinks.revokedAt)));
  return rows.map((row) => row.token).filter((token): token is string => Boolean(token));
}

async function activeFolderShareTokensForFolder(folderId: string): Promise<string[]> {
  const now = new Date();
  const rows = await db
    .select({ token: folderShareLinks.token })
    .from(folderShareLinks)
    .where(
      and(
        eq(folderShareLinks.folderId, folderId),
        isNotNull(folderShareLinks.token),
        isNull(folderShareLinks.revokedAt),
        or(isNull(folderShareLinks.expiresAt), eq(folderShareLinks.expiresAt, now))
      )
    );
  return rows.map((row) => row.token).filter((token): token is string => Boolean(token));
}

export function invalidateCacheForShareToken(token: string): number {
  return sharedLinkCache.invalidateByToken(token);
}

export async function invalidateCacheForNote(noteId: string, folderId?: string): Promise<number> {
  let count = 0;
  const noteTokens = await activeNoteShareTokensForNote(noteId);
  for (const token of noteTokens) {
    count += sharedLinkCache.invalidateByToken(token);
  }
  if (folderId) {
    const folderTokens = await activeFolderShareTokensForFolder(folderId);
    for (const token of folderTokens) {
      count += sharedLinkCache.invalidateByToken(token);
    }
  }
  return count;
}

export async function invalidateCacheForFolder(folderId: string): Promise<number> {
  let count = 0;
  const folderTokens = await activeFolderShareTokensForFolder(folderId);
  for (const token of folderTokens) {
    count += sharedLinkCache.invalidateByToken(token);
  }
  const noteTokens = await activeNoteShareTokensForFolder(folderId);
  for (const token of noteTokens) {
    count += sharedLinkCache.invalidateByToken(token);
  }
  return count;
}
