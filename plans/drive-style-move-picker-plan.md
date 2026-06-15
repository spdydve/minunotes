# Drive-Style Move Picker Plan

## Goal
Replace the flat folder move picker with a Google Drive-style destination browser that can be reused for both folder moves and note moves.

## UX target
- Open move dialog from folder or note actions.
- Dialog starts at Root.
- Shows only immediate child folders for the current destination.
- Click a folder row to navigate into it.
- Breadcrumbs show current path, e.g. `Root / Projects / Client`.
- Search finds folders by title and allows jumping to a result.
- Primary action: `Move here`.
- Current destination is the folder currently being viewed, or Root.
- Invalid destinations are disabled or blocked with clear messages.

## Scope
- Build a reusable destination picker component.
- Refactor folder move dialog to use it.
- Refactor note move UI if an existing note move dialog exists; otherwise add/use the generic picker where note move is triggered.
- Keep API behavior compatible with current folder and note move endpoints.

## Validation rules
### Folder moves
- Cannot move a folder into itself.
- Cannot move a folder into a descendant.
- Cannot exceed max folder depth of 5 levels.
- Cannot move under an effectively private folder.
- Can move to Root if depth cap remains valid.

### Note moves
- Can move to any user-owned destination folder that is allowed by product rules.
- Current recommendation: allow moving notes into private folders for owner-authenticated UI, because private only blocks agents/integrations.
- No cycle/depth checks needed for notes.

## Files likely to modify/create
- `src/frontend/components/folder-destination-picker.tsx`
  - New reusable Drive-style browser/search picker.
- `src/frontend/components/move-folder-dialog.tsx`
  - Refactor to use destination picker.
- `src/frontend/components/move-note-dialog.tsx`
  - Update/create generic note move flow using destination picker.
- `src/frontend/components/note-actions-popover.tsx`
  - Wire note move action if needed.
- `src/frontend/components/folder-actions-popover.tsx`
  - Keep using `MoveFolderDialog`.
- `src/frontend/lib/api.ts`
  - Reuse existing `moveFolder` and `moveNote` helpers.
- `tests/folders.test.ts`
  - Existing server-side move validation remains relevant.
- Optional frontend/component tests if project has a pattern for them.

## Implementation checklist
- [x] Inspect existing note move UI and action flow.
- [x] Design picker props for folder and note callers.
- [x] Create `FolderDestinationPicker` with:
  - [x] current folder state
  - [x] breadcrumb navigation
  - [x] immediate child folder rows
  - [x] search input/results
  - [x] disabled destination reasons
- [x] Refactor `MoveFolderDialog` to use picker.
- [x] Add or refactor `MoveNoteDialog` to use picker.
- [x] Wire note action popover if needed.
- [x] Ensure query invalidation updates folder/sidebar/note views.
- [x] Run verification.

## Verification
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [ ] Manual smoke: move folder to Root.
- [ ] Manual smoke: move folder into another folder by navigating.
- [ ] Manual smoke: move folder using search result.
- [ ] Manual smoke: invalid folder destinations are blocked.
- [ ] Manual smoke: move note using the same picker.
- [ ] Manual smoke: breadcrumbs navigate correctly.

## Open questions
- Should note moves allow private folders as destinations? Recommended: yes for owner UI.
- Should search select a destination immediately, or jump the browser into that folder? Recommended: jump into the folder so `Move here` remains consistent.
- Should the dialog default to current parent or Root? Recommended: current parent, with breadcrumbs visible.

## Approval
Approved and implemented on `main`.
