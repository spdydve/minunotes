import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tempDirs: string[] = [];

async function runMigrations(libsql: { executeMultiple: (sql: string) => Promise<unknown> }, from = 0, through = 24) {
  for (let index = from; index <= through; index += 1) {
    const [file] = await Array.fromAsync(
      (await import('node:fs/promises')).glob(`drizzle/${String(index).padStart(4, '0')}_*.sql`)
    );
    if (!file) throw new Error(`Missing migration ${index}`);
    await libsql.executeMultiple(await readFile(file, 'utf8'));
  }
}

async function setupTrashPolicyApp() {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), 'notes-trash-policy-'));
  tempDirs.push(dir);
  vi.stubEnv('TURSO_DB_URL', `file:${path.join(dir, 'test.db')}`);
  vi.stubEnv('FRONTEND_URL', 'https://notes.example.test');

  const [
    { db, libsql },
    schema,
    { attachmentRoutes },
    { folderRoutes },
    { harnessRoutes },
    { noteRoutes },
    { shareRoutes },
  ] = await Promise.all([
    import('../src/api/db/client'),
    import('../src/api/db/schema'),
    import('../src/api/routes/attachments'),
    import('../src/api/routes/folders'),
    import('../src/api/routes/harness'),
    import('../src/api/routes/notes'),
    import('../src/api/routes/share'),
  ]);

  await runMigrations(libsql);
  const user = {
    id: 'user_trash',
    name: 'Trash Tester',
    email: 'trash@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.insert(schema.user).values(user);

  const app = new Hono();
  app.use('/api/folders/*', async (c, next) => {
    c.set('user', user);
    c.set('session', null);
    await next();
  });
  app.use('/api/notes/*', async (c, next) => {
    c.set('user', user);
    c.set('session', null);
    await next();
  });
  app.use('/api/attachments/*', async (c, next) => {
    c.set('user', user);
    c.set('session', null);
    await next();
  });
  app.use('/api/harness/*', async (c, next) => {
    c.set('user', user);
    c.set('session', null);
    c.set('apiKey', null);
    c.set('oauthAuthorization', null);
    await next();
  });
  app.route('/api/folders', folderRoutes);
  app.route('/api/notes', noteRoutes);
  app.route('/api/attachments', attachmentRoutes);
  app.route('/api/harness', harnessRoutes);
  app.route('/api/share', shareRoutes);

  return { app, db, schema, user };
}

