import { and, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { attachments } from '../db/schema';
import { getObjectStorage } from '../storage';

export const DEFAULT_ATTACHMENT_CLEANUP_GRACE_DAYS = 30;

export function getAttachmentCleanupGraceDays() {
  const value = Number.parseInt(process.env.ATTACHMENT_CLEANUP_GRACE_DAYS ?? '', 10);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_ATTACHMENT_CLEANUP_GRACE_DAYS;
}

export function getAttachmentCleanupCutoff(graceDays = getAttachmentCleanupGraceDays(), now = new Date()) {
  return new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);
}

export async function cleanupUnreferencedAttachments(input: { cutoff?: Date; limit?: number } = {}) {
  const cutoff = input.cutoff ?? getAttachmentCleanupCutoff();
  const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
  const storage = getObjectStorage();
  const candidates = await db
    .select()
    .from(attachments)
    .where(
      and(isNotNull(attachments.unreferencedAt), isNull(attachments.deletedAt), lt(attachments.unreferencedAt, cutoff))
    )
    .limit(limit);

  let deleted = 0;
  for (const attachment of candidates) {
    await storage.deleteObject({ key: attachment.storageKey });
    await db
      .update(attachments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(attachments.id, attachment.id), isNull(attachments.deletedAt), lt(attachments.unreferencedAt, cutoff))
      );
    deleted += 1;
  }

  return { scanned: candidates.length, deleted, cutoff };
}
