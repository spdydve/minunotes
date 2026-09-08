import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Hono } from 'hono';

const LATEST_MIGRATION = 39;
const DEFAULT_SIZES = [100, 1_000, 10_000];
const DEFAULT_ITERATIONS = 7;
const DEFAULT_LINK_FANOUT = 1_000;
const DEFAULT_CHILD_FOLDERS = 100;
const OWNER_ID = 'user_graph_benchmark_owner';
const COLLABORATOR_ID = 'user_graph_benchmark_collaborator';
const FOLDER_ID = 'folder_graph_benchmark';
const AUTHORIZATION_ID = 'authorization_graph_benchmark';
const API_KEY_ID = 'agent_key_graph_benchmark';
const SOURCE_NOTE_ID = 'note_graph_benchmark_000000';
const BACKLINK_TARGET_ID = 'note_graph_benchmark_000001';

type SqlStatement = string | { sql: string; args?: Array<string | number | null> };
type SqlClient = {
  batch: (statements: Array<{ sql: string; args: Array<string | number | null> }>, mode?: 'write') => Promise<unknown>;
  execute: (statement: SqlStatement) => Promise<{ rows: unknown[] }>;
  executeMultiple: (sql: string) => Promise<unknown>;
};

type Counter = { calls: number };
type Measurement = {
  case: string;
  firstMs: number;
  warmMedianMs: number;
  warmP95Ms: number;
  databaseCalls: number;
  responseBytes: number;
  results: number;
};

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
  if (sizes.length === 0 || sizes.some((value) => !Number.isFinite(value) || value < 2))
    throw new Error('--sizes must contain comma-separated integers of at least 2');
  return [...new Set(sizes)].sort((left, right) => left - right);
}

function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

async function applyMigrations(client: SqlClient) {
  for (let index = 0; index <= LATEST_MIGRATION; index += 1) {
    const [file] = await Array.fromAsync(
      (await import('node:fs/promises')).glob(`drizzle/${String(index).padStart(4, '0')}_*.sql`)
    );
    if (!file) throw new Error(`Missing migration ${index}`);
    await client.executeMultiple(await readFile(file, 'utf8'));
  }
}

async function seedPrincipals(client: SqlClient) {
  await client.executeMultiple(`
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES
      ('${OWNER_ID}', 'Graph Owner', 'graph-owner@example.com', 1, 1735689600000, 1735689600000),
      ('${COLLABORATOR_ID}', 'Graph Collaborator', 'graph-collaborator@example.com', 1, 1735689600000, 1735689600000);

    INSERT INTO folders (
      id, user_id, title, is_private, is_agent_read_only, created_at, updated_at
    ) VALUES ('${FOLDER_ID}', '${OWNER_ID}', 'Graph benchmark', 0, 0, 1735689600, 1735689600);

    INSERT INTO collaboration_grants (
      id, owner_user_id, grantee_user_id, folder_id, role, created_by_user_id, created_at, updated_at
    ) VALUES (
      'grant_graph_benchmark', '${OWNER_ID}', '${COLLABORATOR_ID}', '${FOLDER_ID}',
      'editor', '${OWNER_ID}', 1735689600, 1735689600
    );

    INSERT INTO integration_authorizations (
      id, user_id, access_mode, can_read, can_create, can_edit, can_comment, can_create_folders,
      shared_access_mode, created_at, updated_at
    ) VALUES (
      '${AUTHORIZATION_ID}', '${OWNER_ID}', 'all', 1, 0, 0, 0, 0, 'none', 1735689600, 1735689600
    );

    INSERT INTO api_keys (
      id, user_id, authorization_id, name, uid, hash, salt, created_at, updated_at
    ) VALUES (
      '${API_KEY_ID}', '${OWNER_ID}', '${AUTHORIZATION_ID}', 'Graph benchmark',
      'GRAPHKEY', 'hash', 'salt', 1735689600, 1735689600
    );
  `);
}

async function seedChildFolders(client: SqlClient, count: number) {
  const statements = Array.from({ length: count }, (_, index) => {
    const padded = String(index).padStart(4, '0');
    return {
      sql: `INSERT INTO folders (
        id, user_id, parent_folder_id, title, is_private, is_agent_read_only,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 0, ?, 1735689600, 1735689600)`,
      args: [`folder_graph_child_${padded}`, OWNER_ID, FOLDER_ID, `Graph child ${padded}`, COLLABORATOR_ID],
    };
  });
  for (let start = 0; start < statements.length; start += 250)
    await client.batch(statements.slice(start, start + 250), 'write');
}

