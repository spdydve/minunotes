# @minunotes/sdk

Typed client for the MinuNotes harness API using API key auth.

```ts
import { NotesClient } from "@minunotes/sdk";

const notes = new NotesClient({
  // Accepts either the API origin or the /api base.
  baseUrl: process.env.NOTES_API_URL!, // e.g. https://api.notes.example.com
  apiKey: process.env.NOTES_API_KEY!,
});

const { folders } = await notes.folders.list();
const created = await notes.folders.create("Agent Workspace");
const note = await notes.notes.create(created.folder.id, {
  title: "Hello",
  content: "Created through the SDK",
});
```

The SDK targets `/api/harness/*`, so access is controlled by API-key folder permissions. Folder creation requires the key's `canCreateFolders` capability; newly-created folders are automatically scoped to that key by the API.

Available workflow groups:

- `folders.list()` / `folders.create()`
- `notes.search()` / `search.notes()`
- `notes.create()` / `notes.get()` / `notes.update()` / `notes.edit()`
- `notes.events()` / `notes.lines()` / `notes.searchLines()` / `notes.searchNoteLines()`
- `notes.outline()` / `notes.section()`
