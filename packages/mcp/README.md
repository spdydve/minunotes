# @minunotes/mcp

MCP server for MinuNotes harness workflows. Local stdio MCP uses the MinuNotes harness API with API-key auth. Hosted MinuNotes MCP uses OAuth bearer auth at `/mcp`.

## Local stdio MCP

Use the local binary for desktop/local MCP clients that spawn a process:

```sh
export NOTES_API_URL="https://api.notes.example.com"
export NOTES_API_KEY="ntak_..."
notes-mcp
```

Example MCP client config:

```json
{
  "mcpServers": {
    "notes": {
      "command": "notes-mcp",
      "env": {
        "NOTES_API_URL": "https://api.notes.example.com",
        "NOTES_API_KEY": "ntak_..."
      }
    }
  }
}
```

## Hosted MCP

MinuNotes also exposes a hosted Streamable HTTP MCP endpoint at:

```txt
POST /mcp
GET /mcp
DELETE /mcp
```

Hosted MCP uses OAuth bearer authentication. Tool calls run through the authorized connected app's scoped permissions.

```http
Authorization: Bearer mnoac_...
Accept: application/json, text/event-stream
Content-Type: application/json
```

Direct harness API access remains API-key based through `/v1/harness/*`. Local stdio MCP uses `NOTES_API_KEY` and calls the harness API from the local process.

Use hosted MCP for cloud agents, ChatGPT-style integrations, Lambda/container agents, or team-managed agent runtimes. Use local stdio MCP when a desktop client expects to launch a local MCP process.

## Tools

Folders and notes:

- `notes_list_folders`
- `notes_create_folder` (supports optional `parentFolderId` for subfolders)
- `notes_search`
- `notes_get_note`
- `notes_create_note`
- `notes_edit_note`
- `notes_move_notes` (all-or-nothing, up to 100 notes)

Structured reads:

- `notes_search_lines`
- `notes_read_lines`
- `notes_search_note_lines`
- `notes_read_outline`
- `notes_read_section`
- `notes_read_events`

Canvas lifecycle and links:

- `notes_create_canvas`
- `notes_create_canvas_from_syntax`
- `notes_replace_canvas`
- `notes_replace_canvas_from_syntax`
- `notes_set_canvas_node_note_link`
- `notes_remove_canvas_node_note_link`

Tags:

- `notes_list_tags`
- `notes_read_note_tags`
- `notes_replace_note_tags`

## Canvas JSON and Minu syntax

Use JSON Canvas when exact node IDs, positions, external URLs, internal note links, or host metadata must be retained:

```json
{
  "nodes": [
    { "id": "node_a", "type": "text", "text": "Research", "x": 0, "y": 0, "width": 240, "height": 120 }
  ],
  "edges": []
}
```

Use Minu diagram syntax when an agent should generate a laid-out flow or mind map without calculating coordinates:

```txt
diagram "Product plan" {
  layout mindmap
  Product
  Product > Research
  Product > Build
}
```

Syntax creation and replacement compile the source into JSON Canvas. Syntax replacement is whole-document generation and can regenerate node IDs, positions, links, and metadata. Use JSON Canvas for deterministic replacement, and use the focused node-link tools after syntax generation when nodes need internal MinuNotes links.

Canvas replacement and node-link mutations require a current `baseHash`. Setting a node note link creates or changes the target while preserving `node.url` and unrelated metadata. Removing the internal link also preserves the external URL.

## Tool boundaries

Tags are available because they already have user-facing Note Details behavior. Broader graph inspection—including outgoing links, backlinks, and orphan discovery—is intentionally not exposed through MCP yet; those product and UI semantics are deferred.

Implementation notes:

- Uses the official `@modelcontextprotocol/sdk`.
- Honors MinuNotes access modes: all non-private folders, selected project roots, or specific selected non-private folders. Private folders are not accessible to MCP.
- Move operations require edit access to every source folder and create access to the target folder.
- Uses stdio transport for local process-spawned MCP clients.
- Uses Streamable HTTP transport for hosted `/mcp` clients.
- Returns both `structuredContent` and text content.
- Adds MCP tool annotations for read-only/destructive/idempotent hints.
- Includes a starter `summarize_note` prompt.
