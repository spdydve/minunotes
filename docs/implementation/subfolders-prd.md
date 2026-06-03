# Subfolders Product Requirements

## Goal
Add a simple, bounded folder hierarchy for organizing notes without turning Notes into a full filesystem.

## Structure
Folders support a maximum depth of 3 folder levels:

```text
Project        level 0 / top-level folder
└── Unit       level 1 / subfolder
    └── Detail level 2 / subfolder
        └── Notes
```

Notes can live in any folder level.

## Non-goals
- No unlimited folder nesting.
- No path-based folder URLs required.
- No inherited API permissions in the first version.
- No complex drag-and-drop tree management initially.
- No cross-folder rollup views initially.

## Key Decisions
- Store hierarchy with `parentFolderId` on folders.
- Enforce max folder depth in the API.
- Keep API key permissions explicit per folder.
- Parent folder access does not grant child folder access.
- Clicking a folder shows notes directly inside that folder only.
- Parent folders with child folders cannot be deleted until children are moved/deleted.

## User Stories
- As a user, I can create a top-level project folder.
- As a user, I can create a subfolder under a project.
- As a user, I can create a detail folder under a unit.
- As a user, I cannot create folders below the detail level.
- As a user, I can move notes into any allowed folder level.
- As a user, I can see the folder hierarchy in the sidebar.
- As a user, I can grant API key access to specific folders/subfolders.

## Permission Behavior
API key folder permissions remain explicit:

- Permission to Project does not imply Unit or Detail access.
- Permission to Unit does not imply Detail access.
- Permission to Detail grants only that Detail folder.

Future optional enhancement:
- Add a bulk action like “Grant selected folder and descendants.”
- Do not add implicit inheritance unless there is a strong product need.

## Delete Behavior
Initial recommendation:

- Folder with notes: existing delete confirmation behavior can remain.
- Folder with child folders: block deletion and tell the user to move/delete subfolders first.

This avoids accidental deletion of nested structures.

## UX Notes
- Sidebar should indent by level.
- Show “New subfolder” only when folder depth is less than 2.
- Hide or disable “New subfolder” at level 2.
- Move dialogs and API access dialogs should show folders with indentation.
