# API pagination compatibility

## Harness API

The following discovery endpoints keep their existing array property and now add `pageInfo: { hasMore, nextCursor }`:

- `/v1/harness/folders`
- `/v1/harness/tags`
- `/v1/harness/notes/search`
- `/v1/harness/notes/orphans`
- `/v1/harness/notes/search-lines`

Clients that only use the first page can continue reading the existing array. Clients that need more results must pass the opaque `nextCursor` back to the same endpoint without changing query filters. Invalid, modified, cross-endpoint, or mismatched-query cursors return `400`.

Discovery note records are compact and do not include `content`. Read a selected note, line range, outline, or section explicitly.

## Internal API

Folder-note lists, note search, recent notes, templates, orphans, and top-level Trash now accept `page` and bounded `limit`. Responses retain their existing collection property and add `page`, `limit`, and `hasMore`.

Internal list records omit note `content`. UI actions that need a body, such as duplicate or template preview, perform an explicit note read. Full note reads and editor routes are unchanged.

The complete folder tree remains unpaginated because hierarchy consumers require complete parent paths and inherited folder state. Folder-template relationships and trashed-folder hierarchy contents also remain complete but use compact note records.

## Representative payload check

For 50 representative notes with 10 KB bodies, the previous full-note JSON shape was 514,591 bytes. The compact paginated shape was 13,077 bytes, a 97.5% reduction. Folder-note, recent, template, and search queries now select explicit list columns and fetch at most `limit + 1` rows per page instead of loading note bodies.
