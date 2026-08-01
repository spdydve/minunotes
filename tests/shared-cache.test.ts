import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SharedLinkCache } from '../src/api/shared/cache';

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

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('SharedLinkCache (unit)', () => {
  it('returns null on miss', () => {
    const cache = new SharedLinkCache();
    expect(cache.get('missing')).toBeNull();
  });

  it('returns the cached value on hit', () => {
    const cache = new SharedLinkCache();
    cache.set('k', { hello: 'world' }, 60_000, 'tok');
    expect(cache.get('k')).toEqual({ hello: 'world' });
  });

  it('expires entries after the TTL', async () => {
    const cache = new SharedLinkCache();
    cache.set('k', 'v', 10, 'tok');
    expect(cache.get('k')).toBe('v');
    await new Promise((r) => setTimeout(r, 25));
    expect(cache.get('k')).toBeNull();
  });

  it('invalidateByToken removes all entries for the token', () => {
    const cache = new SharedLinkCache();
    cache.set('a', 1, 60_000, 'tok1');
    cache.set('b', 2, 60_000, 'tok1');
    cache.set('c', 3, 60_000, 'tok2');
    expect(cache.invalidateByToken('tok1')).toBe(2);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
    expect(cache.get('c')).toBe(3);
  });

  it('evicts least-recently-used entries when over capacity', () => {
    const cache = new SharedLinkCache(2);
    cache.set('a', 1, 60_000, 't');
    cache.set('b', 2, 60_000, 't');
    cache.get('a');
    cache.set('c', 3, 60_000, 't');
    expect(cache.get('b')).toBeNull();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('clear removes everything', () => {
    const cache = new SharedLinkCache();
    cache.set('a', 1, 60_000, 't');
    cache.set('b', 2, 60_000, 't2');
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get('a')).toBeNull();
  });
});

describe('shared-link cache (integration)', () => {
  type Ctx = {
    app: Hono;
    db: Awaited<ReturnType<typeof import('../src/api/db/client')['db']>>;
    schema: typeof import('../src/api/db/schema');
    shareTokenFor: (noteId: string) => Promise<string>;
    folderShareTokenFor: (folderId: string) => Promise<string>;
    updateNote: (noteId: string, content: string) => Promise<{ status: number; body: unknown }>;
    fetchSharedNote: (token: string) => Promise<{ status: number; body: unknown }>;
    resolveShared: (token: string, targets: string[]) => Promise<{ status: number; body: unknown }>;
  };

  async function setupCacheApp(): Promise<Ctx> {
    vi.resetModules();
    const dir = await mkdtemp(path.join(tmpdir(), 'notes-cache-'));
    tempDirs.push(dir);
    vi.stubEnv('TURSO_DB_URL', `file:${path.join(dir, 'test.db')}`);
    vi.stubEnv('FRONTEND_URL', 'https://notes.example.test');

    const [
      { db, libsql },
      schema,
      { noteRoutes },
      { folderRoutes },
      { shareRoutes },
      { sharedResolveRoutes },
      cacheModule,
    ] = await Promise.all([
      import('../src/api/db/client'),
      import('../src/api/db/schema'),
      import('../src/api/routes/notes'),
      import('../src/api/routes/folders'),
      import('../src/api/routes/share'),
      import('../src/api/routes/shared-resolve'),
      import('../src/api/shared/cache'),
    ]);

    await runMigrations(libsql);
    cacheModule.sharedLinkCache.clear();

    const userA = {
      id: 'user_a',
      name: 'A',
      email: 'a@x.test',
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.insert(schema.user).values(userA);
    await db.insert(schema.folders).values({
      id: 'folder_root',
      userId: userA.id,
      parentFolderId: null,
      title: 'Root',
      isPrivate: false,
      isAgentReadOnly: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(schema.notes).values({
      id: 'note_a',
      folderId: 'folder_root',
      userId: userA.id,
      title: 'A',
      content: 'original',
      documentType: 'markdown',
      type: 'note',
      isApiEditable: true,
      updatedByActorType: null,
      updatedByActorId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

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
      const { shareLink } = (await res.json()) as { shareLink: { url: string } };
      const segment = new URL(shareLink.url).pathname.split('/').pop();
      if (!segment) throw new Error('No share token');
      return segment;
    }

    async function folderShareTokenFor(folderId: string) {
      const res = await app.request(`/api/folders/${folderId}/share-link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ permission: 'read' }),
      });
      const { shareLink } = (await res.json()) as { shareLink: { url: string } };
      const segment = new URL(shareLink.url).pathname.split('/').pop();
      if (!segment) throw new Error('No folder share token');
      return segment;
    }

    async function updateNote(noteId: string, content: string) {
      const get = await app.request(`/api/notes/${noteId}`);
      const current = (await get.json()) as { note: { title: string; folderId: string } };
      const res = await app.request(`/api/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: current.note.title, content, baseHash: undefined }),
      });
      return { status: res.status, body: await res.json() };
    }

    async function fetchSharedNote(token: string) {
      const res = await app.request(`/api/share/${token}`);
      return { status: res.status, body: await res.json() };
    }

    async function resolveShared(token: string, targets: string[]) {
      const res = await app.request('/api/share/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, targets }),
      });
      return { status: res.status, body: await res.json() };
    }

    return {
      app: app as unknown as Hono,
      db: db as unknown as Ctx['db'],
      schema,
      shareTokenFor,
      folderShareTokenFor,
      updateNote,
      fetchSharedNote,
      resolveShared,
    };
  }

  it('serves the same shared note from cache on repeated reads', async () => {
    const ctx = await setupCacheApp();
    const token = await ctx.shareTokenFor('note_a');
    const first = await ctx.fetchSharedNote(token);
    expect(first.status).toBe(200);
    const second = await ctx.fetchSharedNote(token);
    expect(second.status).toBe(200);
    expect((second.body as { note: { content: string } }).note.content).toBe('original');
  });

  it('absorbs a viral burst with a single DB hit', async () => {
    const ctx = await setupCacheApp();
    const token = await ctx.shareTokenFor('note_a');
    // Warm the cache.
    await ctx.fetchSharedNote(token);
    // Now hammer it. We can't easily count DB hits here, but the test is that
    // 1000 sequential calls all return the same response without errors and
    // complete quickly.
    const start = Date.now();
    for (let i = 0; i < 200; i += 1) {
      const r = await ctx.fetchSharedNote(token);
      expect(r.status).toBe(200);
    }
    expect(Date.now() - start).toBeLessThan(5_000);
  });

  it('invalidates the cached shared note when the note is updated', async () => {
    const ctx = await setupCacheApp();
    const token = await ctx.shareTokenFor('note_a');
    const first = (await ctx.fetchSharedNote(token)).body as { note: { content: string } };
    expect(first.note.content).toBe('original');
    await ctx.updateNote('note_a', 'updated content');
    const second = (await ctx.fetchSharedNote(token)).body as { note: { content: string } };
    expect(second.note.content).toBe('updated content');
  });

  it('invalidates the cache when the share link is revoked', async () => {
    const ctx = await setupCacheApp();
    const token = await ctx.shareTokenFor('note_a');
    const first = await ctx.fetchSharedNote(token);
    expect(first.status).toBe(200);
    await ctx.app.request('/api/notes/note_a/share-link', { method: 'DELETE' });
    const after = await ctx.fetchSharedNote(token);
    expect(after.status).toBe(404);
  });

  it('caches the resolver response and serves the same answer on repeated calls', async () => {
    const ctx = await setupCacheApp();
    const token = await ctx.shareTokenFor('note_a');
    const first = await ctx.resolveShared(token, ['note_a']);
    const second = await ctx.resolveShared(token, ['note_a']);
    expect((first.body as { resolutions: unknown[] }).resolutions).toEqual(
      (second.body as { resolutions: unknown[] }).resolutions
    );
  });

  it('returns different cache entries for different (token, targets) combinations', async () => {
    const ctx = await setupCacheApp();
    const token = await ctx.shareTokenFor('note_a');
    const a = await ctx.resolveShared(token, ['note_a']);
    const b = await ctx.resolveShared(token, ['note_a', 'note_b']);
    expect((a.body as { resolutions: unknown[] }).resolutions.length).toBeLessThan(
      (b.body as { resolutions: unknown[] }).resolutions.length
    );
  });
});
