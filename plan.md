# Plan: note actor display + sidebar accordion

## Goal
Improve navigation and update metadata UX:
- Do not show internal API key IDs in “last updated by” text.
- Prefer public API key UID when showing API edits.
- Replace generic API pills in tables with clearer last-edited metadata.
- Make sidebar folders/subfolders collapsible with accordion behavior.

## UX decisions to confirm
- Note detail header should show: `Last edited via API key <uid>` when the actor is an API key.
- Note/folder tables should avoid a standalone `API` pill and instead show update metadata in the Updated/Last edited area.
- Sidebar should default expand enough to show the current route path, with users able to collapse/expand folder branches.
- Folder expansion can be local UI state for this iteration; no persistence required.

## Files to modify

### API / data shape
- `src/api/harness/commands.ts`
  - Consider whether note reads should include a public actor display field.
- `src/api/routes/notes.ts`
  - For authenticated app note reads/listing, enrich notes with API key public UID for `updatedByActorId` when actor is `agent`.
- `src/api/routes/folders.ts`
  - Folder notes listing may need enriched note metadata.
- `src/api/routes/harness.ts`
  - Harness note responses can continue returning internal actor metadata, or use the same public display field if safe.
- `src/frontend/lib/api.ts`
  - Add optional note metadata, e.g. `updatedByActorUid?: string | null` or `updatedByDisplay?: string | null`.

### Frontend note metadata
- `src/frontend/routes/notes.$noteId.tsx`
  - Replace internal API key ID display with public UID.
- `src/frontend/components/notes-table.tsx`
  - Replace API pill with last-edited metadata using actor type/UID where available.
- `src/frontend/routes/folders.$folderId.tsx`
  - Same metadata treatment for folder contents table/card note rows.

### Sidebar accordion
- `src/frontend/components/folder-sidebar.tsx`
  - Render recursive accordion tree instead of flattened always-expanded rows.
  - Add expand/collapse buttons for folders with children.
  - Auto-expand ancestors for the current folder route.
  - Preserve existing folder actions, private/read-only indicators, and indentation.

## Implementation checklist

### Phase 1 — API actor public UID
- [x] Find all app note list/read responses used by tables/detail views.
- [x] Add API key UID lookup for agent-updated notes.
- [x] Return optional public actor UID/display field without exposing internal key ID in UI.
- [x] Keep backwards compatibility for existing note shape.

### Phase 2 — Note/table metadata UI
- [x] Update note detail “last updated” line to use public UID.
- [x] Remove standalone API pill in `NotesTable`.
- [x] Remove standalone API pill in folder contents table/cards.
- [x] Keep concise table layout.

### Phase 3 — Sidebar accordion
- [x] Convert folder sidebar rendering to recursive tree.
- [x] Add chevron expand/collapse controls for folders with children.
- [x] Auto-expand current folder ancestors.
- [x] Keep Templates and settings section unchanged.
- [x] Verify mobile sidebar behavior still works.

## Verification
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] Manual: note updated by API shows public UID, not internal API key ID.
- [x] Manual: note tables no longer show standalone API pill.
- [x] Manual: sidebar folders can expand/collapse.
- [x] Manual: current folder path is visible after direct navigation/refresh.
