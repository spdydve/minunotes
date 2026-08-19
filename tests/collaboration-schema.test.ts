import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type Client, createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

async function runMigrations(client: Client, from: number, to: number) {
  for (let index = from; index <= to; index += 1) {
    const [file] = await Array.fromAsync(
      (await import('node:fs/promises')).glob(`drizzle/${String(index).padStart(4, '0')}_*.sql`)
    );
    if (!file) throw new Error(`Missing migration ${index}`);
    await client.executeMultiple(await readFile(file, 'utf8'));
  }
}

async function createDatabase() {
  const dir = await mkdtemp(path.join(tmpdir(), 'notes-collaboration-schema-'));
  tempDirs.push(dir);
  const client = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await runMigrations(client, 0, 35);
  return client;
}

async function seedResources(client: Client) {
  const now = Math.floor(Date.now() / 1000);
  await client.executeMultiple(`
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES
      ('owner_a', 'Owner A', 'owner-a@example.com', 1, ${now}, ${now}),
      ('owner_b', 'Owner B', 'owner-b@example.com', 1, ${now}, ${now}),
      ('grantee', 'Grantee', 'grantee@example.com', 1, ${now}, ${now});
    INSERT INTO folders (id, user_id, parent_folder_id, title, is_private, is_agent_read_only, created_at, updated_at)
      VALUES ('folder_a', 'owner_a', NULL, 'Folder A', 0, 0, ${now}, ${now}),
             ('folder_b', 'owner_b', NULL, 'Folder B', 0, 0, ${now}, ${now});
    INSERT INTO notes (id, folder_id, user_id, title, content, created_at, updated_at)
      VALUES ('note_a', 'folder_a', 'owner_a', 'Note A', '', ${now}, ${now}),
             ('note_b', 'folder_b', 'owner_b', 'Note B', '', ${now}, ${now});
    INSERT INTO integration_authorizations (
      id, user_id, access_mode, can_read, can_create, can_edit, can_comment, can_create_folders,
      created_at, updated_at
    ) VALUES ('auth_grantee', 'grantee', 'all', 1, 1, 1, 1, 0, ${now}, ${now});
  `);
  return now;
}

