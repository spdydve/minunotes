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

---

# MDX Resources Plan

## Objective
Add a `/resources` documentation area backed by MDX so MinuNotes can grow in-app guides, API references, and agent integration docs without cluttering settings or the main notes workspace.

## Proposed UX
- `/resources` is a documentation landing page with cards for major resource areas.
- `/resources/$slug` renders individual MDX docs.
- Add a Resources entry near the settings cog/user email area in the app shell.
- Keep `/settings/api-access` focused on managing keys, but link to it from relevant docs.
- Keep styling consistent with the app: flat dashboard cards, mono/technical typography, light/dark support.

## Initial docs
- `agent-integrations`: overview of harness API, hosted MCP, local MCP, SDK/CLI, OpenAPI.
- `harness-api`: core endpoint usage, auth, permissions, edit safety.
- `openapi`: where to find `/api/openapi.json` and how to use it with Actions/tool importers.
- `mcp`: hosted MCP vs local stdio MCP and endpoint/config examples.
- `sdk-cli`: SDK and CLI setup examples.

## Files likely to modify/create
- MDX/build config:
  - `package.json`
  - `pnpm-lock.yaml`
  - `vite.config.ts`
  - possibly `src/frontend/mdx.d.ts`
- Docs content:
  - `src/frontend/docs/resources/agent-integrations.mdx`
  - `src/frontend/docs/resources/harness-api.mdx`
  - `src/frontend/docs/resources/openapi.mdx`
  - `src/frontend/docs/resources/mcp.mdx`
  - `src/frontend/docs/resources/sdk-cli.mdx`
- Docs registry/components:
  - `src/frontend/docs/resources/index.ts`
  - possibly `src/frontend/components/resource-doc-layout.tsx`
- Routes:
  - `src/frontend/routes/resources.tsx`
  - `src/frontend/routes/resources.$slug.tsx`
  - `src/frontend/routes/__root.tsx` if route registration imports are manual
- Navigation:
  - `src/frontend/components/app-shell.tsx`
  - `src/frontend/components/folder-sidebar.tsx`
- Styles:
  - `src/frontend/styles.css` if MDX/prose styling needs app-specific classes

## Implementation checklist
- [x] Inspect current TanStack route tree/root imports and app-shell user/settings navigation.
- [x] Add MDX support to Vite using `@mdx-js/rollup`.
- [x] Add TypeScript MDX module declaration if needed.
- [x] Create a typed docs registry mapping slugs to MDX components and metadata.
- [x] Create `/resources` landing route.
- [x] Create `/resources/$slug` MDX document route with not-found handling for unknown slugs.
- [x] Create initial MDX docs with concise content and links to current endpoints.
- [x] Add Resources link near the settings cog/user email area.
- [x] Add minimal MDX content styling that works in light/dark themes.
- [x] Avoid duplicating the full OpenAPI spec in MDX; link to `/api/openapi.json`.

## Verification
- [x] `pnpm install` / lockfile refresh.
- [x] `pnpm typecheck`.
- [x] `pnpm test`.
- [x] `pnpm build`.
- [ ] Manual UI smoke: Resources link is reachable from the app shell.
- [ ] Manual UI smoke: `/resources` renders all cards.
- [ ] Manual UI smoke: each initial `/resources/$slug` doc renders.
- [ ] Manual UI smoke: unknown doc slug shows a useful fallback.

## Approval
Approved and implemented on `sdk-cli-mcp-continuation`.

---

# Publishable Package Mirror Plan

## Objective
Keep MinuNotes source of truth in the monorepo while preparing standalone publishable/exportable package artifacts, starting with the local stdio MCP package. This lets users globally install a lightweight package from a separate GitHub repo or npm later without cloning/deploying the full app.

## Proposed architecture
- Monorepo remains source of truth for app/API, hosted MCP, SDK, CLI, and MCP source.
- SST continues to deploy only the web app and Hono API; local package exports are release artifacts only.
- Add scripts that build and stage standalone package contents into an ignored export directory.
- First export target: `@minunotes/mcp` local stdio server.
- The hosted `/api/mcp` route remains part of the app/API deploy and is not exported as a separate service.

