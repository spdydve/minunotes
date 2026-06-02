import { cleanupUnreferencedAttachments } from "../src/api/attachments/cleanup";

const result = await cleanupUnreferencedAttachments();
console.log(`Attachment cleanup scanned ${result.scanned} attachment(s), deleted ${result.deleted}. Cutoff: ${result.cutoff.toISOString()}`);
