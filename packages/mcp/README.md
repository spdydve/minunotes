# @dpklabs/notes-mcp

MCP server for Notes. Uses `@dpklabs/notes-sdk` and API key auth.

```sh
export NOTES_API_URL="https://api.notes.example.com/api"
export NOTES_API_KEY="mn_..."
notes-mcp
```

Example MCP client config:

```json
{
  "mcpServers": {
    "notes": {
      "command": "notes-mcp",
      "env": {
        "NOTES_API_URL": "https://api.notes.example.com/api",
        "NOTES_API_KEY": "mn_..."
      }
    }
  }
}
```

Tools include folder listing, note CRUD, search, template listing, and create-from-template.
