import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tempDirs: string[] = [];

async function runMigrations(libsql: { executeMultiple: (sql: string) => Promise<unknown> }) {
  for (let index = 0; index <= 24; index += 1) {
    const [file] = await Array.fromAsync(
      (await import('node:fs/promises')).glob(`drizzle/${String(index).padStart(4, '0')}_*.sql`)
    );
    if (!file) throw new Error(`Missing migration ${index}`);
    await libsql.executeMultiple(await readFile(file, 'utf8'));
  }
}

async function setupTrashNotesApp() {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), 'notes-trash-notes-'));
  tempDirs.push(dir);
  vi.stubEnv('TURSO_DB_URL', `file:${path.join(dir, 'test.db')}`);
  vi.stubEnv('FRONTEND_URL', 'https://notes.example.test');
  vi.stubEnv('ATTACHMENT_STORAGE_DRIVER', 'filesystem');
  vi.stubEnv('ATTACHMENT_STORAGE_PATH', path.join(dir, 'attachments'));

  const [{ db, libsql }, schema, { folderRoutes }, { noteRoutes }, { shareRoutes }, { trashRoutes }, storage] =
    await Promise.all([
      import('../src/api/db/client'),
      import('../src/api/db/schema'),
      import('../src/api/routes/folders'),
      import('../src/api/routes/notes'),
      import('../src/api/routes/share'),
      import('../src/api/routes/trash'),
      import('../src/api/storage'),
    ]);
  await runMigrations(libsql);

  const users = [
    {
      id: 'user_a',
      name: 'User A',
      email: 'a@example.com',
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'user_b',
      name: 'User B',
      email: 'b@example.com',
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  await db.insert(schema.user).values(users);

  const app = new Hono();
  app.use('/api/*', async (c, next) => {
    const user = c.req.header('x-user') === 'b' ? users[1] : users[0];
    c.set('user', user);
    c.set('session', null);
    await next();
  });
  app.route('/api/folders', folderRoutes);
  app.route('/api/notes', noteRoutes);
  app.route('/api/share', shareRoutes);
  app.route('/api/trash', trashRoutes);

  return { app, db, schema, storage, users };
}

async function createFolder(app: Hono, title: string, user = 'a') {
  const response = await app.request('/api/folders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user': user },
    body: JSON.stringify({ title }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { folder: { id: string } }).folder;
}

async function createNote(app: Hono, folderId: string, title = 'Recoverable note', user = 'a') {
  const response = await app.request(`/api/folders/${folderId}/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user': user },
    body: JSON.stringify({ title, content: '# Recoverable\n\nBody' }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { note: { id: string; folderId: string } }).note;
}

function tokenFromUrl(url: string) {
  const token = new URL(url).pathname.split('/').pop();
  if (!token) throw new Error('Missing share token');
  return token;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('note Trash lifecycle', () => {
  it('moves a note to Trash while preserving recoverable metadata and revoking its share', async () => {
    const { app, db, schema } = await setupTrashNotesApp();
    const folder = await createFolder(app, 'Notes');
    const note = await createNote(app, folder.id);

    expect(
      (
        await app.request(`/api/notes/${note.id}/tags`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tags: ['recoverable'] }),
        })
      ).status
    ).toBe(200);
    const share = await app.request(`/api/notes/${note.id}/share-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const token = tokenFromUrl(((await share.json()) as { shareLink: { url: string } }).shareLink.url);

    const remove = await app.request(`/api/notes/${note.id}`, { method: 'DELETE' });
    expect(remove.status).toBe(200);
    expect(await remove.json()).toMatchObject({ ok: true, deletedAt: expect.any(String) });
    expect((await app.request(`/api/notes/${note.id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await app.request(`/api/share/${token}`)).status).toBe(404);

    const trash = (await (await app.request('/api/trash')).json()) as {
      notes: Array<{
        id: string;
        originalFolderTitle: string;
        originalFolderAvailable: boolean;
        deletedAt: string;
      }>;
    };
    expect(trash.notes).toEqual([
      expect.objectContaining({
        id: note.id,
        originalFolderTitle: 'Notes',
        originalFolderAvailable: true,
        deletedAt: expect.any(String),
      }),
    ]);

    const [storedNote] = await db.select().from(schema.notes).where(eq(schema.notes.id, note.id));
    const versions = await db.select().from(schema.noteVersions).where(eq(schema.noteVersions.noteId, note.id));
    const events = await db.select().from(schema.noteEvents).where(eq(schema.noteEvents.noteId, note.id));
    const noteTagRows = await db.select().from(schema.noteTags).where(eq(schema.noteTags.noteId, note.id));
    const [shareRow] = await db.select().from(schema.noteShareLinks).where(eq(schema.noteShareLinks.noteId, note.id));
    expect(storedNote.deletedAt).toBeInstanceOf(Date);
    expect(versions.length).toBeGreaterThan(0);
    expect(noteTagRows).toHaveLength(1);
    expect(events.map((event) => event.eventType)).toContain('trash');
    expect(shareRow.revokedAt).toBeInstanceOf(Date);
  });

  it('restores to the original folder without reactivating the revoked share', async () => {
    const { app, db, schema } = await setupTrashNotesApp();
    const folder = await createFolder(app, 'Notes');
    const note = await createNote(app, folder.id);
    const share = await app.request(`/api/notes/${note.id}/share-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const token = tokenFromUrl(((await share.json()) as { shareLink: { url: string } }).shareLink.url);
    expect((await app.request(`/api/notes/${note.id}`, { method: 'DELETE' })).status).toBe(200);
    expect(
      (
        await app.request(`/api/trash/notes/${note.id}/restore`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-user': 'b' },
          body: '{}',
        })
      ).status
    ).toBe(404);

    const restore = await app.request(`/api/trash/notes/${note.id}/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(restore.status).toBe(200);
    expect(await restore.json()).toMatchObject({
      note: { id: note.id, folderId: folder.id },
      restoredToOriginalFolder: true,
    });
    expect((await app.request(`/api/notes/${note.id}`)).status).toBe(200);
    expect((await app.request(`/api/share/${token}`)).status).toBe(404);
    expect(((await (await app.request('/api/trash')).json()) as { notes: unknown[] }).notes).toEqual([]);

    const events = await db.select().from(schema.noteEvents).where(eq(schema.noteEvents.noteId, note.id));
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining(['trash', 'restore_from_trash']));
  });

  it('moves and restores templates without losing their template identity', async () => {
    const { app } = await setupTrashNotesApp();
    const folder = await createFolder(app, 'Templates');
    const create = await app.request(`/api/folders/${folder.id}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Reusable', content: '# Template', type: 'template' }),
    });
    const template = ((await create.json()) as { note: { id: string } }).note;

    expect((await app.request(`/api/notes/${template.id}`, { method: 'DELETE' })).status).toBe(200);
    const templatesWhileTrashed = (await (await app.request('/api/notes/templates')).json()) as {
      templates: unknown[];
    };
    const trash = (await (await app.request('/api/trash')).json()) as {
      notes: Array<{ id: string; type: string }>;
    };
    expect(templatesWhileTrashed.templates).toEqual([]);
    expect(trash.notes).toEqual([expect.objectContaining({ id: template.id, type: 'template' })]);

    expect(
      (
        await app.request(`/api/trash/notes/${template.id}/restore`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).status
    ).toBe(200);
    const templatesAfterRestore = (await (await app.request('/api/notes/templates')).json()) as {
      templates: Array<{ id: string }>;
    };
    expect(templatesAfterRestore.templates.map((item) => item.id)).toEqual([template.id]);
  });

  it('requires a valid destination when the original folder is unavailable', async () => {
    const { app, db, schema } = await setupTrashNotesApp();
    const original = await createFolder(app, 'Original');
    const destination = await createFolder(app, 'Recovered');
    const note = await createNote(app, original.id);
    expect((await app.request(`/api/notes/${note.id}`, { method: 'DELETE' })).status).toBe(200);
    await db.update(schema.folders).set({ deletedAt: new Date() }).where(eq(schema.folders.id, original.id));

    const missingDestination = await app.request(`/api/trash/notes/${note.id}/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(missingDestination.status).toBe(409);
    expect(await missingDestination.json()).toMatchObject({ requiresDestination: true });

    const restore = await app.request(`/api/trash/notes/${note.id}/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId: destination.id }),
    });
    expect(restore.status).toBe(200);
    expect(await restore.json()).toMatchObject({
      note: { id: note.id, folderId: destination.id },
      restoredToOriginalFolder: false,
    });
  });

  it('atomically moves selected notes to Trash and revokes their shares', async () => {
    const { app, db, schema } = await setupTrashNotesApp();
    const folder = await createFolder(app, 'Notes');
    const first = await createNote(app, folder.id, 'First');
    const second = await createNote(app, folder.id, 'Second');

    for (const note of [first, second]) {
      expect(
        (
          await app.request(`/api/notes/${note.id}/share-link`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
        ).status
      ).toBe(201);
    }

    const rejected = await app.request('/api/notes/trash', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ noteIds: [first.id, 'note_missing'] }),
    });
    expect(rejected.status).toBe(404);
    expect(
      await db.select({ id: schema.notes.id }).from(schema.notes).where(isNull(schema.notes.deletedAt))
    ).toHaveLength(2);

    const response = await app.request('/api/notes/trash', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ noteIds: [first.id, second.id] }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, noteCount: 2 });

    const [trashed, shares, events] = await Promise.all([
      db.select().from(schema.notes).where(isNotNull(schema.notes.deletedAt)),
      db.select().from(schema.noteShareLinks).where(isNotNull(schema.noteShareLinks.revokedAt)),
      db.select().from(schema.noteEvents).where(eq(schema.noteEvents.eventType, 'trash')),
    ]);
    expect(trashed).toHaveLength(2);
    expect(shares).toHaveLength(2);
    expect(events).toHaveLength(2);
  });

  it('permanently deletes only trashed owner notes and removes attachment objects', async () => {
    const { app, db, schema, storage, users } = await setupTrashNotesApp();
    const folder = await createFolder(app, 'Notes');
    const active = await createNote(app, folder.id, 'Active');
    const note = await createNote(app, folder.id, 'Purge me');
    await app.request(`/api/notes/${note.id}/tags`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['purge-only'] }),
    });

    const storageKey = `users/${users[0].id}/notes/${note.id}/attachments/att_purge-image.png`;
    await storage.getObjectStorage().putObject({
      key: storageKey,
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/png',
    });
    await db.insert(schema.attachments).values({
      id: 'att_purge',
      userId: users[0].id,
      noteId: note.id,
      folderId: folder.id,
      provider: 'filesystem',
      filename: 'image.png',
      mimeType: 'image/png',
      size: 3,
      contentHash: 'hash',
      storageKey,
      status: 'ready',
    });

    expect((await app.request(`/api/trash/notes/${active.id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await app.request(`/api/notes/${note.id}`, { method: 'DELETE' })).status).toBe(200);
    expect(
      (await app.request(`/api/trash/notes/${note.id}`, { method: 'DELETE', headers: { 'x-user': 'b' } })).status
    ).toBe(404);

    const purge = await app.request(`/api/trash/notes/${note.id}`, { method: 'DELETE' });
    expect(purge.status).toBe(200);
    expect(await purge.json()).toEqual({ ok: true, deletedAttachmentCount: 1 });
    await expect(storage.getObjectStorage().getObject({ key: storageKey })).resolves.toBeNull();

    const [storedNote, attachment, versions, events, noteTags, remainingTag] = await Promise.all([
      db.select().from(schema.notes).where(eq(schema.notes.id, note.id)),
      db.select().from(schema.attachments).where(eq(schema.attachments.noteId, note.id)),
      db.select().from(schema.noteVersions).where(eq(schema.noteVersions.noteId, note.id)),
      db.select().from(schema.noteEvents).where(eq(schema.noteEvents.noteId, note.id)),
      db.select().from(schema.noteTags).where(eq(schema.noteTags.noteId, note.id)),
      db
        .select()
        .from(schema.tags)
        .where(and(eq(schema.tags.userId, users[0].id), eq(schema.tags.normalizedName, 'purge-only'))),
    ]);
    expect([storedNote, attachment, versions, events, noteTags, remainingTag].every((rows) => rows.length === 0)).toBe(
      true
    );
    expect((await app.request(`/api/trash/notes/${note.id}`, { method: 'DELETE' })).status).toBe(404);
  });
});
