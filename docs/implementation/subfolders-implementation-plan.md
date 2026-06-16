# Subfolders Implementation Plan

## Overview
Implement bounded folder nesting with a maximum folder depth of 5 levels.

Do not perform implementation edits until this plan is approved.

## Files Expected to Modify or Create

### Database
- `src/api/db/schema.ts`
- `drizzle/*` migration file

### API
- `src/api/routes/folders.ts`
- `src/api/routes/notes.ts` if note move/list behavior needs adjustment
- `src/api/routes/api-keys.ts` if permission response shape needs folder hierarchy context
- `src/api/harness/commands.ts` if folder listing/discovery returns folder metadata
- tests as needed:
  - `tests/folders.test.ts` or existing folder route tests
  - `tests/api-access.test.ts`
  - `tests/harness.test.ts`

### Frontend
- `src/frontend/components/folder-sidebar.tsx`
- `src/frontend/components/create-folder-dialog.tsx`
- `src/frontend/components/folder-actions-popover.tsx`
- `src/frontend/components/move-note-dialog.tsx`
- `src/frontend/components/api-key-access-dialog.tsx`
- Central API key settings modal handles folder access
- `src/frontend/lib/api.ts`
- potentially `src/frontend/routes/folders.$folderId.tsx`

## Data Model
Add a nullable parent relation to folders:

```ts
parentFolderId: string | null
```

Recommended constraints/indexes:
- index on `userId`
- index on `parentFolderId`
- optional uniqueness by user + parent + title, if duplicate names should be prevented within the same parent

Depth is enforced in application/API logic, not only DB constraints.

## API Behavior

### Folder creation
Support creating folders with optional `parentFolderId`.

Validation:
- Parent folder must belong to current user.
- Parent folder depth must be 0 through 3.
- Creating below depth 4 is rejected.
- Folder depth is computed from parent chain.

### Folder listing
Return enough data for frontend tree rendering:

```ts
{
  id: string;
  title: string;
  parentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Frontend can build the tree locally from the flat list.

### Folder deletion
Before deleting a folder:
- If child folders exist, reject with a clear error.
- Existing note deletion behavior can remain as-is unless product wants stricter protection.

### Note movement
Move note endpoint should allow moving to any folder level owned by the user.

### API key permissions
Use simple access modes:
- `all`: access all non-private folders.
- `top_level`: access selected project roots and non-private descendants.
- `specific`: access exact selected non-private folders.

Private folders and their descendants are never accessible to API keys, MCP, or integrations in the MVP.

## Frontend Behavior

### Sidebar
- Build a folder tree from flat folders.
- Render max 5 levels.
- Indent child folders.
- Allow selecting any folder level.
- Show folder actions per folder.
- Show “New subfolder” only for depth 0 through 3 folders.

### Create folder dialog
- Existing “New folder” creates a top-level folder.
- Add support for “New subfolder” with a parent folder context.
- Dialog copy should indicate parent folder when applicable.

### Move note dialog
- Display folders as an indented list.
- Allow selecting any folder.

### API access dialogs
- Display folders as an indented list.
- Project-root selection uses top-level folders.
- Specific folder selection uses exact selected folders.
- Show helper text: “Private folders are not accessible to agents or integrations. Read-only folders block broad write access.”

## Phased Checklist

### Phase 1 — Database + API
- [x] Add `parentFolderId` to folder schema.
- [x] Add migration.
- [x] Update folder create route to accept `parentFolderId`.
- [x] Add max-depth validation.
- [x] Update folder delete route to block deletion when children exist.
- [x] Ensure folder list returns parent IDs.
- [ ] Add API tests for creation, max depth, deletion blocking, and ownership checks.

Verification:
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm db:migrate`

### Phase 2 — Sidebar + Folder Creation UX
- [x] Build folder tree helper in frontend or component-local utility.
- [x] Render nested sidebar up to depth 4.
- [x] Add “New subfolder” action for depth 0/1 folders.
- [x] Hide/disable subfolder creation at depth 4.
- [x] Keep top-level “New folder” behavior.

Verification:
- [ ] `pnpm typecheck`
- [ ] Manual: create five folder levels.
- [ ] Manual: verify no create option below level 5.

### Phase 3 — Move Dialog + API Access UX
- [ ] Update move note dialog to show indented folder hierarchy.
- [ ] Update API key access dialog to show indented folder hierarchy.
- [ ] Update folder API access dialog if needed.
- [ ] Add helper copy clarifying explicit permissions.

Verification:
- [ ] `pnpm typecheck`
- [ ] Manual: move notes to each folder level.
- [ ] Manual: grant API key access to specific child folder only.
- [ ] Manual/API: verify parent permission does not grant child access.

### Phase 4 — Polish + Regression
- [ ] Check empty states for folders with no notes but with subfolders.
- [ ] Check sidebar spacing in light/dark themes.
- [ ] Check delete warning/error behavior.
- [ ] Confirm harness folder visibility still respects explicit permissions.

Verification:
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`

## Open Questions
- Should duplicate folder names be allowed under the same parent?
- Should deleting a folder with notes but no subfolders remain destructive, or should it also be blocked?
- Should parent folder views eventually show a count of descendant notes?
- Should API access UI offer a “select descendants” bulk action in the first version?
