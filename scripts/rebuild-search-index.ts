import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    const value = line
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    process.env[key] ??= value;
  }
}

const environment = process.env.ENVIRONMENT ?? 'local';
loadEnvFile('.env');
loadEnvFile(`.env.${environment}`);
loadEnvFile('.env.local');

const url = process.env.TURSO_DB_URL ?? process.env.LIBSQL_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;
const remote = !url.startsWith('file:');
const verifyOnly = process.argv.includes('--verify-only');
if (remote && !verifyOnly && !process.argv.includes('--yes'))
  throw new Error('Rebuilding a remote search index requires --yes');

const client = createClient({ url, authToken });

const backfillSql = `INSERT INTO note_search_fts (rowid, title, body)
SELECT
  search_document.id,
  note.title,
  CASE
    WHEN note.document_type = 'markdown' THEN note.content
    WHEN json_valid(note.content) THEN trim(
      coalesce((
        SELECT group_concat(trim(
          coalesce(cast(json_extract(node.value, '$.text') AS text), '') || ' ' ||
          coalesce(cast(json_extract(node.value, '$.label') AS text), '')
        ), ' ')
        FROM json_each(note.content, '$.nodes') AS node
      ), '') || ' ' ||
      coalesce((
        SELECT group_concat(trim(coalesce(cast(json_extract(edge.value, '$.label') AS text), '')), ' ')
        FROM json_each(note.content, '$.edges') AS edge
      ), '')
    )
    ELSE ''
  END
FROM notes AS note
INNER JOIN note_search_documents AS search_document ON search_document.note_id = note.id`;

async function counts() {
  const result = await client.execute(`SELECT
    (SELECT count(*) FROM notes) AS notes,
    (SELECT count(*) FROM note_search_documents) AS mappings,
    (SELECT count(*) FROM note_search_fts) AS indexed`);
  const row = result.rows[0];
  return {
    notes: Number(row?.notes ?? 0),
    mappings: Number(row?.mappings ?? 0),
    indexed: Number(row?.indexed ?? 0),
  };
}

try {
  const existing = await counts();
  console.log(`Search index ${verifyOnly ? 'verification' : 'rebuild'}`);
  console.log(`Environment: ${environment}`);
  console.log(`Target: ${remote ? 'configured remote database' : 'local database'}`);
  console.log(`Before: ${JSON.stringify(existing)}`);

  if (!verifyOnly) {
    await client.batch(
      [
        { sql: 'DELETE FROM note_search_fts', args: [] },
        { sql: 'DELETE FROM note_search_documents', args: [] },
        { sql: 'INSERT INTO note_search_documents (note_id) SELECT id FROM notes ORDER BY id', args: [] },
        { sql: backfillSql, args: [] },
      ],
      'write'
    );
  }

  const final = await counts();
  console.log(`After: ${JSON.stringify(final)}`);
  if (final.notes !== final.mappings || final.notes !== final.indexed)
    throw new Error('Search index counts do not match the notes table');
  await client.execute("INSERT INTO note_search_fts(note_search_fts) VALUES('integrity-check')");
  console.log(verifyOnly ? 'Search index counts and integrity verified.' : 'Search index rebuilt and verified.');
} finally {
  client.close();
}
