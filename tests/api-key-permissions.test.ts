import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tempDirs: string[] = [];

async function runMigrations(libsql: { executeMultiple: (sql: string) => Promise<unknown> }) {
  for (let index = 0; index <= 25; index += 1) {
    const [file] = await Array.fromAsync(
      (await import('node:fs/promises')).glob(`drizzle/${String(index).padStart(4, '0')}_*.sql`)
    );
    if (!file) throw new Error(`Missing migration ${index}`);
    await libsql.executeMultiple(await readFile(file, 'utf8'));
  }
}

async function setupApp() {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), 'notes-api-key-permissions-'));
  tempDirs.push(dir);
  vi.stubEnv('TURSO_DB_URL', `file:${path.join(dir, 'test.db')}`);

  const [{ db, libsql }, schema, { apiKeyRoutes }] = await Promise.all([
    import('../src/api/db/client'),
    import('../src/api/db/schema'),
    import('../src/api/routes/api-keys'),
  ]);
  await runMigrations(libsql);

  const now = new Date();
  const user = {
    id: 'user_api_keys',
    name: 'API Key Owner',
    email: 'keys@example.com',
    emailVerified: true,
    image: null,
    createdAt: now,
    updatedAt: now,
  };
  const folder = {
    id: 'folder_api_keys',
    userId: user.id,
    parentFolderId: null,
    title: 'Review folder',
    isPrivate: false,
    isAgentReadOnly: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.user).values(user);
  await db.insert(schema.folders).values(folder);

  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('user', user);
    c.set('session', null);
    c.set('apiKey', null);
    await next();
  });
  app.route('/api-keys', apiKeyRoutes);

  return { app, db, schema, folder };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('API key Review comments permission', () => {
  it('defaults Review comments permission to disabled and returns it from list responses', async () => {
    const { app } = await setupApp();
    const create = await app.request('/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Read only', canRead: true, canEdit: false, permissions: [] }),
    });

    expect(create.status).toBe(201);
    await expect(create.json()).resolves.toMatchObject({ apiKey: { canRead: true, canComment: false } });

    const list = await app.request('/api-keys');
    await expect(list.json()).resolves.toMatchObject({ keys: [{ canComment: false }] });
  });

  it('persists global and folder Review permission and requires read access', async () => {
    const { app, db, schema, folder } = await setupApp();
    const invalid = await app.request('/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Invalid reviewer', canRead: false, canComment: true, permissions: [] }),
    });
    expect(invalid.status).toBe(400);

    const create = await app.request('/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Reviewer',
        accessMode: 'specific',
        canRead: true,
        canEdit: false,
        canComment: true,
        permissions: [{ folderId: folder.id }],
      }),
    });
    expect(create.status).toBe(201);
    const body = (await create.json()) as { apiKey: { id: string } };

    const [key] = await db.select().from(schema.apiKeys);
    expect(key).toMatchObject({ canRead: true, canEdit: false, canComment: true });
    const [permission] = await db.select().from(schema.apiKeyFolderPermissions);
    expect(permission).toMatchObject({ folderId: folder.id, canRead: true, canEdit: false, canComment: true });

    const invalidUpdate = await app.request(`/api-keys/${body.apiKey.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ canRead: false }),
    });
    expect(invalidUpdate.status).toBe(400);
  });
});
