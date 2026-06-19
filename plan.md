# Plan: note share links

## Goal
Add public, read-only share links for individual notes. A signed-in owner can create, copy, and revoke a share link. Anyone with the unguessable URL can view a minimal read-only page without logging in.

## Confirmed MVP decisions
- Share notes only, not folders.
- Public links are read-only.
- Allow explicit sharing of notes in private folders.
- One active read-only share link per note.
- `POST` returns the existing active link if present; users revoke and recreate to rotate.
- Store only a token hash in the database.
- No expiration UI in MVP; schema may include nullable `expiresAt` for future use.

## Files to modify/create

### Database
- `src/api/db/schema.ts`
  - Add `noteShareLinks` table.
- `drizzle/*`
  - Add migration for share-link table and indexes.

### Backend
- New file: `src/api/lib/share-tokens.ts`
  - Generate raw token.
  - Hash token for storage/lookup.
  - Build public share URL.
- `src/api/routes/notes.ts`
  - Add authenticated note-owner share management endpoints:
    - `GET /api/notes/:noteId/share-link`
    - `POST /api/notes/:noteId/share-link`
    - `DELETE /api/notes/:noteId/share-link`
- New or existing route file for public share resolution:
  - `GET /api/share/:token`
  - Return safe fields only: title, content, updatedAt.
- `src/api/index.ts`
  - Register public share route if a new route file is used.

### Frontend
- `src/frontend/lib/api.ts`
  - Add share-link response types and API helpers.
- New file: `src/frontend/components/note-share-dialog.tsx`
  - Create/copy/revoke link UI.
- `src/frontend/components/note-actions-popover.tsx`
  - Add `Share` action.
- New file: `src/frontend/routes/share.$token.tsx`
  - Minimal public read-only shared note page.
- `src/frontend/router.tsx`
  - Register public share route if needed.

### Tests
- Add API tests under `tests/` for:
  - creating a share link as owner
  - returning existing active link on repeated create
  - unauthenticated public read by token
  - revoked link returns not found/unavailable
  - deleted note link returns not found/unavailable
  - another user cannot manage the share link

## Implementation checklist
- [x] Add DB schema and migration.
- [x] Add token generation/hash helpers.
- [x] Add authenticated share-link management API.
- [x] Add public share resolution API.
- [x] Add frontend API helpers/types.
- [x] Add note share dialog.
- [x] Wire Share action into note actions popover.
- [x] Add public shared note route/page.
- [x] Add tests.
- [x] Run verification.

## Verification
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [ ] Manual: owner can create and copy a share link.
- [ ] Manual: unauthenticated browser can view shared note.
- [ ] Manual: shared page has no edit controls/sidebar/private metadata.
- [ ] Manual: revoked link stops working.
- [ ] Manual: deleted note link stops working.
