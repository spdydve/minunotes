import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Hono } from 'hono';

const LATEST_MIGRATION = 39;
const DEFAULT_SIZES = [100, 1_000, 10_000];
const DEFAULT_ITERATIONS = 7;
const DEFAULT_CONTENT_BYTES = 2_048;
const ACTOR_ID = 'user_search_benchmark';
const SHARED_OWNER_ID = 'user_search_benchmark_shared';
const OWNED_FOLDER_ID = 'folder_search_benchmark_owned';
const SHARED_FOLDER_ID = 'folder_search_benchmark_shared';

function integerArgument(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) throw new Error(`--${name} must be a positive integer`);
  return value;
}

function sizesArgument() {
  const raw = process.argv.find((argument) => argument.startsWith('--sizes='))?.slice('--sizes='.length);
  if (!raw) return DEFAULT_SIZES;
  const sizes = raw.split(',').map((value) => Number.parseInt(value.trim(), 10));
  if (sizes.length === 0 || sizes.some((value) => !Number.isFinite(value) || value < 1))
    throw new Error('--sizes must be a comma-separated list of positive integers');
  return [...new Set(sizes)].sort((left, right) => left - right);
}

function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function noteContent(index: number, targetBytes: number) {
  const unique = `raretoken${String(index).padStart(6, '0')}`;
  const prefix = `commonterm project knowledge base\n${unique}\n`;
  const filler = 'MinuNotes benchmark content for deterministic full body search. ';
  if (prefix.length >= targetBytes) return prefix;
  return `${prefix}${filler.repeat(Math.ceil((targetBytes - prefix.length) / filler.length))}`.slice(0, targetBytes);
}

async function applyMigrations(client: { executeMultiple: (sql: string) => Promise<unknown> }) {
  for (let index = 0; index <= LATEST_MIGRATION; index += 1) {
    const [file] = await Array.fromAsync(
      (await import('node:fs/promises')).glob(`drizzle/${String(index).padStart(4, '0')}_*.sql`)
    );
    if (!file) throw new Error(`Missing migration ${index}`);
    await client.executeMultiple(await readFile(file, 'utf8'));
  }
}

async function seedPrincipals(client: { executeMultiple: (sql: string) => Promise<unknown> }) {
  await client.executeMultiple(`
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES
      ('${ACTOR_ID}', 'Search Benchmark', 'search-benchmark@example.com', 1, 1735689600000, 1735689600000),
      ('${SHARED_OWNER_ID}', 'Shared Search Benchmark', 'shared-search-benchmark@example.com', 1, 1735689600000, 1735689600000);

    INSERT INTO folders (
      id, user_id, title, is_private, is_agent_read_only, created_at, updated_at
    ) VALUES
      ('${OWNED_FOLDER_ID}', '${ACTOR_ID}', 'Owned benchmark folder', 0, 0, 1735689600, 1735689600),
      ('${SHARED_FOLDER_ID}', '${SHARED_OWNER_ID}', 'Shared benchmark folder', 0, 0, 1735689600, 1735689600);

    INSERT INTO collaboration_grants (
      id, owner_user_id, grantee_user_id, folder_id, role, created_by_user_id, created_at, updated_at
    ) VALUES (
      'grant_search_benchmark_shared', '${SHARED_OWNER_ID}', '${ACTOR_ID}', '${SHARED_FOLDER_ID}',
      'viewer', '${SHARED_OWNER_ID}', 1735689600, 1735689600
    );
  `);
}

type SqlClient = {
  batch: (statements: Array<{ sql: string; args: Array<string | number> }>, mode?: 'write') => Promise<unknown>;
  execute: (statement: string | { sql: string; args?: Array<string | number> }) => Promise<{ rows: unknown[] }>;
};

async function seedNotes(client: SqlClient, from: number, to: number, contentBytes: number) {
  const batchSize = 250;
  for (let start = from; start < to; start += batchSize) {
    const statements: Array<{ sql: string; args: Array<string | number> }> = [];
    for (let index = start; index < Math.min(start + batchSize, to); index += 1) {
      const shared = index % 5 === 0;
      const padded = String(index).padStart(6, '0');
      statements.push({
        sql: `INSERT INTO notes (
          id, folder_id, user_id, title, content, document_type, type, is_api_editable, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'markdown', 'note', 1, ?, ?)`,
        args: [
          `note_search_benchmark_${padded}`,
          shared ? SHARED_FOLDER_ID : OWNED_FOLDER_ID,
          shared ? SHARED_OWNER_ID : ACTOR_ID,
          index === 1 ? 'Exact benchmark target' : `Project benchmark note ${padded}`,
          noteContent(index, contentBytes),
          1735689600 + index,
          1735689600 + index,
        ],
      });
    }
    await client.batch(statements, 'write');
  }
}

type Counter = { calls: number };

