---
name: minunotes-harness
description: Read, search, create, edit, tag, inspect linked notes, and work with canvas notes in MinuNotes through the deployed /v1 harness API using MINUNOTES_API_URL and MINUNOTES_API_KEY.
---

# MinuNotes Harness Skill

Use this skill when the user wants an agent to work with MinuNotes notes through the harness API.

## Prefer tools first

If registered MinuNotes tools are available, use them instead of shelling out to `curl`.

Common tools:

- `minunotes_list_folders`
- `minunotes_create_folder`
- `minunotes_search_notes`
- `minunotes_search_lines`
- `minunotes_read_note`
- `minunotes_read_lines`
- `minunotes_read_outline`
- `minunotes_read_section`
- `minunotes_read_events`
- `minunotes_create_note`
- `minunotes_edit_note`
- `minunotes_read_tags`
- `minunotes_replace_tags`
- `minunotes_list_tags`
- `minunotes_backlinks`
- `minunotes_links`
- `minunotes_orphans`
- `minunotes_create_canvas`
- `minunotes_create_canvas_from_syntax`
- `minunotes_replace_canvas`
- `minunotes_replace_canvas_from_syntax`

Only use shell examples as fallback/reference when tools are unavailable.

## Current deployed route base

The deployed harness routes live under:

```txt
/v1/harness
```

The legacy `/api/harness` route has been removed from production.

## Requirements

Environment variables:

- `MINUNOTES_API_URL` — API origin/base, for example `https://api.notes.dpklabs.com`.
- `MINUNOTES_API_KEY` — API key scoped to all non-private folders, selected project roots, or specific folders.

Shell helper:

```bash
API="${MINUNOTES_API_URL%/}"
KEY="$MINUNOTES_API_KEY"
AUTH=(-H "X-API-Key: $KEY" -H "Content-Type: application/json")
```

## Safety and editing rules

- Use only the harness/API. Do not use browser access unless explicitly asked.
- Never fabricate note contents. Read/search first, then act.
- Always read a note and capture `contentHash` before editing note content.
- Include `baseHash` when editing content to avoid overwriting concurrent changes.
- Prefer small, targeted edits.
- Preserve markdown structure, headings, links, wikilinks, tags, and image URLs.
- Check `documentType` before editing. Markdown patch edits only work for `markdown` notes.
- For `canvas.default` and `canvas.mindmap`, use canvas JSON or Minu diagram syntax endpoints instead of markdown patch edits.
- Use `[[Note Title]]` for note links when appropriate. Use `[[Note Title|label]]` when the visible label should differ.
- Search/read before creating wikilinks to avoid duplicate-title ambiguity.
- Tags are lightweight labels. Tag names normalize to lowercase words with optional dashes, for example `plan` or `release-notes`.
- For app-owned images, preserve URLs such as `/internal/attachments/.../content`.
- If permission is denied, report the permission issue instead of retrying unrelated actions.
- After edits, report folder ID, note ID, and a concise summary of changes.

## Fallback curl examples

List accessible folders:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/folders"
```

Create a folder or subfolder:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/folders" \
  -d '{"title":"Research","parentFolderId":"folder_xxx"}'
```

Search notes by title/content/folder/tag text:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/notes/search?q=project"
curl -s "${AUTH[@]}" "$API/v1/harness/notes/search?q=project&tag=release-notes"
```

Create/read/edit markdown notes:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/notes" \
  -d '{"folderId":"folder_xxx","title":"Agent Harness Smoke Test","content":"# Agent Harness Smoke Test\n\n- [ ] Created by harness\n"}'

curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx"

curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/notes/note_xxx/edit" \
  -d '{"baseHash":"hash_from_read","edits":[{"type":"replace_text","oldText":"old","newText":"new"}]}'
```

Create canvases from JSON Canvas or Minu diagram syntax:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/canvases" \
  -d '{"folderId":"folder_xxx","title":"Flow","canvas":{"nodes":[],"edges":[]}}'

curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/canvases/from-syntax" \
  -d '{"folderId":"folder_xxx","syntax":"diagram \"Product plan\" {\n  layout mindmap\n  Product\n  Product > Research\n  Product > Build\n}"}'
```

Replace an existing canvas:

```bash
curl -s "${AUTH[@]}" \
  -X PUT "$API/v1/harness/notes/note_xxx/canvas/from-syntax" \
  -d '{"baseHash":"hash_from_read","syntax":"diagram \"Auth flow\" {\n  User > Login\n  Login > Dashboard\n}"}'
```

Tags:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/tags"
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/tags"
curl -s "${AUTH[@]}" \
  -X PUT "$API/v1/harness/notes/note_xxx/tags" \
  -d '{"tags":["project","release-notes"]}'
```

Graph context:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/backlinks"
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/links"
curl -s "${AUTH[@]}" "$API/v1/harness/notes/orphans"
```

Read outline/section/lines/events:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/outline"
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/sections/section-id"
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/lines?from=1&to=80"
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/events?limit=25"
```

## Endpoint reference

- `GET /v1/harness/folders`
- `POST /v1/harness/folders`
- `GET /v1/harness/tags`
- `GET /v1/harness/notes/search?q=...&tag=...`
- `GET /v1/harness/notes/search-lines?q=...&folderId=...&context=2&limit=25&caseSensitive=false`
- `POST /v1/harness/notes`
- `POST /v1/harness/canvases`
- `POST /v1/harness/canvases/from-syntax`
- `GET /v1/harness/notes/orphans`
- `GET /v1/harness/notes/:noteId`
- `GET /v1/harness/notes/:noteId/events?limit=25`
- `GET /v1/harness/notes/:noteId/tags`
- `PUT /v1/harness/notes/:noteId/tags`
- `GET /v1/harness/notes/:noteId/backlinks`
- `GET /v1/harness/notes/:noteId/links`
- `GET /v1/harness/notes/:noteId/lines?from=1&to=80`
- `GET /v1/harness/notes/:noteId/search-lines?q=...&context=2&limit=25&caseSensitive=false`
- `GET /v1/harness/notes/:noteId/outline`
- `GET /v1/harness/notes/:noteId/sections/:sectionId`
- `PUT /v1/harness/notes/:noteId/canvas`
- `PUT /v1/harness/notes/:noteId/canvas/from-syntax`
- `POST /v1/harness/notes/:noteId/edit`

## Edit payload types

```ts
type DocumentEdit =
  | { type: "append"; text: string }
  | { type: "replace_text"; oldText: string; newText: string }
  | { type: "replace_range"; from: number; to: number; text: string };
```

Prefer `replace_text` when the target text is unique. Use `replace_range` only after reading lines/sections and when exact replacement is not practical.

For canvases, prefer Minu diagram syntax for generated diagrams/mind maps and JSON Canvas for exact imports/replacements.

## Error handling

- `401`: missing/invalid API key.
- `403`: API key lacks folder permission, or the target folder/note is read-only for this key.
- `404`: note/folder/section not found.
- `409`: stale `baseHash`; reread the note and retry with the new hash.
- `500`: server error; report endpoint and response body.
