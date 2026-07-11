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

Tools include:

- `notes_list_folders`
- `notes_create_folder` (supports optional `parentFolderId` for subfolders)
- `notes_search`
- `notes_get_note`
- `notes_create_note`
- `notes_edit_note`
- `notes_search_lines`
- `notes_read_lines`
- `notes_search_note_lines`
- `notes_read_section`

Implementation notes:

- Uses the official `@modelcontextprotocol/sdk`.
- Honors MinuNotes access modes: all non-private folders, selected project roots, or specific selected non-private folders. Private folders are not accessible to MCP.
- Uses stdio transport for local process-spawned MCP clients.
- Uses Streamable HTTP transport for hosted `/mcp` clients.
- Returns both `structuredContent` and text content.
- Adds MCP tool annotations for read-only/destructive/idempotent hints.
- Includes a starter `summarize_note` prompt.
