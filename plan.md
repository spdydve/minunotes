# Per-Folder Integration Permission UX Plan

## Status

**Implemented and verified.**

## Product decision

Keep the backend’s connection-level capability ceiling as a security invariant, but stop exposing it as a prerequisite when configuring restricted API-key scopes.

For `specific` and `top_level` API-key scopes:

- Folder rules become the user-facing source of truth.
- A permission may be enabled on one folder without visibly enabling it on every folder.
- The top permission controls act as bulk “all selected folders” controls.
- Connection-level capabilities are derived as the union required by the selected folder rules when saving. This preserves the backend ceiling without requiring users to manage it separately.
- Comment continues to require Read on the same folder.

For `all` scope, global permissions remain the default/maximum permissions, with optional folder restrictions.

Permission order becomes: **Read → Create → Comment → Edit**, placing the broadest write permission last.

## Changes

- [x] Extract helpers for restricted-scope permission derivation and bulk/individual updates.
  - Modify `src/frontend/components/api-key-access-dialog.tsx`.
- [x] In `specific` and `top_level` modes, make individual folder permissions directly selectable without a global prerequisite.
- [x] Make top permission checkboxes bulk controls for all selected folders, including mixed-state handling.
- [x] Derive submitted connection capabilities from selected folder rules while preserving Comment → Read dependency.
- [x] Keep existing `all`-scope ceiling and restriction behavior unchanged.
- [x] Reorder permission controls to Read, Create, Comment, Edit in API-key and OAuth permission UIs.
  - Modify `src/frontend/components/api-key-access-dialog.tsx`.
  - Modify `src/frontend/routes/oauth.authorize.tsx`.
- [x] Update explanatory UI copy so “global maximum” is shown only where it is actually user-managed.
- [x] Update architecture/product documentation to distinguish the persisted security ceiling from restricted-scope UI behavior.
  - Modify `docs/guides/using-minunotes-with-agents.md`.
  - Modify relevant skill documentation if the external contract needs clarification.
- [x] Add regression coverage for individual, bulk, mixed, and derived-ceiling behavior.
  - Modify `tests/frontend-api-key-access.test.ts`.
  - Modify `tests/browser/navigation.spec.ts`.
  - Run relevant API-key authorization tests to confirm the backend ceiling remains enforced.

## Verification

- [x] `pnpm exec biome check --write <changed-files>`
- [x] `pnpm typecheck`
- [x] `pnpm exec vitest run tests/frontend-api-key-access.test.ts tests/api-key-permissions.test.ts tests/integration-authorization.test.ts`
- [x] `pnpm exec playwright test tests/browser/navigation.spec.ts -g 'API key folders'`