async function createFolder(app: Hono, title: string, parentFolderId?: string) {
  const response = await app.request('/api/folders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, parentFolderId }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { folder: { id: string } }).folder;
}

async function createNote(app: Hono, folderId: string, title: string, content = '') {
  const response = await app.request(`/api/folders/${folderId}/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, content }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { note: { id: string } }).note;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Trash active-content policy', () => {
  it('migrates existing notes and folders as active rows', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'notes-trash-migration-'));
    tempDirs.push(dir);
    const client = createClient({ url: `file:${path.join(dir, 'migration.db')}` });
    await runMigrations(client, 0, 23);
    await client.executeMultiple(`
      insert into user (id, name, email, email_verified) values ('user_existing', 'Existing', 'existing@example.com', 1);
      insert into folders (id, user_id, title) values ('folder_existing', 'user_existing', 'Existing folder');
      insert into notes (id, folder_id, user_id, title, content) values ('note_existing', 'folder_existing', 'user_existing', 'Existing note', 'Body');
    `);

    await runMigrations(client, 24, 24);
    const folder = await client.execute("select deleted_at, trash_batch_id from folders where id = 'folder_existing'");
    const note = await client.execute("select deleted_at, trash_batch_id from notes where id = 'note_existing'");
    expect(folder.rows[0]).toMatchObject({ deleted_at: null, trash_batch_id: null });
    expect(note.rows[0]).toMatchObject({ deleted_at: null, trash_batch_id: null });
    client.close();
  });

  it('hides a trashed note from normal, harness, metadata, link, share, and attachment reads', async () => {
    const { app, db, schema, user } = await setupTrashPolicyApp();
    const folder = await createFolder(app, 'Active');
    const target = await createNote(app, folder.id, 'Target');
    const source = await createNote(app, folder.id, 'Source', '[[Target]]');

    const tags = await app.request(`/api/notes/${target.id}/tags`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['important'] }),
    });
    expect(tags.status).toBe(200);

    const share = await app.request(`/api/notes/${target.id}/share-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(share.status).toBe(201);
    const shareUrl = ((await share.json()) as { shareLink: { url: string } }).shareLink.url;
    const token = new URL(shareUrl).pathname.split('/').pop();
    expect(token).toBeTruthy();

    await db.insert(schema.attachments).values({
      id: 'att_trashed',
      userId: user.id,
      noteId: target.id,
      folderId: folder.id,
      provider: 'filesystem',
      filename: 'hidden.png',
      mimeType: 'image/png',
      size: 1,
      contentHash: 'hash',
      storageKey: 'hidden.png',
      status: 'ready',
    });
    await db.update(schema.notes).set({ deletedAt: new Date() }).where(eq(schema.notes.id, target.id));

    const [direct, harness, versions, noteTags, attachment, publicShare] = await Promise.all([
      app.request(`/api/notes/${target.id}`),
      app.request(`/api/harness/notes/${target.id}`),
      app.request(`/api/notes/${target.id}/versions`),
      app.request(`/api/notes/${target.id}/tags`),
      app.request('/api/attachments/att_trashed/content'),
      app.request(`/api/share/${token}`),
    ]);
    expect([
      direct.status,
      harness.status,
      versions.status,
      noteTags.status,
      attachment.status,
      publicShare.status,
    ]).toEqual([404, 404, 404, 404, 404, 404]);

    const [edit, replaceTags, move] = await Promise.all([
      app.request(`/api/harness/notes/${target.id}/edit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseHash: 'hidden', edits: [{ type: 'append', text: '\nblocked' }] }),
      }),
      app.request(`/api/harness/notes/${target.id}/tags`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags: ['blocked'] }),
      }),
      app.request('/api/harness/notes/move', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ noteIds: [target.id], targetFolderId: folder.id }),
      }),
    ]);
    expect([edit.status, replaceTags.status, move.status]).toEqual([404, 404, 404]);

    const recent = (await (await app.request('/api/notes/recent')).json()) as { notes: Array<{ id: string }> };
    const search = (await (await app.request('/api/notes/search?q=Target')).json()) as {
      notes: Array<{ id: string }>;
    };
    const tagList = (await (await app.request('/api/notes/tags')).json()) as { tags: Array<{ name: string }> };
    expect(recent.notes.map((note) => note.id)).not.toContain(target.id);
    expect(search.notes.map((note) => note.id)).not.toContain(target.id);
    expect(tagList.tags).toEqual([]);

    const outgoing = (await (await app.request(`/api/notes/${source.id}/links`)).json()) as {
      links: Array<{ targetNoteId: string | null }>;
    };
    expect(outgoing.links).toHaveLength(1);
    expect(outgoing.links[0].targetNoteId).toBeNull();
    expect((await app.request(`/api/notes/${target.id}/backlinks`)).status).toBe(404);
  });

  it('hides an entire descendant hierarchy when only its root is marked trashed', async () => {
    const { app, db, schema } = await setupTrashPolicyApp();
    const root = await createFolder(app, 'Root');
    const child = await createFolder(app, 'Child', root.id);
    const note = await createNote(app, child.id, 'Nested note', 'hidden hierarchy text');

    const share = await app.request(`/api/folders/${child.id}/share-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(share.status).toBe(201);
    const shareUrl = ((await share.json()) as { shareLink: { url: string } }).shareLink.url;
    const token = new URL(shareUrl).pathname.split('/').pop();
    const noteShare = await app.request(`/api/notes/${note.id}/share-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(noteShare.status).toBe(201);
    const noteShareUrl = ((await noteShare.json()) as { shareLink: { url: string } }).shareLink.url;
    const noteToken = new URL(noteShareUrl).pathname.split('/').pop();

    await db.update(schema.folders).set({ deletedAt: new Date() }).where(eq(schema.folders.id, root.id));

    const folders = (await (await app.request('/api/folders')).json()) as { folders: Array<{ id: string }> };
    const harnessFolders = (await (await app.request('/api/harness/folders')).json()) as {
      folders: Array<{ id: string }>;
    };
    expect(folders.folders).toEqual([]);
    expect(harnessFolders.folders).toEqual([]);

    const [direct, harness, folderNotes, sharedFolder, sharedNote] = await Promise.all([
      app.request(`/api/notes/${note.id}`),
      app.request(`/api/harness/notes/${note.id}`),
      app.request(`/api/folders/${child.id}/notes`),
      app.request(`/api/share/folders/${token}`),
      app.request(`/api/share/${noteToken}`),
    ]);
    expect([direct.status, harness.status, sharedFolder.status, sharedNote.status]).toEqual([404, 404, 404, 404]);
    expect(((await folderNotes.json()) as { notes: unknown[] }).notes).toEqual([]);
    const createInTrashedFolder = await app.request('/api/harness/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId: child.id, title: 'Blocked note' }),
    });
    expect(createInTrashedFolder.status).toBe(404);

    const search = (await (await app.request('/api/harness/notes/search?q=hierarchy')).json()) as {
      notes: unknown[];
    };
    const lines = (await (await app.request('/api/harness/notes/search-lines?q=hierarchy')).json()) as {
      matches: unknown[];
    };
    expect(search.notes).toEqual([]);
    expect(lines.matches).toEqual([]);
  });
});
