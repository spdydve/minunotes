import type { Client } from '@libsql/client';

export type Migration = {
  idx: number;
  tag: string;
  when: number;
  hash: string;
  statements: string[];
};

const FOREIGN_KEYS_PRAGMA = /^PRAGMA\s+foreign_keys\s*=\s*(?:ON|OFF)\s*;?$/i;

export function resolveThroughMigration(migrations: Migration[], requested: string | undefined) {
  if (!requested) return migrations.at(-1);
  const matches = migrations.filter(
    (migration) => migration.tag === requested || migration.tag.startsWith(`${requested}_`)
  );
  if (matches.length !== 1) {
    const detail = matches.length === 0 ? 'does not exist' : 'is ambiguous';
    throw new Error(`Migration --through target "${requested}" ${detail}`);
  }
  return matches[0];
}

export async function applyMigrationAtomically(client: Client, migration: Migration, migrationsTable: string) {
  const controlsForeignKeys = migration.statements.some((statement) => FOREIGN_KEYS_PRAGMA.test(statement));
  const statements = migration.statements.filter((statement) => !FOREIGN_KEYS_PRAGMA.test(statement));
  const transaction = [
    ...statements.map((sql) => ({ sql, args: [] })),
    {
      sql: `INSERT INTO "${migrationsTable}" (hash, created_at) VALUES (?, ?)`,
      args: [migration.hash, migration.when],
    },
  ];

  if (controlsForeignKeys) await client.execute('PRAGMA foreign_keys=OFF');
  try {
    await client.batch(transaction, 'write');
  } finally {
    if (controlsForeignKeys) await client.execute('PRAGMA foreign_keys=ON');
  }
}
