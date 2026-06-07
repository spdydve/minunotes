import { cleanupUnreferencedAttachments } from "./cleanup";

export async function handler() {
  const result = await cleanupUnreferencedAttachments();
  console.log("Attachment cleanup complete", {
    scanned: result.scanned,
    deleted: result.deleted,
    cutoff: result.cutoff.toISOString(),
  });
  return result;
}
