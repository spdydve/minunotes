# SDK / CLI / MCP Continuation Plan

## Objective
Continue the SDK/CLI/MCP work using the existing `sdk-cli-mcp-planning` branch as source material, while keeping the current app layout on `main` stable.

## Branch findings
- `feature/note-links-plan` rebased cleanly onto `main`.
- `sdk-cli-mcp-planning` does not rebase cleanly because it includes a large monorepo restructure (`src/` -> `apps/`).
- Rebase was aborted to avoid mixing the restructure into current `main`.
- Backup branches were created:
  - `backup/note-links-plan-before-rebase`
  - `backup/sdk-cli-mcp-planning-before-rebase`

## Recommended approach
Create a fresh continuation branch from `main` and selectively bring over SDK/CLI/MCP package source from `sdk-cli-mcp-planning`, without adopting the full monorepo restructure.

## Files likely to create or modify
- New/restore package source files:
  - `packages/sdk/package.json`
  - `packages/sdk/src/*`
  - `packages/sdk/tests/*`
  - `packages/sdk/README.md`
  - `packages/sdk/tsconfig.json`
  - `packages/cli/package.json`
  - `packages/cli/src/*`
  - `packages/cli/tests/*`
  - `packages/cli/README.md`
  - `packages/cli/tsconfig.json`
  - `packages/mcp/package.json`
  - `packages/mcp/src/*`
  - `packages/mcp/tests/*`
  - `packages/mcp/README.md`
  - `packages/mcp/tsconfig.json`
- Workspace/package config:
  - `pnpm-workspace.yaml`
  - `package.json`
  - `pnpm-lock.yaml`
  - `tsconfig.json` if needed
- Possibly update generated/dist policy:
  - Decide whether to keep/remove `packages/*/dist` from git.

## Implementation checklist
- [x] Create fresh branch from current `main`.
- [x] Copy SDK source/tests/config from `sdk-cli-mcp-planning` into existing `packages/sdk`.
- [x] Copy CLI source/tests/config from `sdk-cli-mcp-planning` into existing `packages/cli`.
- [x] Copy MCP source/tests/config from `sdk-cli-mcp-planning` into existing `packages/mcp`.
- [x] Add workspace config without moving app source paths.
- [x] Update root package scripts only if needed.
- [x] Update package code to match current API surface, including agent-created folder access if applicable.
- [x] Decide whether folder creation should be exposed in SDK/CLI/MCP now.
- [x] Run verification.

## Verification
- [x] `pnpm install` / lockfile refresh.
- [x] `pnpm typecheck`.
- [x] `pnpm test`.
- [x] `pnpm build`.
- [x] SDK package typecheck/build/tests.
- [x] CLI package typecheck/build/tests.
- [x] MCP package typecheck/build/tests.
- [ ] Manual smoke: CLI lists folders with API key.
- [ ] Manual smoke: MCP server starts.

## Approval
Approved and implemented on `sdk-cli-mcp-continuation`.

---

# Hosted MCP Plan

## Objective
Add a hosted MCP option for MinuNotes while keeping `/api/harness/*` as the single source of truth for note/folder permissions and business logic. Local stdio MCP remains available for desktop/local clients.

## Proposed architecture
- Keep SDK as the shared client over `/api/harness/*`.
- Keep local MCP package using stdio transport.
- Add an HTTP MCP transport mounted in the existing Hono API, likely at `/api/mcp`.
- Reuse API-key authentication and scoped folder permissions.
- Do not duplicate note/folder command logic outside existing harness routes/SDK unless required by MCP transport boundaries.

## Files likely to modify/create
- Hosted MCP server/transport:
  - `src/api/index.ts`
  - `src/api/routes/mcp.ts` or `src/api/mcp/*`
  - possibly shared MCP tool definitions extracted from `packages/mcp/src/server.ts`
- MCP package/shared logic:
  - `packages/mcp/src/server.ts`
  - `packages/mcp/src/index.ts`
  - possibly new shared factory files under `packages/mcp/src/*`
  - `packages/mcp/package.json` if transport dependencies/scripts change
- Auth/client glue:
  - `src/api/middleware/authentication.ts` if API-key extraction needs reuse
  - `src/api/lib/api-keys.ts` if hosted MCP needs direct API-key validation helpers
  - `packages/sdk/src/client.ts` only if hosted MCP should call local in-process harness helpers instead of HTTP
- Tests:
  - new or updated MCP route tests under `tests/*`
  - package MCP tests under `packages/mcp/tests/*`
- Docs:
  - `packages/mcp/README.md`
  - `docs/guides/using-minunotes-with-agents.md`
  - `docs/skills/minunotes-harness/SKILL.md` if endpoint guidance changes

## Implementation checklist
- [x] Confirm hosted MCP endpoint path and transport (`/api/mcp`, streamable HTTP if supported by current MCP SDK).
- [x] Inspect MCP SDK server HTTP transport APIs and examples.
- [x] Decide auth model for hosted MCP v1: API key header only, no OAuth yet.
- [x] Extract/reuse MCP tool registration so local stdio and hosted HTTP use the same tools.
- [x] Add hosted Hono route for MCP transport.
- [x] Ensure hosted MCP requests run with the caller's API key and preserve scoped folder permissions.
- [x] Add tests for MCP endpoint auth failure and at least one successful tool/list interaction if practical.
- [x] Update docs for local vs hosted MCP usage.
- [x] Keep local `notes-mcp` working unchanged.

## Verification
- [x] `pnpm typecheck`.
- [x] `pnpm test`.
- [x] `pnpm build`.
- [x] `pnpm --filter @minunotes/mcp test`.
- [ ] Manual smoke: local stdio MCP still starts.
- [x] Manual smoke: hosted MCP endpoint responds with valid MCP transport behavior via automated initialize test.

## Approval
Approved and implemented on `sdk-cli-mcp-continuation`.
