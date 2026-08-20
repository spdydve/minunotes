import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tempDirs: string[] = [];

async function runMigrations(libsql: { executeMultiple: (sql: string) => Promise<unknown> }) {
  for (let index = 0; index <= 36; index += 1) {
    const [file] = await Array.fromAsync(
      (await import('node:fs/promises')).glob(`drizzle/${String(index).padStart(4, '0')}_*.sql`)
    );
    if (!file) throw new Error(`Missing migration ${index}`);
    await libsql.executeMultiple(await readFile(file, 'utf8'));
  }
}

async function setup() {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), 'notes-internal-pagination-'));
  tempDirs.push(dir);
  vi.stubEnv('TURSO_DB_URL', `file:${path.join(dir, 'test.db')}`);

  const [{ db, libsql }, schema, { folderRoutes }, { noteRoutes }, { trashRoutes }] = await Promise.all([
    import('../src/api/db/client'),
    import('../src/api/db/schema'),
    import('../src/api/routes/folders'),
    import('../src/api/routes/notes'),
    import('../src/api/routes/trash'),
  ]);
  await runMigrations(libsql);

  const now = new Date('2025-02-01T00:00:00.000Z');
  const user = {
    id: 'user_internal_page',
    name: 'Internal User',
    email: 'internal@example.com',
    emailVerified: true,
    image: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.user).values(user);
  await db.insert(schema.folders).values({
    id: 'folder_internal',
    userId: user.id,
    parentFolderId: null,
    title: 'Internal',
    isPrivate: false,
    isAgentReadOnly: false,
    createdAt: now,
    updatedAt: now,
  });

  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('user', user);
    c.set('session', null);
    await next();
  });
  app.route('/api/folders', folderRoutes);
  app.route('/api/notes', noteRoutes);
  app.route('/api/trash', trashRoutes);

  return { app, db, schema, now };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function note(id: string, title: string, now: Date, extras = {}) {
  return {
    id,
    userId: 'user_internal_page',
    folderId: 'folder_internal',
    title,
    content: `private body for ${title} common`,
    documentType: 'markdown' as const,
    type: 'note' as const,
    isApiEditable: true,
    createdAt: now,
    updatedAt: now,
    ...extras,
  };
}

type PageResponse<T> = T & { page: number; limit: number; hasMore: boolean };

describe('internal list pagination', () => {
  it('returns compact deterministic folder-note pages', async () => {
    const { app, db, schema, now } = await setup();
    await db
      .insert(schema.notes)
      .values([note('note_c', 'Charlie', now), note('note_a', 'Alpha', now), note('note_b', 'Bravo', now)]);

    const first = (await (
      await app.request('/api/folders/folder_internal/notes?page=1&limit=2')
    ).json()) as PageResponse<{ notes: Array<{ id: string; content?: string; userId?: string }> }>;
    expect(first.notes.map((item) => item.id)).toEqual(['note_a', 'note_b']);
    expect(first.notes.every((item) => item.content === undefined && item.userId === undefined)).toBe(true);
    expect(first).toMatchObject({ page: 1, limit: 2, hasMore: true });

    const second = (await (
      await app.request('/api/folders/folder_internal/notes?page=2&limit=2')
    ).json()) as PageResponse<{ notes: Array<{ id: string }> }>;
    expect(second.notes.map((item) => item.id)).toEqual(['note_c']);
    expect(second).toMatchObject({ page: 2, limit: 2, hasMore: false });
  });

  it('paginates compact search, recent, template, and orphan responses', async () => {
    const { app, db, schema, now } = await setup();
    await db
      .insert(schema.notes)
      .values([
        note('note_a', 'Alpha', now),
        note('note_b', 'Bravo', now),
        note('template_a', 'Template', now, { type: 'template' as const }),
      ]);

    for (const path of [
      '/api/notes/search?q=common&page=1&limit=1',
      '/api/notes/recent?page=1&limit=1',
      '/api/notes/templates?page=1&limit=1',
      '/api/notes/orphans?page=1&limit=1',
    ]) {
      const response = await app.request(path);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        notes?: Array<{ content?: string; userId?: string }>;
        templates?: Array<{ content?: string; userId?: string }>;
        page: number;
        limit: number;
        hasMore: boolean;
      };
      const items = body.notes ?? body.templates ?? [];
      expect(items).toHaveLength(1);
      expect(items[0]?.content).toBeUndefined();
      expect(items[0]?.userId).toBeUndefined();
      expect(body.page).toBe(1);
      expect(body.limit).toBe(1);
      expect(typeof body.hasMore).toBe('boolean');
    }
  });

  it('paginates compact top-level Trash collections', async () => {
    const { app, db, schema, now } = await setup();
    await db
      .insert(schema.notes)
      .values([
        note('note_deleted_a', 'Deleted A', now, { deletedAt: now }),
        note('note_deleted_b', 'Deleted B', now, { deletedAt: now }),
      ]);

    const body = (await (await app.request('/api/trash?page=1&limit=1')).json()) as PageResponse<{
      notes: Array<{ id: string; content?: string }>;
      folders: unknown[];
    }>;
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0]?.content).toBeUndefined();
    expect(body).toMatchObject({ page: 1, limit: 1, hasMore: true });
  });
});
