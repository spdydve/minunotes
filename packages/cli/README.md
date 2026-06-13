# @minunotes/cli

CLI for MinuNotes harness workflows. Uses `@minunotes/sdk` and API key auth.

```sh
export NOTES_API_URL="https://api.notes.example.com"
export NOTES_API_KEY="ntak_..."

notes folders list
notes folders create "Agent Workspace"
notes notes create --folder <folder-id> --title "Hello" --content ./note.md
notes notes update <note-id> --content ./note.md
notes notes edit <note-id> --old "before" --new "after" --base-hash <hash>
notes notes events <note-id>
notes search "query" --json
```

`notes folders create` requires an API key with folder-creation permission. Created folders are automatically accessible to that same key.

Build locally:

```sh
pnpm --filter @minunotes/cli build
```
