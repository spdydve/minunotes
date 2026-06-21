# MinuNotes Harness Skill

Use this skill when the user wants an agent to work with MinuNotes notes through the harness API.

## Requirements

Environment variables:

- `MINUNOTES_API_URL` — API origin/base, for example `https://api-dev-notes.dpklabs.com`.
- `MINUNOTES_API_KEY` — API key scoped to all non-private folders, selected project roots, or specific folders.

Normalize the API URL by removing any trailing slash. Harness routes live under `/api/harness`.

Send the API key on every request:

```http
X-API-Key: <MINUNOTES_API_KEY>
```

## Safety and editing rules

- Use only the harness/API. Do not use browser access unless explicitly asked.
- Never fabricate note contents. Read/search first, then act.
- Always read a note and capture `contentHash` before editing note content.
- Include `baseHash` when editing content to avoid overwriting concurrent changes.
- Prefer small, targeted edits.
- Preserve markdown structure, headings, links, wikilinks, and image URLs.
- Use `[[Note Title]]` for note links when appropriate. Use `[[Note Title|label]]` when the visible label should differ.
- Search/read before creating wikilinks to avoid duplicate-title ambiguity.
- Tags are lightweight labels. Tag names normalize to lowercase words with optional dashes, for example `plan` or `release-notes`.
- For app-owned images, preserve URLs such as `/api/attachments/.../content`.
- Report folder ID, note ID, and final changed markdown or section summary after edits.
- If permission is denied, report the permission issue instead of retrying unrelated actions.

## Shell helpers

```bash
API="${MINUNOTES_API_URL%/}"
KEY="$MINUNOTES_API_KEY"
AUTH=(-H "X-API-Key: $KEY" -H "Content-Type: application/json")
```

## Common commands

List accessible folders:

```bash
curl -s "${AUTH[@]}" "$API/api/harness/folders"
```

Search notes by title/content/folder/tag text:

```bash
curl -s "${AUTH[@]}" "$API/api/harness/notes/search?q=project"
```

Filter search by tag:

```bash
curl -s "${AUTH[@]}" "$API/api/harness/notes/search?q=project&tag=release-notes"
```

Create/read/edit notes:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/api/harness/notes" \
  -d '{"folderId":"folder_xxx","title":"Agent Harness Smoke Test","content":"# Agent Harness Smoke Test\n\n- [ ] Created by harness\n"}'

curl -s "${AUTH[@]}" "$API/api/harness/notes/note_xxx"

curl -s "${AUTH[@]}" \
  -X POST "$API/api/harness/notes/note_xxx/edit" \
  -d '{"baseHash":"hash_from_read","edits":[{"type":"replace_text","oldText":"old","newText":"new"}]}'
```

Tags:

```bash
curl -s "${AUTH[@]}" "$API/api/harness/tags"
curl -s "${AUTH[@]}" "$API/api/harness/notes/note_xxx/tags"
curl -s "${AUTH[@]}" \
  -X PUT "$API/api/harness/notes/note_xxx/tags" \
  -d '{"tags":["project","release-notes"]}'
```

Graph context:

```bash
curl -s "${AUTH[@]}" "$API/api/harness/notes/note_xxx/backlinks"
curl -s "${AUTH[@]}" "$API/api/harness/notes/note_xxx/links"
curl -s "${AUTH[@]}" "$API/api/harness/notes/orphans"
```

Read outline/section/lines:

```bash
curl -s "${AUTH[@]}" "$API/api/harness/notes/note_xxx/outline"
curl -s "${AUTH[@]}" "$API/api/harness/notes/note_xxx/sections/section-id"
curl -s "${AUTH[@]}" "$API/api/harness/notes/note_xxx/lines?from=1&to=80"
```

## Endpoint reference

- `GET /api/harness/folders`
- `POST /api/harness/folders`
- `GET /api/harness/tags`
- `GET /api/harness/notes/search?q=...&tag=...`
- `GET /api/harness/notes/search-lines?q=...&folderId=...&context=2&limit=25&caseSensitive=false`
- `POST /api/harness/notes`
- `GET /api/harness/notes/orphans`
- `GET /api/harness/notes/:noteId`
- `GET /api/harness/notes/:noteId/events?limit=25`
- `GET /api/harness/notes/:noteId/tags`
- `PUT /api/harness/notes/:noteId/tags`
- `GET /api/harness/notes/:noteId/backlinks`
- `GET /api/harness/notes/:noteId/links`
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
- `403`: API key lacks folder permission, or the target folder/note is read-only for this key.
- `404`: note/folder/section not found.
- `409`: stale `baseHash`; reread the note and retry with the new hash.
- `500`: server error; report endpoint and response body.
