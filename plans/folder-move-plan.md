# Folder Move Plan

## Goal
Implement folder move functionality now that folder trees are supported.

## Scope
- Move a folder to another parent folder or to the top level.
- Prevent invalid moves:
  - cannot move a folder into itself
  - cannot move a folder into one of its descendants
  - cannot exceed the max depth of 5 levels
  - cannot move into a private destination if this would violate the current "no subfolders under private folders" creation rule
- Keep existing note move behavior unchanged.

## Files to modify or create
- `src/api/routes/folders.ts`
  - Accept `parentFolderId` in folder `PATCH`.
  - Validate destination, cycle prevention, and max depth.
- `src/frontend/lib/api.ts`
  - Add `moveFolder(folderId, parentFolderId)` helper or extend `updateFolder` typing.
- `src/frontend/components/folder-actions-popover.tsx`
  - Replace disabled `Move` item with dialog trigger.
- `src/frontend/components/move-folder-dialog.tsx`
  - New dialog with folder tree picker and top-level destination.
- `tests/folders.test.ts`
  - Add API tests for successful move and invalid move cases.

## Implementation checklist
- [x] Add server-side folder move validation helpers.
- [x] Update `PATCH /api/folders/:folderId` to support `parentFolderId`.
- [x] Add frontend API helper.
- [x] Build move-folder dialog with indented folder hierarchy.
- [x] Enable `Move` in folder actions popover.
- [x] Invalidate folder queries and navigate appropriately after move.
- [x] Add tests for move success, cycle prevention, depth cap, and invalid/private destinations.
- [x] Run verification.

## Verification
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [ ] Manual smoke: move folder to top level.
- [ ] Manual smoke: move folder under another folder.
- [ ] Manual smoke: invalid descendant/self moves are blocked.
- [ ] Manual smoke: depth cap is enforced.

## Approval
Approved and implemented on `main`.