## Initial export shape
- Export directory: `dist-packages/minunotes-mcp/` or `.release/minunotes-mcp/`.
- Contents:
  - `package.json` rewritten for standalone install
  - `README.md`
  - `dist/`
  - optional `LICENSE` if present later
- Package bin remains:
  - `notes-mcp -> ./dist/index.js`
- Dependencies should include runtime deps only:
  - `@modelcontextprotocol/sdk`
  - `zod`
- Avoid workspace dependencies in the exported artifact.

## Files likely to modify/create
- Release/export scripts:
  - `scripts/export-mcp-package.ts`
- Package metadata:
  - `packages/mcp/package.json`
  - `packages/mcp/README.md`
- Root scripts/config:
  - `package.json`
  - `.gitignore`
  - possibly `pnpm-lock.yaml` if dependencies/scripts change
- Docs:
  - `src/frontend/docs/resources/mcp.mdx`
  - `src/frontend/docs/resources/sdk-cli.mdx` if install guidance changes
  - possibly `packages/mcp/README.md`
- Tests/verification:
  - optional script test under `tests/*` if practical

## Implementation checklist
- [x] Decide export directory name; recommended `.release/minunotes-mcp/` and gitignored.
- [x] Ensure `packages/mcp` builds cleanly before export.
- [x] Add export script that removes previous export directory and copies package files.
- [x] Rewrite standalone `package.json` without `workspace:*`, private flags, or dev-only fields.
- [x] Include `dist/` and README in exported package.
- [x] Add root script, e.g. `package:mcp` or `export:mcp`.
- [x] Verify exported package can be packed with `npm pack --pack-destination` or inspected with `npm pack --dry-run`.
- [x] Document how to install from a future mirror repo and how to install local tarball.
- [x] Keep package source in monorepo; do not create/push the mirror repo in this step.

## Verification
- [x] `pnpm --filter @minunotes/mcp build`.
- [x] `pnpm export:mcp` or chosen script.
- [x] `npm pack --dry-run` in exported package directory.
- [x] `pnpm typecheck`.
- [x] `pnpm test`.
- [x] `pnpm build`.
- [ ] Optional manual smoke: install exported tarball globally and run `notes-mcp --help` or start stdio server with env vars.

## Approval
Approved and implemented on `sdk-cli-mcp-continuation`.

---

# Simplify Integration Surface Plan

## Status
Approved and implemented after preserving the SDK/CLI experiment on `keep/sdk-cli-wrapper-experiment`.

## Objective
Keep the experimental SDK/CLI work preserved on `keep/sdk-cli-wrapper-experiment`, then simplify the current branch to focus on the four integration surfaces that currently matter most:

- Harness API = real product surface
- OpenAPI = machine-readable wrapper
- Skill docs = agent behavior/safety wrapper
- MCP = optional protocol wrapper

## Branch preservation
- [x] Created `keep/sdk-cli-wrapper-experiment` at the current branch state before removing SDK/CLI packages.

## Files likely to remove
- SDK package:
  - `packages/sdk/package.json`
  - `packages/sdk/README.md`
  - `packages/sdk/tsconfig.json`
  - `packages/sdk/src/*`
  - `packages/sdk/tests/*`
- CLI package:
  - `packages/cli/package.json`
  - `packages/cli/README.md`
  - `packages/cli/tsconfig.json`
  - `packages/cli/src/*`
  - `packages/cli/tests/*`

## Files likely to modify
- Workspace/package config:
  - `pnpm-workspace.yaml` only if package globs need adjustment; likely no change needed
  - `pnpm-lock.yaml`
  - `package.json` only if scripts/deps mention SDK/CLI; likely no direct script removal needed
- MCP package:
  - `packages/mcp/package.json` remove `@minunotes/sdk` dependency
  - `packages/mcp/src/config.ts` replace SDK client creation with a small local harness HTTP client
  - `packages/mcp/src/index.ts` if imports/types change
  - `packages/mcp/tests/config.test.ts` if config/client behavior changes
  - `packages/mcp/README.md` remove SDK dependency language
