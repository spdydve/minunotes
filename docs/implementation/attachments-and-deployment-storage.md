# Attachments and Deployment Storage

## Decision

Images and other uploaded files should be handled as **URL-referenced attachments in canonical markdown**.

The note body remains markdown-first. Binary data is stored outside `notes.content` behind a generic object storage interface.

```md
![Alt text](/api/attachments/attachment_id/content)
```

Markdown should use normal URLs so humans, scripts, and models can add or preserve image links naturally. App-owned uploads should use stable Notes URLs that resolve to authenticated download responses, signed URLs, or local file responses depending on the configured storage backend.

## Goals

- Keep `notes.content` readable, portable, searchable, and agent-friendly.
- Avoid base64-encoded images in markdown.
- Support SST/S3 as the primary production path.
- Keep the storage layer swappable for Docker/self-hosted deployments.
- Let Notes own attachment identity, metadata, URL routing, and permissions.
- Let the storage backend own bytes only.
- Allow external image URLs in markdown when users or models intentionally link remote images.

## Non-goals for the first pass

- Image editing, cropping, or transformations.
- Full media library management.
- Automatic orphan cleanup.
- Public unauthenticated image hosting by default.
- Embedding binary data directly in markdown.

## Storage model

Use an app-level attachment record with object storage metadata.

Potential `attachments` fields:

- `id`
- `user_id`
- `note_id` nullable if we later support folder/global assets
- `folder_id` optional, useful for permission checks
- `filename`
- `mime_type`
- `size`
- `content_hash`
- `storage_key`
- `created_at`
- `updated_at`

Example object key:

```txt
users/{userId}/notes/{noteId}/attachments/{attachmentId}-{safeFilename}
```

Markdown should not contain storage-specific bucket URLs by default. App-owned uploads should use stable app-level URLs:

```md
![Architecture diagram](/api/attachments/att_123/content)
```

External images may remain as normal remote URLs:

```md
![External reference](https://example.com/image.png)
```

## Storage abstraction

Define a generic object storage adapter with S3-compatible semantics.

```ts
interface ObjectStorage {
  putObject(input: {
    key: string
    body: Blob | Buffer | Uint8Array
    contentType: string
    metadata?: Record<string, string>
  }): Promise<void>

  getObject(input: { key: string }): Promise<{
    body: ReadableStream | Buffer
    contentType?: string
  }>

  deleteObject(input: { key: string }): Promise<void>

  createSignedReadUrl?(input: {
    key: string
    expiresInSeconds: number
  }): Promise<string>

  getPublicUrl?(input: { key: string }): string
}
```

Supported implementations can include:

- `S3ObjectStorage` for SST/AWS S3.
- `S3CompatibleObjectStorage` for MinIO, Tigris, R2, or other S3-compatible providers.
- `FilesystemObjectStorage` for Docker/self-hosted installs using a mounted volume.

## Deployment recommendation

### Primary path: SST + S3

Use SST and S3 for the canonical production deployment.

Benefits:

- Fits the current stack.
- Provides real object storage.
- Works well with signed URLs and private buckets.
- Keeps production infrastructure simple.

### Portable path: Docker

Add Docker as a secondary distribution path when self-hosting or easier onboarding becomes important.

Recommended Docker options:

1. **Simple Docker volume**
   - App stores attachments using `FilesystemObjectStorage`.
   - Files live under a mounted path such as `/data/attachments`.
   - Easiest self-hosted path.

2. **S3-compatible local service**
   - App uses the S3-compatible adapter.
   - MinIO/Tigris-compatible service stores data on a volume.
   - Better parity with production object storage.

Example config shape:

```env
ATTACHMENT_STORAGE_DRIVER=s3
ATTACHMENT_BUCKET=notes-attachments
ATTACHMENT_PUBLIC_BASE_URL=

# or
ATTACHMENT_STORAGE_DRIVER=filesystem
ATTACHMENT_STORAGE_PATH=/data/attachments
```

## Permissions

Attachment access should flow from note/folder permissions.

- If a user can read a note, they can read that note's referenced attachments.
- If an API key can read a folder/note, it can read attachment metadata and download URLs for attachments in scope.
- Upload/edit permissions should follow folder or note API Access rules.
- Direct storage URLs should generally be signed or routed through the app unless explicitly configured as public.

## API and harness behavior

Agents and external tools should work with normal markdown image URLs, not inline binary data.

A note read can expose:

- markdown content
- attachment metadata
- optional signed download URLs

A note write can insert markdown references such as:

```md
![Screenshot](/api/attachments/att_abc/content)
```

Models may also insert external URLs when referencing images from the web. The harness should preserve markdown as the source of truth and avoid leaking backend-specific storage details like S3 bucket URLs into note content for app-owned uploads.

## MVP implementation order

1. Add storage adapter interface.
2. Add S3/SST-backed implementation.
3. Add attachment metadata table.
4. Add upload endpoint that stores bytes and creates attachment metadata.
5. Insert stable app URL markdown references into notes.
6. Add authenticated attachment resolve/download route.
7. Render app-owned and external image URLs in the note UI.
8. Add filesystem or S3-compatible Docker storage later.
