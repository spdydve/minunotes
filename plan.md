# Notes Mobile View Polish Plan

## Objective
Evaluate and improve the Notes app mobile experience while preserving the current desktop sidebar dashboard layout.

## Scope
Focus on responsive layout and usability, not new product features.

## Files likely to modify
- `src/frontend/components/app-shell.tsx`
- `src/frontend/components/folder-sidebar.tsx`
- `src/frontend/components/notes-table.tsx`
- `src/frontend/components/note-editor.tsx`
- `src/frontend/routes/index.tsx`
- `src/frontend/routes/folders.$folderId.tsx`
- `src/frontend/routes/notes.$noteId.tsx`
- `src/frontend/routes/settings.api-access.tsx`
- `src/frontend/components/search-dialog.tsx`
- dialog components as needed:
  - `src/frontend/components/create-folder-dialog.tsx`
  - `src/frontend/components/rename-folder-dialog.tsx`
  - `src/frontend/components/delete-confirm-dialog.tsx`
  - `src/frontend/components/move-note-dialog.tsx`
  - `src/frontend/components/api-key-access-dialog.tsx`
  - `src/frontend/components/folder-api-access-dialog.tsx`
- `src/frontend/styles.css`

## Proposed UX direction
- Desktop keeps current fixed sidebar + scrollable main layout.
- Mobile gets a compact top bar with menu access to folders/settings/search.
- Sidebar becomes a slide-over/drawer on small screens.
- Main content uses smaller horizontal padding on mobile.
- Notes list becomes mobile-friendly cards/stacked rows instead of cramped table columns.
- Note editor header/title/actions wrap cleanly on small screens.
- Editor/table content remains horizontally scrollable where needed.
- Dialogs use full-width mobile panels with safe padding.
- API Access table/grid should collapse to stacked cards on mobile.

## Checklist
- [ ] Audit current mobile layout in app shell, sidebar, notes table, editor, settings, dialogs.
- [x] Add responsive app shell behavior: mobile top bar + sidebar drawer.
- [x] Make folder sidebar usable as a mobile drawer.
- [x] Convert notes list/table to a responsive card layout below `sm`/`md`.
- [x] Improve note editor mobile header/title/action wrapping.
- [x] Ensure editor content and markdown tables do not cause page-wide horizontal overflow.
- [x] Make settings/API access responsive with stacked mobile rows.
- [ ] Make dialogs mobile-safe with viewport padding and max-height scrolling.
- [ ] Verify desktop layout remains unchanged.

## Verification
- [x] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] Manual desktop smoke test:
  - sidebar navigation
  - search
  - create/rename/delete folders
  - note editor
  - API Access settings
- [ ] Manual mobile smoke test at ~375px width:
  - open/close menu drawer
  - navigate folders/settings
  - view notes list
  - edit a note
  - search dialog
  - dialogs fit viewport
  - no full-page horizontal scrolling

## Approval
Waiting for approval before code changes.
