import { createHash, randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { attachments, notes } from "../db/schema";
import { auth } from "../lib/auth";
import { getAttachmentMarkdownUrl, getObjectStorage } from "../storage";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]);

export const attachmentRoutes = new Hono<{ Variables: Variables }>();

function getUser(c: Context<{ Variables: Variables }>) {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

function safeFilename(filename: string) {
  const cleaned = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "image";
}

function createAttachmentId() {
  return `att_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function hashBytes(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function storageKeyFor(input: { userId: string; noteId: string; attachmentId: string; filename: string }) {
  return `users/${input.userId}/notes/${input.noteId}/attachments/${input.attachmentId}-${input.filename}`;
}

function validateImageMetadata(file: { mimeType: string; size: number }) {
  if (!ALLOWED_IMAGE_TYPES.has(file.mimeType)) return "Unsupported image type";
  if (file.size > MAX_IMAGE_BYTES) return "Image is too large";
  if (file.size <= 0) return "Image is empty";
  return null;
}

attachmentRoutes.post("/notes/:noteId/image-uploads", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const [note] = await db.select().from(notes).where(and(eq(notes.id, c.req.param("noteId")), eq(notes.userId, user.id))).limit(1);
  if (!note) return c.json({ error: "Note not found" }, 404);

  const body = await c.req.json().catch(() => null) as { files?: Array<{ filename?: string; mimeType?: string; size?: number }> } | null;
  if (!body || !Array.isArray(body.files) || body.files.length === 0) return c.json({ error: "At least one file is required" }, 400);
  if (body.files.length > 10) return c.json({ error: "Too many files" }, 400);

  const storage = getObjectStorage();
  if (!storage.createSignedUploadUrl) return c.json({ error: "Signed uploads are not supported by the configured storage driver" }, 400);

  const uploads = [];
  for (const file of body.files) {
    const filename = safeFilename(file.filename || "image");
    const mimeType = file.mimeType ?? "";
    const size = typeof file.size === "number" ? file.size : 0;
    const validationError = validateImageMetadata({ mimeType, size });
    if (validationError) return c.json({ error: validationError }, validationError === "Image is too large" ? 413 : 400);

    const attachmentId = createAttachmentId();
    const storageKey = storageKeyFor({ userId: user.id, noteId: note.id, attachmentId, filename });
    const signedUrl = await storage.createSignedUploadUrl({ key: storageKey, contentType: mimeType, expiresInSeconds: 900 });

    const [attachment] = await db.insert(attachments).values({
      id: attachmentId,
      userId: user.id,
      noteId: note.id,
      folderId: note.folderId,
      provider: storage.provider,
      filename,
      mimeType,
      size,
      contentHash: "",
      storageKey,
      status: "pending",
    }).returning();

    const markdownUrl = getAttachmentMarkdownUrl(attachment.id);
    uploads.push({
      attachment,
      signedUrl,
      method: "PUT",
      headers: { "content-type": mimeType },
      markdownUrl,
      markdown: `![${filename}](${markdownUrl})`,
    });
  }

  return c.json({ uploads }, 201);
});

attachmentRoutes.post("/:attachmentId/complete", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const [attachment] = await db.select().from(attachments).where(and(eq(attachments.id, c.req.param("attachmentId")), eq(attachments.userId, user.id))).limit(1);
  if (!attachment) return c.json({ error: "Attachment not found" }, 404);

  const storage = getObjectStorage();
  if (storage.objectExists) {
    const exists = await storage.objectExists({ key: attachment.storageKey });
    if (!exists) return c.json({ error: "Attachment upload not found" }, 404);
  }

  const [updated] = await db.update(attachments).set({ status: "ready", updatedAt: new Date() }).where(and(eq(attachments.id, attachment.id), eq(attachments.userId, user.id))).returning();
  return c.json({ attachment: updated, markdownUrl: getAttachmentMarkdownUrl(updated.id), markdown: `![${updated.filename}](${getAttachmentMarkdownUrl(updated.id)})` });
});

attachmentRoutes.post("/notes/:noteId/images", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const [note] = await db.select().from(notes).where(and(eq(notes.id, c.req.param("noteId")), eq(notes.userId, user.id))).limit(1);
  if (!note) return c.json({ error: "Note not found" }, 404);

  const body = await c.req.parseBody().catch(() => null);
  const file = body?.image;
  if (!(file instanceof File)) return c.json({ error: "Image file is required" }, 400);
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return c.json({ error: "Unsupported image type" }, 400);
  if (file.size > MAX_IMAGE_BYTES) return c.json({ error: "Image is too large" }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const attachmentId = createAttachmentId();
  const filename = safeFilename(file.name || "image");
  const storageKey = storageKeyFor({ userId: user.id, noteId: note.id, attachmentId, filename });
  const storage = getObjectStorage();

  await storage.putObject({
    key: storageKey,
    body: bytes,
    contentType: file.type,
    metadata: { userId: user.id, noteId: note.id, attachmentId, filename },
  });

  const [attachment] = await db.insert(attachments).values({
    id: attachmentId,
    userId: user.id,
    noteId: note.id,
    folderId: note.folderId,
    provider: storage.provider,
    filename,
    mimeType: file.type,
    size: file.size,
    contentHash: hashBytes(bytes),
    storageKey,
    status: "ready",
  }).returning();

  return c.json({
    attachment,
    markdownUrl: getAttachmentMarkdownUrl(attachment.id),
    markdown: `![${filename}](${getAttachmentMarkdownUrl(attachment.id)})`,
  }, 201);
});

attachmentRoutes.get("/:attachmentId/content", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const [attachment] = await db.select().from(attachments).where(and(eq(attachments.id, c.req.param("attachmentId")), eq(attachments.userId, user.id))).limit(1);
  if (!attachment || attachment.deletedAt) return c.json({ error: "Attachment not found" }, 404);
  if (attachment.status !== "ready") return c.json({ error: "Attachment is not ready" }, 404);

  const object = await getObjectStorage().getObject({ key: attachment.storageKey });
  if (!object) return c.json({ error: "Attachment content not found" }, 404);

  const body = object.body.buffer.slice(object.body.byteOffset, object.body.byteOffset + object.body.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "content-type": object.contentType ?? attachment.mimeType,
      "content-length": String(object.body.byteLength),
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
});
