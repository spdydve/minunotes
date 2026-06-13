# @minunotes/mcp

MCP server for MinuNotes harness workflows. Uses `@minunotes/sdk` and API key auth.

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
POST /api/mcp
GET /api/mcp
DELETE /api/mcp
```

Hosted MCP v1 requires `X-API-Key` authentication. Tool calls run through the same SDK and `/api/harness/*` permissions as the CLI/local MCP path.

```http
X-API-Key: ntak_...
Accept: application/json, text/event-stream
Content-Type: application/json
```

Use hosted MCP for cloud agents, ChatGPT-style integrations, Lambda/container agents, or team-managed agent runtimes. Use local stdio MCP when a desktop client expects to launch a local MCP process.

## Tools

Tools include:

- `notes_list_folders`
- `notes_create_folder`
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
- Uses stdio transport for local process-spawned MCP clients.
- Uses Streamable HTTP transport for hosted `/api/mcp` clients.
- Returns both `structuredContent` and text content.
- Adds MCP tool annotations for read-only/destructive/idempotent hints.
- Includes a starter `summarize_note` prompt.
