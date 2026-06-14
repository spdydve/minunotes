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
- No workspace-level permission system in the first version.
- No complex drag-and-drop tree management initially.
- No cross-folder rollup views initially.

## Key Decisions
- Store hierarchy with `parentFolderId` on folders.
- Enforce max folder depth in the API.
- API key permissions use simple access modes: all non-private folders or selected non-private folder branches.
- Selected folder access grants that folder and its non-private descendants.
- Clicking a folder shows notes directly inside that folder only.
- Parent folders with child folders cannot be deleted until children are moved/deleted.

## User Stories
- As a user, I can create a top-level project folder.
- As a user, I can create a subfolder under a project.
- As a user, I can create a detail folder under a unit.
- As a user, I cannot create folders below the detail level.
- As a user, I can move notes into any allowed folder level.
- As a user, I can see the folder hierarchy in the sidebar.
- As a user, I can grant API key access to all non-private folders or selected non-private folder branches.
- As a user, I can mark a folder private so agents and integrations cannot access it.

## Permission Behavior
API key access uses two modes:

- **All**: access all non-private folders, including future non-private folders.
- **Selected**: access selected non-private folder branches.

Private folders are never accessible to API keys, MCP, or integrations in the MVP. Private status applies to the folder and its descendants.

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
- Private folders should show a subtle private/lock indicator.
