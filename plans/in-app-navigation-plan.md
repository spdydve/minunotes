# In-app navigation improvement plan

## Goal

Improve MinuNotes wayfinding, route context, mobile navigation, keyboard navigation, and route resilience without changing note/folder authorization or public-share capability boundaries.

## Baseline findings

- Folder and note URLs are stable and deep-linkable through TanStack Router.
- Browser history, auth redirects, unsaved-note blocking, search, backlinks, and shared-folder `?note=` navigation already work.
- The authenticated shell loses folder context on note routes.
- The sidebar has no Home destination, active state, or `aria-current` treatment.
- Markdown, canvas, template, activity, and settings views use inconsistent parent navigation.
- There is no shared breadcrumb or route-aware mobile title.
- Backlinks are hidden on mobile.
- Search lacks dialog semantics, Escape/focus handling, result keyboard navigation, and a global shortcut.
- The router has no global not-found or shared error presentation.
- Current browser tests do not exercise authenticated navigation workflows.

## Constraints

- Keep TanStack Router and React Query.
- Do not introduce a second navigation state that can diverge from the URL.
- Prefer stable structural navigation over fragile `history.back()` assumptions.
- Preserve browser Back/Forward behavior.
- Preserve autosave and unsaved-navigation blocking.
- Preserve public-share navigation and capability boundaries.
- Keep mobile and desktop behavior accessible.
- Do not change APIs unless navigation context cannot be derived from existing note/folder queries.
- Implement and verify one phase at a time.

## Proposed navigation model

Create one application navigation model derived from:

- Current pathname and route parameters
- Existing folder query data
- Existing note query data for `/notes/:noteId` and `/notes/:noteId/activity`

The model will provide:

- Current top-level section
- Active folder ID
- Ancestor folder path
- Current note/template identity
- Breadcrumb items
- Mobile page title
- Structural parent destination

React Query should deduplicate note/folder requests already used by route pages. No authorization decisions belong in the navigation model.

## Phase 1 — Wayfinding and route context

### Files to create

- `src/frontend/lib/navigation.ts`
  - Pure path parsing and breadcrumb/navigation-model construction.
- `src/frontend/components/app-navigation-bar.tsx`
  - Desktop breadcrumbs and route-aware mobile title/parent control.
- `tests/frontend-navigation.test.ts`
  - Pure navigation-model tests.
- `tests/browser/navigation.spec.ts`
  - Authenticated desktop/mobile navigation coverage.

### Files to modify

- `src/frontend/components/app-shell.tsx`
  - Load/deduplicate route navigation context.
  - Render the shared navigation bar.
  - Replace the generic mobile “Notes” heading with route context.
- `src/frontend/components/folder-sidebar.tsx`
  - Make the MinuNotes brand link to Home.
  - Add a visible Home/Recent Notes destination.
  - Add active states and `aria-current`.
  - Keep the active note’s folder ancestors expanded.
  - Represent Templates as active while editing a template.
- `src/frontend/routes/notes.$noteId.tsx`
  - Remove canvas-only parent navigation once the shared structural navigation is present.
  - Keep editor behavior and autosave blocking unchanged.
- `src/frontend/components/note-canvas-editor.tsx`
  - Adjust the optional navigation slot only if the shared bar makes it redundant.
- `src/frontend/styles.css`
  - Add only shared navigation styles not expressible cleanly with existing utilities.
- `tests/browser/fixtures.ts`
  - Extend navigation fixtures only as required.

### Behavior

- Home is always visible and keyboard accessible in the sidebar.
- Folder links show a visible active state and `aria-current="page"` where appropriate.
- Opening a note preserves and displays its folder hierarchy.
- Note, template, activity, folder settings, and template-creation routes have predictable structural breadcrumbs.
- Markdown and canvas notes receive equivalent parent-folder navigation.
- Mobile headers identify the current folder, note, template, or settings page.
- Deep-linked notes still have a safe structural route back to their folder or Templates.

### Verification

- Unit tests for every route category and missing-data fallback.
- Browser test: Home → folder → note → folder.
- Browser test: nested folder → note with expanded ancestors and active state.
- Browser test: template list → template → Templates.
- Browser test: note → activity → note.
- Browser test at mobile viewport for title, parent navigation, and drawer state.
- Confirm autosave still completes before blocked navigation proceeds.

## Phase 2 — Search, backlinks, and overlay navigation

### Files to modify/create

- `src/frontend/components/search-dialog.tsx`
- `src/frontend/components/backlinks-panel.tsx`
- `src/frontend/components/app-shell.tsx`
- `src/frontend/components/ui/dialog.tsx` if an accessible shared dialog primitive is required.
- `package.json` and `pnpm-lock.yaml` only if adopting an approved Radix dialog dependency.
- `tests/browser/navigation.spec.ts`

### Behavior

- Search is available through `Cmd/Ctrl+K` even when the desktop sidebar is collapsed.
- Search has dialog semantics, Escape handling, focus trapping/restoration, and keyboard result selection.
- Empty-query search presents useful recent notes rather than a blank panel.
- Selecting a result closes the dialog and preserves normal browser history.
- Backlinks have a mobile-accessible trigger.
- Backlinks support Escape and focus restoration.

### Verification

- Desktop and mobile browser tests for opening, closing, and restoring focus.
- Keyboard-only search test.
- Folder and note result navigation tests.
- Backlink navigation and mobile-trigger tests.

### Human gate

Approve the dialog dependency or dependency-free accessibility approach before implementation.

## Phase 3 — Route resilience and consistency

### Files to modify

- `src/frontend/router.tsx`
- `src/frontend/routes/__root.tsx`
- `src/frontend/routes/folders.$folderId.templates.tsx`
- `src/frontend/components/folder-actions-popover.tsx`
- Route files that need document-title metadata.
- `tests/browser/navigation.spec.ts`

