import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { type Client, createClient } from '@libsql/client';

const DEFAULT_NOTE_COUNT = 10_000;
const DEFAULT_CONTENT_BYTES = 2_048;
const DEFAULT_ITERATIONS = 10;

function integerArgument(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) throw new Error(`--${name} must be a positive integer`);
  return value;
}

function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function noteContent(index: number, targetBytes: number) {
  const prefix = `commonterm project knowledge base\nraretoken${String(index).padStart(6, '0')}\nC++ quoted phrase\n`;
  const filler = 'MinuNotes deterministic full text search prototype content. ';
  return `${prefix}${filler.repeat(Math.ceil(Math.max(0, targetBytes - prefix.length) / filler.length))}`.slice(
    0,
    targetBytes
  );
}

async function seed(client: Client, noteCount: number, contentBytes: number) {
  await client.executeMultiple(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE notes_fts_unicode USING fts5(
      title,
      body,
      content='',
      tokenize='unicode61'
    );
    CREATE VIRTUAL TABLE notes_fts_trigram USING fts5(
      title,
      body,
      content='',
      tokenize='trigram'
    );
    CREATE VIRTUAL TABLE notes_fts_title_trigram USING fts5(
      title,
      content='',
      tokenize='trigram'
    );
  `);

  const batchSize = 250;
  for (let start = 0; start < noteCount; start += batchSize) {
    const statements = [];
    for (let index = start; index < Math.min(start + batchSize, noteCount); index += 1) {
      statements.push({
        sql: 'INSERT INTO notes (id, title, body) VALUES (?, ?, ?)',
        args: [
          index + 1,
          index === 1 ? 'Exact benchmark target' : `Project benchmark note ${String(index).padStart(6, '0')}`,
          noteContent(index, contentBytes),
        ],
      });
    }
    await client.batch(statements, 'write');
  }

  const startedAt = performance.now();
  await client.execute('INSERT INTO notes_fts_unicode(rowid, title, body) SELECT id, title, body FROM notes');
  const unicodeBuildMs = performance.now() - startedAt;
  const trigramStartedAt = performance.now();
  await client.execute('INSERT INTO notes_fts_trigram(rowid, title, body) SELECT id, title, body FROM notes');
  const trigramBuildMs = performance.now() - trigramStartedAt;
  const titleTrigramStartedAt = performance.now();
  await client.execute('INSERT INTO notes_fts_title_trigram(rowid, title) SELECT id, title FROM notes');
  const titleTrigramBuildMs = performance.now() - titleTrigramStartedAt;
  await client.execute('PRAGMA optimize');
  return { unicodeBuildMs, trigramBuildMs, titleTrigramBuildMs };
}

type PrototypeCase = {
  name: string;
  sql: string;
  args: string[];
};

async function measure(client: Client, testCase: PrototypeCase, iterations: number) {
  const elapsed: number[] = [];
  let results = 0;
  for (let iteration = 0; iteration <= iterations; iteration += 1) {
    const startedAt = performance.now();
    const response = await client.execute({ sql: testCase.sql, args: testCase.args });
    const duration = performance.now() - startedAt;
    results = response.rows.length;
    if (iteration > 0) elapsed.push(duration);
  }
  return {
    case: testCase.name,
    warmMedianMs: Number(percentile(elapsed, 0.5).toFixed(3)),
    warmP95Ms: Number(percentile(elapsed, 0.95).toFixed(3)),
    results,
  };
}

async function storageByObject(client: Client) {
  const result = await client.execute(`
    SELECT
      CASE
        WHEN name LIKE 'notes_fts_unicode%' THEN 'unicode61 index'
        WHEN name LIKE 'notes_fts_title_trigram%' THEN 'title trigram index'
        WHEN name LIKE 'notes_fts_trigram%' THEN 'full trigram index'
        WHEN name = 'notes' THEN 'source notes'
        ELSE 'other'
      END AS object_group,
      SUM(pgsize) AS bytes
    FROM dbstat
    GROUP BY object_group
    ORDER BY object_group
  `);
  return result.rows;
}

async function main() {
  const noteCount = integerArgument('notes', DEFAULT_NOTE_COUNT);
  const contentBytes = integerArgument('content-bytes', DEFAULT_CONTENT_BYTES);
  const iterations = integerArgument('iterations', DEFAULT_ITERATIONS);
  const directory = await mkdtemp(path.join(tmpdir(), 'minunotes-fts-prototype-'));
  const client = createClient({ url: `file:${path.join(directory, 'prototype.db')}` });

  try {
    const version = (await client.execute('SELECT sqlite_version() AS version')).rows[0];
    const modules = (await client.execute("SELECT name FROM pragma_module_list WHERE name LIKE 'fts%' ORDER BY name"))
      .rows;
    const builds = await seed(client, noteCount, contentBytes);
    const cases: PrototypeCase[] = [
      {
        name: 'like-common-body',
        sql: "SELECT id FROM notes WHERE body LIKE '%commonterm%' LIMIT 20",
        args: [],
      },
      {
        name: 'like-rare-body',
        sql: "SELECT id FROM notes WHERE body LIKE '%raretoken009999%' LIMIT 20",
        args: [],
      },
      {
        name: 'unicode-whole-token',
        sql: 'SELECT rowid FROM notes_fts_unicode WHERE notes_fts_unicode MATCH ? LIMIT 20',
        args: ['"commonterm"'],
      },
      {
        name: 'unicode-token-prefix',
        sql: 'SELECT rowid FROM notes_fts_unicode WHERE notes_fts_unicode MATCH ? LIMIT 20',
        args: ['project*'],
      },
      {
        name: 'unicode-infix',
        sql: 'SELECT rowid FROM notes_fts_unicode WHERE notes_fts_unicode MATCH ? LIMIT 20',
        args: ['"ject"'],
      },
      {
        name: 'trigram-common-body',
        sql: 'SELECT rowid FROM notes_fts_trigram WHERE notes_fts_trigram MATCH ? LIMIT 20',
        args: ['"commonterm"'],
      },
      {
        name: 'trigram-rare-body',
        sql: 'SELECT rowid FROM notes_fts_trigram WHERE notes_fts_trigram MATCH ? LIMIT 20',
        args: ['"raretoken009999"'],
      },
      {
        name: 'trigram-infix',
        sql: 'SELECT rowid FROM notes_fts_trigram WHERE notes_fts_trigram MATCH ? LIMIT 20',
        args: ['"ject"'],
      },
      {
        name: 'trigram-two-character',
        sql: 'SELECT rowid FROM notes_fts_trigram WHERE notes_fts_trigram MATCH ? LIMIT 20',
        args: ['"C+"'],
      },
      {
        name: 'trigram-punctuation',
        sql: 'SELECT rowid FROM notes_fts_trigram WHERE notes_fts_trigram MATCH ? LIMIT 20',
        args: ['"C++"'],
      },
      {
        name: 'title-trigram-infix',
        sql: 'SELECT rowid FROM notes_fts_title_trigram WHERE notes_fts_title_trigram MATCH ? LIMIT 20',
        args: ['"ject"'],
      },
    ];
    const measurements = [];
    for (const testCase of cases) measurements.push(await measure(client, testCase, iterations));

    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          engine: { ...version, modules },
          fixture: { noteCount, contentBytes, iterations },
          buildMilliseconds: {
            unicode61: Number(builds.unicodeBuildMs.toFixed(2)),
            fullTrigram: Number(builds.trigramBuildMs.toFixed(2)),
            titleTrigram: Number(builds.titleTrigramBuildMs.toFixed(2)),
          },
          source: (await client.execute('SELECT COUNT(*) AS notes, SUM(length(body)) AS body_bytes FROM notes'))
            .rows[0],
          storage: await storageByObject(client),
          measurements,
        },
        null,
        2
      )
    );
  } finally {
    client.close();
    await rm(directory, { recursive: true, force: true });
  }
}

await main();