async function seedNotes(client: SqlClient, from: number, to: number) {
  const batchSize = 250;
  for (let start = from; start < to; start += batchSize) {
    const statements: Array<{ sql: string; args: Array<string | number | null> }> = [];
    for (let index = start; index < Math.min(start + batchSize, to); index += 1) {
      const padded = String(index).padStart(6, '0');
      statements.push({
        sql: `INSERT INTO notes (
          id, folder_id, user_id, title, content, document_type, type, is_api_editable, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'markdown', 'note', 1, ?, ?)`,
        args: [
          `note_graph_benchmark_${padded}`,
          FOLDER_ID,
          OWNER_ID,
          `Graph note ${padded}`,
          `# Graph note ${padded}`,
          1735689600 + index,
          1735689600 + index,
        ],
      });
    }
    await client.batch(statements, 'write');
  }
}

async function seedLinks(client: SqlClient, noteCount: number, requestedFanout: number) {
  await client.execute('DELETE FROM note_links');
  const fanout = Math.min(noteCount - 1, requestedFanout);
  const batchSize = 250;
  const statements: Array<{ sql: string; args: Array<string | number | null> }> = [];
  for (let index = 1; index <= fanout; index += 1) {
    const padded = String(index).padStart(6, '0');
    const noteId = `note_graph_benchmark_${padded}`;
    statements.push({
      sql: `INSERT INTO note_links (
        id, user_id, source_note_id, target_note_id, target_title, label, link_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, null, 'wikilink', 1735689600, 1735689600)`,
      args: [`link_graph_out_${padded}`, OWNER_ID, SOURCE_NOTE_ID, noteId, `Graph note ${padded}`],
    });
    if (index > 1) {
      statements.push({
        sql: `INSERT INTO note_links (
          id, user_id, source_note_id, target_note_id, target_title, label, link_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'Graph note 000001', null, 'wikilink', 1735689600, 1735689600)`,
        args: [`link_graph_back_${padded}`, OWNER_ID, noteId, BACKLINK_TARGET_ID],
      });
    }
  }
  for (let start = 0; start < statements.length; start += batchSize)
    await client.batch(statements.slice(start, start + batchSize), 'write');
  return fanout;
}

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

