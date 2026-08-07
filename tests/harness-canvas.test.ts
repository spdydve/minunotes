import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
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

async function setupHarnessApp() {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), 'notes-harness-canvas-'));
  tempDirs.push(dir);
  vi.stubEnv('TURSO_DB_URL', `file:${path.join(dir, 'test.db')}`);

  const [{ db, libsql }, schema, { harnessRoutes }] = await Promise.all([
    import('../src/api/db/client'),
    import('../src/api/db/schema'),
    import('../src/api/routes/harness'),
  ]);

  await runMigrations(libsql);

  const user = {
    id: 'user_test',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const apiKey = {
    id: 'agent_key_test',
    userId: user.id,
    name: 'Test key',
    uid: 'ABCDEFGH',
    hash: 'hash',
    salt: 'salt',
    canCreateFolders: true,
    canRead: true,
    canCreate: true,
    canEdit: true,
    accessMode: 'all' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
  };
  const folder = {
    id: 'folder_canvas',
    userId: user.id,
    parentFolderId: null,
    title: 'Canvas',
    isPrivate: false,
    isAgentReadOnly: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(schema.user).values(user);
  await db.insert(schema.apiKeys).values(apiKey);
  await db.insert(schema.folders).values(folder);

  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('user', user);
    c.set('session', null);
    c.set('apiKey', apiKey);
    await next();
  });
  app.route('/api/harness', harnessRoutes);

  return { app, db, schema, folder };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('harness canvas operations', () => {
  it('creates a canvas note from raw JSON', async () => {
    const { app, folder } = await setupHarnessApp();
    const canvas = { nodes: [{ id: 'a', type: 'text', text: 'A', x: 0, y: 0, width: 120, height: 48 }], edges: [] };

    const response = await app.request('/api/harness/canvases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId: folder.id, title: 'Raw canvas', canvas }),
    });

    expect(response.status).toBe(201);
    const { note } = (await response.json()) as {
      note: { id: string; title: string; documentType: string; content?: string };
    };
    expect(note.title).toBe('Raw canvas');
    expect(note.documentType).toBe('canvas.default');
    expect(note.content).toBeUndefined();

    const read = await app.request(`/api/harness/notes/${note.id}`);
    expect(read.status).toBe(200);
    const { note: fullNote } = (await read.json()) as { note: { content: string } };
    expect(JSON.parse(fullNote.content)).toEqual(canvas);
  });

  it('creates a mind map note from diagram syntax', async () => {
    const { app, folder } = await setupHarnessApp();

    const response = await app.request('/api/harness/canvases/from-syntax', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        folderId: folder.id,
        syntax: `diagram "Product plan" {\n  layout mindmap\n  Product\n  Product > Research\n  Product > Build\n}`,
      }),
    });

    expect(response.status).toBe(201);
    const { note, diagnostics } = (await response.json()) as {
      note: { id: string; title: string; documentType: string; content?: string };
      diagnostics: unknown[];
    };
    expect(note.title).toBe('Product plan');
    expect(note.documentType).toBe('canvas.mindmap');
    expect(note.content).toBeUndefined();
    expect(diagnostics).toEqual([]);

    const read = await app.request(`/api/harness/notes/${note.id}`);
    expect(read.status).toBe(200);
    const { note: fullNote } = (await read.json()) as { note: { content: string } };
    const canvas = JSON.parse(fullNote.content) as {
      nodes: Array<{ id: string; text?: string }>;
      edges: Array<{ fromNode: string; toNode: string }>;
    };
    expect(canvas.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(['Product', 'Research', 'Build']));
    expect(canvas.edges).toEqual(
      expect.arrayContaining([expect.objectContaining({ fromNode: 'Product', toNode: 'Research' })])
    );
  });

  it('links, changes, and unlinks canvas nodes while preserving external URLs and metadata', async () => {
    const { app, folder } = await setupHarnessApp();
    const createTarget = async (title: string) => {
      const response = await app.request('/api/harness/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ folderId: folder.id, title }),
      });
      expect(response.status).toBe(201);
      return (await response.json()) as { note: { id: string } };
    };
    const firstTarget = await createTarget('First target');
    const secondTarget = await createTarget('Second target');

    const canvasCreate = await app.request('/api/harness/canvases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        folderId: folder.id,
        title: 'Linked canvas',
        canvas: {
          nodes: [
            {
              id: 'node_a',
              type: 'text',
              x: 0,
              y: 0,
              width: 160,
              height: 80,
              url: 'https://example.com/source',
              minunotes: { status: 'keep' },
            },
          ],
          edges: [],
        },
      }),
    });
    expect(canvasCreate.status).toBe(201);
    const created = (await canvasCreate.json()) as { note: { id: string }; contentHash: string };

    const link = await app.request(`/api/harness/notes/${created.note.id}/canvas/nodes/node_a/link-note`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetNoteId: firstTarget.note.id, baseHash: created.contentHash }),
    });
    expect(link.status).toBe(200);
    const linked = (await link.json()) as { note: { content?: string }; contentHash: string };
    expect(linked.note.content).toBeUndefined();

    const change = await app.request(`/api/harness/notes/${created.note.id}/canvas/nodes/node_a/link-note`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetNoteId: secondTarget.note.id, baseHash: linked.contentHash }),
    });
    expect(change.status).toBe(200);
    const changed = (await change.json()) as { note: { content?: string }; contentHash: string };
    expect(changed.note.content).toBeUndefined();

    const readLinked = await app.request(`/api/harness/notes/${created.note.id}`);
    const readLinkedBody = (await readLinked.json()) as { note: { content: string } };
    expect(JSON.parse(readLinkedBody.note.content).nodes[0]).toMatchObject({
      text: 'First target',
      url: 'https://example.com/source',
      minunotes: { status: 'keep', link: { type: 'note', id: secondTarget.note.id } },
    });

    const backlinks = await app.request(`/api/harness/notes/${secondTarget.note.id}/backlinks`);
    expect(backlinks.status).toBe(200);
    await expect(backlinks.json()).resolves.toMatchObject({
      backlinks: [expect.objectContaining({ sourceNoteId: created.note.id, linkType: 'canvas-note' })],
    });

    const unlink = await app.request(
      `/api/harness/notes/${created.note.id}/canvas/nodes/node_a/link?baseHash=${encodeURIComponent(changed.contentHash)}`,
      { method: 'DELETE' }
    );
    expect(unlink.status).toBe(200);
    const unlinked = (await unlink.json()) as { note: { content?: string } };
    expect(unlinked.note.content).toBeUndefined();

    const readUnlinked = await app.request(`/api/harness/notes/${created.note.id}`);
    const readUnlinkedBody = (await readUnlinked.json()) as { note: { content: string } };
    expect(JSON.parse(readUnlinkedBody.note.content).nodes[0]).toMatchObject({
      url: 'https://example.com/source',
      minunotes: { status: 'keep' },
    });
    expect(JSON.parse(readUnlinkedBody.note.content).nodes[0].minunotes.link).toBeUndefined();
  });

  it('validates canvas node link targets, node ids, document types, editability, and content hashes', async () => {
    const { app, db, schema, folder } = await setupHarnessApp();
    const targetResponse = await app.request('/api/harness/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId: folder.id, title: 'Target' }),
    });
    const target = (await targetResponse.json()) as { note: { id: string } };
    const canvasResponse = await app.request('/api/harness/canvases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        folderId: folder.id,
        canvas: { nodes: [{ id: 'node_a', type: 'text', x: 0, y: 0, width: 160, height: 80 }], edges: [] },
      }),
    });
    const canvas = (await canvasResponse.json()) as { note: { id: string } };

    const requestLink = (noteId: string, nodeId: string, targetNoteId: string, baseHash?: string) =>
      app.request(`/api/harness/notes/${noteId}/canvas/nodes/${nodeId}/link-note`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetNoteId, baseHash }),
      });

    expect((await requestLink(canvas.note.id, 'missing', target.note.id)).status).toBe(404);
    expect((await requestLink(canvas.note.id, 'node_a', 'note_missing123')).status).toBe(404);
    expect((await requestLink(canvas.note.id, 'node_a', target.note.id, 'stale-hash')).status).toBe(409);

    const markdownResponse = await app.request('/api/harness/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId: folder.id, title: 'Markdown' }),
    });
    const markdown = (await markdownResponse.json()) as { note: { id: string } };
    expect((await requestLink(markdown.note.id, 'node_a', target.note.id)).status).toBe(400);
    expect((await requestLink(canvas.note.id, 'node_a', canvas.note.id)).status).toBe(400);

    await db.update(schema.notes).set({ isApiEditable: false }).where(eq(schema.notes.id, canvas.note.id));
    expect((await requestLink(canvas.note.id, 'node_a', target.note.id)).status).toBe(403);
  });

  it('does not disclose or link targets outside the API key read scope', async () => {
    const { app, db, schema, folder } = await setupHarnessApp();
    const privateFolder = {
      id: 'folder_private',
      userId: 'user_test',
      parentFolderId: null,
      title: 'Private',
      isPrivate: true,
      isAgentReadOnly: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.insert(schema.folders).values(privateFolder);
    await db.insert(schema.notes).values({
      id: 'note_private123',
      userId: 'user_test',
      folderId: privateFolder.id,
      title: 'Secret target title',
      content: 'secret',
      documentType: 'markdown',
      type: 'note',
      isApiEditable: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const canvasResponse = await app.request('/api/harness/canvases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        folderId: folder.id,
        canvas: { nodes: [{ id: 'node_a', type: 'text', x: 0, y: 0, width: 160, height: 80 }], edges: [] },
      }),
    });
    const canvas = (await canvasResponse.json()) as { note: { id: string } };

    const response = await app.request(`/api/harness/notes/${canvas.note.id}/canvas/nodes/node_a/link-note`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetNoteId: 'note_private123' }),
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Target note not found' });

    const replace = await app.request(`/api/harness/notes/${canvas.note.id}/canvas`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        canvas: {
          nodes: [
            {
              id: 'node_a',
              type: 'text',
              text: 'Known label',
              x: 0,
              y: 0,
              width: 160,
              height: 80,
              minunotes: { link: { type: 'note', id: 'note_private123' } },
            },
          ],
          edges: [],
        },
      }),
    });
    expect(replace.status).toBe(200);

    const links = await app.request(`/api/harness/notes/${canvas.note.id}/links`);
    expect(links.status).toBe(200);
    await expect(links.json()).resolves.toMatchObject({
      links: [
        expect.objectContaining({
          targetNoteId: null,
          targetTitle: 'Known label',
          label: 'Known label',
          linkType: 'canvas-note',
        }),
      ],
    });
  });

  it('replaces a canvas note from diagram syntax and rejects markdown patch edits', async () => {
    const { app, folder } = await setupHarnessApp();
    const create = await app.request('/api/harness/canvases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId: folder.id, title: 'Flow' }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { note: { id: string } };

    const replace = await app.request(`/api/harness/notes/${created.note.id}/canvas/from-syntax`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ syntax: `diagram "Auth flow" {\n  User > Login\n  Login > Dashboard\n}` }),
    });
    expect(replace.status).toBe(200);
    const replaced = (await replace.json()) as { note: { title: string; documentType: string; content?: string } };
    expect(replaced.note.title).toBe('Auth flow');
    expect(replaced.note.documentType).toBe('canvas.default');
    expect(replaced.note.content).toBeUndefined();

    const read = await app.request(`/api/harness/notes/${created.note.id}`);
    expect(read.status).toBe(200);
    const { note: fullNote } = (await read.json()) as { note: { content: string } };
    expect(JSON.parse(fullNote.content).nodes.map((node: { id: string }) => node.id)).toEqual(
      expect.arrayContaining(['User', 'Login', 'Dashboard'])
    );

    const patch = await app.request(`/api/harness/notes/${created.note.id}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ edits: [{ type: 'append', text: 'nope' }] }),
    });
    expect(patch.status).toBe(400);
  });
});
