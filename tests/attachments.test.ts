import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectRasterImageType, validateImageBytes } from '../src/api/attachments/image-validation';
import { attachmentContentResponse } from '../src/api/routes/attachments';
import { getAttachmentMarkdownUrl, getObjectStorage, resetObjectStorageForTests } from '../src/api/storage';
import { FilesystemObjectStorage } from '../src/api/storage/filesystem-storage';
import type { ObjectStorage } from '../src/api/storage/object-storage';
import { S3ObjectStorage } from '../src/api/storage/s3-storage';

const tempDirs: string[] = [];

afterEach(async () => {
  resetObjectStorageForTests();
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('attachment image validation', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('accepts matching raster signatures and rejects spoofed or active content', () => {
    expect(detectRasterImageType(png)).toBe('image/png');
    expect(validateImageBytes({ bytes: png, claimedMimeType: 'image/png' })).toMatchObject({
      detectedMimeType: 'image/png',
      size: png.byteLength,
    });
    expect(validateImageBytes({ bytes: png, claimedMimeType: 'image/jpeg' })).toEqual({
      ok: false,
      error: 'Image content does not match its declared type',
    });
    expect(
      validateImageBytes({ bytes: new TextEncoder().encode('<svg><script/></svg>'), claimedMimeType: 'image/svg+xml' })
    ).toEqual({ ok: false, error: 'Unsupported image type' });
  });

  it('sandboxes authenticated content and forces legacy SVG downloads', async () => {
    const response = attachmentContentResponse({
      body: new TextEncoder().encode('<svg/>'),
      contentType: 'image/svg+xml',
      cacheControl: 'private, max-age=3600',
      sandbox: true,
    });
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
    expect(response.headers.get('content-disposition')).toBe('attachment');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('FilesystemObjectStorage', () => {
  it('stores, reads, and deletes objects', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'notes-attachments-'));
    tempDirs.push(root);
    const storage = new FilesystemObjectStorage(root);

    await storage.putObject({
      key: 'users/user_1/notes/note_1/attachments/att_1-test.png',
      body: new TextEncoder().encode('image-bytes'),
      contentType: 'image/png',
    });

    const key = 'users/user_1/notes/note_1/attachments/att_1-test.png';
    const object = await storage.getObject({ key });
    expect(object?.contentType).toBe('image/png');
    expect(new TextDecoder().decode(object?.body)).toBe('image-bytes');
    await expect(storage.getObjectMetadata({ key })).resolves.toEqual({
      size: new TextEncoder().encode('image-bytes').byteLength,
      contentType: 'image/png',
    });

    await storage.deleteObject({ key: 'users/user_1/notes/note_1/attachments/att_1-test.png' });
    await expect(
      storage.getObject({ key: 'users/user_1/notes/note_1/attachments/att_1-test.png' })
    ).resolves.toBeNull();
  });

  it('rejects keys that escape the storage root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'notes-attachments-'));
    tempDirs.push(root);
    const storage = new FilesystemObjectStorage(root);

    await expect(
      storage.putObject({
        key: '../escape.png',
        body: new Uint8Array([1]),
        contentType: 'image/png',
      })
    ).rejects.toThrow('Storage key escapes storage root');
  });
});

describe('attachment storage interface', () => {
  it('allows adapters to expose signed upload URLs', async () => {
    const storage: ObjectStorage = {
      provider: 'test',
      putObject: async () => undefined,
      getObject: async () => null,
      deleteObject: async () => undefined,
      createSignedUploadUrl: async ({ key }) => `https://uploads.example.com/${key}`,
      objectExists: async () => true,
    };

    await expect(
      storage.createSignedUploadUrl?.({ key: 'image.png', contentType: 'image/png', expiresInSeconds: 900 })
    ).resolves.toBe('https://uploads.example.com/image.png');
    await expect(storage.objectExists?.({ key: 'image.png' })).resolves.toBe(true);
  });
});

describe('attachment storage factory', () => {
  it('creates S3 storage when S3 config is present', () => {
    vi.stubEnv('ATTACHMENT_STORAGE_DRIVER', 's3');
    vi.stubEnv('ATTACHMENT_BUCKET', 'notes-attachments');
    vi.stubEnv('ATTACHMENT_REGION', 'us-east-1');

    expect(getObjectStorage()).toBeInstanceOf(S3ObjectStorage);
  });

  it('requires a bucket for S3 storage', () => {
    vi.stubEnv('ATTACHMENT_STORAGE_DRIVER', 's3');
    vi.stubEnv('ATTACHMENT_BUCKET', '');

    expect(() => getObjectStorage()).toThrow('ATTACHMENT_BUCKET is required');
  });
});

describe('attachment markdown URLs', () => {
  it('returns relative app URLs by default', () => {
    vi.stubEnv('ATTACHMENT_STORAGE_DRIVER', 'filesystem');
    vi.stubEnv('ATTACHMENT_PUBLIC_BASE_URL', '');

    expect(getAttachmentMarkdownUrl('att_123')).toBe('/internal/attachments/att_123/content');
  });

  it('uses the configured public base URL', () => {
    vi.stubEnv('ATTACHMENT_STORAGE_DRIVER', 'filesystem');
    vi.stubEnv('ATTACHMENT_PUBLIC_BASE_URL', 'https://images.dpklabs.com/');

    expect(getAttachmentMarkdownUrl('att_123')).toBe('https://images.dpklabs.com/internal/attachments/att_123/content');
  });
});
