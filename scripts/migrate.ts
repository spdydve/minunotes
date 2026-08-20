import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { applyMigrationAtomically, type Migration, resolveThroughMigration } from './lib/migration-runner';

type JournalEntry = { idx: number; version: string; when: number; tag: string; breakpoints: boolean };
type JournalFile = { version: string; dialect: string; entries: JournalEntry[] };

const MIGRATIONS_DIR = path.resolve('drizzle');
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, 'meta/_journal.json');
const DRIZZLE_TABLE = '__drizzle_migrations';
const BREAKPOINT = '--> statement-breakpoint';
const PERMISSION_MIGRATION_START = 28;
const PERMISSION_MIGRATION_END = 34;
const TENANT_INTEGRITY_MIGRATION = 36;

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

function loadMigrations(): Migration[] {
  if (!existsSync(JOURNAL_PATH)) throw new Error(`Migration journal not found: ${JOURNAL_PATH}`);
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as JournalFile;
  return journal.entries.map((entry) => {
    const sqlPath = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
    if (!existsSync(sqlPath)) throw new Error(`Migration SQL file not found: ${sqlPath}`);
    const sql = readFileSync(sqlPath, 'utf8');
    return {
      idx: entry.idx,
      tag: entry.tag,
      when: entry.when,
      hash: hash(sql),
      statements: statements(sql),
    };
  });
}

function throughArgument(argv: string[]) {
  const inline = argv.find((argument) => argument.startsWith('--through='));
  if (inline) return inline.slice('--through='.length);
  const index = argv.indexOf('--through');
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error('--through requires a migration number or tag');
  return value;
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

async function tableExists(client: ReturnType<typeof createClient>, name: string) {
  const result = await client.execute({
    sql: "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [name],
  });
  return result.rows.length > 0;
}

function runPreflight(label: string, script: string) {
  console.log(`\nRunning ${label}...`);
  const result = spawnSync('pnpm', ['exec', 'tsx', script], {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });
  if (result.status !== 0) throw new Error(`${label} failed`);
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
  const through = resolveThroughMigration(migrations, throughArgument(process.argv.slice(2)));
  if (!through) throw new Error('No migrations found');
  const selected = migrations.filter((migration) => migration.idx <= through.idx);
  const applied = await appliedHashes(client);
  const pending = selected.filter((migration) => !applied.has(migration.hash));
  const deferred = migrations.filter((migration) => migration.idx > through.idx && !applied.has(migration.hash));

  console.log(`Local migrations: ${migrations.length}`);
  console.log(`Through: ${through.tag}`);
  console.log(`Applied migrations: ${applied.size}`);
  console.log(`Pending selected migrations: ${pending.length}`);
  if (deferred.length > 0) console.log(`Deferred migrations: ${deferred.length}`);

  if (pending.length === 0) {
    console.log('Nothing to migrate.');
  } else if (dryRun) {
    for (const migration of pending) console.log(`- ${migration.tag} (${migration.statements.length} statements)`);
  } else {
    const hasPendingPermissionMigration = pending.some(
      (migration) => migration.idx >= PERMISSION_MIGRATION_START && migration.idx <= PERMISSION_MIGRATION_END
    );
    const hasExistingFolders = await tableExists(client, 'folders');
    if (hasPendingPermissionMigration && hasExistingFolders)
      runPreflight('permission migration preflight', 'scripts/verify-permission-migration.ts');
    else if (hasPendingPermissionMigration) console.log('Skipping permission preflight for a fresh database.');

    const hasPendingTenantIntegrityMigration = pending.some(
      (migration) => migration.idx === TENANT_INTEGRITY_MIGRATION
    );
    if (hasPendingTenantIntegrityMigration && hasExistingFolders)
      runPreflight('tenant-integrity migration preflight', 'scripts/verify-tenant-integrity.ts');
    else if (hasPendingTenantIntegrityMigration)
      console.log('Skipping tenant-integrity preflight for a fresh database.');

    for (const migration of pending) {
      console.log(`\n→ ${migration.tag}`);
      for (const [index, statement] of migration.statements.entries()) {
        const preview = statement.length > 100 ? `${statement.slice(0, 97)}...` : statement;
        console.log(`  [${index + 1}/${migration.statements.length}] ${preview}`);
      }
      await applyMigrationAtomically(client, migration, DRIZZLE_TABLE);
      console.log('  ✓ applied atomically and recorded');
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
