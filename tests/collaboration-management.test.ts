import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tempDirs: string[] = [];

async function runMigrations(libsql: { executeMultiple: (sql: string) => Promise<unknown> }) {
  for (let index = 0; index <= 35; index += 1) {
    const [file] = await Array.fromAsync(
      (await import('node:fs/promises')).glob(`drizzle/${String(index).padStart(4, '0')}_*.sql`)
    );
    if (!file) throw new Error(`Missing migration ${index}`);
    await libsql.executeMultiple(await readFile(file, 'utf8'));
  }
}

async function setup() {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), 'notes-collaboration-management-'));
  tempDirs.push(dir);
  vi.stubEnv('TURSO_DB_URL', `file:${path.join(dir, 'test.db')}`);
  vi.stubEnv('FRONTEND_URL', 'https://notes.example.com');
  vi.stubEnv('ATTACHMENT_STORAGE_PATH', path.join(dir, 'attachments'));

  const [
    { db, libsql },
    schema,
    { collaborationRoutes },
    { noteRoutes },
    { folderRoutes },
    { attachmentRoutes },
    { getObjectStorage },
  ] = await Promise.all([
    import('../src/api/db/client'),
    import('../src/api/db/schema'),
    import('../src/api/routes/collaboration'),
    import('../src/api/routes/notes'),
    import('../src/api/routes/folders'),
    import('../src/api/routes/attachments'),
    import('../src/api/storage'),
  ]);
  await runMigrations(libsql);

  const owner = {
    id: 'owner',
    name: 'Owner',
    email: 'owner@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const collaborator = {
    id: 'collaborator',
    name: 'Collaborator',
    email: 'collaborator@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const otherOwner = {
    id: 'other_owner',
    name: 'Other Owner',
    email: 'other@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.insert(schema.user).values([owner, collaborator, otherOwner]);
  await db.insert(schema.folders).values({
    id: 'folder',
    userId: owner.id,
    parentFolderId: null,
    title: 'Folder',
    isPrivate: false,
    isAgentReadOnly: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(schema.notes).values({
    id: 'note',
    folderId: 'folder',
    userId: owner.id,
    title: 'Note',
    content: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const app = new Hono();
  app.use('*', async (c, next) => {
    const actor = c.req.header('x-test-user');
    const sessionUser =
      actor === otherOwner.id
        ? otherOwner
        : actor === collaborator.id
          ? collaborator
          : actor
            ? { ...owner, id: actor }
            : owner;
    c.set('user', sessionUser);
    c.set('session', null);
    await next();
  });
  app.route('/', collaborationRoutes);
  app.route('/notes', noteRoutes);
  app.route('/folders', folderRoutes);
  app.route('/attachments', attachmentRoutes);
  return { app, db, libsql, schema, owner, collaborator, otherOwner, storage: getObjectStorage() };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('collaborator management', () => {
  it('creates, lists, updates, and removes an existing-user note grant', async () => {
    const { app, db, libsql, schema, collaborator, storage } = await setup();
    const created = await app.request('/notes/note/collaborators', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'COLLABORATOR@example.com ', role: 'commenter' }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      kind: 'grant',
      grant: { granteeUserId: collaborator.id, role: 'commenter' },
    });

    await db.insert(schema.notes).values({
      id: 'note_secret123',
      folderId: 'folder',
      userId: 'owner',
      title: 'Secret sibling',
      content: 'private sibling text',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(schema.tags).values([
      {
        id: 'tag_shared',
        userId: 'owner',
        name: 'Shared tag',
        normalizedName: 'shared tag',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'tag_hidden',
        userId: 'owner',
        name: 'Hidden tag',
        normalizedName: 'hidden tag',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await db.insert(schema.noteTags).values([
      {
        id: 'note_tag_shared',
        userId: 'owner',
        noteId: 'note',
        tagId: 'tag_shared',
        createdAt: new Date(),
      },
      {
        id: 'note_tag_hidden',
        userId: 'owner',
        noteId: 'note_secret123',
        tagId: 'tag_hidden',
        createdAt: new Date(),
      },
    ]);
    await db.insert(schema.noteLinks).values([
      {
        id: 'link_to_secret',
        userId: 'owner',
        sourceNoteId: 'note',
        targetNoteId: 'note_secret123',
        targetTitle: 'Secret sibling',
        label: null,
        linkType: 'wikilink',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'hidden_backlink',
        userId: 'owner',
        sourceNoteId: 'note_secret123',
        targetNoteId: 'note',
        targetTitle: 'Note',
        label: null,
        linkType: 'wikilink',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const collaboratorRead = await app.request('/notes/note', {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(collaboratorRead.status).toBe(200);
    const collaboratorReadBody = await collaboratorRead.json();
    expect(collaboratorReadBody).toMatchObject({
      note: { id: 'note', folderId: null },
      access: { role: 'commenter', source: 'note_grant' },
    });
    expect(collaboratorReadBody.note).not.toHaveProperty('userId');
    expect(collaboratorReadBody.access).not.toHaveProperty('resourceOwnerUserId');
    expect(collaboratorReadBody.access).not.toHaveProperty('actorUserId');

    const search = await app.request('/notes/search?q=Note', {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(search.status).toBe(200);
    expect(await search.json()).toMatchObject({
      notes: [{ id: 'note', folderId: null, folderTitle: null }],
    });
    const hiddenSearch = await app.request('/notes/search?q=private%20sibling', {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(await hiddenSearch.json()).toMatchObject({ notes: [] });
    const recent = await app.request('/notes/recent', { headers: { 'x-test-user': collaborator.id } });
    expect(recent.status).toBe(200);
    expect(await recent.json()).toMatchObject({ notes: [{ id: 'note', folderId: null }] });
    const orphans = await app.request('/notes/orphans', { headers: { 'x-test-user': collaborator.id } });
    expect(orphans.status).toBe(200);
    expect(await orphans.json()).toMatchObject({ notes: [{ id: 'note', folderId: null }] });

    const tags = await app.request('/notes/note/tags', { headers: { 'x-test-user': collaborator.id } });
    expect(tags.status).toBe(200);
    expect(await tags.json()).toMatchObject({ tags: [{ id: 'tag_shared', name: 'Shared tag' }] });
    const accessibleTags = await app.request('/notes/tags', { headers: { 'x-test-user': collaborator.id } });
    expect(accessibleTags.status).toBe(200);
    expect(await accessibleTags.json()).toEqual({
      tags: [{ id: 'tag_shared', name: 'Shared tag', normalizedName: 'shared tag', noteCount: 1 }],
    });

    const links = await app.request('/notes/note/links', { headers: { 'x-test-user': collaborator.id } });
    expect(links.status).toBe(200);
    expect(await links.json()).toMatchObject({ links: [{ id: 'link_to_secret', targetNoteId: null }] });
    const backlinks = await app.request('/notes/note/backlinks', { headers: { 'x-test-user': collaborator.id } });
    expect(backlinks.status).toBe(200);
    expect(await backlinks.json()).toMatchObject({ backlinks: [] });

    await storage.putObject({
      key: 'shared-attachment',
      body: new TextEncoder().encode('shared bytes'),
      contentType: 'image/png',
    });
    await storage.putObject({
      key: 'secret-attachment',
      body: new TextEncoder().encode('secret bytes'),
      contentType: 'image/png',
    });
    await db.insert(schema.attachments).values([
      {
        id: 'shared_attachment',
        userId: 'owner',
        noteId: 'note',
        folderId: 'folder',
        provider: storage.provider,
        filename: 'shared.png',
        mimeType: 'image/png',
        size: 12,
        contentHash: 'shared',
        storageKey: 'shared-attachment',
        status: 'ready',
      },
      {
        id: 'secret_attachment',
        userId: 'owner',
        noteId: 'note_secret123',
        folderId: 'folder',
        provider: storage.provider,
        filename: 'secret.png',
        mimeType: 'image/png',
        size: 12,
        contentHash: 'secret',
        storageKey: 'secret-attachment',
        status: 'ready',
      },
    ]);
    const sharedAttachment = await app.request('/attachments/shared_attachment/content', {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(sharedAttachment.status).toBe(200);
    expect(await sharedAttachment.text()).toBe('shared bytes');
    const hiddenAttachment = await app.request('/attachments/secret_attachment/content', {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(hiddenAttachment.status).toBe(404);

    const sharedWithMe = await app.request('/collaborations/shared-with-me', {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(sharedWithMe.status).toBe(200);
    const sharedWithMeBody = await sharedWithMe.json();
    expect(sharedWithMeBody).toMatchObject({
      collaborations: [
        {
          type: 'note',
          role: 'commenter',
          owner: { key: expect.stringMatching(/^user_[a-f0-9]{16}$/) },
          note: { id: 'note', title: 'Note' },
        },
      ],
    });
    expect(sharedWithMeBody.collaborations[0].owner).not.toHaveProperty('id');

    const listed = await app.request('/notes/note/collaborators');
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      owner: { id: 'owner', email: 'owner@example.com' },
      grants: [{ role: 'commenter', user: { id: collaborator.id, email: collaborator.email } }],
      invitations: [],
    });

    const commenterEdit = await app.request('/notes/note', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-test-user': collaborator.id },
      body: JSON.stringify({ title: 'Denied' }),
    });
    expect(commenterEdit.status).toBe(403);
    const commenterTags = await app.request('/notes/note/tags', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-user': collaborator.id },
      body: JSON.stringify({ tags: ['denied'] }),
    });
    expect(commenterTags.status).toBe(403);
    const commenterUpload = await app.request('/attachments/notes/note/images', {
      method: 'POST',
      headers: { 'x-test-user': collaborator.id },
    });
    expect(commenterUpload.status).toBe(403);
    const commenterDelete = await app.request('/attachments/shared_attachment', {
      method: 'DELETE',
      headers: { 'x-test-user': collaborator.id },
    });
    expect(commenterDelete.status).toBe(403);

    const updated = await app.request(`/notes/note/collaborators/${collaborator.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'editor' }),
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ grant: { role: 'editor' } });

    const beforeEdit = await app.request('/notes/note', { headers: { 'x-test-user': collaborator.id } });
    const beforeEditBody = (await beforeEdit.json()) as { contentHash: string };
    const editorEdit = await app.request('/notes/note', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-test-user': collaborator.id },
      body: JSON.stringify({
        title: 'Collaboratively edited',
        content: 'Edited by collaborator',
        baseHash: beforeEditBody.contentHash,
      }),
    });
    expect(editorEdit.status).toBe(200);
    const editorEditBody = await editorEdit.json();
    expect(editorEditBody).toMatchObject({
      note: {
        id: 'note',
        folderId: null,
        title: 'Collaboratively edited',
        content: 'Edited by collaborator',
        updatedByActorId: null,
      },
    });
    expect(editorEditBody.note).not.toHaveProperty('userId');
    const collaboratorEvents = await db.select().from(schema.noteEvents).where(eq(schema.noteEvents.noteId, 'note'));
    expect(collaboratorEvents).toContainEqual(
      expect.objectContaining({ userId: 'owner', actorType: 'user', actorId: collaborator.id })
    );
    const staleEdit = await app.request('/notes/note', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-test-user': collaborator.id },
      body: JSON.stringify({ content: 'Stale overwrite', baseHash: beforeEditBody.contentHash }),
    });
    expect(staleEdit.status).toBe(409);
    const forbiddenPolicyEdit = await app.request('/notes/note', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-test-user': collaborator.id },
      body: JSON.stringify({ isApiEditable: false }),
    });
    expect(forbiddenPolicyEdit.status).toBe(403);

    const editorTags = await app.request('/notes/note/tags', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-user': collaborator.id },
      body: JSON.stringify({ tags: ['collaborative'] }),
    });
    expect(editorTags.status).toBe(200);
    expect(await editorTags.json()).toMatchObject({ tags: [{ name: 'collaborative' }] });
    const [collaborativeTag] = await db.select().from(schema.tags).where(eq(schema.tags.name, 'collaborative'));
    expect(collaborativeTag.userId).toBe('owner');

    const imageBody = new FormData();
    imageBody.set('image', new File([new Uint8Array([1, 2, 3])], 'shared.png', { type: 'image/png' }));
    const editorUpload = await app.request('/attachments/notes/note/images', {
      method: 'POST',
      headers: { 'x-test-user': collaborator.id },
      body: imageBody,
    });
    expect(editorUpload.status).toBe(201);
    const editorUploadBody = (await editorUpload.json()) as {
      attachment: { id: string; userId: string; folderId: string | null };
    };
    expect(editorUploadBody.attachment).toMatchObject({ userId: 'owner', folderId: null });
    const [storedUpload] = await db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.id, editorUploadBody.attachment.id));
    expect(storedUpload).toMatchObject({ userId: 'owner', folderId: 'folder' });
    const uploadedContent = await app.request(`/attachments/${editorUploadBody.attachment.id}/content`, {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(uploadedContent.status).toBe(200);
    const editorDelete = await app.request(`/attachments/${editorUploadBody.attachment.id}`, {
      method: 'DELETE',
      headers: { 'x-test-user': collaborator.id },
    });
    expect(editorDelete.status).toBe(200);
    const deletedContent = await app.request(`/attachments/${editorUploadBody.attachment.id}/content`, {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(deletedContent.status).toBe(404);

    await db
      .update(schema.notes)
      .set({
        documentType: 'canvas.default',
        content: JSON.stringify({
          nodes: [
            {
              id: 'hidden-link-node',
              type: 'text',
              text: 'Private link',
              minunotes: { link: { type: 'note', id: 'note_secret123' } },
            },
          ],
          edges: [],
        }),
      })
      .where(eq(schema.notes.id, 'note'));
    await db.insert(schema.noteLinks).values({
      id: 'canvas_link_to_secret',
      userId: 'owner',
      sourceNoteId: 'note',
      targetNoteId: 'note_secret123',
      targetTitle: 'Secret sibling',
      label: null,
      linkType: 'canvas-note',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const sanitizedCanvas = await app.request('/notes/note', {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(sanitizedCanvas.status).toBe(200);
    const sanitizedCanvasBody = (await sanitizedCanvas.json()) as {
      note: { content: string };
      contentHash: string;
    };
    expect(sanitizedCanvasBody.note.content).not.toContain('note_secret123');
    const hiddenCanvasLinks = await app.request('/notes/note/links', {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(await hiddenCanvasLinks.json()).toMatchObject({
      links: [{ id: 'canvas_link_to_secret', targetNoteId: null, targetTitle: 'Linked note' }],
    });
    const blockedHiddenCanvasEdit = await app.request('/notes/note', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-test-user': collaborator.id },
      body: JSON.stringify({ content: sanitizedCanvasBody.note.content, baseHash: sanitizedCanvasBody.contentHash }),
    });
    expect(blockedHiddenCanvasEdit.status).toBe(403);
    const allowedCanvasTitleEdit = await app.request('/notes/note', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-test-user': collaborator.id },
      body: JSON.stringify({ title: 'Safe canvas title', baseHash: sanitizedCanvasBody.contentHash }),
    });
    expect(allowedCanvasTitleEdit.status).toBe(200);
    expect(JSON.stringify(await allowedCanvasTitleEdit.json())).not.toContain('note_secret123');

    await db.insert(schema.integrationAuthorizations).values({
      id: 'auth',
      userId: collaborator.id,
      sharedAccessMode: 'specific',
    });
    const [grant] = await db.select().from(schema.collaborationGrants);
    await db.insert(schema.authorizationCollaborationScopes).values({
      id: 'scope',
      authorizationId: 'auth',
      userId: collaborator.id,
      collaborationGrantId: grant.id,
    });

    const removed = await app.request(`/notes/note/collaborators/${collaborator.id}`, { method: 'DELETE' });
    expect(removed.status).toBe(200);
    expect(await db.select().from(schema.collaborationGrants)).toHaveLength(0);
    expect(await db.select().from(schema.authorizationCollaborationScopes)).toHaveLength(0);
    libsql.close();
  });

  it('lists notes in an inherited shared folder without exposing templates', async () => {
    const { app, libsql, collaborator } = await setup();
    const grant = await app.request('/folders/folder/collaborators', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: collaborator.email, role: 'viewer' }),
    });
    expect(grant.status).toBe(201);

    const listed = await app.request('/folders/folder/notes', {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(listed.status).toBe(200);
    const listedBody = await listed.json();
    expect(listedBody).toMatchObject({
      notes: [{ id: 'note' }],
      access: { role: 'viewer', source: 'folder_grant' },
    });
    expect(listedBody.access).not.toHaveProperty('resourceOwnerUserId');
    const detail = await app.request('/folders/folder/detail', {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(detail.status).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody).toMatchObject({
      folder: { id: 'folder', parentFolderId: null },
      childFolders: [],
      access: { role: 'viewer', source: 'folder_grant' },
    });
    expect(detailBody.folder).not.toHaveProperty('userId');

    const templates = await app.request('/folders/folder/notes?type=template', {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(templates.status).toBe(404);
    const viewerCreate = await app.request('/folders/folder/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': collaborator.id },
      body: JSON.stringify({ title: 'Denied' }),
    });
    expect(viewerCreate.status).toBe(403);

    const upgraded = await app.request(`/folders/folder/collaborators/${collaborator.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'editor' }),
    });
    expect(upgraded.status).toBe(200);
    const created = await app.request('/folders/folder/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': collaborator.id },
      body: JSON.stringify({ title: 'Created by editor', content: 'Shared folder content' }),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody).toMatchObject({ note: { folderId: 'folder', updatedByActorId: null } });
    expect(createdBody.note).not.toHaveProperty('userId');
    const createdCanvas = await app.request('/folders/folder/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': collaborator.id },
      body: JSON.stringify({ title: 'Editor canvas', documentType: 'canvas.default' }),
    });
    expect(createdCanvas.status).toBe(201);
    const createdCanvasBody = (await createdCanvas.json()) as {
      note: { id: string; documentType: string; updatedByActorId: null };
    };
    expect(createdCanvasBody).toMatchObject({
      note: { documentType: 'canvas.default', updatedByActorId: null },
    });
    expect(createdCanvasBody.note).not.toHaveProperty('userId');
    const canvasRead = await app.request(`/notes/${createdCanvasBody.note.id}`, {
      headers: { 'x-test-user': collaborator.id },
    });
    const canvasReadBody = (await canvasRead.json()) as { contentHash: string };
    const canvasEdit = await app.request(`/notes/${createdCanvasBody.note.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-test-user': collaborator.id },
      body: JSON.stringify({
        content: JSON.stringify({ nodes: [{ id: 'node', type: 'text', text: 'Editor' }], edges: [] }),
        baseHash: canvasReadBody.contentHash,
      }),
    });
    expect(canvasEdit.status).toBe(200);
    expect(await canvasEdit.json()).toMatchObject({ note: { updatedByActorId: null } });
    const deniedTemplate = await app.request('/folders/folder/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': collaborator.id },
      body: JSON.stringify({ title: 'No template', type: 'template' }),
    });
    expect(deniedTemplate.status).toBe(403);
    libsql.close();
  });

  it('lists direct roots with the highest effective role across overlapping grants', async () => {
    const { app, collaborator, db, libsql, schema } = await setup();
    await db.insert(schema.notes).values({
      id: 'note_second',
      folderId: 'folder',
      userId: 'owner',
      title: 'Second note',
      content: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const grant = (resource: 'folders/folder' | 'notes/note' | 'notes/note_second', role: 'viewer' | 'editor') =>
      app.request(`/${resource}/collaborators`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: collaborator.email, role }),
      });

    expect((await grant('folders/folder', 'editor')).status).toBe(201);
    expect((await grant('notes/note', 'viewer')).status).toBe(201);
    expect((await grant('notes/note_second', 'viewer')).status).toBe(201);
    const response = await app.request('/collaborations/shared-with-me', {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      collaborations: Array<{ type: 'note' | 'folder'; role: string }>;
    };
    expect(body.collaborations).toHaveLength(3);
    expect(body.collaborations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'folder', role: 'editor' }),
        expect.objectContaining({ type: 'note', role: 'editor' }),
      ])
    );

    const firstPage = await app.request('/collaborations/shared-with-me?type=note&limit=1', {
      headers: { 'x-test-user': collaborator.id },
    });
    expect(firstPage.status).toBe(200);
    const firstPageBody = (await firstPage.json()) as {
      collaborations: Array<{ grantId: string }>;
      pageInfo: { hasMore: boolean; nextCursor: string | null };
    };
    expect(firstPageBody.collaborations).toHaveLength(1);
    expect(firstPageBody.pageInfo).toMatchObject({ hasMore: true, nextCursor: expect.any(String) });
    const secondPage = await app.request(
      `/collaborations/shared-with-me?type=note&limit=1&cursor=${encodeURIComponent(firstPageBody.pageInfo.nextCursor ?? '')}`,
      { headers: { 'x-test-user': collaborator.id } }
    );
    expect(secondPage.status).toBe(200);
    const secondPageBody = (await secondPage.json()) as typeof firstPageBody;
    expect(secondPageBody.collaborations).toHaveLength(1);
    expect(secondPageBody.collaborations[0]?.grantId).not.toBe(firstPageBody.collaborations[0]?.grantId);
    expect(secondPageBody.pageInfo).toEqual({ hasMore: false, nextCursor: null });
    libsql.close();
  });

  it('creates a safe pending invitation for an unknown email and regenerates it', async () => {
    const { app, db, libsql, schema } = await setup();
    const invite = () =>
      app.request('/folders/folder/collaborators', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'new@example.com', role: 'viewer' }),
      });

    const first = await invite();
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as Record<string, unknown>;
    expect(firstBody).toMatchObject({
      kind: 'invitation',
      emailDelivery: 'disabled',
      invitation: {
        email: 'new@example.com',
        role: 'viewer',
        invitationUrl: expect.stringMatching(/^https:\/\/notes\.example\.com\/invite\/[A-Za-z0-9_-]+$/),
      },
    });
    expect(JSON.stringify(firstBody)).not.toContain('tokenHash');
    const [before] = await db.select().from(schema.collaborationInvitations);
    const firstToken = (firstBody.invitation as { invitationUrl: string }).invitationUrl.split('/').at(-1) ?? '';
    await db
      .update(schema.collaborationInvitations)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.collaborationInvitations.id, before.id));
    const expiredList = await app.request('/folders/folder/collaborators');
    await expect(expiredList.json()).resolves.toMatchObject({
      invitations: [{ id: before.id, email: 'new@example.com' }],
    });

    const resent = await app.request(`/collaboration-invitations/${before.id}/resend`, { method: 'POST' });
    expect(resent.status).toBe(200);
    const resentBody = (await resent.json()) as {
      emailDelivery: string;
      invitation: { invitationUrl: string };
    };
    expect(resentBody.emailDelivery).toBe('disabled');
    const resentToken = resentBody.invitation.invitationUrl.split('/').at(-1) ?? '';
    expect(resentToken).not.toBe(firstToken);
    expect((await app.request(`/collaboration-invitations/${firstToken}/preview`)).status).toBe(404);
    expect((await app.request(`/collaboration-invitations/${resentToken}/preview`)).status).toBe(200);

    const second = await invite();
    expect(second.status).toBe(201);
    const invitations = await db.select().from(schema.collaborationInvitations);
    expect(invitations).toHaveLength(1);
    expect(invitations[0]?.tokenHash).not.toBe(before.tokenHash);
    const denied = await app.request(`/collaboration-invitations/${invitations[0]?.id}`, {
      method: 'DELETE',
      headers: { 'x-test-user': 'other_owner' },
    });
    expect(denied.status).toBe(404);
    const revoked = await app.request(`/collaboration-invitations/${invitations[0]?.id}`, { method: 'DELETE' });
    expect(revoked.status).toBe(200);
    const [stored] = await db.select().from(schema.collaborationInvitations);
    expect(stored?.revokedAt).toBeInstanceOf(Date);
    const listed = await app.request('/folders/folder/collaborators');
    await expect(listed.json()).resolves.toMatchObject({ invitations: [] });
    libsql.close();
  });

  it('previews and atomically accepts an invitation with the matching verified account', async () => {
    const { app, db, libsql, schema, collaborator } = await setup();
    const created = await app.request('/notes/note/collaborators', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'invitee@example.com', role: 'viewer' }),
    });
    const createdBody = (await created.json()) as { invitation: { invitationUrl: string } };
    const token = createdBody.invitation.invitationUrl.split('/').at(-1) ?? '';

    const preview = await app.request(`/collaboration-invitations/${token}/preview`);
    expect(preview.status).toBe(200);
    const previewBody = await preview.json();
    expect(previewBody).toMatchObject({
      resource: { type: 'note', id: 'note', title: 'Note' },
      owner: { name: 'Owner' },
      role: 'viewer',
      invitedEmail: 'i***@example.com',
      status: 'pending',
    });
    expect(previewBody.owner).not.toHaveProperty('id');

    const mismatch = await app.request(`/collaboration-invitations/${token}/accept`, {
      method: 'POST',
      headers: { 'x-test-user': collaborator.id },
    });
    expect(mismatch.status).toBe(403);

    await db.insert(schema.user).values({
      id: 'invitee',
      name: 'Invitee',
      email: 'invitee@example.com',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const accept = () =>
      app.request(`/collaboration-invitations/${token}/accept`, {
        method: 'POST',
        headers: { 'x-test-user': 'invitee' },
      });
    const accepted = await accept();
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ destination: '/notes/note', alreadyAccepted: false });
    const replay = await accept();
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ destination: '/notes/note', alreadyAccepted: true });

    const note = await app.request('/notes/note', { headers: { 'x-test-user': 'invitee' } });
    expect(note.status).toBe(200);
    expect(await note.json()).toMatchObject({ access: { role: 'viewer', source: 'note_grant' } });
    libsql.close();
  });

  it('keeps collaborator management owner-only and validates roles', async () => {
    const { app, libsql, otherOwner } = await setup();
    const forbidden = await app.request('/notes/note/collaborators', {
      headers: { 'x-test-user': otherOwner.id },
    });
    expect(forbidden.status).toBe(404);

    const invalid = await app.request('/notes/note/collaborators', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'collaborator@example.com', role: 'manager' }),
    });
    expect(invalid.status).toBe(400);

    const invalidEmail = await app.request('/notes/note/collaborators', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'person@localhost', role: 'viewer' }),
    });
    expect(invalidEmail.status).toBe(400);
    await expect(invalidEmail.json()).resolves.toEqual({ error: 'Valid email is required' });

    const self = await app.request('/notes/note/collaborators', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.com', role: 'viewer' }),
    });
    expect(self.status).toBe(400);
    libsql.close();
  });
});
