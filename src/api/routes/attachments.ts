import { createHash, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, validateImageBytes } from '../attachments/image-validation';
import { db } from '../db/client';
import { attachments, notes } from '../db/schema';
import type { auth } from '../lib/auth';
import { collaborationRoleAllows, resolveNoteCollaborationAccess } from '../lib/collaboration-access';
import { omitCollaborationInternalFields } from '../lib/collaboration-serialization';
import { getAttachmentMarkdownUrl, getObjectStorage } from '../storage';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const SIGNED_UPLOAD_EXPIRY_SECONDS = 300;

export const attachmentRoutes = new Hono<{ Variables: Variables }>();

function getUser(c: Context<{ Variables: Variables }>) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

function safeFilename(filename: string) {
  const cleaned = filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'image';
}

function createAttachmentId() {
  return `att_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function hashBytes(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function storageKeyFor(input: { userId: string; noteId: string; attachmentId: string; filename: string }) {
  return `users/${input.userId}/notes/${input.noteId}/attachments/${input.attachmentId}-${input.filename}`;
}

function serializeAttachment<T extends object>(attachment: T, source: 'owner' | 'note_grant' | 'folder_grant') {
  const safe = omitCollaborationInternalFields(attachment);
  return source === 'note_grant' ? { ...safe, folderId: null } : safe;
}

function validateImageMetadata(file: { mimeType: string; size: number }) {
  if (!ALLOWED_IMAGE_TYPES.has(file.mimeType)) return 'Unsupported image type';
  if (file.size > MAX_IMAGE_BYTES) return 'Image is too large';
  if (file.size <= 0) return 'Image is empty';
  return null;
}

attachmentRoutes.post('/notes/:noteId/image-uploads', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const access = await resolveNoteCollaborationAccess({ actorUserId: user.id, noteId: c.req.param('noteId') });
  if (!access) return c.json({ error: 'Note not found' }, 404);
  if (!collaborationRoleAllows(access.role, 'edit')) return c.json({ error: 'Forbidden' }, 403);
  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, c.req.param('noteId')), eq(notes.userId, access.resourceOwnerUserId)))
    .limit(1);
  if (!note) return c.json({ error: 'Note not found' }, 404);
  if (access.role !== 'owner' && note.type === 'template') return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => null)) as {
    files?: Array<{ filename?: string; mimeType?: string; size?: number }>;
  } | null;
  if (!body || !Array.isArray(body.files) || body.files.length === 0)
    return c.json({ error: 'At least one file is required' }, 400);
  if (body.files.length > 10) return c.json({ error: 'Too many files' }, 400);

  const storage = getObjectStorage();
  if (!storage.createSignedUploadUrl)
    return c.json({ error: 'Signed uploads are not supported by the configured storage driver' }, 400);

  const uploads = [];
  for (const file of body.files) {
    const filename = safeFilename(file.filename || 'image');
    const mimeType = file.mimeType ?? '';
    const size = typeof file.size === 'number' ? file.size : 0;
    const validationError = validateImageMetadata({ mimeType, size });
    if (validationError)
      return c.json({ error: validationError }, validationError === 'Image is too large' ? 413 : 400);

    const attachmentId = createAttachmentId();
    const storageKey = storageKeyFor({
      userId: access.resourceOwnerUserId,
      noteId: note.id,
      attachmentId,
      filename,
    });
    const signedUrl = await storage.createSignedUploadUrl({
      key: storageKey,
      contentType: mimeType,
      expiresInSeconds: SIGNED_UPLOAD_EXPIRY_SECONDS,
    });

    const [attachment] = await db
      .insert(attachments)
      .values({
        id: attachmentId,
        userId: access.resourceOwnerUserId,
        noteId: note.id,
        folderId: note.folderId,
        provider: storage.provider,
        filename,
        mimeType,
        size,
        contentHash: '',
        storageKey,
        status: 'pending',
      })
      .returning();

    const markdownUrl = getAttachmentMarkdownUrl(attachment.id);
    uploads.push({
      attachment: serializeAttachment(attachment, access.source),
      signedUrl,
      method: 'PUT',
      headers: { 'content-type': mimeType },
      markdownUrl,
      markdown: `![${filename}](${markdownUrl})`,
    });
  }

  return c.json({ uploads }, 201);
});

attachmentRoutes.post('/:attachmentId/complete', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const [attachment] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, c.req.param('attachmentId')), isNull(attachments.deletedAt)))
    .limit(1);
  if (!attachment) return c.json({ error: 'Attachment not found' }, 404);
  const access = await resolveNoteCollaborationAccess({ actorUserId: user.id, noteId: attachment.noteId });
  if (!access || access.resourceOwnerUserId !== attachment.userId || !collaborationRoleAllows(access.role, 'edit'))
    return c.json({ error: access ? 'Forbidden' : 'Attachment not found' }, access ? 403 : 404);

  const storage = getObjectStorage();
  const rejectStoredUpload = async (error: string) => {
    await storage.deleteObject({ key: attachment.storageKey });
    await db
      .update(attachments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(attachments.id, attachment.id), eq(attachments.userId, access.resourceOwnerUserId)));
    return c.json({ error }, error === 'Image is too large' ? 413 : 400);
  };
  const metadata = storage.getObjectMetadata
    ? await storage.getObjectMetadata({ key: attachment.storageKey })
    : undefined;
  if (metadata === null) return c.json({ error: 'Attachment upload not found' }, 404);
  if (metadata && metadata.size > MAX_IMAGE_BYTES) return rejectStoredUpload('Image is too large');
  if (metadata && metadata.size <= 0) return rejectStoredUpload('Image is empty');

  const object = await storage.getObject({ key: attachment.storageKey });
  if (!object) return c.json({ error: 'Attachment upload not found' }, 404);
  const validation = validateImageBytes({ bytes: object.body, claimedMimeType: attachment.mimeType });
  if (!validation.ok) return rejectStoredUpload(validation.error);

  const [updated] = await db
    .update(attachments)
    .set({
      status: 'ready',
      size: validation.size,
      contentHash: hashBytes(object.body),
      mimeType: validation.detectedMimeType,
      updatedAt: new Date(),
    })
    .where(and(eq(attachments.id, attachment.id), eq(attachments.userId, access.resourceOwnerUserId)))
    .returning();
  return c.json({
    attachment: serializeAttachment(updated, access.source),
    markdownUrl: getAttachmentMarkdownUrl(updated.id),
    markdown: `![${updated.filename}](${getAttachmentMarkdownUrl(updated.id)})`,
  });
});

attachmentRoutes.delete('/:attachmentId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const [attachment] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, c.req.param('attachmentId')), isNull(attachments.deletedAt)))
    .limit(1);
  if (!attachment) return c.json({ error: 'Attachment not found' }, 404);
  const access = await resolveNoteCollaborationAccess({ actorUserId: user.id, noteId: attachment.noteId });
  if (!access || access.resourceOwnerUserId !== attachment.userId)
    return c.json({ error: 'Attachment not found' }, 404);
  if (!collaborationRoleAllows(access.role, 'edit')) return c.json({ error: 'Forbidden' }, 403);

  await getObjectStorage().deleteObject({ key: attachment.storageKey });
  await db
    .update(attachments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(attachments.id, attachment.id), eq(attachments.userId, access.resourceOwnerUserId)));
  return c.json({ ok: true });
});

attachmentRoutes.post('/notes/:noteId/images', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const access = await resolveNoteCollaborationAccess({ actorUserId: user.id, noteId: c.req.param('noteId') });
  if (!access) return c.json({ error: 'Note not found' }, 404);
  if (!collaborationRoleAllows(access.role, 'edit')) return c.json({ error: 'Forbidden' }, 403);
  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, c.req.param('noteId')), eq(notes.userId, access.resourceOwnerUserId)))
    .limit(1);
  if (!note) return c.json({ error: 'Note not found' }, 404);
  if (access.role !== 'owner' && note.type === 'template') return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.parseBody().catch(() => null);
  const file = body?.image;
  if (!(file instanceof File)) return c.json({ error: 'Image file is required' }, 400);
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return c.json({ error: 'Unsupported image type' }, 400);
  if (file.size > MAX_IMAGE_BYTES) return c.json({ error: 'Image is too large' }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateImageBytes({ bytes, claimedMimeType: file.type });
  if (!validation.ok) return c.json({ error: validation.error }, validation.error === 'Image is too large' ? 413 : 400);
  const attachmentId = createAttachmentId();
  const filename = safeFilename(file.name || 'image');
  const storageKey = storageKeyFor({
    userId: access.resourceOwnerUserId,
    noteId: note.id,
    attachmentId,
    filename,
  });
  const storage = getObjectStorage();

  await storage.putObject({
    key: storageKey,
    body: bytes,
    contentType: file.type,
    metadata: { userId: access.resourceOwnerUserId, noteId: note.id, attachmentId, filename },
  });

  const [attachment] = await db
    .insert(attachments)
    .values({
      id: attachmentId,
      userId: access.resourceOwnerUserId,
      noteId: note.id,
      folderId: note.folderId,
      provider: storage.provider,
      filename,
      mimeType: validation.detectedMimeType,
      size: validation.size,
      contentHash: hashBytes(bytes),
      storageKey,
      status: 'ready',
    })
    .returning();

  return c.json(
    {
      attachment: serializeAttachment(attachment, access.source),
      markdownUrl: getAttachmentMarkdownUrl(attachment.id),
      markdown: `![${filename}](${getAttachmentMarkdownUrl(attachment.id)})`,
    },
    201
  );
});

export function attachmentContentResponse(input: {
  body: Uint8Array;
  contentType: string;
  cacheControl: string;
  sandbox?: boolean;
}) {
  const body = input.body.buffer.slice(
    input.body.byteOffset,
    input.body.byteOffset + input.body.byteLength
  ) as ArrayBuffer;
  const headers: Record<string, string> = {
    'content-type': input.contentType,
    'content-length': String(input.body.byteLength),
    'cache-control': input.cacheControl,
    'x-content-type-options': 'nosniff',
  };
  if (input.sandbox) headers['content-security-policy'] = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
  if (input.contentType === 'image/svg+xml') headers['content-disposition'] = 'attachment';
  return new Response(body, { headers });
}

attachmentRoutes.get('/:attachmentId/content', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const [attachment] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, c.req.param('attachmentId')), isNull(attachments.deletedAt)))
    .limit(1);
  if (!attachment) return c.json({ error: 'Attachment not found' }, 404);
  const access = await resolveNoteCollaborationAccess({ actorUserId: user.id, noteId: attachment.noteId });
  if (!access || access.resourceOwnerUserId !== attachment.userId || !collaborationRoleAllows(access.role, 'read'))
    return c.json({ error: 'Attachment not found' }, 404);
  if (attachment.status !== 'ready') return c.json({ error: 'Attachment is not ready' }, 404);

  const object = await getObjectStorage().getObject({ key: attachment.storageKey });
  if (!object) return c.json({ error: 'Attachment content not found' }, 404);

  return attachmentContentResponse({
    body: object.body,
    contentType: attachment.mimeType,
    cacheControl: 'private, max-age=3600',
    sandbox: true,
  });
});
