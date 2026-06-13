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
