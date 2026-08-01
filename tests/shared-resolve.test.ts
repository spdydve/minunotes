import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tempDirs: string[] = [];

async function runMigrations(libsql: { executeMultiple: (sql: string) => Promise<unknown> }) {
  for (let index = 0; index <= 23; index += 1) {
    const [file] = await Array.fromAsync(
      (await import('node:fs/promises')).glob(`drizzle/${String(index).padStart(4, '0')}_*.sql`)
    );
    if (!file) throw new Error(`Missing migration ${index}`);
    await libsql.executeMultiple(await readFile(file, 'utf8'));
  }
}

type TestCtx = {
  app: Hono;
  db: Awaited<ReturnType<typeof import('../src/api/db/client')['db']>> extends infer T ? T : never;
  schema: typeof import('../src/api/db/schema');
  shareTokenFor: (noteId: string) => Promise<string>;
  folderShareTokenFor: (folderId: string) => Promise<string>;
};

async function setupResolverApp(): Promise<TestCtx> {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), 'notes-resolver-'));
  tempDirs.push(dir);
  vi.stubEnv('TURSO_DB_URL', `file:${path.join(dir, 'test.db')}`);
  vi.stubEnv('FRONTEND_URL', 'https://notes.example.test');

  const [{ db, libsql }, schema, { noteRoutes }, { folderRoutes }, { shareRoutes }, { sharedResolveRoutes }] =
    await Promise.all([
      import('../src/api/db/client'),
      import('../src/api/db/schema'),
      import('../src/api/routes/notes'),
      import('../src/api/routes/folders'),
      import('../src/api/routes/share'),
      import('../src/api/routes/shared-resolve'),
    ]);

  await runMigrations(libsql);

  const userA = {
    id: 'user_a',
    name: 'User A',
    email: 'a@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.insert(schema.user).values(userA);

  const folderRoot = {
    id: 'folder_root',
    userId: userA.id,
    parentFolderId: null,
    title: 'Root',
    isPrivate: false,
    isAgentReadOnly: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const folderSub = {
    id: 'folder_sub',
    userId: userA.id,
    parentFolderId: 'folder_root',
    title: 'Sub',
    isPrivate: false,
    isAgentReadOnly: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const folderOther = {
    id: 'folder_other',
    userId: userA.id,
    parentFolderId: null,
    title: 'Other',
    isPrivate: false,
    isAgentReadOnly: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.insert(schema.folders).values([folderRoot, folderSub, folderOther]);

  const seedNote = (id: string, folderId: string, title: string) => ({
    id,
    folderId,
    userId: userA.id,
    title,
    content: '',
    documentType: 'markdown' as const,
    type: 'note' as const,
    isApiEditable: true,
    updatedByActorType: null,
    updatedByActorId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db
    .insert(schema.notes)
    .values([
      seedNote('note_a', 'folder_root', 'Alpha Note'),
      seedNote('note_b', 'folder_root', 'Beta Note'),
      seedNote('note_c', 'folder_sub', 'Gamma Note'),
      seedNote('note_d', 'folder_other', 'Delta Note'),
      seedNote('note_dup', 'folder_root', 'Alpha Note'),
    ]);

  const app = new Hono();
  const setUser = async (c: Parameters<Parameters<typeof app.use>[1]>[0], next: () => Promise<void>) => {
    c.set('user', userA);
    c.set('session', { id: 'sess_a', userId: userA.id });
    await next();
  };
  app.use('/api/notes/*', setUser);
  app.use('/api/folders/*', setUser);
  app.route('/api/notes', noteRoutes);
  app.route('/api/folders', folderRoutes);
  app.route('/api/share', shareRoutes);
  app.route('/api/share', sharedResolveRoutes);

  async function shareTokenFor(noteId: string) {
    const res = await app.request(`/api/notes/${noteId}/share-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.status !== 201) throw new Error(`share failed: ${res.status}`);
    const { shareLink } = (await res.json()) as { shareLink: { url: string } };
    const segment = new URL(shareLink.url).pathname.split('/').pop();
    if (!segment) throw new Error('Failed to parse share token');
    return segment;
  }

  async function folderShareTokenFor(folderId: string) {
    const res = await app.request(`/api/folders/${folderId}/share-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ permission: 'read' }),
    });
    if (res.status !== 201) {
      const text = await res.text();
      throw new Error(`folder share failed: ${res.status} ${text}`);
    }
    const { shareLink } = (await res.json()) as { shareLink: { url: string } };
    const segment = new URL(shareLink.url).pathname.split('/').pop();
    if (!segment) throw new Error('Failed to parse folder share token');
    return segment;
  }

  return {
    app: app as unknown as Hono,
    db: db as unknown as TestCtx['db'],
    schema,
    shareTokenFor,
    folderShareTokenFor,
  };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('shared wikilink resolver', () => {
  it('returns null for every target when the share token is unknown', async () => {
    const { app } = await setupResolverApp();
    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'never-issued', targets: ['Alpha Note'] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { resolutions: { target: string; shareToken: string | null }[] };
    expect(body.resolutions).toEqual([{ target: 'Alpha Note', shareToken: null }]);
  });

  it('rejects malformed bodies', async () => {
    const { app } = await setupResolverApp();
    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('rejects oversized targets array', async () => {
    const { app } = await setupResolverApp();
    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'any', targets: Array.from({ length: 501 }, (_, i) => `t${i}`) }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects targets over the character limit', async () => {
    const { app } = await setupResolverApp();
    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'any', targets: ['x'.repeat(257)] }),
    });
    expect(res.status).toBe(400);
  });

  it('resolves a target by title to its own share token (note share → target with own share)', async () => {
    const { app, shareTokenFor } = await setupResolverApp();
    const tokenA = await shareTokenFor('note_a');
    const tokenB = await shareTokenFor('note_b');

    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenA, targets: ['Beta Note'] }),
    });
    const body = (await res.json()) as { resolutions: { target: string; shareToken: string | null }[] };
    expect(body.resolutions[0]?.shareToken).toBe(tokenB);
  });

  it('resolves a self-link to the current share token', async () => {
    const { app, shareTokenFor } = await setupResolverApp();
    const tokenA = await shareTokenFor('note_a');
    const tokenB = await shareTokenFor('note_b');

    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenA, targets: ['note_a', 'note_b'] }),
    });
    const body = (await res.json()) as { resolutions: { target: string; shareToken: string | null }[] };
    expect(body.resolutions[0]?.shareToken).toBe(tokenA);
    expect(body.resolutions[1]?.shareToken).toBe(tokenB);
  });

  it('returns null for a target that is not shared (note share → no share)', async () => {
    const { app, shareTokenFor } = await setupResolverApp();
    const tokenA = await shareTokenFor('note_a');

    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenA, targets: ['Delta Note'] }),
    });
    const body = (await res.json()) as { resolutions: { target: string; shareToken: string | null }[] };
    expect(body.resolutions[0]?.shareToken).toBeNull();
  });

  it('returns null for a title matching multiple notes (ambiguity guard)', async () => {
    const { app, shareTokenFor } = await setupResolverApp();
    const tokenA = await shareTokenFor('note_a');

    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenA, targets: ['Alpha Note'] }),
    });
    const body = (await res.json()) as { resolutions: { target: string; shareToken: string | null }[] };
    expect(body.resolutions[0]?.shareToken).toBeNull();
  });

  it('returns null for a non-existent target', async () => {
    const { app, shareTokenFor } = await setupResolverApp();
    const tokenA = await shareTokenFor('note_a');

    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenA, targets: ['No Such Note'] }),
    });
    const body = (await res.json()) as { resolutions: { target: string; shareToken: string | null }[] };
    expect(body.resolutions[0]?.shareToken).toBeNull();
  });

  it('resolves a folder share token to the folder share for in-folder targets', async () => {
    const { app, shareTokenFor, folderShareTokenFor } = await setupResolverApp();
    const folderToken = await folderShareTokenFor('folder_root');
    void (await shareTokenFor('note_b'));

    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: folderToken, targets: ['note_a', 'note_b'] }),
    });
    const body = (await res.json()) as { resolutions: { target: string; shareToken: string | null }[] };
    expect(body.resolutions[0]?.shareToken).toBe(folderToken);
    expect(body.resolutions[1]?.shareToken).toBe(folderToken);
  });

  it('resolves sub-folder targets through a parent folder share', async () => {
    const { app, folderShareTokenFor } = await setupResolverApp();
    const folderToken = await folderShareTokenFor('folder_root');

    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: folderToken, targets: ['Gamma Note'] }),
    });
    const body = (await res.json()) as { resolutions: { target: string; shareToken: string | null }[] };
    expect(body.resolutions[0]?.shareToken).toBe(folderToken);
  });

  it('returns null for cross-folder targets without their own share', async () => {
    const { app, folderShareTokenFor } = await setupResolverApp();
    const folderToken = await folderShareTokenFor('folder_root');

    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: folderToken, targets: ['Delta Note'] }),
    });
    const body = (await res.json()) as { resolutions: { target: string; shareToken: string | null }[] };
    expect(body.resolutions[0]?.shareToken).toBeNull();
  });

  it("uses the target's own note share when reachable outside the folder share scope", async () => {
    const { app, folderShareTokenFor, shareTokenFor } = await setupResolverApp();
    const folderToken = await folderShareTokenFor('folder_root');
    const noteDToken = await shareTokenFor('note_d');

    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: folderToken, targets: ['Delta Note'] }),
    });
    const body = (await res.json()) as { resolutions: { target: string; shareToken: string | null }[] };
    expect(body.resolutions[0]?.shareToken).toBe(noteDToken);
  });

  it('preserves target order in the response', async () => {
    const { app, shareTokenFor } = await setupResolverApp();
    const tokenA = await shareTokenFor('note_a');
    const targets = ['No Such', 'Beta Note', 'Alpha Note', 'Delta Note'];

    const res = await app.request('/api/share/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenA, targets }),
    });
    const body = (await res.json()) as { resolutions: { target: string; shareToken: string | null }[] };
    expect(body.resolutions.map((r) => r.target)).toEqual(targets);
  });
});
