# @minunotes/sdk

Typed client for the Notes HTTP API.

```ts
import { NotesClient } from "@minunotes/sdk";

const notes = new NotesClient({
  baseUrl: process.env.NOTES_API_URL!, // e.g. https://api.notes.example.com/api
  apiKey: process.env.NOTES_API_KEY!,
});

const { folders } = await notes.folders.list();
const { notes: folderNotes } = await notes.notes.list(folders[0].id);
```

MVP auth uses API keys via `x-api-key`.