async function measureRoute(input: {
  app: Hono;
  counter: Counter;
  name: string;
  path: string;
  actorUserId: string;
  iterations: number;
  resultKey: 'notes' | 'links' | 'backlinks' | 'childFolders';
}): Promise<Measurement> {
  const samples: Array<{ milliseconds: number; calls: number; bytes: number; results: number }> = [];
  for (let iteration = 0; iteration <= input.iterations; iteration += 1) {
    input.counter.calls = 0;
    const startedAt = performance.now();
    const response = await input.app.request(input.path, { headers: { 'x-benchmark-user': input.actorUserId } });
    const body = await response.text();
    const milliseconds = performance.now() - startedAt;
    if (!response.ok) throw new Error(`${input.name} returned ${response.status}: ${body}`);
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const results = Array.isArray(parsed[input.resultKey]) ? parsed[input.resultKey].length : 0;
    samples.push({ milliseconds, calls: input.counter.calls, bytes: Buffer.byteLength(body), results });
  }
  const first = samples[0];
  const warm = samples.slice(1);
  return {
    case: input.name,
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

async function explainPlans(client: SqlClient) {
  const orphanCandidates = await client.execute(`EXPLAIN QUERY PLAN
    SELECT id, folder_id, title
    FROM notes
    WHERE user_id = '${OWNER_ID}' AND deleted_at IS NULL AND type = 'note'
    ORDER BY title`);
  const incomingLinks = await client.execute(`EXPLAIN QUERY PLAN
    SELECT note_links.target_note_id
    FROM note_links
    INNER JOIN notes ON note_links.source_note_id = notes.id
    WHERE note_links.user_id = '${OWNER_ID}'
      AND note_links.target_note_id IS NOT NULL
      AND notes.user_id = '${OWNER_ID}'
      AND notes.deleted_at IS NULL`);
  const outgoing = await client.execute(`EXPLAIN QUERY PLAN
    SELECT * FROM note_links
    WHERE user_id = '${OWNER_ID}' AND source_note_id = '${SOURCE_NOTE_ID}'
    ORDER BY target_title`);
  const backlinks = await client.execute(`EXPLAIN QUERY PLAN
    SELECT note_links.id, notes.title
    FROM note_links
    INNER JOIN notes ON note_links.source_note_id = notes.id
    WHERE note_links.user_id = '${OWNER_ID}'
      AND note_links.target_note_id = '${BACKLINK_TARGET_ID}'
    ORDER BY notes.title`);
  return {
    orphanCandidates: orphanCandidates.rows,
    incomingLinks: incomingLinks.rows,
    outgoing: outgoing.rows,
    backlinks: backlinks.rows,
  };
}

async function main() {
  const sizes = sizesArgument();
  const iterations = integerArgument('iterations', DEFAULT_ITERATIONS);
  const requestedFanout = integerArgument('link-fanout', DEFAULT_LINK_FANOUT);
  const childFolderCount = integerArgument('child-folders', DEFAULT_CHILD_FOLDERS);
  const directory = await mkdtemp(path.join(tmpdir(), 'minunotes-graph-benchmark-'));
  process.env.TURSO_DB_URL = `file:${path.join(directory, 'benchmark.db')}`;

  try {
    const [{ libsql }, { noteRoutes }, { harnessRoutes }, { folderRoutes }] = await Promise.all([
      import('../src/api/db/client'),
      import('../src/api/routes/notes'),
      import('../src/api/routes/harness'),
      import('../src/api/routes/folders'),
    ]);
    const client = libsql as unknown as SqlClient;
    await applyMigrations(client);
    await seedPrincipals(client);
    await seedChildFolders(client, childFolderCount);

    const app = new Hono();
    app.use('*', async (context, next) => {
      const id = context.req.header('x-benchmark-user') ?? OWNER_ID;
      context.set('user', {
        id,
        name: id === OWNER_ID ? 'Graph Owner' : 'Graph Collaborator',
        email: id === OWNER_ID ? 'graph-owner@example.com' : 'graph-collaborator@example.com',
        emailVerified: true,
        image: null,
        createdAt: new Date(1735689600000),
        updatedAt: new Date(1735689600000),
      });
      context.set('session', null);
      context.set(
        'apiKey',
        id === OWNER_ID
          ? {
              id: API_KEY_ID,
              userId: OWNER_ID,
              authorizationId: AUTHORIZATION_ID,
              name: 'Graph benchmark',
              uid: 'GRAPHKEY',
              hash: 'hash',
              salt: 'salt',
              accessMode: 'all',
              canRead: true,
              canCreate: false,
              canEdit: false,
              canComment: false,
              canCreateFolders: false,
              sharedAccessMode: 'none',
              createdAt: new Date(1735689600000),
              updatedAt: new Date(1735689600000),
              lastUsedAt: null,
              revokedAt: null,
            }
          : null
      );
      context.set('oauthAuthorization', null);
      await next();
    });
    app.route('/notes', noteRoutes);
    app.route('/harness', harnessRoutes);
    app.route('/folders', folderRoutes);

    const counter = { calls: 0 };
    instrumentClient(client, counter);
    let seeded = 0;
    const reports = [];
    for (const size of sizes) {
      await seedNotes(client, seeded, size);
      seeded = size;
      const linkFanout = await seedLinks(client, size, requestedFanout);
      await client.execute('PRAGMA optimize');
      const cases = [];
      const definitions = [
        {
          name: 'orphans-owner-first-page',
          path: '/notes/orphans?page=1&limit=20',
          actorUserId: OWNER_ID,
          resultKey: 'notes' as const,
        },
        {
          name: 'orphans-collaborator-first-page',
          path: '/notes/orphans?page=1&limit=20',
          actorUserId: COLLABORATOR_ID,
          resultKey: 'notes' as const,
        },
        {
          name: 'outgoing-owner-high-fanout',
          path: `/notes/${SOURCE_NOTE_ID}/links`,
          actorUserId: OWNER_ID,
          resultKey: 'links' as const,
        },
        {
          name: 'outgoing-collaborator-high-fanout',
          path: `/notes/${SOURCE_NOTE_ID}/links`,
          actorUserId: COLLABORATOR_ID,
          resultKey: 'links' as const,
        },
        {
          name: 'backlinks-owner-high-fanout',
          path: `/notes/${BACKLINK_TARGET_ID}/backlinks`,
          actorUserId: OWNER_ID,
          resultKey: 'backlinks' as const,
        },
        {
          name: 'backlinks-collaborator-high-fanout',
          path: `/notes/${BACKLINK_TARGET_ID}/backlinks`,
          actorUserId: COLLABORATOR_ID,
          resultKey: 'backlinks' as const,
        },
        {
          name: 'harness-outgoing-owner-high-fanout',
          path: `/harness/notes/${SOURCE_NOTE_ID}/links`,
          actorUserId: OWNER_ID,
          resultKey: 'links' as const,
        },
        {
          name: 'harness-backlinks-owner-high-fanout',
          path: `/harness/notes/${BACKLINK_TARGET_ID}/backlinks`,
          actorUserId: OWNER_ID,
          resultKey: 'backlinks' as const,
        },
        {
          name: 'shared-folder-detail',
          path: `/folders/${FOLDER_ID}/detail`,
          actorUserId: COLLABORATOR_ID,
          resultKey: 'childFolders' as const,
        },
      ];
      for (const definition of definitions) {
        await client.execute('PRAGMA shrink_memory');
        cases.push(await measureRoute({ app, counter, iterations, ...definition }));
      }
      reports.push({ notes: size, authoredLinkFanout: linkFanout, childFolders: childFolderCount, cases });
    }

    counter.calls = 0;
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          environment: 'local libSQL temporary database',
          iterations,
          reports,
          queryPlans: await explainPlans(client),
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
