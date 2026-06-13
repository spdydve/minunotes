# @minunotes/mcp

MCP server for MinuNotes harness workflows. Uses `@minunotes/sdk` and API key auth.

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

Tools include:

- `notes_list_folders`
- `notes_create_folder`
- `notes_search`
- `notes_get_note`
- `notes_create_note`
- `notes_edit_note`
- `notes_read_lines`

Implementation notes:

- Uses the official `@modelcontextprotocol/sdk`.
- Uses stdio transport for local process-spawned MCP clients.
- Returns both `structuredContent` and text content.
- Adds MCP tool annotations for read-only/destructive/idempotent hints.
- Includes a starter `summarize_note` prompt.
