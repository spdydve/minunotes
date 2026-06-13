# MinuNotes Harness Skill

Use this skill when the user wants an agent to read, search, create, or edit notes in MinuNotes through the harness API.

## Requirements

You need these environment variables or equivalent secrets:

- `MINUNOTES_API_URL` — API origin or API base, for example `https://api-dev-notes.dpklabs.com`.
- `MINUNOTES_API_KEY` — MinuNotes API key with scoped folder permissions. Folder creation requires the key's explicit folder-creation permission.

Normalize `MINUNOTES_API_URL` by removing any trailing slash. Harness routes live under `/api/harness`.

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
- Preserve markdown structure, headings, links, and image URLs.
- For app-owned images, preserve normal URL markdown such as `/api/attachments/.../content`.
- Report the folder ID, note ID, and final changed markdown or section summary after edits.
- If an API key lacks permission, report the permission issue instead of retrying unrelated actions.
- Do not create folders unless the user explicitly asks or grants permission for folder creation.

## Common commands

Set shell helpers:

```bash
API="${MINUNOTES_API_URL%/}"
KEY="$MINUNOTES_API_KEY"
AUTH=(-H "X-API-Key: $KEY" -H "Content-Type: application/json")
```

List accessible folders:

```bash
curl -s "${AUTH[@]}" "$API/api/harness/folders"
```

Create a folder, only when explicitly requested and when the API key allows folder creation. The created folder is automatically accessible to the same API key:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/api/harness/folders" \
  -d '{"title":"Agent Workspace"}'
```

Search notes by title/content/folder title:

```bash
curl -s "${AUTH[@]}" "$API/api/harness/notes/search?q=project"
```

Search lines across notes:

```bash
curl -s "${AUTH[@]}" "$API/api/harness/notes/search-lines?q=todo&context=2&limit=10"
```

Create a note:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/api/harness/notes" \
  -d '{"folderId":"folder_xxx","title":"Agent Harness Smoke Test","content":"# Agent Harness Smoke Test\n\n- [ ] Created by harness\n"}'
```

Read a note:

```bash
curl -s "${AUTH[@]}" "$API/api/harness/notes/note_xxx"
```

Get a note outline:

```bash
curl -s "${AUTH[@]}" "$API/api/harness/notes/note_xxx/outline"
```

Read a section:

```bash
curl -s "${AUTH[@]}" "$API/api/harness/notes/note_xxx/sections/section-id"
```

Read lines:

```bash
curl -s "${AUTH[@]}" "$API/api/harness/notes/note_xxx/lines?from=1&to=80"
```

Edit a note using exact text replacement:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/api/harness/notes/note_xxx/edit" \
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
  -X POST "$API/api/harness/notes/note_xxx/edit" \
  -d '{
    "baseHash":"hash_from_read",
    "edits":[{"type":"append","text":"\n- Added by agent\n"}]
  }'
```

## OpenAPI

A static OpenAPI document for these harness endpoints is available at:

- `GET /api/openapi.json`
- `GET /api/harness/openapi.json`

## Endpoint reference

- `GET /api/harness/folders`
- `POST /api/harness/folders`
- `GET /api/harness/notes/search?q=...`
- `GET /api/harness/notes/search-lines?q=...&folderId=...&context=2&limit=25&caseSensitive=false`
- `POST /api/harness/notes`
- `GET /api/harness/notes/:noteId`
- `GET /api/harness/notes/:noteId/events?limit=25`
- `GET /api/harness/notes/:noteId/lines?from=1&to=80`
- `GET /api/harness/notes/:noteId/search-lines?q=...&context=2&limit=25&caseSensitive=false`
- `GET /api/harness/notes/:noteId/outline`
- `GET /api/harness/notes/:noteId/sections/:sectionId`
- `POST /api/harness/notes/:noteId/edit`

## Edit payload types

```ts
type DocumentEdit =
  | { type: "append"; text: string }
  | { type: "replace_text"; oldText: string; newText: string }
  | { type: "replace_range"; from: number; to: number; text: string };
```

Prefer `replace_text` when the target text is unique. Use `replace_range` only after reading lines/sections and when exact replacement is not practical.

## Error handling

- `401`: missing/invalid API key.
- `403`: API key lacks folder permission or folder-creation permission.
- `404`: note/folder/section not found.
- `409`: stale `baseHash`; reread the note and retry with the new hash.
- `500`: server error; report endpoint and response body.
