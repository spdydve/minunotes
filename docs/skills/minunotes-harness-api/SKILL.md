---
name: minunotes-harness-api
description: Curl/API-only MinuNotes harness skill for agents without registered MinuNotes tools. Use to read, search, create, edit, review, and inspect notes through /v1/harness with MINUNOTES_API_URL and MINUNOTES_API_KEY.
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

## Rich Markdown

- GitHub-style callouts use `> [!NOTE]`, `TIP`, `IMPORTANT`, `WARNING`, or `CAUTION`.
- Mermaid diagrams use ordinary fenced `mermaid` code blocks.
- Treat both as portable Markdown and preserve their markers and fences during edits.

## Trash boundary

- Harness folder lists, search, direct reads, line reads, tags, links, backlinks, and orphan results include active content only. Folder lists and discovery searches return compact metadata rather than owner fields or full note content.
- A trashed note, template, or folder subtree is unavailable through `/v1/harness/*` and normally returns `404` when addressed by ID.
- The harness API cannot list Trash or trash, restore, or permanently delete content. Those owner-only operations require the authenticated MinuNotes web interface.
- Do not interpret `404` as proof that content was permanently deleted; it may be outside the key's scope or recoverable in the owner's Trash.

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
- Use note moves to organize agent-created notes only within folders the API key can edit/create in.
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
curl -s "${AUTH[@]}" "$API/v1/harness/folders?limit=25"
```

Folder, tag, note-search, orphan, and cross-note line-search responses include `pageInfo`. When `hasMore` is true, pass the opaque `nextCursor` to the same endpoint with the same query and filters:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/folders?limit=25&cursor=$NEXT_CURSOR"
```

Do not inspect or modify cursors, reuse them across endpoints, or continue every page unless the task requires broader coverage.

Create a folder or subfolder:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/folders" \
  -d '{"title":"Research","parentFolderId":"folder_xxx"}'
```

Search notes by title/content/folder/tag text:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/notes/search?q=project&limit=25"
curl -s "${AUTH[@]}" "$API/v1/harness/notes/search?q=project&tag=release-notes&limit=25"
curl -s "${AUTH[@]}" "$API/v1/harness/notes/search?q=project&limit=25&cursor=$NEXT_CURSOR"
```

Search results are compact metadata only: they include identity, folder, title, document type, type, and timestamps, but never full `content`, `userId`, or database folder-owner fields. Orphan results follow the same contract. After choosing a result, expand only what you need:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx"
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/outline"
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/sections/section-id"
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/lines?from=1&to=80"
```

Search lines across notes:

```bash
curl -s "${AUTH[@]}" "$API/v1/harness/notes/search-lines?q=todo&context=2&limit=10"
```

Cross-note line matches retain the matching line and requested context plus note identity and location. They omit repeated hashes, byte sizes, and total line counts; read the selected note explicitly when you need its current `contentHash` before editing.

### Recommended retrieval sequence

1. Search note metadata first; do not expect `content` in search or orphan responses.
2. Use `search-lines` when body text is the deciding signal, especially for long notes.
3. Read only the selected note, line range, or section needed for the task.
4. Before any edit, read the current note and use its returned `contentHash` as `baseHash`.

Do not fetch every search result in full. Choose candidates using title, folder, document type, and matching context, then expand selectively.

Create a note:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/notes" \
  -d '{"folderId":"folder_xxx","title":"Agent Harness Smoke Test","content":"# Agent Harness Smoke Test\n\n- [ ] Created by harness\n"}'
```

Create/update responses return compact note metadata plus `contentHash`, not full note content. Read the note explicitly when content is needed.

Move notes to another accessible folder:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/notes/move" \
  -d '{"noteIds":["note_xxx","note_yyy"],"targetFolderId":"folder_xxx"}'
```

Moving requires edit access to every source note folder and create access to the target folder. The response is compact and does not include note content.

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

Review comments on Markdown notes:

```bash
# List threads and ordered messages
curl -s "${AUTH[@]}" "$API/v1/harness/notes/note_xxx/comments"

# Create a range thread using zero-based Markdown offsets and the current contentHash
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/notes/note_xxx/comments" \
  -d '{"body":"Please clarify this.","anchor":{"anchorType":"range","from":42,"to":61,"quote":"exact source text","prefix":"nearby text before","suffix":"nearby text after","documentHash":"hash_from_read"}}'