- Hosted MCP/API:
  - `src/api/routes/mcp.ts` should continue using shared MCP tool registration directly
- Resources/docs:
  - `src/frontend/docs/resources/sdk-cli.mdx` remove or replace with a lighter docs page
  - `src/frontend/docs/resources/index.ts` update registry
  - `src/frontend/docs/resources/agent-integrations.mdx` update integration list
  - `packages/mcp/README.md`
  - `plan.md`

## Implementation checklist
- [x] Remove `packages/sdk` and `packages/cli` from the current branch.
- [x] Keep `packages/mcp` as the optional protocol wrapper.
- [x] Replace local MCP dependency on `@minunotes/sdk` with a small internal harness HTTP client.
- [x] Keep hosted MCP route working with shared tool registration.
- [x] Update package lockfile after dependency removal.
- [x] Update docs/resources to avoid presenting SDK/CLI as primary supported surfaces.
- [x] Keep OpenAPI, harness skill docs, and hosted/local MCP docs intact.

## Verification
- [x] `pnpm install` / lockfile refresh.
- [x] `pnpm --filter @minunotes/mcp typecheck`.
- [x] `pnpm --filter @minunotes/mcp test`.
- [x] `pnpm --filter @minunotes/mcp build`.
- [x] `pnpm typecheck`.
- [x] `pnpm test`.
- [x] `pnpm build`.
- [x] Confirm `packages/sdk` and `packages/cli` no longer exist on current branch.
- [x] Confirm `keep/sdk-cli-wrapper-experiment` preserves the removed SDK/CLI work.

## Approval
Approved and implemented on `sdk-cli-mcp-continuation`.

---

# Subfolders + Agent Access Model Plan

## Objective
Implement subfolders and simplify agent/API access around two durable modes:

- **All**: agents can access all non-private folder branches.
- **Selected**: agents can access selected non-private folder branches.

For MVP, **private folders are never accessible to agents/integrations**. Private status applies to the folder and its descendants. This keeps MinuNotes ergonomic for trusted personal agents while preserving a clear safety boundary for sensitive notes.

## Product decisions
- Keep MinuNotes lightweight; do not add workspaces yet.
- Top-level folders can act like informal project/control-plane boundaries.
- Add bounded folder nesting, max depth 5.
- Access grants are branch-based, not single-folder-only:
  - Selected Folder B grants Folder B and all non-private descendants.
- Private folders are excluded from all agent/integration access:
  - excluded from `All`
  - cannot be selected in `Selected`
  - descendants inherit private exclusion
  - agent-created folders cannot be created under private branches
- API key UX should optimize for the common trusted-agent case:
  - default access mode: `All` non-private folders
  - optional `Selected` mode for narrower keys
- OAuth later should reuse the same access model.

## Existing plans being revised
The existing subfolders docs currently say API permissions are explicit and not inherited. This plan supersedes that for the agent access model:

- old: permission to parent does not grant child access
- new: selected folder grants that non-private folder branch

Docs to update during implementation:
- `docs/implementation/subfolders-prd.md`
- `docs/implementation/subfolders-implementation-plan.md`

## Data model proposal

### `folders`
Add:
- `parentFolderId: string | null`
- `isPrivate: boolean default false`

Notes:
- depth enforced in application logic
- private effective state is computed by walking ancestors
- no private override for descendants in MVP

### `api_keys`
Add:
- `accessMode: "all" | "selected"`, default `all`

Keep:
- `canCreateFolders`

### `api_key_folder_permissions`
Keep rows for selected branch roots, but reinterpret them as branch grants.

Current columns can remain for MVP:
- `canRead`
- `canCreate`
- `canEdit`

Behavior:
- rows apply to the selected folder and non-private descendants
- private branch roots should not be insertable
- private descendants should always be denied even if an ancestor is selected

## Files likely to modify/create

### Database/migrations
- `src/api/db/schema.ts`
- new migration under `drizzle/`
- `drizzle/meta/_journal.json`

### API permissions/core
- `src/api/routes/api-keys.ts`
- `src/api/routes/harness.ts`
- `src/api/routes/folders.ts`
- `src/api/harness/commands.ts`
- possible new helper:
  - `src/api/lib/folder-access.ts`

