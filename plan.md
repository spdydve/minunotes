# SDK / CLI / MCP Monorepo Plan

## Objective
Restructure Notes into a larger monorepo and add three coupled control-plane packages:

- `@dpklabs/notes-sdk` — typed reusable API client.
- `@dpklabs/notes-cli` — human/developer CLI using the SDK.
- `@dpklabs/notes-mcp` — MCP server using the SDK.

## Decisions
- Move toward a larger monorepo with `apps/` and `packages/`.
- SDK/CLI/MCP use API key auth for MVP.
- API key permissions are the primary access-control mechanism.
- Templates are handled the same as notes across SDK/CLI/MCP; no special agent template lock behavior in MVP.
- CLI and MCP must depend on the SDK instead of duplicating HTTP logic.
- Preserve the existing web/API release and deploy flow during the restructure.

## Current working context
- Branch: `sdk-cli-mcp-planning`
- Existing uncommitted work from before this plan:
  - `package.json` / `pnpm-lock.yaml`: MinuEditor upgraded to `v0.9.1`.
  - `src/frontend/styles.css`: removed redundant editor CSS now covered upstream, retained checkbox theming.
- Before monorepo implementation, decide whether to commit or separately release the editor update.

## Target structure

```txt
notes-2/
  apps/
    web/
    api/
  packages/
    sdk/
    cli/
    mcp/
    shared/              # optional; only if needed
  drizzle/
  scripts/
  docs/
  package.json
  pnpm-workspace.yaml
  tsconfig.json
```

## Dependency flow

```txt
apps/api exposes HTTP API
  ↓
packages/sdk wraps HTTP API
  ↓
packages/cli and packages/mcp use SDK
```

---

## Phase 0 — Stabilize current branch state

### Files likely to modify
- `package.json`
- `pnpm-lock.yaml`
- `src/frontend/styles.css`
- `plan.md`

### Checklist
- [ ] Review current MinuEditor `v0.9.1` changes.
- [ ] Confirm editor CSS cleanup still matches desired UI.
- [ ] Run verification.
- [ ] Commit current editor dependency/style update separately from monorepo work.

### Verification
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Manual browser check for code block highlighting, task checkboxes, wrapped lists.

---

## Phase 1 — Monorepo restructure

### Goal
Move current app code into `apps/` while preserving existing behavior, scripts, routes, migrations, and deployment.

### Files/directories likely to move or modify
- `src/api/**` → likely `apps/api/src/**`
- `src/frontend/**` → likely `apps/web/src/**`
- `index.html` → likely `apps/web/index.html`
- `vite.config.ts`
- `sst.config.ts`
- `tsconfig.json`
- `package.json`
- `pnpm-workspace.yaml`
- `scripts/**`
- `drizzle/**`
- test config files if present

### Checklist
- [x] Decide final app paths: `apps/api`, `apps/web`.
- [x] Add/adjust `pnpm-workspace.yaml`.
- [x] Move frontend app files into `apps/web`.
- [x] Move API app files into `apps/api` or adjust imports if API remains bundled through SST from app path.
- [x] Update TS path aliases/imports.
- [x] Update Vite config paths.
- [x] Update SST config paths.
- [x] Update release/migration scripts for new locations.
- [x] Ensure Drizzle migrations remain stable.
- [x] Keep root scripts as the primary developer entrypoint.

### Verification
- [ ] `pnpm install`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [ ] Local API/web smoke if available.
- [ ] `pnpm release:dev` dry-run or dev deploy only after approval.

---

## Phase 2 — SDK MVP

### Goal
Create a typed SDK package used by all non-browser control planes.

### Package
- `packages/sdk`
- Name: `@dpklabs/notes-sdk`

### Files likely to create
- `packages/sdk/package.json`
- `packages/sdk/src/index.ts`
- `packages/sdk/src/client.ts`
- `packages/sdk/src/errors.ts`
- `packages/sdk/src/types.ts`
- `packages/sdk/src/resources/folders.ts`
- `packages/sdk/src/resources/notes.ts`
- `packages/sdk/src/resources/templates.ts`
- `packages/sdk/src/resources/search.ts`
- `packages/sdk/tsconfig.json`
- `packages/sdk/README.md`
- SDK tests

### Checklist
- [ ] Define `NotesClient` constructor with `baseUrl`, `apiKey`, optional `fetch`.
- [ ] Add typed API errors with status/code/message.
- [ ] Add folder methods: list/get/create/update/delete where supported.
- [ ] Add note methods: list/get/create/update/delete/duplicate where supported or client-side duplicate.
- [ ] Add template methods using the same note model plus template-specific list helpers.
- [ ] Add search methods.
- [ ] Add API key auth header handling.
- [ ] Add JSON request/response helpers.
- [ ] Add README examples.

