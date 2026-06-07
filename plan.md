# Note Templates Design Plan

## Objective
Add user-created note templates using the existing note editor and markdown model.

## Core decision
Use a hybrid Obsidian/Notion model:

```ts
type: "note" | "template"
```

Templates are normal markdown notes with different list/create behavior, not a separate content model.

- Obsidian-style: templates are authored/managed in a dedicated Templates area.
- Notion-style future direction: templates can optionally be scoped/available to a folder context.
- First pass: templates are globally available; folder-scoped availability is reserved for later.

## Goals
- Users can create and edit templates themselves.
- Templates use the same editor experience as notes.
- Normal note lists exclude templates.
- A Templates area lists only templates.
- Users can create a normal note from a template.
- Keep the model agent/API friendly.

## Non-goals for first pass
- Built-in templates.
- Public template marketplace/library.
- Folder-scoped template availability.
- Folder default templates.
- Advanced variable prompting UI.
- Template versioning.
- Drag/drop folder tree changes.

## Data model
### Files likely to modify
- `src/api/db/schema.ts`
- new migration generated under `src/api/db/migrations/`
- API note validation/types as needed

### Proposed schema change
Add `type` column to notes:

```ts
type: text("type", { enum: ["note", "template"] }).notNull().default("note")
```

Default all existing notes to `note`.

### Future template scoping fields
Reserve for later if we want Notion-like folder/context templates:

```ts
templateScope: "global" | "folder"
templateFolderId: string | null
```

First pass does not need these fields unless we decide to implement folder-scoped availability immediately.

## API design
### Files likely to modify
- `src/api/routes/notes.ts`
- `src/api/harness/commands.ts`
- `src/frontend/lib/api.ts`

### Behavior
- Existing note list endpoints default to `type=note`.
- Add query support for `type=template`.
- Create note accepts optional `type`, default `note`.
- Update note may allow changing type only if we want “convert to template”; defer if unnecessary.
- Harness/API should expose type so agents can create/search templates.

## Frontend UX
### Files likely to modify/create
- `src/frontend/components/app-shell.tsx`
- `src/frontend/components/folder-sidebar.tsx`
- `src/frontend/components/notes-table.tsx`
- `src/frontend/components/note-editor.tsx` if labels/actions need template context
- `src/frontend/routes/templates.tsx` or equivalent route file
- `src/frontend/routes/notes.$noteId.tsx`
- `src/frontend/routes/index.tsx`
- `src/frontend/routes/folders.$folderId.tsx`
- possibly `src/frontend/components/template-picker-dialog.tsx`

### Templates area
- Add sidebar nav item: Templates.
- Templates route lists `type=template` notes.
- Primary action: New template.
- Template rows/cards open the same editor.
- Editor can display subtle label/status: Template.
- This acts like an Obsidian templates folder/management area without requiring a physical folder yet.

### New from template
Options:
1. Add dropdown next to New Note: Blank / From template.
2. Add separate “New from template” action in notes list empty state/header.

First-pass recommendation:
- Keep existing New Note button.
- Add a small adjacent action or menu item “From template”.
- Opens template picker dialog.
- Selecting a template creates a normal note copied from template title/content.

## Template copy behavior
- New note type is always `note`.
- Content copied from template content.
- If creating from a folder context, the new note goes into the destination/current folder.
- Template storage/management location does not determine destination.
- First pass templates are globally available.

## Variables
### First pass variables
Support simple replacements when creating from template:

```txt
{{title}}
{{date}}
{{time}}
{{datetime}}
```

### Open question
Should creation prompt for title before variable replacement?

Recommendation:
- First pass: ask for title in picker/create dialog.
- Use title for note title and `{{title}}` replacement.

## Verification
- [x] Generate and inspect migration.
- [x] `pnpm typecheck`.
- [x] `pnpm test`.
- [x] `pnpm build`.
- [ ] Manual: existing notes still list normally.
- [ ] Manual: templates do not appear in normal notes list.
- [ ] Manual: create/edit template.
- [ ] Manual: create note from template.
- [ ] Manual mobile: templates list and picker/page usable.
- [ ] Manual: folder template assignment page works.
- [ ] Manual: create-from-template page only shows folder-assigned templates.
- [x] Manual/local migration: `0011_dazzling_squadron_sinister` applied.
- [ ] Manual: agent/API cannot edit templates.
- [ ] API smoke: create/list template via API if exposed.

## Implementation phases
### Phase 1: Schema/API foundation
- [x] Add `type` to notes.
- [x] Migrate existing rows to `note` default.
- [x] Update API types/list/create.
- [x] Verify tests/build.

### Phase 2: Templates list/editor UX
- [x] Add Templates sidebar/nav route.
- [x] List templates.
- [x] New template action.
- [x] Reuse editor.

### Phase 3: Create from template
- [x] Add picker dialog.
- [x] Add variable replacement.
- [x] Create normal note from selected template.

### Phase 4: Global templates + folder assignments
- [x] Add `template_folder_assignments` table.
- [x] Add assignment migration.
- [x] Add API endpoints:
  - [x] `GET /notes/templates` — fast global template list.
  - [x] `GET /folders/:folderId/templates` — templates assigned to a folder.
  - [x] `PUT /notes/templates/:templateId/folders` — replace folder assignments.
- [x] Block agent/API edits to templates by default.
- [x] Replace N+1 frontend template loading with global/assigned endpoints.
- [x] Replace create-from-template modal with a dedicated route/page.
- [x] Add folder template settings page:
  - [x] route `/folders/:folderId/templates`.
  - [x] show assigned templates.
  - [x] add/remove assignments.
- [x] Create-from-template page should show:
  - [x] destination folder name.
  - [x] templates assigned to that folder.
  - [x] empty state with link to template settings/templates page.
  - [x] title field without auto-filling from template unless explicitly selected/entered.
- [ ] Add template search/filter on Templates page if lightweight.

### Phase 5: Folder settings/action UX
- [x] Update folder cog popover actions:
  - [x] Settings
  - [x] Rename
  - [x] Move (deferred/disabled until folder tree/subfolders exists)
  - [x] Template settings
  - [x] API Access
  - [x] Delete
- [x] Add folder settings route/page `/folders/:folderId/settings`.
- [x] Folder settings page should include:
  - [x] Folder title/rename action.
  - [x] Template availability settings.
  - [x] API access settings.
  - [x] Delete folder action.
  - [x] Move folder action placeholder/disabled until hierarchy support.
- [x] Link existing `/folders/:folderId/templates` behavior into settings via redirect.
- [x] Remove clutter from folder header by moving Template settings into folder settings/cog.

## Approval
Approved and implementation started on `note-templates-design`.