### API docs/specs
- `src/api/openapi/harness.ts`
- `docs/skills/minunotes-harness/SKILL.md`
- `docs/guides/using-minunotes-with-agents.md`
- `src/frontend/docs/resources/agent-integrations.mdx`
- `src/frontend/docs/resources/harness-api.mdx`
- `src/frontend/docs/resources/mcp.mdx` if needed

### Frontend data/API
- `src/frontend/lib/api.ts`

### Frontend folder UI
- `src/frontend/components/folder-sidebar.tsx`
- `src/frontend/components/create-folder-dialog.tsx`
- `src/frontend/components/folder-actions-popover.tsx`
- `src/frontend/components/rename-folder-dialog.tsx` only if private toggle belongs there
- `src/frontend/routes/folders.$folderId.settings.tsx`

### Frontend note/folder selection UI
- `src/frontend/components/api-key-access-dialog.tsx`
- `src/frontend/components/folder-api-access-dialog.tsx`
- `src/frontend/components/move-note-dialog.tsx`

### Tests
- `tests/api-access.test.ts`
- `tests/harness-folder-access.test.ts`
- new or existing folder route tests, likely `tests/folders.test.ts`
- `tests/mcp-route.test.ts` if hosted MCP assumptions change
- `tests/openapi.test.ts` if spec changes

## Implementation checklist

### Phase 1 — Schema + folder API
- [x] Add `folders.parentFolderId`.
- [x] Add `folders.isPrivate`.
- [x] Add `apiKeys.accessMode` with default `all`.
- [x] Generate migration.
- [x] Update folder create routes to accept optional `parentFolderId`.
- [x] Validate parent ownership and max depth.
- [x] Reject creating below depth 4.
- [x] Update folder list output to include `parentFolderId` and `isPrivate`.
- [x] Update folder patch/settings route to rename and toggle `isPrivate`.
- [x] Block folder deletion if it has child folders.
- [x] Add tests for hierarchy, max depth, private toggle, and deletion blocking.

Verification:
- [ ] `pnpm db:generate`.
- [x] `pnpm typecheck`.
- [x] `pnpm test`.

### Phase 2 — Shared branch/private access helper
- [x] Add helper to load a user's folder tree/ancestors.
- [x] Add helper to compute effective private folders.
- [x] Add helper to answer whether an API key can read/create/edit a folder.
- [x] Implement access mode behavior:
  - [x] `all`: allow non-private folders by capability.
  - [x] `selected`: allow selected branch roots and non-private descendants by per-row capability.
- [x] Ensure private folders always deny agent access.
- [x] Ensure selected private folders cannot be saved as permissions.
- [x] Ensure agent-created folders under allowed non-private parents auto-access correctly.
- [x] Update harness routes to use helper.
- [x] Update search/read/list filters to exclude private folders for agents.
- [x] Add/adjust tests for all-vs-selected and private exclusions.

Verification:
- [x] `pnpm typecheck`.
- [x] `pnpm test`.
- [ ] Manual/API smoke with one `all` key and one `selected` key.

### Phase 3 — Frontend folder tree + private UX
- [x] Build frontend folder tree helper.
- [x] Render sidebar hierarchy with indentation.
- [x] Add “New subfolder” action for depth 0/1 folders.
- [x] Hide/disable subfolder action at depth 4.
- [x] Update create folder dialog to support parent context.
- [x] Show private status in sidebar/settings with subtle lock/private indicator.
- [x] Add private toggle in folder settings with copy: “Private folders are not accessible to agents or integrations.”
- [x] Ensure private descendants visually communicate inherited privacy where practical.

Verification:
- [x] `pnpm typecheck`.
- [ ] Manual: create five folder levels.
- [ ] Manual: confirm no subfolder create below level 5.
- [ ] Manual: toggle private and verify copy/indicator.

### Phase 4 — API key UX: All vs Selected
- [x] Update API key dialog to default to `All` access mode.
- [x] Add access mode selection:
  - [x] All non-private folders
  - [x] Selected folder branches