### Verification
- [ ] SDK unit tests with mocked fetch.
- [ ] `pnpm --filter @dpklabs/notes-sdk typecheck`
- [ ] Root `pnpm typecheck`
- [ ] Root `pnpm test`

---

## Phase 3 — CLI MVP

### Goal
Create a CLI package for users/developers that uses the SDK.

### Package
- `packages/cli`
- Name: `@dpklabs/notes-cli`
- Binary: `notes`

### Files likely to create
- `packages/cli/package.json`
- `packages/cli/src/index.ts`
- `packages/cli/src/config.ts`
- `packages/cli/src/output.ts`
- `packages/cli/src/commands/folders.ts`
- `packages/cli/src/commands/notes.ts`
- `packages/cli/src/commands/templates.ts`
- `packages/cli/src/commands/search.ts`
- `packages/cli/README.md`
- CLI tests

### Checklist
- [ ] Choose CLI parser (`commander`, `cac`, or similar).
- [ ] Support env config: `NOTES_API_URL`, `NOTES_API_KEY`.
- [ ] Optionally support local config file later; env-only is acceptable for MVP.
- [ ] Add `--json` output mode.
- [ ] Add folder commands.
- [ ] Add note commands.
- [ ] Add template commands.
- [ ] Add search command.
- [ ] Add helpful error output for auth/permission failures.

### Initial command surface

```txt
notes folders list
notes folders create <name>
notes notes list --folder <folderId>
notes notes get <noteId>
notes notes create --folder <folderId> --title <title> [--content <file|->]
notes notes update <noteId> [--title <title>] [--content <file|->]
notes notes delete <noteId>
notes templates list
notes templates create --title <title> [--content <file|->]
notes search <query>
```

### Verification
- [ ] CLI unit tests with mocked SDK.
- [ ] `pnpm --filter @dpklabs/notes-cli typecheck`
- [ ] Smoke commands against dev API with a test API key, only after approval.

---

## Phase 4 — MCP MVP

### Goal
Create an MCP server package for agents/tools that uses the SDK.

### Package
- `packages/mcp`
- Name: `@dpklabs/notes-mcp`
- Binary: `notes-mcp`

### Files likely to create
- `packages/mcp/package.json`
- `packages/mcp/src/index.ts`
- `packages/mcp/src/config.ts`
- `packages/mcp/src/server.ts`
- `packages/mcp/src/tools/folders.ts`
- `packages/mcp/src/tools/notes.ts`
- `packages/mcp/src/tools/templates.ts`
- `packages/mcp/src/tools/search.ts`
- `packages/mcp/README.md`
- MCP tests

### Checklist
- [ ] Use official MCP TypeScript SDK if appropriate.
- [ ] Configure via `NOTES_API_URL` and `NOTES_API_KEY`.
- [ ] Add folder tools.
- [ ] Add note tools.
- [ ] Add template tools using same permission model as notes.
- [ ] Add search tool.
- [ ] Return concise structured responses.
- [ ] Document Claude Desktop / generic MCP client config.

### Initial tool surface
- [ ] `notes_list_folders`
- [ ] `notes_list_notes`
- [ ] `notes_get_note`
- [ ] `notes_create_note`
- [ ] `notes_update_note`
- [ ] `notes_delete_note`
- [ ] `notes_search`
- [ ] `notes_list_templates`
- [ ] `notes_create_from_template`

### Verification
- [ ] MCP unit tests with mocked SDK.
- [ ] `pnpm --filter @dpklabs/notes-mcp typecheck`
- [ ] Local MCP inspector/manual tool invocation if available.

---

## Phase 5 — Docs, packaging, and release flow

### Goal
Document and prepare packages for local/dev use and future publishing.

### Files likely to create/modify
- root `README.md`
- `docs/sdk.md`
- `docs/cli.md`
- `docs/mcp.md`
- package READMEs
- root/package scripts
- release scripts if package publishing is added

### Checklist
- [ ] Add root monorepo development docs.
- [ ] Add SDK usage examples.
- [ ] Add CLI usage examples.
- [ ] Add MCP client config examples.
- [ ] Decide package publish strategy.
- [ ] Add package build scripts.
- [ ] Add package versioning approach.

### Verification
- [ ] Fresh clone/install/build instructions tested locally.
- [ ] Package binaries work from workspace.
- [ ] Existing app release still works.

---

## Approval gates
- [ ] Approve this plan before implementation.
- [ ] Approve Phase 0 commit/release handling.
- [ ] Approve Phase 1 restructure before moving files.
- [ ] Approve SDK public API shape before implementing CLI/MCP.
