import { getApiRuntimeConfig } from '../lib/env';
import { FilesystemObjectStorage } from './filesystem-storage';
import type { ObjectStorage } from './object-storage';
import { S3ObjectStorage } from './s3-storage';

let storage: ObjectStorage | null = null;

export function getObjectStorage() {
  if (storage) return storage;

  const { attachmentStorage } = getApiRuntimeConfig();
  if (attachmentStorage.driver === 'filesystem') {
    storage = new FilesystemObjectStorage(attachmentStorage.filesystemPath);
    return storage;
  }

  if (attachmentStorage.driver === 's3' || attachmentStorage.driver === 's3-compatible') {
    if (!attachmentStorage.bucket) throw new Error('ATTACHMENT_BUCKET is required for S3 attachment storage');
    storage = new S3ObjectStorage({
      bucket: attachmentStorage.bucket,
      region: attachmentStorage.region,
      endpoint: attachmentStorage.endpoint,
      forcePathStyle: attachmentStorage.forcePathStyle,
      provider: attachmentStorage.driver,
    });
    return storage;
  }

  throw new Error(`Attachment storage driver is not implemented yet: ${attachmentStorage.driver}`);
}

export function getAttachmentMarkdownUrl(attachmentId: string) {
  const { attachmentStorage } = getApiRuntimeConfig();
  const path = `/internal/attachments/${attachmentId}/content`;
  return attachmentStorage.publicBaseUrl ? `${attachmentStorage.publicBaseUrl}${path}` : path;
}

export function resetObjectStorageForTests() {
  storage = null;
}
