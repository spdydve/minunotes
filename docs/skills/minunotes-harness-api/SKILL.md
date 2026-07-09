---
name: minunotes-harness-api
description: Curl/API-only MinuNotes harness skill for agents without registered MinuNotes tools. Use to read, search, create, edit, and inspect notes through /v1/harness with MINUNOTES_API_URL and MINUNOTES_API_KEY.
---

# MinuNotes Harness API Skill

Use this skill when the user wants an agent to read, search, create, or edit notes in MinuNotes through the harness API and registered MinuNotes tools are not available.

## Requirements

You need these environment variables or equivalent secrets:

- `MINUNOTES_API_URL` — API origin or API base, for example `https://api.notes.dpklabs.com`.
- `MINUNOTES_API_KEY` — MinuNotes API key with folder permissions.

Normalize `MINUNOTES_API_URL` by removing any trailing slash. Harness routes live under `/v1/harness`.

The legacy `/api/harness` route has been removed from production.

Send the API key on every request:

```http
X-API-Key: <MINUNOTES_API_KEY>
```

Use JSON for request/response bodies.

## Safety and editing rules

- Use only the harness/API. Do not use browser access unless explicitly asked.
- Never fabricate note contents. Read/search first, then act.
- Always read a note and capture `contentHash` before editing.
- Include `baseHash` when editing to avoid overwriting concurrent changes.
- Prefer small, targeted edits.
- Preserve markdown structure, headings, links, wikilinks, tags, and image URLs.
- Check `documentType` before editing. Markdown patch edits only work for `markdown` notes.
- For `canvas.default` and `canvas.mindmap`, use canvas JSON or Minu diagram syntax endpoints instead of markdown patch edits.
- For app-owned images, preserve normal URL markdown such as `/internal/attachments/.../content`.
- Report the folder ID, note ID, and final changed markdown or section summary after edits.
- If an API key lacks permission, report the permission issue instead of retrying unrelated actions.

## Common commands

Set shell helpers:

```bash
API="${MINUNOTES_API_URL%/}"
KEY="$MINUNOTES_API_KEY"
AUTH=(-H "X-API-Key: $KEY" -H "Content-Type: application/json")
```

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

Search lines across notes:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/notes/search-lines?q=todo&context=2&limit=10"
```

Create a note:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/notes" \
  -d '{"folderId":"folder_xxx","title":"Agent Harness Smoke Test","content":"# Agent Harness Smoke Test\n\n- [ ] Created by harness\n"}'
```

Read a note:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx"
```

Get a note outline:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/outline"
```

Read a section:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/sections/section-id"
```

Read lines:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/lines?from=1&to=80"
```

Read note events:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/events?limit=25"
```

Edit a note using exact text replacement:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/notes/note_xxx/edit" \
  -d '{
    "baseHash":"hash_from_read",
    "edits":[
      {"type":"replace_text","oldText":"- [ ] Created by harness","newText":"- [x] Created by harness"}
    ]
  }'
```

Append text:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/notes/note_xxx/edit" \
  -d '{
    "baseHash":"hash_from_read",
    "edits":[{"type":"append","text":"\n- Added by agent\n"}]
  }'
```

Create canvases from JSON Canvas or Minu diagram syntax:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/canvases" \
  -d '{"folderId":"folder_xxx","title":"Flow","canvas":{"nodes":[],"edges":[]}}'

curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/canvases/from-syntax" \
  -d '{"folderId":"folder_xxx","syntax":"diagram \"Product plan\" {\n  layout mindmap\n  Product\n  Product > Research\n}"}'
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
- `403`: API key lacks folder permission.
- `404`: note/folder/section not found.
- `409`: stale `baseHash`; reread the note and retry with the new hash.
- `500`: server error; report endpoint and response body.