### Behavior

- Unknown routes render a useful not-found view with Home navigation.
- Route failures use a consistent error view with retry/escape actions.
- Redirect-only routes do not navigate during render.
- Page titles describe folders, notes, templates, settings, resources, and shares.
- “Settings” and “Template settings” no longer appear as duplicate destinations.
- Canvas-note links and wikilinks follow a documented current-tab/new-tab policy.

### Verification

- Unknown-route browser test.
- Route-error browser test where practical.
- Redirect compatibility test.
- Document-title assertions.
- Link-target policy tests.

## Phase 4 — Polish, persistence, and documentation

### Candidate files

- `src/frontend/components/app-shell.tsx`
- `src/frontend/components/folder-sidebar.tsx`
- `src/frontend/components/notes-table.tsx`
- `src/frontend/routes/index.tsx`
- `docs/implementation/in-app-navigation.md`

### Behavior

- Consider persisting desktop collapse and folder expansion preferences locally.
- Add folder context to Recent Notes rows.
- Confirm breadcrumbs truncate and horizontally scroll safely on small screens.
- Document navigation hierarchy, structural parent behavior, keyboard shortcuts, and new-tab policy.

### Verification

- Preference persistence browser test if implemented.
- Small-width and long-title browser tests.
- `git diff --check` and documentation-link check.

## Quality gates for every implementation phase

- `pnpm exec biome check --write <changed-files>`
- `pnpm typecheck` after TypeScript changes.
- Targeted unit and browser tests.
- `pnpm test` after behavior changes.
- `pnpm test:browser` before phase completion.
- `pnpm build` before final completion.
- Remove generated Playwright artifacts.
- Review changed navigation for keyboard access, visible focus, and `aria-current`/dialog semantics.

## Out of scope

- New note/folder authorization rules.
- Public-share capability changes.
- Favorites, pinning, or a new database-backed recents model.
- Full command-palette actions beyond navigation.
- A route-loader migration unrelated to navigation requirements.
- Navigation analytics.

## Approval status

- [x] Navigation audit completed.
- [x] High-level phased direction approved.
- [x] Detailed implementation plan approved.
- [x] Phase 1 implementation started.
- [x] Phase 1 reviewed; user started Phase 2.
- [x] Radix dialog dependency approved for Phase 2.
- [x] Phase 2 implementation started.
- [x] Phase 2 reviewed; user started Phase 3.
- [x] Phase 3 implementation started.
- [x] Phase 3 reviewed; user started Phase 4.
- [x] Phase 4 implementation started.
- [x] Phase 4 reviewed and approved.

## Phase status ledger

- Phase 1 — Complete.
  - Implemented URL-derived navigation models, desktop breadcrumbs, route-aware mobile titles and parent links, Home/sidebar active states, note-folder ancestor expansion, template context, and unified Markdown/canvas structural navigation.
  - Added 7 navigation-model tests and 6 authenticated browser navigation tests, including nested folders, browser history, autosave-blocked navigation, templates, activity, and mobile drawer behavior.
  - Verification: Biome completed with existing unsafe class-order/non-null warnings; typecheck passed; 184/184 unit/integration tests passed; 22/22 browser tests passed; production build passed with the existing large-chunk advisory.
- Phase 2 — Complete.
  - Added a shared Radix dialog primitive and migrated Search and Backlinks to accessible modal overlays with focus trapping, Escape dismissal, and focus restoration.
  - Added global Cmd/Ctrl+K search with a platform-aware shortcut tooltip on the icon-only Search control, recent-note empty-query results, keyboard result selection, result scrolling, folder/note navigation, and mobile-accessible backlink controls.
  - Added 4 browser scenarios covering recent results, collapsed-sidebar shortcuts, keyboard-only note/folder navigation, mobile Search and Backlinks, focus restoration, and browser history.
  - Verification: Biome completed with existing unsafe class-order warnings; typecheck passed; 184/184 unit/integration tests passed; 26/26 browser tests passed; production build passed with the existing large-chunk advisory.
- Phase 3 — Complete.
  - Added global not-found and route-error presentations with retry and Home escape actions, and moved the legacy folder-template redirect into `beforeLoad`.
  - Added descriptive document titles for authenticated, resource, note-activity, note-share, and folder-share routes; removed the duplicate Template settings action.
  - Defined and documented the internal note-link policy: Markdown wikilinks use the current tab while canvas node links preserve canvas context in a new tab.
  - Added policy unit coverage and browser scenarios for unknown routes, redirect compatibility, consolidated settings, and authenticated/shared titles.
  - Verification: Biome completed with existing unsafe class-order/non-null warnings; typecheck passed; 185/185 unit/integration tests passed; 30/30 browser tests passed; production build passed with the existing large-chunk advisory.
- Phase 4 — Complete.
  - Reworked root-folder creation around a Folders section `+` action and an accessible validated dialog; successful root creation opens the folder and closes the mobile drawer, while subfolder creation remains attached to its parent.
  - Persisted desktop sidebar collapse and folder expansion preferences with storage-failure fallbacks, and preserved automatic expansion for the active note's ancestors.
  - Added linked folder context to Recent Notes and made long desktop breadcrumbs truncatable, discoverable, and horizontally scrollable.
  - Expanded and indexed `docs/implementation/in-app-navigation.md` with hierarchy, mobile, keyboard, persistence, resilience, and link-policy behavior.
  - Verification: Biome completed with existing unsafe class-order warnings; typecheck passed; 186/186 unit/integration tests passed; 37/37 browser tests passed; production build passed with the existing large-chunk advisory.