- [x] Hide folder selector unless `Selected` is chosen.
- [ ] Render selected folder branches in tree form.
- [x] Prevent private folders from being selected.
- [x] Update existing key edit behavior.
- [x] Update folder-specific API access dialog to respect branch grants or de-emphasize if global dialog is primary.
- [x] Update copy to explain private folders and branch access.

Verification:
- [x] `pnpm typecheck`.
- [ ] Manual: create all-access key.
- [ ] Manual: create selected-branch key.
- [ ] Manual/API: selected parent can access child, but not private child.

### Phase 5 — Move dialogs + docs/spec polish
- [ ] Update move note dialog to show indented folder hierarchy.
- [x] Update OpenAPI spec for folder fields and API key access mode if exposed.
- [x] Update resources/docs for private folders and access modes.
- [x] Update skill docs to describe all/selected/private behavior.
- [x] Update existing subfolder PRD/implementation docs to match product decision.

Verification:
- [x] `pnpm typecheck`.
- [x] `pnpm test`.
- [x] `pnpm build`.
- [ ] Manual MCP smoke: all-access key cannot see private notes.
- [ ] Manual MCP smoke: selected branch key can read selected descendant.

## Open questions before implementation
- Should existing API keys migrate to `accessMode = "selected"` to preserve current exact permissions, or `all` to match new default?
  - recommended: existing keys should become `selected` if they have permissions, preserving behavior as much as possible.
  - existing keys with no permissions should become `all` only if this is acceptable; safer default is `selected` with no access.
- Should folder privacy be editable from sidebar action menu, settings page, or both?
  - recommended: settings page first; sidebar can show indicator.
- Should agent-created folders support `parentFolderId` immediately?
  - recommended: yes, but only under non-private branches where the key has create access or when using all-access mode.
- Should users be able to create private folders directly from the create dialog?
  - recommended: not initially; create then mark private in settings.
- Should folder names be unique within a parent?
  - recommended: defer uniqueness; allow duplicates for now.

## Approval
Approved by user and implementation started on `subfolders-agent-access-model`.

---

# Folder Content View Plan

## Objective
Update the folder page to show both child folders and notes in the main content area, similar to Google Drive or S3. When a user opens a folder, they should see immediate subfolders first, then notes/files directly inside that folder.

## Product behavior
- Folder page displays two content types:
  - child folders where `parentFolderId === current folder id`
  - notes directly inside the current folder
- Child folders appear before notes.
- Clicking a child folder navigates into that folder.
- Folder rows/cards should show a folder icon and optional private lock indicator.
- Notes continue opening as they do today.
- Empty state should distinguish between:
  - no subfolders and no notes
  - subfolders exist but no notes
- Top-level sidebar remains unchanged.
- No recursive descendant rollup in the folder page for MVP; only immediate children.

## Files likely to modify/create
- `src/frontend/routes/folders.$folderId.tsx`
  - compute child folders from `api.folders()` response
  - render child folders and notes together or as two sections
- Potential new reusable component:
  - `src/frontend/components/folder-content-list.tsx`
  - or inline in route for first implementation
- Potential updates only if needed:
  - `src/frontend/components/notes-table.tsx`
  - `src/frontend/components/folder-actions-popover.tsx`
  - `src/frontend/styles.css`

## Implementation checklist
- [x] Add child folder derivation in folder route.
- [x] Add folder rows/cards above notes.
- [x] Include folder icon, title, private indicator, and actions menu.
- [x] Navigate to child folder on click.
- [x] Keep existing note table for notes.
- [x] Update empty state copy for no folders/no notes.
- [x] Ensure layout works on mobile and desktop.

## Verification
- [ ] `pnpm typecheck`.
- [ ] `pnpm test`.
- [ ] `pnpm build`.
- [ ] Manual: parent folder with subfolders and notes shows both.
- [ ] Manual: parent folder with only subfolders does not show “No notes yet” as the main message.
- [ ] Manual: clicking child folder navigates correctly.
- [ ] Manual: private child folder shows lock indicator.

## Approval
Approved and implemented on `subfolders-agent-access-model`.