function instrumentClient(client: SqlClient, counter: Counter) {
  const mutable = client as SqlClient & Record<string, unknown>;
  const execute = client.execute.bind(client);
  const batch = client.batch.bind(client);
  mutable.execute = (async (...args: Parameters<SqlClient['execute']>) => {
    counter.calls += 1;
    return execute(...args);
  }) as SqlClient['execute'];
  mutable.batch = (async (...args: Parameters<SqlClient['batch']>) => {
    counter.calls += 1;
    return batch(...args);
  }) as SqlClient['batch'];
}

type SearchCase = { name: string; query: string; scope: 'mine' | 'all' };
type LineSearchCase = { name: string; query: string; limit: number };
type LineSearchRunner = typeof import('../src/api/harness/commands').searchAllDocumentLines;

async function measureSearch(app: Hono, counter: Counter, searchCase: SearchCase, iterations: number) {
  const requestPath = `/notes/search?q=${encodeURIComponent(searchCase.query)}&scope=${searchCase.scope}&limit=20`;
  const samples: Array<{ milliseconds: number; calls: number; bytes: number; results: number }> = [];

  for (let iteration = 0; iteration <= iterations; iteration += 1) {
    counter.calls = 0;
    const startedAt = performance.now();
    const response = await app.request(requestPath);
    const body = await response.text();
    const milliseconds = performance.now() - startedAt;
    if (!response.ok) throw new Error(`${searchCase.name} returned ${response.status}: ${body}`);
    const parsed = JSON.parse(body) as { notes?: unknown[] };
    const sample = {
      milliseconds,
      calls: counter.calls,
      bytes: Buffer.byteLength(body),
      results: parsed.notes?.length ?? 0,
    };
    if (iteration === 0) samples.push(sample);
    else samples.push(sample);
  }

  const first = samples[0];
  const warm = samples.slice(1);
  return {
    case: searchCase.name,
    scope: searchCase.scope,
    query: searchCase.query,
    firstMs: Number(first.milliseconds.toFixed(2)),
    warmMedianMs: Number(
      percentile(
        warm.map((sample) => sample.milliseconds),
        0.5
      ).toFixed(2)
    ),
    warmP95Ms: Number(
      percentile(
        warm.map((sample) => sample.milliseconds),
        0.95
      ).toFixed(2)
    ),
    databaseCalls: Math.max(...samples.map((sample) => sample.calls)),
    responseBytes: Math.max(...samples.map((sample) => sample.bytes)),
    results: Math.max(...samples.map((sample) => sample.results)),
  };
}

async function measureLineSearch(
  searchLines: LineSearchRunner,
  counter: Counter,
  searchCase: LineSearchCase,
  iterations: number
) {
  const samples: Array<{ milliseconds: number; calls: number; matches: number }> = [];
  for (let iteration = 0; iteration <= iterations; iteration += 1) {
    counter.calls = 0;
    const startedAt = performance.now();
    const result = await searchLines({
      userId: ACTOR_ID,
      query: searchCase.query,
      limit: searchCase.limit,
    });
    const milliseconds = performance.now() - startedAt;
    if (!result.ok) throw new Error(`${searchCase.name} failed`);
    samples.push({ milliseconds, calls: counter.calls, matches: result.value.matches.length });
  }
  const first = samples[0];
  const warm = samples.slice(1);
  return {
    case: searchCase.name,
    query: searchCase.query,
    firstMs: Number(first.milliseconds.toFixed(2)),
    warmMedianMs: Number(
      percentile(
        warm.map((sample) => sample.milliseconds),
        0.5
      ).toFixed(2)
    ),
    warmP95Ms: Number(
      percentile(
        warm.map((sample) => sample.milliseconds),
        0.95
      ).toFixed(2)
    ),
    databaseCalls: Math.max(...samples.map((sample) => sample.calls)),
    matches: Math.max(...samples.map((sample) => sample.matches)),
  };
}

