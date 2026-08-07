import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
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

async function setupRetention() {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), 'notes-trash-retention-'));
  tempDirs.push(dir);
  vi.stubEnv('TURSO_DB_URL', `file:${path.join(dir, 'test.db')}`);
  vi.stubEnv('ATTACHMENT_STORAGE_DRIVER', 'filesystem');
  vi.stubEnv('ATTACHMENT_STORAGE_PATH', path.join(dir, 'attachments'));

  const [{ db, libsql }, schema, cleanup, cleanupHandler, operations, retention] = await Promise.all([
    import('../src/api/db/client'),
    import('../src/api/db/schema'),
    import('../src/api/trash/cleanup'),
    import('../src/api/trash/cleanup-handler'),
    import('../src/api/trash/operations'),
    import('../src/api/trash/retention'),
  ]);
  await runMigrations(libsql);
  await db.insert(schema.user).values({
    id: 'user_retention',
    name: 'Retention Tester',
    email: 'retention@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { db, schema, cleanup, cleanupHandler, operations, retention };
}

function noteValue(input: {
  id: string;
  folderId: string;
  deletedAt: Date;
  purgeAfter: Date;
  trashBatchId?: string | null;
}) {
  return {
    id: input.id,
    folderId: input.folderId,
    userId: 'user_retention',
    title: input.id,
    content: '',
    deletedAt: input.deletedAt,
    purgeAfter: input.purgeAfter,
    trashBatchId: input.trashBatchId ?? null,
  };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('30-day Trash retention', () => {
  it('uses conservative rollout defaults and computes a 30-day deadline', async () => {
    const { cleanupHandler, retention } = await setupRetention();
    const now = new Date('2026-08-01T12:00:00.000Z');
    expect(retention.getTrashPurgeAfter(now).toISOString()).toBe('2026-08-31T12:00:00.000Z');
    expect(retention.getTrashAutoPurgeMode()).toBe('disabled');
    expect(retention.getTrashAutoPurgeMode('invalid')).toBe('disabled');
    expect(retention.getTrashAutoPurgeMode('dry-run')).toBe('dry-run');
    expect(retention.getTrashPurgeLimit('0')).toBe(100);
    expect(retention.getTrashPurgeLimit('900')).toBe(500);

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(cleanupHandler.handler()).resolves.toMatchObject({ mode: 'disabled', scanned: 0 });
    expect(log).toHaveBeenCalledWith('Trash cleanup complete', expect.objectContaining({ mode: 'disabled' }));
    log.mockRestore();
  });

  it('reports only bounded, eligible top-level items in dry-run mode', async () => {
    const { db, schema, cleanup } = await setupRetention();
    const cutoff = new Date('2026-08-31T12:00:00.000Z');
    const expired = new Date(cutoff.getTime() - 1000);
    const future = new Date(cutoff.getTime() + 1000);
    await db.insert(schema.folders).values([
      { id: 'folder_active', userId: 'user_retention', title: 'Active' },
      {
        id: 'folder_batch',
        userId: 'user_retention',
        title: 'Batch',
        deletedAt: new Date('2026-08-01T00:00:00.000Z'),
        purgeAfter: expired,
        trashBatchId: 'folder_batch',
      },
    ]);
    await db.insert(schema.notes).values([
      noteValue({ id: 'note_expired', folderId: 'folder_active', deletedAt: cutoff, purgeAfter: expired }),
      noteValue({ id: 'note_future', folderId: 'folder_active', deletedAt: cutoff, purgeAfter: future }),
      noteValue({
        id: 'note_in_batch',
        folderId: 'folder_batch',
        deletedAt: cutoff,
        purgeAfter: expired,
        trashBatchId: 'folder_batch',
      }),
    ]);

    expect(await cleanup.cleanupExpiredTrash({ mode: 'disabled', now: cutoff })).toMatchObject({ scanned: 0 });
    expect(await cleanup.cleanupExpiredTrash({ mode: 'dry-run', now: cutoff })).toMatchObject({
      scanned: 2,
      eligibleNotes: 1,
      eligibleFolders: 1,
      deletedNotes: 0,
      deletedFolders: 0,
      candidates: [
        { kind: 'note', id: 'note_expired' },
        { kind: 'folder', id: 'folder_batch' },
      ],
    });
    expect(await cleanup.cleanupExpiredTrash({ mode: 'dry-run', now: cutoff, limit: 1 })).toMatchObject({
      scanned: 1,
      eligibleNotes: 1,
      eligibleFolders: 0,
    });
    expect(await db.select().from(schema.notes)).toHaveLength(3);
  });

  it('purges eligible standalone notes before folder batches and leaves future items recoverable', async () => {
    const { db, schema, cleanup } = await setupRetention();
    const cutoff = new Date('2026-08-31T12:00:00.000Z');
    const expired = new Date(cutoff.getTime() - 1000);
    const future = new Date(cutoff.getTime() + 1000);
    await db.insert(schema.folders).values([
      { id: 'folder_active', userId: 'user_retention', title: 'Active' },
      {
        id: 'folder_batch',
        userId: 'user_retention',
        title: 'Batch',
        deletedAt: cutoff,
        purgeAfter: expired,
        trashBatchId: 'folder_batch',
      },
    ]);
    await db.insert(schema.notes).values([
      noteValue({ id: 'note_expired', folderId: 'folder_active', deletedAt: cutoff, purgeAfter: expired }),
      noteValue({ id: 'note_future', folderId: 'folder_active', deletedAt: cutoff, purgeAfter: future }),
      noteValue({
        id: 'note_in_batch',
        folderId: 'folder_batch',
        deletedAt: cutoff,
        purgeAfter: expired,
        trashBatchId: 'folder_batch',
      }),
    ]);

    const result = await cleanup.cleanupExpiredTrash({ mode: 'enabled', now: cutoff });
    expect(result).toMatchObject({
      scanned: 2,
      eligibleNotes: 1,
      eligibleFolders: 1,
      deletedNotes: 2,
      deletedFolders: 1,
      skipped: 0,
      failures: [],
    });
    expect(await db.select().from(schema.folders).where(eq(schema.folders.id, 'folder_batch'))).toHaveLength(0);
    expect(await db.select().from(schema.notes).where(eq(schema.notes.id, 'note_expired'))).toHaveLength(0);
    expect(await db.select().from(schema.notes).where(eq(schema.notes.id, 'note_future'))).toHaveLength(1);
  });

  it('handles overlapping enabled cleanup runs without double deletion', async () => {
    const { db, schema, cleanup } = await setupRetention();
    const cutoff = new Date('2026-08-31T12:00:00.000Z');
    await db.insert(schema.folders).values({ id: 'folder_active', userId: 'user_retention', title: 'Active' });
    await db
      .insert(schema.notes)
      .values(noteValue({ id: 'note_once', folderId: 'folder_active', deletedAt: cutoff, purgeAfter: cutoff }));

    const results = await Promise.all([
      cleanup.cleanupExpiredTrash({ mode: 'enabled', now: cutoff }),
      cleanup.cleanupExpiredTrash({ mode: 'enabled', now: cutoff }),
    ]);
    expect(results.reduce((total, result) => total + result.deletedNotes, 0)).toBe(1);
    expect(await db.select().from(schema.notes).where(eq(schema.notes.id, 'note_once'))).toHaveLength(0);
  });

  it('refuses a scheduled purge when content has a newer deadline', async () => {
    const { db, schema, operations } = await setupRetention();
    const cutoff = new Date('2026-08-31T12:00:00.000Z');
    const future = new Date('2026-09-30T12:00:00.000Z');
    await db.insert(schema.folders).values([
      { id: 'folder_active', userId: 'user_retention', title: 'Active' },
      {
        id: 'folder_future',
        userId: 'user_retention',
        title: 'Future folder',
        deletedAt: cutoff,
        purgeAfter: future,
        trashBatchId: 'folder_future',
      },
    ]);
    await db
      .insert(schema.notes)
      .values(noteValue({ id: 'note_future', folderId: 'folder_active', deletedAt: cutoff, purgeAfter: future }));

    expect(
      await operations.permanentlyDeleteTrashedNote({
        userId: 'user_retention',
        noteId: 'note_future',
        purgeBefore: cutoff,
      })
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      await operations.permanentlyDeleteTrashedFolder({
        userId: 'user_retention',
        folderId: 'folder_future',
        purgeBefore: cutoff,
      })
    ).toMatchObject({ ok: false, status: 404 });
    expect(await db.select().from(schema.notes).where(eq(schema.notes.id, 'note_future'))).toHaveLength(1);
    expect(await db.select().from(schema.folders).where(eq(schema.folders.id, 'folder_future'))).toHaveLength(1);
  });

  it('releases the purge claim and reports an attachment failure for retry', async () => {
    const { db, schema, cleanup } = await setupRetention();
    const cutoff = new Date('2026-08-31T12:00:00.000Z');
    await db.insert(schema.folders).values({ id: 'folder_active', userId: 'user_retention', title: 'Active' });
    await db
      .insert(schema.notes)
      .values(noteValue({ id: 'note_failure', folderId: 'folder_active', deletedAt: cutoff, purgeAfter: cutoff }));
    await db.insert(schema.attachments).values({
      id: 'attachment_failure',
      userId: 'user_retention',
      noteId: 'note_failure',
      folderId: 'folder_active',
      filename: 'failure.png',
      mimeType: 'image/png',
      size: 1,
      contentHash: 'hash',
      storageKey: '../outside',
    });

    const result = await cleanup.cleanupExpiredTrash({ mode: 'enabled', now: cutoff });
    expect(result.failures).toEqual([
      expect.objectContaining({
        kind: 'note',
        id: 'note_failure',
        error: expect.stringContaining('escapes storage root'),
      }),
    ]);
    const [note] = await db.select().from(schema.notes).where(eq(schema.notes.id, 'note_failure'));
    expect(note).toMatchObject({ trashBatchId: null, purgeAfter: cutoff });
  });
});
