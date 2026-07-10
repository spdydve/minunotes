# MinuNotes

MinuNotes is a note-first markdown/canvas workspace with external agent integrations through a stable harness API, MCP, and OAuth.

## Production endpoints

- Web app: `https://notes.dpklabs.com`
- API origin: `https://api.notes.dpklabs.com`
- Health check: `https://api.notes.dpklabs.com/health`

## API surfaces

- Internal app API: `/internal/*`
- External harness API: `/v1/harness/*`
- MCP endpoint: `/mcp`
- OAuth endpoints: `/oauth/*`
- OpenAPI: `/openapi.json` and `/v1/openapi.json`

Legacy `/api/*` routes have been removed from production.

## Discovery endpoints

- OAuth authorization server metadata: `/.well-known/oauth-authorization-server`
- OAuth protected resource metadata: `/.well-known/oauth-protected-resource`
- MCP protected resource metadata: `/mcp/.well-known/oauth-protected-resource`

Full production URLs:

```txt
https://api.notes.dpklabs.com/.well-known/oauth-authorization-server
https://api.notes.dpklabs.com/.well-known/oauth-protected-resource
https://api.notes.dpklabs.com/mcp/.well-known/oauth-protected-resource
```

## Agent integrations

- Harness/OpenAPI clients should use `https://api.notes.dpklabs.com/v1/harness/*`.
- MCP clients should use `https://api.notes.dpklabs.com/mcp`.
- OAuth-capable clients should discover metadata from `https://api.notes.dpklabs.com/.well-known/oauth-authorization-server`.
- API-key based local/private agents should send `X-API-Key` to `/v1/harness/*`.

## Docs

See [docs/README.md](./docs/README.md).
