# Markdown and Editor Guide

MinuNotes uses Markdown with a live editor. You can type plain text, use Markdown syntax directly, or use slash commands for common blocks.

## Basic Markdown

```md
# Heading 1
## Heading 2
### Heading 3

Normal paragraph text.

- Bulleted list
- Another item

1. Numbered list
2. Another item

- [ ] Open task
- [x] Completed task

> Quote

**Bold** and *italic* text

[External link](https://example.com)
```

## Code

Inline code:

```md
Use `pnpm build` to build the app.
```

Code block:

````md
```ts
const message = "hello";
```
````

## Tables

```md
| Name | Status |
| --- | --- |
| Share links | Done |
| OAuth | Planned |
```

## Images

Use the image command or paste/insert Markdown image syntax:

```md
![Alt text](https://example.com/image.png)
```

Uploaded app images use MinuNotes attachment URLs. Keep those URLs unchanged when editing notes manually or with agents.

## Slash commands

Type `/` at the start of an empty line to open the slash command menu.

Common commands include:

- Heading 1
- Heading 2
- Heading 3
- Bulleted List
- Numbered List
- Task List
- Quote
- Code Block
- Table
- Divider
- Image
- Wiki Link

Use arrow keys to select an option and press Enter. You can also keep typing to filter the command list.

## Wikilinks

Use wikilinks to connect notes together:

```md
[[Note Title]]
```

Use a label when you want different visible text:

```md
[[Note Title|visible label]]
```

Typing `[[` opens note suggestions. Selecting a suggestion inserts the link.

Clicking a wikilink opens the target note when MinuNotes can resolve it.

## Duplicate note titles

Wikilinks resolve by note title when there is exactly one matching note. If multiple notes have the same title, the link may stay unresolved. Use clear note names when possible.

## Backlinks

Backlinks are created automatically when one note links to another with:

- `[[wikilinks]]`
- `[[wikilinks|with labels]]`
- internal MinuNotes note URLs

When a note has backlinks, a `Backlinks N` button appears near the top of the note on desktop/tablet. Open it to see notes that reference the current note.

If a note has no backlinks, no backlinks button is shown.

## Tags

Tags are managed from **Note actions → Details**.

Tag names are lowercase words and may use dashes:

```txt
plan
research
release-notes
```

Tags are lightweight labels for organization and search. They are not a custom database/property system.

## Note details

Open **Note actions → Details** to view or edit built-in metadata:

- Name
- Created date
- API editable
- Tags

The Details panel also shows read-only metadata such as folder, type, updated date, and updated-by information.
