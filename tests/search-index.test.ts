import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { buildLiteralFtsPrefixQuery } from '../src/api/notes/search';

const tempDirs: string[] = [];

async function migrationSql(index: number) {
  const [file] = await Array.fromAsync(
    (await import('node:fs/promises')).glob(`drizzle/${String(index).padStart(4, '0')}_*.sql`)
  );
  if (!file) throw new Error(`Missing migration ${index}`);
  return readFile(file, 'utf8');
}

async function setupBeforeSearchMigration() {
  const directory = await mkdtemp(path.join(tmpdir(), 'minunotes-search-index-'));
  tempDirs.push(directory);
  const client = createClient({ url: `file:${path.join(directory, 'test.db')}` });
  for (let index = 0; index <= 37; index += 1) await client.executeMultiple(await migrationSql(index));
  await client.executeMultiple(`
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
    VALUES ('search_user', 'Search User', 'search@example.com', 1, 1735689600000, 1735689600000);

    INSERT INTO folders (id, user_id, title, is_private, is_agent_read_only, created_at, updated_at)
    VALUES ('search_folder', 'search_user', 'Search Folder', 0, 0, 1735689600, 1735689600);

    INSERT INTO notes (
      id, folder_id, user_id, title, content, document_type, type, is_api_editable, created_at, updated_at
    ) VALUES
      (
        'markdown_note', 'search_folder', 'search_user', 'Markdown performance',
        'A searchable performance baseline with C++ examples.', 'markdown', 'note', 1, 1735689600, 1735689600
      ),
      (
        'canvas_note', 'search_folder', 'search_user', 'Architecture board',
        '{"nodes":[{"id":"secret_internal_node","type":"text","text":"Visible service map","label":"API boundary","x":420}],"edges":[{"id":"secret_edge","fromNode":"a","toNode":"b","label":"Depends on"}]}',
        'canvas.default', 'note', 1, 1735689600, 1735689600
      );
  `);
  return { client, databasePath: path.join(directory, 'test.db') };
}

async function indexedNoteIds(client: ReturnType<typeof createClient>, query: string) {
  const result = await client.execute({
    sql: `SELECT search_document.note_id
      FROM note_search_fts
      INNER JOIN note_search_documents AS search_document ON search_document.id = note_search_fts.rowid
      WHERE note_search_fts MATCH ?
      ORDER BY search_document.note_id`,
    args: [buildLiteralFtsPrefixQuery(query)],
  });
  return result.rows.map((row) => String(row.note_id));
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('note search FTS index', () => {
  it('constructs literal phrase-prefix queries without exposing FTS operators', () => {
    expect(buildLiteralFtsPrefixQuery('performance')).toBe('"performance"*');
    expect(buildLiteralFtsPrefixQuery('project plan')).toBe('"project plan"*');
    expect(buildLiteralFtsPrefixQuery('say "hello"')).toBe('"say ""hello"""*');
  });

  it('backfills Markdown and visible canvas text without indexing raw canvas metadata', async () => {
    const { client } = await setupBeforeSearchMigration();
    try {
      await client.executeMultiple(await migrationSql(38));

      await expect(indexedNoteIds(client, 'perfor')).resolves.toEqual(['markdown_note']);
      await expect(indexedNoteIds(client, 'C++')).resolves.toEqual(['markdown_note']);
      await expect(indexedNoteIds(client, 'service map')).resolves.toEqual(['canvas_note']);
      await expect(indexedNoteIds(client, 'API boundary')).resolves.toEqual(['canvas_note']);
      await expect(indexedNoteIds(client, 'depends')).resolves.toEqual(['canvas_note']);
      await expect(indexedNoteIds(client, 'secret_internal_node')).resolves.toEqual([]);
      await expect(indexedNoteIds(client, 'nodes')).resolves.toEqual([]);
    } finally {
      client.close();
    }
  });

  it('synchronizes inserts, updates, document-type changes, and permanent deletion', async () => {
    const { client } = await setupBeforeSearchMigration();
    try {
      await client.executeMultiple(await migrationSql(38));
      await client.execute(`INSERT INTO notes (
        id, folder_id, user_id, title, content, document_type, type, is_api_editable, created_at, updated_at
      ) VALUES (
        'new_note', 'search_folder', 'search_user', 'Newly indexed', 'Initial lighthouse content',
        'markdown', 'note', 1, 1735689600, 1735689600
      )`);
      await expect(indexedNoteIds(client, 'lighthouse')).resolves.toEqual(['new_note']);

      await client.execute(
        "UPDATE notes SET title = 'Updated title', content = 'Replacement observability text' WHERE id = 'new_note'"
      );
      await expect(indexedNoteIds(client, 'lighthouse')).resolves.toEqual([]);
      await expect(indexedNoteIds(client, 'observability')).resolves.toEqual(['new_note']);
      await expect(indexedNoteIds(client, 'updated title')).resolves.toEqual(['new_note']);

      await client.execute({
        sql: "UPDATE notes SET document_type = 'canvas.default', content = ? WHERE id = 'new_note'",
        args: ['{"nodes":[{"id":"hidden_identifier","text":"Canvas migration target"}],"edges":[]}'],
      });
      await expect(indexedNoteIds(client, 'observability')).resolves.toEqual([]);
      await expect(indexedNoteIds(client, 'migration target')).resolves.toEqual(['new_note']);
      await expect(indexedNoteIds(client, 'hidden_identifier')).resolves.toEqual([]);

      await client.execute("UPDATE notes SET content = '{not valid json' WHERE id = 'new_note'");
      await expect(indexedNoteIds(client, 'migration target')).resolves.toEqual([]);
      await expect(indexedNoteIds(client, 'updated title')).resolves.toEqual(['new_note']);

      await client.execute("DELETE FROM notes WHERE id = 'new_note'");
      await expect(indexedNoteIds(client, 'updated title')).resolves.toEqual([]);
      const mapping = await client.execute("SELECT 1 FROM note_search_documents WHERE note_id = 'new_note'");
      expect(mapping.rows).toEqual([]);
    } finally {
      client.close();
    }
  });

  it('rebuilds and verifies derived index records without touching note content', async () => {
    const { client, databasePath } = await setupBeforeSearchMigration();
    await client.executeMultiple(await migrationSql(38));
    await client.execute(
      "DELETE FROM note_search_fts WHERE rowid = (SELECT id FROM note_search_documents WHERE note_id = 'markdown_note')"
    );
    client.close();

    const rebuild = spawnSync('pnpm', ['exec', 'tsx', 'scripts/rebuild-search-index.ts'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, ENVIRONMENT: 'local', TURSO_DB_URL: `file:${databasePath}` },
    });
    expect(rebuild.status, rebuild.stderr).toBe(0);
    expect(rebuild.stdout).toContain('Search index rebuilt and verified.');

    const verification = createClient({ url: `file:${databasePath}` });
    try {
      await expect(indexedNoteIds(verification, 'performance')).resolves.toEqual(['markdown_note']);
      await expect(indexedNoteIds(verification, 'service map')).resolves.toEqual(['canvas_note']);
    } finally {
      verification.close();
    }
  });
});
