import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
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

async function setupShareApp() {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), 'notes-share-links-'));
  tempDirs.push(dir);
  vi.stubEnv('TURSO_DB_URL', `file:${path.join(dir, 'test.db')}`);
  vi.stubEnv('FRONTEND_URL', 'https://notes.example.test');

  const [{ db, libsql }, schema, { noteRoutes }, { shareRoutes }] = await Promise.all([
    import('../src/api/db/client'),
    import('../src/api/db/schema'),
    import('../src/api/routes/notes'),
    import('../src/api/routes/share'),
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
  const userB = {
    id: 'user_b',
    name: 'User B',
    email: 'b@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const folderA = {
    id: 'folder_a',
    userId: userA.id,
    parentFolderId: null,
    title: 'A Folder',
    isPrivate: false,
    isAgentReadOnly: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const noteA = {
    id: 'note_a',
    folderId: folderA.id,
    userId: userA.id,
    title: 'A Note',
    content: '# Shared\n\nHello',
    type: 'note' as const,
    isApiEditable: true,
    updatedByActorType: null,
    updatedByActorId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(schema.user).values([userA, userB]);
  await db.insert(schema.folders).values(folderA);
  await db.insert(schema.notes).values(noteA);

  const app = new Hono();
  app.use('/api/notes/*', async (c, next) => {
    const currentUser = c.req.header('x-user') === 'b' ? userB : userA;
    c.set('user', currentUser);
    c.set('session', { id: `session_${currentUser.id}`, userId: currentUser.id });
    await next();
  });
  app.route('/api/notes', noteRoutes);
  app.route('/api/share', shareRoutes);

  return { app, db, schema };
}

function tokenFromUrl(url: string) {
  const token = new URL(url).pathname.split('/').pop();
  if (!token) throw new Error('Missing share token in URL');
  return token;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('note share links', () => {
  it('creates a share link and resolves it publicly', async () => {
    const { app } = await setupShareApp();

    const create = await app.request('/api/notes/note_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(create.status).toBe(201);
    const { shareLink } = (await create.json()) as { shareLink: { id: string; url: string } };
    expect(shareLink.url).toMatch(/^https:\/\/notes\.example\.test\/share\//);

    const publicRead = await app.request(`/api/share/${tokenFromUrl(shareLink.url)}`);
    expect(publicRead.status).toBe(200);
    const body = (await publicRead.json()) as {
      note: { title: string; content: string; documentType: string };
      share: { id: string; permission: string };
      resolutions: Array<{ target: string; href: string | null }>;
    };
    expect(body.note).toEqual({
      title: 'A Note',
      content: '# Shared\n\nHello',
      documentType: 'markdown',
      updatedAt: expect.any(String),
    });
    expect(body.share.id).toBe(shareLink.id);
    expect(body.share.permission).toBe('read');
    expect(body.resolutions).toEqual([]);
  });

  it('returns fresh source-bound wikilink destinations with the shared note', async () => {
    const { app, db, schema } = await setupShareApp();
    await db
      .update(schema.notes)
      .set({ content: '[[Shared Target]] [[Private Target]] [[Missing]]' })
      .where(eq(schema.notes.id, 'note_a'));
    await db.insert(schema.notes).values([
      {
        id: 'note_shared',
        folderId: 'folder_a',
        userId: 'user_a',
        title: 'Shared Target',
        content: '',
        documentType: 'markdown',
        type: 'note',
        isApiEditable: true,
        updatedByActorType: null,
        updatedByActorId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'note_private',
        folderId: 'folder_a',
        userId: 'user_a',
        title: 'Private Target',
        content: '',
        documentType: 'markdown',
        type: 'note',
        isApiEditable: true,
        updatedByActorType: null,
        updatedByActorId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const sourceCreate = await app.request('/api/notes/note_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const targetCreate = await app.request('/api/notes/note_shared/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const sourceToken = tokenFromUrl(((await sourceCreate.json()) as { shareLink: { url: string } }).shareLink.url);
    const targetToken = tokenFromUrl(((await targetCreate.json()) as { shareLink: { url: string } }).shareLink.url);

    const first = (await (await app.request(`/api/share/${sourceToken}`)).json()) as {
      resolutions: Array<{ target: string; href: string | null }>;
    };
    expect(first.resolutions).toEqual([
      { target: 'Shared Target', href: `/share/${targetToken}` },
      { target: 'Private Target', href: null },
      { target: 'Missing', href: null },
    ]);

    await app.request('/api/notes/note_shared/share-link', { method: 'DELETE' });
    const afterRevoke = (await (await app.request(`/api/share/${sourceToken}`)).json()) as {
      resolutions: Array<{ target: string; href: string | null }>;
    };
    expect(afterRevoke.resolutions[0]).toEqual({ target: 'Shared Target', href: null });
  });

  it('creates a share link for canvas notes', async () => {
    const { app, db, schema } = await setupShareApp();
    await db.insert(schema.notes).values({
      id: 'note_canvas',
      folderId: 'folder_a',
      userId: 'user_a',
      title: 'Shared Canvas',
      content: JSON.stringify({ nodes: [], edges: [] }),
      documentType: 'canvas.default',
      type: 'note',
      isApiEditable: true,
      updatedByActorType: null,
      updatedByActorId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const create = await app.request('/api/notes/note_canvas/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(create.status).toBe(201);
    const { shareLink } = (await create.json()) as { shareLink: { url: string } };

    const publicRead = await app.request(`/api/share/${tokenFromUrl(shareLink.url)}`);
    expect(publicRead.status).toBe(200);
    const body = (await publicRead.json()) as { note: { title: string; content: string; documentType: string } };
    expect(body.note.title).toBe('Shared Canvas');
    expect(body.note.documentType).toBe('canvas.default');
    expect(JSON.parse(body.note.content)).toEqual({ nodes: [], edges: [] });
  });

  it('returns existing active share metadata on repeated create', async () => {
    const { app } = await setupShareApp();

    const first = await app.request('/api/notes/note_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const { shareLink: firstShare } = (await first.json()) as { shareLink: { id: string; url: string } };

    const second = await app.request('/api/notes/note_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(second.status).toBe(200);
    const { shareLink: secondShare } = (await second.json()) as { shareLink: { id: string; url: string | null } };
    expect(secondShare.id).toBe(firstShare.id);
    expect(secondShare.url).toBe(firstShare.url);
  });

  it('revokes a share link', async () => {
    const { app } = await setupShareApp();

    const create = await app.request('/api/notes/note_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const { shareLink } = (await create.json()) as { shareLink: { url: string } };
    const token = tokenFromUrl(shareLink.url);

    const revoke = await app.request('/api/notes/note_a/share-link', { method: 'DELETE' });
    expect(revoke.status).toBe(200);

    const publicRead = await app.request(`/api/share/${token}`);
    expect(publicRead.status).toBe(404);
  });

  it('does not allow another user to manage a share link', async () => {
    const { app } = await setupShareApp();

    const create = await app.request('/api/notes/note_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user': 'b' },
      body: JSON.stringify({}),
    });
    expect(create.status).toBe(404);

    const revoke = await app.request('/api/notes/note_a/share-link', { method: 'DELETE', headers: { 'x-user': 'b' } });
    expect(revoke.status).toBe(404);
  });

  it('invalidates a share link when the note is deleted', async () => {
    const { app, db, schema } = await setupShareApp();

    const create = await app.request('/api/notes/note_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const { shareLink } = (await create.json()) as { shareLink: { url: string } };
    const token = tokenFromUrl(shareLink.url);

    await db.delete(schema.notes);

    const publicRead = await app.request(`/api/share/${token}`);
    expect(publicRead.status).toBe(404);
  });
});