async function expectRejected(client: Client, sql: string, args: Array<string | number | null>) {
  await expect(client.execute({ sql, args })).rejects.toThrow();
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('direct collaboration schema', () => {
  it('migrates populated integration data with shared access disabled and valid foreign keys', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'notes-collaboration-migration-'));
    tempDirs.push(dir);
    const client = createClient({ url: `file:${path.join(dir, 'test.db')}` });
    await runMigrations(client, 0, 34);
    const now = Math.floor(Date.now() / 1000);
    await client.executeMultiple(`
      INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
        VALUES ('user_a', 'User A', 'a@example.com', 1, ${now}, ${now});
      INSERT INTO folders (
        id, user_id, parent_folder_id, title, is_private, is_agent_read_only, created_at, updated_at
      ) VALUES ('folder_a', 'user_a', NULL, 'Folder A', 0, 0, ${now}, ${now});
      INSERT INTO integration_authorizations (
        id, user_id, access_mode, can_read, can_create, can_edit, can_comment, can_create_folders,
        created_at, updated_at
      ) VALUES ('auth_a', 'user_a', 'specific', 1, 1, 1, 1, 1, ${now}, ${now});
      INSERT INTO authorization_folder_rules (
        id, authorization_id, user_id, folder_id, applies_to, can_read, can_create, can_edit,
        can_comment, can_create_folders, created_at, updated_at
      ) VALUES (
        'rule_a', 'auth_a', 'user_a', 'folder_a', 'subtree', 1, 1, 1, 1, 1, ${now}, ${now}
      );
      INSERT INTO api_keys (
        id, user_id, authorization_id, name, uid, hash, salt, created_at, updated_at
      ) VALUES ('key_a', 'user_a', 'auth_a', 'Key A', 'KEYA0001', 'hash', 'salt', ${now}, ${now});
      INSERT INTO oauth_clients (
        id, name, redirect_uris, client_type, created_at, updated_at
      ) VALUES ('client_a', 'Client A', '["https://client.example/callback"]', 'public', ${now}, ${now});
      INSERT INTO oauth_authorizations (
        id, user_id, integration_authorization_id, client_id, scope, created_at, updated_at
      ) VALUES ('oauth_a', 'user_a', 'auth_a', 'client_a', 'notes.read', ${now}, ${now});
    `);

    await runMigrations(client, 35, 35);

    const authorization = await client.execute(
      "SELECT access_mode, shared_access_mode FROM integration_authorizations WHERE id = 'auth_a'"
    );
    expect(authorization.rows[0]).toMatchObject({ access_mode: 'specific', shared_access_mode: 'none' });
    for (const table of ['authorization_folder_rules', 'api_keys', 'oauth_authorizations']) {
      const result = await client.execute(`SELECT count(*) AS count FROM ${table}`);
      expect(result.rows[0]?.count).toBe(1);
    }
    expect((await client.execute('PRAGMA foreign_key_check')).rows).toEqual([]);

    await client.execute("DELETE FROM integration_authorizations WHERE id = 'auth_a'");
    for (const table of ['authorization_folder_rules', 'api_keys', 'oauth_authorizations']) {
      const result = await client.execute(`SELECT count(*) AS count FROM ${table}`);
      expect(result.rows[0]?.count).toBe(0);
    }
    client.close();
  });

  it('enforces resource ownership, role, identity, and uniqueness constraints', async () => {
    const client = await createDatabase();
    const now = await seedResources(client);
    const insert = `INSERT INTO collaboration_grants (
      id, owner_user_id, grantee_user_id, note_id, folder_id, role, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    await client.execute({
      sql: insert,
      args: ['grant_note', 'owner_a', 'grantee', 'note_a', null, 'editor', 'owner_a', now, now],
    });
    await client.execute({
      sql: insert,
      args: ['grant_folder', 'owner_a', 'grantee', null, 'folder_a', 'viewer', 'owner_a', now, now],
    });

    await expectRejected(client, insert, [
      'grant_cross_owner',
      'owner_a',
      'grantee',
      'note_b',
      null,
      'viewer',
      'owner_a',
      now,
      now,
    ]);
    await expectRejected(client, insert, [
      'grant_self',
      'owner_a',
      'owner_a',
      'note_a',
      null,
      'viewer',
      'owner_a',
      now,
      now,
    ]);
    await expectRejected(client, insert, [
      'grant_two_resources',
      'owner_a',
      'grantee',
      'note_a',
      'folder_a',
      'viewer',
      'owner_a',
      now,
      now,
    ]);
    await expectRejected(client, insert, [
      'grant_invalid_role',
      'owner_a',
      'grantee',
      'note_a',
      null,
      'manager',
      'owner_a',
      now,
      now,
    ]);
    await expectRejected(client, insert, [
      'grant_duplicate',
      'owner_a',
      'grantee',
      'note_a',
      null,
      'commenter',
      'owner_a',
      now,
      now,
    ]);
    client.close();
  });

  it('ties selected collaboration grants to the authorization owner', async () => {
    const client = await createDatabase();
    const now = await seedResources(client);
    await client.execute({
      sql: `INSERT INTO collaboration_grants (
        id, owner_user_id, grantee_user_id, note_id, role, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'editor', ?, ?, ?)`,
      args: ['grant_note', 'owner_a', 'grantee', 'note_a', 'owner_a', now, now],
    });
    await client.execute({
      sql: `INSERT INTO authorization_collaboration_scopes (
        id, authorization_id, user_id, collaboration_grant_id, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
      args: ['scope_valid', 'auth_grantee', 'grantee', 'grant_note', now],
    });

    await expectRejected(
      client,
      `INSERT INTO authorization_collaboration_scopes (
        id, authorization_id, user_id, collaboration_grant_id, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
      ['scope_wrong_user', 'auth_grantee', 'owner_a', 'grant_note', now]
    );
    client.close();
  });

  it('cascades active access on account deletion while detaching retained invitation audit', async () => {
    const client = await createDatabase();
    const now = await seedResources(client);
    await client.execute({
      sql: `INSERT INTO collaboration_grants (
        id, owner_user_id, grantee_user_id, note_id, role, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'editor', ?, ?, ?)`,
      args: ['grant_note', 'owner_a', 'grantee', 'note_a', 'owner_a', now, now],
    });
    await client.execute({
      sql: `INSERT INTO authorization_collaboration_scopes (
        id, authorization_id, user_id, collaboration_grant_id, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
      args: ['scope_note', 'auth_grantee', 'grantee', 'grant_note', now],
    });
    await client.execute({
      sql: `INSERT INTO collaboration_invitations (
        id, owner_user_id, invited_email_key, note_id, role, token_hash, invited_by_user_id,
        expires_at, accepted_at, accepted_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'editor', ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'invite_accepted',
        'owner_a',
        'grantee@example.com',
        'note_a',
        'token_accepted',
        'owner_a',
        now + 3600,
        now,
        'grantee',
        now,
        now,
      ],
    });

    await client.execute("DELETE FROM user WHERE id = 'grantee'");
    expect((await client.execute('SELECT count(*) AS count FROM collaboration_grants')).rows[0]?.count).toBe(0);
    expect(
      (await client.execute('SELECT count(*) AS count FROM authorization_collaboration_scopes')).rows[0]?.count
    ).toBe(0);
    const invitation = await client.execute(
      "SELECT owner_user_id, accepted_by_user_id FROM collaboration_invitations WHERE id = 'invite_accepted'"
    );
    expect(invitation.rows[0]).toMatchObject({ owner_user_id: 'owner_a', accepted_by_user_id: null });

    await client.execute("DELETE FROM user WHERE id = 'owner_a'");
    expect((await client.execute('SELECT count(*) AS count FROM collaboration_invitations')).rows[0]?.count).toBe(0);
    expect((await client.execute('PRAGMA foreign_key_check')).rows).toEqual([]);
    client.close();
  });

  it('enforces invitation resource ownership and shape', async () => {
    const client = await createDatabase();
    const now = await seedResources(client);
    const insert = `INSERT INTO collaboration_invitations (
      id, owner_user_id, invited_email_key, note_id, folder_id, role, token_hash, invited_by_user_id,
      expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    await client.execute({
      sql: insert,
      args: [
        'invite_valid',
        'owner_a',
        'new@example.com',
        'note_a',
        null,
        'viewer',
        'token_valid',
        'owner_a',
        now + 3600,
        now,
        now,
      ],
    });
    await expectRejected(client, insert, [
      'invite_cross_owner',
      'owner_a',
      'other@example.com',
      null,
      'folder_b',
      'viewer',
      'token_cross',
      'owner_a',
      now + 3600,
      now,
      now,
    ]);
    await expectRejected(client, insert, [
      'invite_no_resource',
      'owner_a',
      'none@example.com',
      null,
      null,
      'viewer',
      'token_none',
      'owner_a',
      now + 3600,
      now,
      now,
    ]);
    client.close();
  });
});
