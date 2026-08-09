---
name: minunotes-harness
description: Tool-first MinuNotes skill for agents with registered minunotes_* tools. Use to read, search, create, edit, review, tag, inspect links, and work with canvas notes through MinuNotes tools.
---

# MinuNotes Harness Tool Skill

Use this skill when registered MinuNotes tools are available. Prefer tools over shell commands.

## Tool usage patterns

- Find/create location: `minunotes_list_folders` → `minunotes_create_folder` if needed.
- Discovery first: `minunotes_search_notes` and `minunotes_orphans` return compact metadata only; use `minunotes_read_note`, `minunotes_read_lines`, or outline/section tools to expand a selected note.
- Safe note edit: search or `minunotes_read_note` → capture `contentHash` → `minunotes_edit_note` with `baseHash`.

## Retrieval workflow

Use the smallest tool result that supports the next decision:

1. **Discover candidates** with `minunotes_search_notes` or `minunotes_orphans`. Treat each result as metadata, not note content.
2. **Find relevant passages** with `minunotes_search_lines` when the query is about note body text or the notes may be large. Matches include the note id, location, matching text, and requested context.
3. **Expand selectively** with `minunotes_read_note` for the complete source, or `minunotes_read_outline` followed by `minunotes_read_section` for one heading. Use `minunotes_read_lines` for a bounded range.
4. **Edit only after reading** the current note and copying its `contentHash` into the edit request.

Discovery tools are cursor-paginated. When a response has `pageInfo.hasMore: true`, pass `pageInfo.nextCursor` back to the same tool with the same query and filters. Do not reuse a cursor with another tool or changed search, and do not fetch every page unless the task requires broader coverage.

Do not read every search result automatically. Rank candidates by title, folder, document type, and matched context, then expand only the notes needed to answer the task.
- Section edit: `minunotes_read_outline` → `minunotes_read_section` → targeted `replace_text` or `replace_range`.
- Canvas create/update: use Minu diagram syntax for generated layouts and JSON Canvas for exact IDs, positions, links, and metadata.
- Canvas replacement: `minunotes_read_note` → use `minunotes_replace_canvas` or `minunotes_replace_canvas_from_syntax` with `baseHash`.
- Canvas note link: `minunotes_read_note` → `minunotes_link_canvas_node_to_note` or `minunotes_unlink_canvas_node` with the latest `contentHash` as `baseHash`.
- Tags/links: use tag and backlink/link tools before changing organization or wikilinks.
- Review comments: read the note and current `contentHash` before creating or remapping an anchor. Anchors use zero-based Markdown offsets and an exact quote. List a thread before editing its messages; message edits/deletes are author-only.

## Review workflow

1. Read the active Markdown note and capture `contentHash`.
2. Compute an exact range or whole-line anchor in the returned Markdown.
3. Create a thread with the quote, offsets, context, and current hash.
4. Use replies for discussion and resolve/reopen for lifecycle state.
5. If the note changes, list comments again and respect `detached: true`; never move an ambiguous anchor speculatively.

Review tools require read scope for listing and edit scope plus API editability for mutations. Comments are unavailable on canvases, templates, Trash, and public shares.

## Available tools

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
- `minunotes_link_canvas_node_to_note`
- `minunotes_unlink_canvas_node`
- `minunotes_list_comments`
- `minunotes_create_comment`
- `minunotes_reply_to_comment`
- `minunotes_update_comment_anchor`
- `minunotes_set_comment_status`
- `minunotes_edit_comment_message`
- `minunotes_delete_comment_message`
- `minunotes_delete_comment_thread`

`minunotes_search_lines` retains matching lines and requested context, but cross-note matches omit repeated hashes, byte sizes, and total line counts. A line match is retrieval context, not a replacement for the current note read when editing.

## Rich Markdown

- GitHub-style callouts use `> [!NOTE]`, `TIP`, `IMPORTANT`, `WARNING`, or `CAUTION`.
- Mermaid diagrams use ordinary fenced `mermaid` code blocks.
- Treat both as portable Markdown and preserve their markers and fences during edits.

## Trash boundary

- Folder lists, search, direct reads, line reads, tags, links, backlinks, and orphan results include active content only. Folder, tag, search, line-search, and orphan discovery lists are cursor-paginated; compact folder/note discovery records omit owner fields and full note content.
- A trashed note, template, or folder subtree is unavailable through harness tools and normally returns not found when addressed by ID.
- Harness tools cannot list Trash or trash, restore, or permanently delete content. Those owner-only operations require the authenticated MinuNotes web interface.
- Do not interpret a not-found response as proof that content was permanently deleted; it may be outside the connection's scope or recoverable in the owner's Trash.

## Safety rules

- Read/search before editing.
- Capture `contentHash` before edits and pass it as `baseHash`.
- Use exact, small edits.
- Markdown patch edits only work for `documentType: "markdown"`.
- For `canvas.default` and `canvas.mindmap`, use canvas JSON or Minu diagram syntax tools.
- Syntax replacement regenerates the complete canvas and can replace node IDs, layout, links, and metadata. Use JSON Canvas for deterministic replacement.
- Prefer focused canvas link/unlink tools over whole-document replacement when only an internal target changes.
- Internal canvas note links and external URLs are independent. Link/unlink operations must preserve `node.url` and unrelated node metadata.
- Preserve markdown structure, wikilinks, tags, and app-owned image URLs such as `/internal/attachments/.../content`.
- If permission is denied, report it; do not retry unrelated actions.
- After edits, report folder ID, note ID, and a concise summary of changes.

## Route note

The deployed harness route base is `/v1/harness`. Legacy `/api/harness` has been removed from production.

If tools are unavailable, use the separate `minunotes-harness-api` skill for direct curl/API usage.