async function explainCurrentOwnedSearch(client: SqlClient) {
  const result = await client.execute({
    sql: `EXPLAIN QUERY PLAN
      SELECT notes.id,
        CASE
          WHEN lower(notes.title) = lower(?) THEN 0
          WHEN lower(notes.title) LIKE lower(?) THEN 1
          WHEN lower(notes.title) LIKE lower(?) THEN 2
          WHEN EXISTS (
            SELECT 1 FROM note_tags
            INNER JOIN tags ON tags.id = note_tags.tag_id
            WHERE note_tags.note_id = notes.id
              AND note_tags.user_id = notes.user_id
              AND lower(tags.name) LIKE lower(?)
          ) THEN 3
          WHEN folders.title LIKE ? THEN 4
          ELSE 5
        END AS search_rank
      FROM notes
      INNER JOIN folders ON notes.folder_id = folders.id AND folders.user_id = notes.user_id
      WHERE notes.user_id = ?
        AND notes.deleted_at IS NULL
        AND notes.type = 'note'
        AND EXISTS (
          WITH RECURSIVE folder_path(id, parent_folder_id, deleted_at) AS (
            SELECT path_folder.id, path_folder.parent_folder_id, path_folder.deleted_at
            FROM folders AS path_folder
            WHERE path_folder.id = notes.folder_id AND path_folder.user_id = ?
            UNION
            SELECT parent.id, parent.parent_folder_id, parent.deleted_at
            FROM folders AS parent
            INNER JOIN folder_path AS child ON parent.id = child.parent_folder_id
            WHERE parent.user_id = ?
          )
          SELECT 1
          WHERE EXISTS (SELECT 1 FROM folder_path WHERE parent_folder_id IS NULL)
            AND NOT EXISTS (SELECT 1 FROM folder_path WHERE deleted_at IS NOT NULL)
        )
        AND (
          notes.title LIKE ?
          OR notes.id IN (
            SELECT indexed_document.note_id
            FROM note_search_fts
            INNER JOIN note_search_documents AS indexed_document ON indexed_document.id = note_search_fts.rowid
            WHERE note_search_fts MATCH ?
          )
          OR folders.title LIKE ?
        )
      ORDER BY search_rank, notes.updated_at DESC, notes.title, notes.id
      LIMIT 21`,
    args: [
      'commonterm',
      'commonterm%',
      '%commonterm%',
      '%commonterm%',
      '%commonterm%',
      ACTOR_ID,
      ACTOR_ID,
      ACTOR_ID,
      '%commonterm%',
      '"commonterm"*',
      '%commonterm%',
    ],
  });
  return result.rows;
}

async function main() {
  const sizes = sizesArgument();
  const iterations = integerArgument('iterations', DEFAULT_ITERATIONS);
  const contentBytes = integerArgument('content-bytes', DEFAULT_CONTENT_BYTES);
  const directory = await mkdtemp(path.join(tmpdir(), 'minunotes-search-benchmark-'));
  process.env.TURSO_DB_URL = `file:${path.join(directory, 'benchmark.db')}`;

  try {
    const [{ libsql }, { noteRoutes }, { searchAllDocumentLines }] = await Promise.all([
      import('../src/api/db/client'),
      import('../src/api/routes/notes'),
      import('../src/api/harness/commands'),
    ]);
    const client = libsql as unknown as SqlClient & { executeMultiple: (sql: string) => Promise<unknown> };
    await applyMigrations(client);
    await seedPrincipals(client);

    const app = new Hono();
    app.use('*', async (context, next) => {
      context.set('user', {
        id: ACTOR_ID,
        name: 'Search Benchmark',
        email: 'search-benchmark@example.com',
        emailVerified: true,
        image: null,
        createdAt: new Date(1735689600000),
        updatedAt: new Date(1735689600000),
      });
      context.set('session', null);
      await next();
    });
    app.route('/notes', noteRoutes);

    const counter = { calls: 0 };
    instrumentClient(client, counter);
    let seeded = 0;
    const reports = [];
    const searchCases: SearchCase[] = [
      { name: 'exact-title-owned', query: 'Exact benchmark target', scope: 'mine' },
      { name: 'prefix-title-owned', query: 'Project benchmark', scope: 'mine' },
      { name: 'rare-body-owned', query: 'raretoken000002', scope: 'mine' },
      { name: 'common-body-owned', query: 'commonterm', scope: 'mine' },
      { name: 'common-body-owned-and-shared', query: 'commonterm', scope: 'all' },
    ];
    const lineSearchCases: LineSearchCase[] = [
      { name: 'line-common-body', query: 'commonterm', limit: 25 },
      { name: 'line-rare-body', query: 'raretoken000002', limit: 25 },
      { name: 'line-title-only', query: 'Project benchmark note', limit: 25 },
    ];

    for (const size of sizes) {
      await seedNotes(client, seeded, size, contentBytes);
      seeded = size;
      await client.execute('PRAGMA optimize');
      const cases = [];
      for (const searchCase of searchCases) {
        await client.execute('PRAGMA shrink_memory');
        cases.push(await measureSearch(app, counter, searchCase, iterations));
      }
      const lineCases = [];
      for (const searchCase of lineSearchCases) {
        await client.execute('PRAGMA shrink_memory');
        lineCases.push(await measureLineSearch(searchAllDocumentLines, counter, searchCase, iterations));
      }
      reports.push({ notes: size, contentBytesPerNote: contentBytes, cases, lineCases });
    }

    counter.calls = 0;
    const queryPlan = await explainCurrentOwnedSearch(client);
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          environment: 'local libSQL temporary database',
          iterations,
          reports,
          queryPlan,
        },
        null,
        2
      )
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

await main();
