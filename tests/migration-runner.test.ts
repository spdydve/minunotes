import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigrationAtomically, type Migration, resolveThroughMigration } from '../scripts/lib/migration-runner';

const tempDirs: string[] = [];

function migration(idx: number, tag: string): Migration {
  return { idx, tag, when: idx, hash: `hash_${idx}`, statements: [] };
}

function runScript(url: string, script: string, args: string[] = []) {
  return spawnSync('pnpm', ['exec', 'tsx', script, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, TURSO_DB_URL: url, LIBSQL_URL: '', TURSO_AUTH_TOKEN: '', LIBSQL_AUTH_TOKEN: '' },
    maxBuffer: 10 * 1024 * 1024,
  });
}

function runMigrations(url: string, through: string) {
  return runScript(url, 'scripts/migrate.ts', ['--through', through]);
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('migration runner', () => {
  it('resolves exact tags and numeric prefixes for --through', () => {
    const migrations = [migration(31, '0031_expand'), migration(32, '0032_constraints')];
    expect(resolveThroughMigration(migrations, '0032')?.idx).toBe(32);
    expect(resolveThroughMigration(migrations, '0031_expand')?.idx).toBe(31);
    expect(() => resolveThroughMigration(migrations, '0099')).toThrow(/does not exist/);
  });

  it('rolls back DDL, data changes, and the migration record together', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'notes-migration-atomic-'));
    tempDirs.push(dir);
    const client = createClient({ url: `file:${path.join(dir, 'test.db')}` });
    await client.execute(`
      CREATE TABLE __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL,
        created_at INTEGER
      )
    `);
    const failing: Migration = {
      idx: 1,
      tag: '0001_failing',
      when: 1,
      hash: 'failing_hash',
      statements: [
        'PRAGMA foreign_keys=OFF',
        'CREATE TABLE atomic_probe (id integer primary key)',
        'INSERT INTO atomic_probe (id) VALUES (1)',
        'INSERT INTO missing_table (id) VALUES (1)',
        'PRAGMA foreign_keys=ON',
      ],
    };

    await expect(applyMigrationAtomically(client, failing, '__drizzle_migrations')).rejects.toThrow();
    const table = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'atomic_probe'");
    const records = await client.execute('SELECT hash FROM __drizzle_migrations');
    const foreignKeys = await client.execute('PRAGMA foreign_keys');
    expect(table.rows).toEqual([]);
    expect(records.rows).toEqual([]);
    expect(foreignKeys.rows[0]?.foreign_keys).toBe(1);
    client.close();
  });

  it('blocks tenant-integrity migration until cross-tenant rows are repaired', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'notes-tenant-migration-runner-'));
    tempDirs.push(dir);
    const url = `file:${path.join(dir, 'test.db')}`;
    const initial = runMigrations(url, '0035');
    expect(initial.status, `${initial.stdout}\n${initial.stderr}`).toBe(0);

    const client = createClient({ url });
    const now = Math.floor(Date.now() / 1000);
    await client.executeMultiple(`
      INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES
        ('owner_a', 'Owner A', 'owner-a@example.com', 1, ${now}, ${now}),
        ('owner_b', 'Owner B', 'owner-b@example.com', 1, ${now}, ${now});
      INSERT INTO folders (id, user_id, parent_folder_id, title, is_private, is_agent_read_only, created_at, updated_at)
        VALUES ('folder_a', 'owner_a', NULL, 'Folder A', 0, 0, ${now}, ${now});
      INSERT INTO notes (id, folder_id, user_id, title, content, created_at, updated_at)
        VALUES ('note_a', 'folder_a', 'owner_a', 'Note A', '', ${now}, ${now});
      INSERT INTO note_events (id, note_id, user_id, actor_type, event_type, summary, created_at)
        VALUES ('event_cross', 'note_a', 'owner_b', 'user', 'edit', 'Cross tenant', ${now});
    `);

    const audit = runScript(url, 'scripts/verify-tenant-integrity.ts');
    expect(audit.status).not.toBe(0);
    expect(`${audit.stdout}\n${audit.stderr}`).toContain('eventNoteOwner');

    const blocked = runMigrations(url, '0036');
    expect(blocked.status).not.toBe(0);
    expect(`${blocked.stdout}\n${blocked.stderr}`).toContain('tenant-integrity migration preflight failed');

    await client.execute("DELETE FROM note_events WHERE id = 'event_cross'");
    const migrated = runMigrations(url, '0036');
    expect(migrated.status, `${migrated.stdout}\n${migrated.stderr}`).toBe(0);
    expect((await client.execute('PRAGMA foreign_key_check')).rows).toEqual([]);
    client.close();
  }, 30_000);

  it('enforces preflight and can stop after the expand migration range', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'notes-migration-range-'));
    tempDirs.push(dir);
    const url = `file:${path.join(dir, 'test.db')}`;
    const initial = runMigrations(url, '0027');
    expect(initial.status, initial.stderr).toBe(0);

    const client = createClient({ url });
    const now = Math.floor(Date.now() / 1000);
    await client.executeMultiple(`
      INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
      VALUES ('user_runner', 'Runner', 'runner@example.com', 1, ${now}, ${now});
      INSERT INTO folders (
        id, user_id, parent_folder_id, title, is_private, is_agent_read_only, created_at, updated_at
      ) VALUES ('folder_runner', 'user_runner', NULL, 'Runner', 0, 0, ${now}, ${now});
      INSERT INTO api_keys (
        id, user_id, name, uid, hash, salt, can_create_folders, can_read, can_create, can_edit,
        can_comment, access_mode, created_at, updated_at
      ) VALUES (
        'agent_key_runner', 'user_runner', 'Runner', 'RUNNER01', 'hash', 'salt', 0, 1, 0, 0,
        0, 'specific', ${now}, ${now}
      );
      INSERT INTO api_key_folder_permissions (
        id, api_key_id, folder_id, can_read, can_create, can_edit, can_comment, created_at, updated_at
      ) VALUES
        ('permission_runner_a', 'agent_key_runner', 'folder_runner', 1, 0, 0, 0, ${now}, ${now}),
        ('permission_runner_b', 'agent_key_runner', 'folder_runner', 1, 0, 0, 0, ${now}, ${now});
    `);
    const before = await client.execute('SELECT count(*) AS count FROM __drizzle_migrations');

    const blocked = runMigrations(url, '0029');
    expect(blocked.status).not.toBe(0);
    expect(`${blocked.stdout}\n${blocked.stderr}`).toContain('duplicateApiKeyGrants');
    const after = await client.execute('SELECT count(*) AS count FROM __drizzle_migrations');
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);

    await client.execute("DELETE FROM api_key_folder_permissions WHERE id = 'permission_runner_b'");
    const expanded = runMigrations(url, '0032');
    expect(expanded.status, `${expanded.stdout}\n${expanded.stderr}`).toBe(0);
    const legacyTable = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'api_key_folder_permissions'"
    );
    const contractTable = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'authorization_folder_rules'"
    );
    expect(legacyTable.rows).toHaveLength(1);
    expect(contractTable.rows).toHaveLength(1);

    await client.executeMultiple(`
      INSERT INTO oauth_clients (id, name, redirect_uris, client_type, created_at, updated_at)
      VALUES ('client_runner', 'Runner client', '["https://client.example/callback"]', 'public', ${now}, ${now});
      INSERT INTO oauth_authorizations (
        id, user_id, client_id, scope, access_mode, can_read, can_create, can_edit,
        can_comment, can_create_folders, created_at, updated_at
      ) VALUES (
        'oauth_auth_runner', 'user_runner', 'client_runner', 'notes.read admin', 'all', 1, 0, 0,
        0, 0, ${now}, ${now}
      );
    `);
    const scopeAudit = runScript(url, 'scripts/verify-permission-migration.ts');
    expect(scopeAudit.status).not.toBe(0);
    expect(`${scopeAudit.stdout}\n${scopeAudit.stderr}`).toContain('invalidOAuthAuthorizationScopes');
    client.close();
  }, 30_000);
});
