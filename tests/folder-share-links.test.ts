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

async function setupFolderShareApp() {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), 'notes-folder-share-links-'));
  tempDirs.push(dir);
  vi.stubEnv('TURSO_DB_URL', `file:${path.join(dir, 'test.db')}`);
  vi.stubEnv('FRONTEND_URL', 'https://notes.example.test');

  const [{ db, libsql }, schema, { folderRoutes }, { shareRoutes }] = await Promise.all([
    import('../src/api/db/client'),
    import('../src/api/db/schema'),
    import('../src/api/routes/folders'),
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
  const childFolder = {
    id: 'folder_child',
    userId: userA.id,
    parentFolderId: folderA.id,
    title: 'Child Folder',
    isPrivate: false,
    isAgentReadOnly: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const privateFolder = {
    id: 'folder_private',
    userId: userA.id,
    parentFolderId: null,
    title: 'Private Folder',
    isPrivate: true,
    isAgentReadOnly: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(schema.user).values([userA, userB]);
  await db.insert(schema.folders).values([folderA, childFolder, privateFolder]);
  await db.insert(schema.notes).values([
    {
      id: 'note_a',
      folderId: folderA.id,
      userId: userA.id,
      title: 'A Note',
      content: '# Shared\n\nHello',
      type: 'note',
      documentType: 'markdown',
      isApiEditable: true,
      updatedByActorType: null,
      updatedByActorId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'note_template',
      folderId: folderA.id,
      userId: userA.id,
      title: 'Template',
      content: 'hidden template',
      type: 'template',
      documentType: 'markdown',
      isApiEditable: true,
      updatedByActorType: null,
      updatedByActorId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'note_child',
      folderId: childFolder.id,
      userId: userA.id,
      title: 'Child Note',
      content: 'hidden child',
      type: 'note',
      documentType: 'markdown',
      isApiEditable: true,
      updatedByActorType: null,
      updatedByActorId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const app = new Hono();
  app.use('/api/folders/*', async (c, next) => {
    const currentUser = c.req.header('x-user') === 'b' ? userB : userA;
    c.set('user', currentUser);
    c.set('session', { id: `session_${currentUser.id}`, userId: currentUser.id });
    await next();
  });
  app.route('/api/folders', folderRoutes);
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

describe('folder share links', () => {
  it('creates a share link and resolves direct notes publicly', async () => {
    const { app } = await setupFolderShareApp();

    const create = await app.request('/api/folders/folder_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(create.status).toBe(201);
    const { shareLink } = (await create.json()) as { shareLink: { id: string; url: string } };
    expect(shareLink.url).toMatch(/^https:\/\/notes\.example\.test\/share\/folders\//);

    const publicRead = await app.request(`/api/share/folders/${tokenFromUrl(shareLink.url)}`);
    expect(publicRead.status).toBe(200);
    const body = (await publicRead.json()) as {
      folder: { title: string };
      notes: Array<{ title: string; content: string }>;
      share: { id: string; permission: string };
    };
    expect(body.folder.title).toBe('A Folder');
    expect(body.notes).toEqual([expect.objectContaining({ title: 'A Note', content: '# Shared\n\nHello' })]);
    expect(body.notes.map((note) => note.title)).not.toContain('Template');
    expect(body.notes.map((note) => note.title)).not.toContain('Child Note');
    expect(body.share.id).toBe(shareLink.id);
    expect(body.share.permission).toBe('read');
  });

  it('returns existing active share metadata on repeated create', async () => {
    const { app } = await setupFolderShareApp();

    const first = await app.request('/api/folders/folder_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const { shareLink: firstShare } = (await first.json()) as { shareLink: { id: string; url: string } };

    const second = await app.request('/api/folders/folder_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(second.status).toBe(200);
    const { shareLink: secondShare } = (await second.json()) as { shareLink: { id: string; url: string | null } };
    expect(secondShare.id).toBe(firstShare.id);
    expect(secondShare.url).toBe(firstShare.url);
  });

  it('regenerates and revokes folder share links', async () => {
    const { app } = await setupFolderShareApp();

    const first = await app.request('/api/folders/folder_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const { shareLink: firstShare } = (await first.json()) as { shareLink: { url: string } };

    const regenerate = await app.request('/api/folders/folder_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ regenerate: true }),
    });
    expect(regenerate.status).toBe(201);
    const { shareLink: secondShare } = (await regenerate.json()) as { shareLink: { url: string } };
    expect(secondShare.url).not.toBe(firstShare.url);
    expect((await app.request(`/api/share/folders/${tokenFromUrl(firstShare.url)}`)).status).toBe(404);
    expect((await app.request(`/api/share/folders/${tokenFromUrl(secondShare.url)}`)).status).toBe(200);

    const revoke = await app.request('/api/folders/folder_a/share-link', { method: 'DELETE' });
    expect(revoke.status).toBe(200);
    expect((await app.request(`/api/share/folders/${tokenFromUrl(secondShare.url)}`)).status).toBe(404);
  });

  it('rejects private folders and hides folders made private after sharing', async () => {
    const { app, db, schema } = await setupFolderShareApp();

    const privateCreate = await app.request('/api/folders/folder_private/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(privateCreate.status).toBe(403);

    const create = await app.request('/api/folders/folder_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const { shareLink } = (await create.json()) as { shareLink: { url: string } };
    await db.update(schema.folders).set({ isPrivate: true }).where(eq(schema.folders.id, 'folder_a'));

    const publicRead = await app.request(`/api/share/folders/${tokenFromUrl(shareLink.url)}`);
    expect(publicRead.status).toBe(404);
  });

  it('does not allow another user to manage a folder share link', async () => {
    const { app } = await setupFolderShareApp();

    const create = await app.request('/api/folders/folder_a/share-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user': 'b' },
      body: JSON.stringify({}),
    });
    expect(create.status).toBe(404);

    const revoke = await app.request('/api/folders/folder_a/share-link', {
      method: 'DELETE',
      headers: { 'x-user': 'b' },
    });
    expect(revoke.status).toBe(404);
  });
});