# Reply and resolve
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/notes/note_xxx/comments/comment_thread_xxx/replies" \
  -d '{"body":"Follow-up review."}'

curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/notes/note_xxx/comments/comment_thread_xxx/resolve" \
  -d '{}'

# Toggle a reaction on one message (repeat to remove your reaction)
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/notes/note_xxx/comments/comment_thread_xxx/messages/comment_message_xxx/reactions" \
  -d '{"emoji":"🎉"}'
```

Messages include grouped reaction counts and `reactedByCurrentActor`. Supported reactions are `👍`, `❤️`, `😂`, `🎉`, `👀`, and `🚀`. Every comment operation requires explicit Review comments permission plus read access. Note edit permission and `isApiEditable` are not required for comments. Existing and new credentials have Review comments disabled until the owner grants it. Message edits/deletes are author-only. Use the current document hash for creation and anchor updates; stale anchors return `409`. When a listed thread is `detached`, do not guess a replacement location. Comments are unavailable for canvases, templates, Trash, and public shares.

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

Link or unlink one canvas node without replacing the full canvas:

```bash
curl -s "${AUTH[@]}" \
  -X POST "$API/v1/harness/notes/note_canvas/canvas/nodes/node_a/link-note" \
  -d '{"targetNoteId":"note_target","baseHash":"hash_from_read"}'

curl -s "${AUTH[@]}" \
  -X DELETE "$API/v1/harness/notes/note_canvas/canvas/nodes/node_a/link?baseHash=hash_from_read"
```

Internal links are stored as `node.minunotes.link = { "type": "note", "id": "note_…" }`. External links remain in `node.url`; link and unlink operations preserve external URLs and unrelated node metadata. Linking requires edit access to the canvas and read access to the target note.

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

- `GET /v1/harness/folders?limit=25&cursor=...`
- `POST /v1/harness/folders`
- `GET /v1/harness/tags?limit=25&cursor=...`
- `GET /v1/harness/notes/search?q=...&tag=...&limit=25&cursor=...`
- `GET /v1/harness/notes/search-lines?q=...&folderId=...&context=2&limit=25&caseSensitive=false&cursor=...`
- `POST /v1/harness/notes`
- `POST /v1/harness/notes/move`
- `POST /v1/harness/canvases`
- `POST /v1/harness/canvases/from-syntax`
- `GET /v1/harness/notes/orphans?limit=25&cursor=...`
- `GET /v1/harness/notes/:noteId`
- `GET /v1/harness/notes/:noteId/events?limit=25`
- `GET /v1/harness/notes/:noteId/comments`
- `POST /v1/harness/notes/:noteId/comments`
- `POST /v1/harness/notes/:noteId/comments/:threadId/replies`
- `PATCH /v1/harness/notes/:noteId/comments/:threadId/anchor`
- `POST /v1/harness/notes/:noteId/comments/:threadId/resolve`
- `POST /v1/harness/notes/:noteId/comments/:threadId/reopen`
- `PATCH /v1/harness/notes/:noteId/comments/:threadId/messages/:messageId`
- `DELETE /v1/harness/notes/:noteId/comments/:threadId/messages/:messageId`
- `DELETE /v1/harness/notes/:noteId/comments/:threadId`
- `GET /v1/harness/notes/:noteId/tags`
- `PUT /v1/harness/notes/:noteId/tags`
- `GET /v1/harness/notes/:noteId/backlinks`
- `GET /v1/harness/notes/:noteId/links`
- `GET /v1/harness/notes/:noteId/lines?from=1&to=80`
- `GET /v1/harness/notes/:noteId/search-lines?q=...&context=2&limit=25&caseSensitive=false`
- `GET /v1/harness/notes/:noteId/outline`
- `GET /v1/harness/notes/:noteId/sections/:sectionId`
- `PUT /v1/harness/notes/:noteId/canvas`
- `POST /v1/harness/notes/:noteId/canvas/nodes/:nodeId/link-note`
- `DELETE /v1/harness/notes/:noteId/canvas/nodes/:nodeId/link?baseHash=...`
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
- `409`: stale note edit or comment-anchor hash; reread the note and retry only after recomputing the edit or anchor.
- `500`: server error; report endpoint and response body.
