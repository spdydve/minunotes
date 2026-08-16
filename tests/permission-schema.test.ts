import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

async function runMigrations(client: { executeMultiple: (sql: string) => Promise<unknown> }, from: number, to: number) {
  for (let index = from; index <= to; index += 1) {
    const [file] = await Array.fromAsync(
      (await import('node:fs/promises')).glob(`drizzle/${String(index).padStart(4, '0')}_*.sql`)
    );
    if (!file) throw new Error(`Missing migration ${index}`);
    await client.executeMultiple(await readFile(file, 'utf8'));
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('unified integration authorization schema', () => {
  it('backfills and continuously mirrors legacy API-key and OAuth permission state', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'notes-permission-schema-'));
    tempDirs.push(dir);
    const client = createClient({ url: `file:${path.join(dir, 'test.db')}` });
    await runMigrations(client, 0, 30);
    const now = Math.floor(Date.now() / 1000);
    await client.executeMultiple(`
      INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
      VALUES ('user_a', 'User A', 'a@example.com', 1, ${now}, ${now});
      INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
      VALUES ('user_b', 'User B', 'b@example.com', 1, ${now}, ${now});
      INSERT INTO folders (id, user_id, parent_folder_id, title, is_private, is_agent_read_only, created_at, updated_at)
      VALUES ('folder_a', 'user_a', NULL, 'Folder A', 0, 0, ${now}, ${now});
      INSERT INTO folders (id, user_id, parent_folder_id, title, is_private, is_agent_read_only, created_at, updated_at)
      VALUES ('folder_b', 'user_b', NULL, 'Folder B', 0, 0, ${now}, ${now});
      INSERT INTO api_keys (
        id, user_id, name, uid, hash, salt, can_create_folders, can_read, can_create, can_edit, can_comment,
        access_mode, created_at, updated_at
      ) VALUES (
        'agent_key_a', 'user_a', 'Agent', 'ABCDEFGH', 'hash', 'salt', 1, 1, 1, 1, 1,
        'all', ${now}, ${now}
      );
      INSERT INTO api_key_folder_permissions (
        id, api_key_id, folder_id, can_read, can_create, can_edit, can_comment, applies_to, created_at, updated_at
      ) VALUES (
        'agent_perm_a', 'agent_key_a', 'folder_a', 1, 0, 0, 0, 'exact', ${now}, ${now}
      );
      INSERT INTO oauth_clients (id, name, redirect_uris, client_type, created_at, updated_at)
      VALUES ('client_a', 'Client A', '["https://client.example/callback"]', 'public', ${now}, ${now});
      INSERT INTO oauth_authorizations (
        id, user_id, client_id, scope, access_mode, can_read, can_create, can_edit, can_comment,
        can_create_folders, created_at, updated_at
      ) VALUES (
        'oauth_auth_a', 'user_a', 'client_a', 'notes.read', 'specific', 1, 0, 0, 0, 0, ${now}, ${now}
      );
      INSERT INTO oauth_authorization_folder_permissions (
        id, authorization_id, folder_id, can_read, can_create, can_edit, can_comment, applies_to, created_at, updated_at
      ) VALUES (
        'oauth_perm_a', 'oauth_auth_a', 'folder_a', 1, 0, 0, 0, 'exact', ${now}, ${now}
      );
      INSERT INTO oauth_authorization_codes (
        id, code_hash, client_id, user_id, redirect_uri, scope, code_challenge,
        code_challenge_method, authorization_id, expires_at, created_at
      ) VALUES (
        'oauth_code_a', 'code_hash_a', 'client_a', 'user_a', 'https://client.example/callback',
        'notes.read', 'challenge', 'S256', 'oauth_auth_a', ${now + 600}, ${now}
      );
      INSERT INTO oauth_tokens (
        id, authorization_id, access_token_hash, refresh_token_hash, scope,
        access_token_expires_at, refresh_token_expires_at, created_at, updated_at
      ) VALUES (
        'oauth_token_a', 'oauth_auth_a', 'access_hash_a', 'refresh_hash_a', 'notes.read',
        ${now + 3600}, ${now + 7200}, ${now}, ${now}
      );
    `);

    await runMigrations(client, 31, 32);

    const authorizations = await client.execute(
      'SELECT id, user_id, access_mode FROM integration_authorizations ORDER BY id'
    );
    expect(authorizations.rows).toEqual([
      expect.objectContaining({ id: 'agent_key_a', user_id: 'user_a', access_mode: 'all' }),
      expect.objectContaining({ id: 'oauth_auth_a', user_id: 'user_a', access_mode: 'specific' }),
    ]);
    const rules = await client.execute(
      'SELECT authorization_id, folder_id, can_create, can_edit FROM authorization_folder_rules ORDER BY authorization_id'
    );
    expect(rules.rows).toEqual([
      expect.objectContaining({ authorization_id: 'agent_key_a', folder_id: 'folder_a', can_create: 0, can_edit: 0 }),
      expect.objectContaining({ authorization_id: 'oauth_auth_a', folder_id: 'folder_a', can_create: 0, can_edit: 0 }),
    ]);
    const apiKey = await client.execute("SELECT authorization_id FROM api_keys WHERE id = 'agent_key_a'");
    const oauth = await client.execute(
      "SELECT integration_authorization_id FROM oauth_authorizations WHERE id = 'oauth_auth_a'"
    );
    expect(apiKey.rows[0]?.authorization_id).toBe('agent_key_a');
    expect(oauth.rows[0]?.integration_authorization_id).toBe('oauth_auth_a');

    await client.execute({
      sql: `UPDATE api_key_folder_permissions SET can_create = 1, updated_at = ? WHERE id = 'agent_perm_a'`,
      args: [now + 1],
    });
    const mirrored = await client.execute(
      "SELECT can_create FROM authorization_folder_rules WHERE authorization_id = 'agent_key_a' AND folder_id = 'folder_a'"
    );
    expect(mirrored.rows[0]?.can_create).toBe(1);

    await expect(
      client.execute({
        sql: `INSERT INTO authorization_folder_rules (
                id, authorization_id, user_id, folder_id, applies_to, can_read, can_create, can_edit,
                can_comment, can_create_folders, created_at, updated_at
              ) VALUES (?, ?, ?, ?, 'exact', 1, 0, 0, 0, 0, ?, ?)`,
        args: ['cross_tenant_rule', 'agent_key_a', 'user_a', 'folder_b', now, now],
      })
    ).rejects.toThrow();
    await expect(
      client.execute({
        sql: `INSERT INTO folders (
                id, user_id, parent_folder_id, title, is_private, is_agent_read_only, created_at, updated_at
              ) VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
        args: ['cross_owner_child', 'user_a', 'folder_b', 'Cross owner child', now, now],
      })
    ).rejects.toThrow();
    await expect(
      client.execute({
        sql: `INSERT INTO folders (
                id, user_id, parent_folder_id, title, is_private, is_agent_read_only, created_at, updated_at
              ) VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
        args: ['self_parent', 'user_a', 'self_parent', 'Self parent', now, now],
      })
    ).rejects.toThrow();
    await expect(
      client.execute({
        sql: `INSERT INTO integration_authorizations (
                id, user_id, access_mode, can_read, can_create, can_edit, can_comment, can_create_folders,
                created_at, updated_at
              ) VALUES (?, ?, 'invalid', 1, 0, 0, 0, 0, ?, ?)`,
        args: ['invalid_auth', 'user_a', now, now],
      })
    ).rejects.toThrow();

    await runMigrations(client, 33, 34);
    const legacyObjects = await client.execute(`
      SELECT type, name FROM sqlite_master
      WHERE name IN (
        'api_key_folder_permissions', 'oauth_authorization_folder_permissions',
        'api_keys_sync_authorization_insert', 'api_keys_sync_authorization_update',
        'api_keys_sync_authorization_delete', 'api_key_rules_sync_insert', 'api_key_rules_sync_update',
        'api_key_rules_sync_delete', 'oauth_authorizations_sync_integration_insert',
        'oauth_authorizations_sync_integration_update', 'oauth_authorizations_sync_integration_delete',
        'oauth_rules_sync_insert', 'oauth_rules_sync_update', 'oauth_rules_sync_delete'
      )
    `);
    expect(legacyObjects.rows).toEqual([]);
    const apiKeyColumns = await client.execute('PRAGMA table_info(api_keys)');
    const oauthColumns = await client.execute('PRAGMA table_info(oauth_authorizations)');
    const removedColumns = [
      'access_mode',
      'can_read',
      'can_create',
      'can_edit',
      'can_comment',
      'can_create_folders',
      'last_used_at',
      'revoked_at',
    ];
    expect(apiKeyColumns.rows.map((column) => column.name)).not.toEqual(expect.arrayContaining(removedColumns));
    expect(oauthColumns.rows.map((column) => column.name)).not.toEqual(expect.arrayContaining(removedColumns));
    await expect(
      client.execute({
        sql: `INSERT INTO api_keys (
                id, user_id, authorization_id, name, uid, hash, salt, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ['cross_tenant_key', 'user_b', 'agent_key_a', 'Cross tenant', 'CROSSKEY', 'hash', 'salt', now, now],
      })
    ).rejects.toThrow();
    const preservedRule = await client.execute(
      "SELECT can_create FROM authorization_folder_rules WHERE authorization_id = 'agent_key_a'"
    );
    expect(preservedRule.rows[0]?.can_create).toBe(1);
    const preservedOAuthChildren = await client.execute(`
      SELECT 'code' AS kind, id FROM oauth_authorization_codes WHERE authorization_id = 'oauth_auth_a'
      UNION ALL
      SELECT 'token' AS kind, id FROM oauth_tokens WHERE authorization_id = 'oauth_auth_a'
      ORDER BY kind
    `);
    expect(preservedOAuthChildren.rows).toEqual([
      expect.objectContaining({ kind: 'code', id: 'oauth_code_a' }),
      expect.objectContaining({ kind: 'token', id: 'oauth_token_a' }),
    ]);
    client.close();
  });
});
