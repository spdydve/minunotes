#!/usr/bin/env tsx
/**
 * Seed a test note covering every markdown element the shared view
 * should render. Run with: pnpm tsx scripts/seed-test-render-note.ts
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@libsql/client';

const dbUrl = process.env.TURSO_DB_URL ?? 'file:local.db';
const client = createClient({ url: dbUrl });

const userId = process.env.SEED_USER_ID;
const folderId = process.env.SEED_FOLDER_ID;
if (!userId || !folderId) {
  console.error('Set SEED_USER_ID and SEED_FOLDER_ID env vars first.');
  process.exit(1);
}

const id = `note_${randomBytes(8).toString('hex')}`;
const now = Math.floor(Date.now() / 1000);

const content = `# Render Test Note

A paragraph with **bold**, _italic_, ~~strikethrough~~, and \`inline code\`.
A link to [MinuNotes](https://example.com).

## Headings

### H3
#### H4
##### H5
###### H6

## Lists

### Bulleted

- First item
- Second item
  - Nested item
  - Another nested
- Third item

### Numbered

1. First
2. Second
3. Third

### Task list

- [ ] Open task
- [x] Done task
- [/] In progress
- [ ] Another open

## Quote

> A blockquote with **formatting** and \`code\`.
>
> Multi-paragraph quote.

## Code

Inline \`const x = 1\` and a fenced block:

\`\`\`ts
type User = { id: string; name: string };
const greet = (u: User) => \`hello \${u.name}\`;
\`\`\`

\`\`\`css
.notes-minu-renderer { color: var(--notes-text); }
\`\`\`

## Table

| Column A | Column B | Column C |
| --- | --- | --- |
| one | two | three |
| four | five | six |

## Horizontal rule

Above.

---

Below.

## Wikilinks

Plain wikilink: [[Some Note]]
Aliased wikilink: [[Other Note|Display Label]]
Code-block wikilink should NOT decorate: \`[[Inside Code]]\`

## Image

![alt text](https://placehold.co/600x200)

## Combined paragraph

A line with **bold**, _italic_, \`code\`, ~~strike~~, a [link](https://example.com), and a [[Wiki Target|wiki alias]] all together.
`;

await client.execute({
  sql: `INSERT INTO notes
    (id, folder_id, user_id, title, content, document_type, type, is_api_editable, updated_by_actor_type, updated_by_actor_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
  args: [id, folderId, userId, 'Render Test Note', content, 'markdown', 'note', 1, now, now],
});

console.log(`Created note ${id} in folder ${folderId}`);
client.close();
