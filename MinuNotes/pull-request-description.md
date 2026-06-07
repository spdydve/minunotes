# Pull Request: Add SDK, CLI, and MCP foundation

## Summary

This PR restructures MinuNotes into a larger monorepo and adds first-pass SDK, CLI, and MCP packages for external/agent control planes. It also updates the MinuEditor integration to `v0.9.1` and removes local CSS workarounds now handled upstream.

## Highlights

- Restructures app code into monorepo-style `apps/` layout:
  - `apps/api/src`
  - `apps/web/src`
- Adds workspace package layout with `pnpm-workspace.yaml`.
- Adds `@dpklabs/notes-sdk` package.
- Adds `@dpklabs/notes-cli` package with `notes` binary.
- Adds `@dpklabs/notes-mcp` package with `notes-mcp` binary.
- Adds SDK/CLI/MCP test coverage.
- Aligns MCP implementation with current MCP SDK standards.
- Updates MinuEditor from `v0.8.0` to `v0.9.1`.

## Monorepo restructure

Moved the existing application into a larger structure while preserving root-level developer scripts and deploy behavior.

New structure includes:

```txt
apps/
  api/
  web/
packages/
  sdk/
  cli/
  mcp/
```

Updated related paths in:

- Vite config
- SST config
- Drizzle config
- scripts
- tests
- TypeScript config

## SDK

Added `packages/sdk` as `@dpklabs/notes-sdk`.

Includes:

- `NotesClient`
- API key auth via `x-api-key`
- typed API errors
- typed folder/note/template/search models
- folder methods
- note methods
- template methods
- search methods
- client-side note duplicate helper
- mocked fetch tests
- README usage example

## CLI

Added `packages/cli` as `@dpklabs/notes-cli` with `notes` binary.

Supports env-based configuration:

```sh
NOTES_API_URL
NOTES_API_KEY
```

Initial commands:

```txt
notes folders list
notes folders create <title>
notes notes list --folder <folderId>
notes notes get <noteId>
notes notes create --folder <folderId> --title <title> --content <file|->
notes notes update <noteId>
notes notes delete <noteId>
notes notes duplicate <noteId>
notes templates list
notes templates create --folder <folderId>
notes search <query>
```

Also includes `--json` output support and command dispatch tests with mocked SDK behavior.

## MCP

Added `packages/mcp` as `@dpklabs/notes-mcp` with `notes-mcp` binary.

Uses:

- official `@modelcontextprotocol/sdk`
- stdio transport
- API key auth through the shared SDK
- `registerTool` with Zod input schemas
- structured tool output via `structuredContent`
- text fallback content
- MCP tool annotations for read-only/destructive/idempotent/open-world hints

Initial tools:

```txt
notes_list_folders
notes_list_notes
notes_get_note
notes_create_note
notes_update_note
notes_delete_note
notes_search
notes_list_templates
notes_create_from_template
```

Also adds a starter prompt:

```txt
summarize_note
```

## MinuEditor update

Updated `@dpklabs/minueditor` to `v0.9.1` after reviewing upstream changes.

Relevant upstream improvements:

- active code block highlight theme support
- built-in hanging indent support for wrapped list/task-list lines

Local CSS cleanup:

- removed fragile generated CodeMirror class overrides for active code highlighting
- removed app-side list hanging-indent workaround
- retained Notes-specific checkbox theming

## Tests / verification

Verified locally:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @dpklabs/notes-sdk typecheck
pnpm --filter @dpklabs/notes-sdk build
pnpm --filter @dpklabs/notes-cli typecheck
pnpm --filter @dpklabs/notes-cli build
pnpm --filter @dpklabs/notes-mcp typecheck
pnpm --filter @dpklabs/notes-mcp build
```

Current test coverage includes:

- root API/app tests
- SDK mocked fetch tests
- CLI config and command dispatch tests
- MCP config and tool/server tests

Latest observed result:

```txt
13 test files passed
79 tests passed
```

## Notes / follow-ups

Recommended follow-ups:

- Run CLI smoke tests against dev API with a scoped test API key.
- Run MCP manual smoke tests with an MCP inspector/client.
- Consider adding a scripted MCP eval harness for end-to-end tool-call scenarios.
- Add package publishing/versioning strategy once SDK/CLI/MCP APIs settle.
