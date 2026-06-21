# Organizing Notes

MinuNotes is designed around a few lightweight organization tools rather than a database-style property system.

## Folders

Use folders for broad areas of work, projects, or access boundaries. Folder permissions also control what API keys and agents can read or edit.

## Wikilinks and backlinks

Use wikilinks to connect related notes:

```md
[[Project Plan]]
[[Project Plan|the plan]]
```

When a note links to another note, MinuNotes indexes that relationship and shows backlinks on the target note. Backlinks help answer “what references this?” without manually maintaining lists.

## Tags

Tags are lightweight labels for cross-cutting organization. They are useful when a note belongs to more than one category.

Examples:

- `plan`
- `research`
- `oauth`
- `release-notes`

Tag names are normalized to lowercase words with optional dashes. For example, `Release Notes` becomes `release-notes`.

Tags are managed from **Note actions → Details**. Tags are reusable, and unused tags disappear automatically after no notes use them.

## Note details

The Details panel includes built-in metadata:

- Name
- Folder
- Type
- Created date
- Updated date
- Updated by
- API editable
- Tags

This is intentionally not a custom properties/database system. Use note content, folders, links, and tags for organization.

## Agent-friendly graph data

Agents can use the harness API to inspect note relationships:

- Backlinks: notes that reference a note.
- Outgoing links: notes a note references.
- Orphans: notes with no incoming links.
- Tags: lightweight labels for filtering/search.

This lets agents gather context without scraping the UI.
