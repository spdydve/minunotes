---
name: minunotes-harness
description: Tool-first MinuNotes skill for agents with registered minunotes_* tools. Use to read, search, create, edit, tag, inspect links, and work with canvas notes through MinuNotes tools.
---

# MinuNotes Harness Tool Skill

Use this skill when registered MinuNotes tools are available. Prefer tools over shell commands.

## Tool usage patterns

- Find/create location: `minunotes_list_folders` → `minunotes_create_folder` if needed.
- Safe note edit: `minunotes_search_notes` or `minunotes_read_note` → capture `contentHash` → `minunotes_edit_note` with `baseHash`.
- Section edit: `minunotes_read_outline` → `minunotes_read_section` → targeted `replace_text` or `replace_range`.
- Canvas create/update: use Minu diagram syntax for generated layouts and JSON Canvas for exact IDs, positions, links, and metadata.
- Canvas replacement: `minunotes_read_note` → use `minunotes_replace_canvas` or `minunotes_replace_canvas_from_syntax` with `baseHash`.
- Canvas note link: `minunotes_read_note` → `minunotes_link_canvas_node_to_note` or `minunotes_unlink_canvas_node` with the latest `contentHash` as `baseHash`.
- Tags/links: use tag and backlink/link tools before changing organization or wikilinks.

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
