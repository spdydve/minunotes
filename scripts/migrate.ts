import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';

type JournalEntry = { idx: number; version: string; when: number; tag: string; breakpoints: boolean };
type JournalFile = { version: string; dialect: string; entries: JournalEntry[] };

const MIGRATIONS_DIR = path.resolve('drizzle');
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, 'meta/_journal.json');
const DRIZZLE_TABLE = '__drizzle_migrations';
const BREAKPOINT = '--> statement-breakpoint';

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

function hash(content: string) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function statements(sql: string) {
  return sql
    .split(BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function loadMigrations() {
  if (!existsSync(JOURNAL_PATH)) throw new Error(`Migration journal not found: ${JOURNAL_PATH}`);
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as JournalFile;
  return journal.entries.map((entry) => {
    const sqlPath = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
    if (!existsSync(sqlPath)) throw new Error(`Migration SQL file not found: ${sqlPath}`);
    const sql = readFileSync(sqlPath, 'utf8');
    return { tag: entry.tag, when: entry.when, hash: hash(sql), statements: statements(sql) };
  });
}

async function ensureMigrationsTable(client: ReturnType<typeof createClient>) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "${DRIZZLE_TABLE}" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at INTEGER
    )
  `);
}

async function appliedHashes(client: ReturnType<typeof createClient>) {
  await ensureMigrationsTable(client);
  const result = await client.execute(`SELECT hash FROM "${DRIZZLE_TABLE}"`);
  return new Set(result.rows.map((row) => String(row.hash)));
}

async function recordMigration(client: ReturnType<typeof createClient>, migration: { hash: string; when: number }) {
  await client.execute({
    sql: `INSERT INTO "${DRIZZLE_TABLE}" (hash, created_at) VALUES (?, ?)`,
    args: [migration.hash, migration.when],
  });
}

const environment = process.env.ENVIRONMENT ?? 'local';
loadEnvFile('.env');
loadEnvFile(`.env.${environment}`);
loadEnvFile('.env.local');

const url = process.env.TURSO_DB_URL ?? process.env.LIBSQL_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;
const dryRun = process.argv.includes('--dry-run');

console.log('Drizzle migration runner');
console.log(`Environment: ${environment}`);
console.log(`Target: ${url}`);
console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);

const client = createClient({ url, authToken });

try {
  const migrations = loadMigrations();
  const applied = await appliedHashes(client);
  const pending = migrations.filter((migration) => !applied.has(migration.hash));

  console.log(`Local migrations: ${migrations.length}`);
  console.log(`Applied migrations: ${applied.size}`);
  console.log(`Pending migrations: ${pending.length}`);

  if (pending.length === 0) {
    console.log('Nothing to migrate.');
  } else if (dryRun) {
    for (const migration of pending) console.log(`- ${migration.tag} (${migration.statements.length} statements)`);
  } else {
    for (const migration of pending) {
      console.log(`\n→ ${migration.tag}`);
      for (const [index, statement] of migration.statements.entries()) {
        const preview = statement.length > 100 ? `${statement.slice(0, 97)}...` : statement;
        console.log(`  [${index + 1}/${migration.statements.length}] ${preview}`);
        await client.execute(statement);
      }
      await recordMigration(client, migration);
      console.log('  ✓ recorded');
    }
    console.log('Migrations applied successfully.');
  }
} catch (error) {
  console.error('Migration failed:');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.close();
}
