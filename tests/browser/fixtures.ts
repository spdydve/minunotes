import { expect, type Page } from '@playwright/test';

type Note = {
  id: string;
  folderId: string;
  title: string;
  content: string;
  documentType: 'markdown' | 'canvas.default' | 'canvas.mindmap';
  type: 'note' | 'template';
  isApiEditable: boolean;
  updatedByActorType: 'user' | 'agent' | 'system' | null;
  updatedByActorId: string | null;
  createdAt: string;
  updatedAt: string;
};

const now = '2026-07-12T00:00:00.000Z';
const purgeAfter = '2026-08-11T00:00:00.000Z';

export const browserFixture = {
  folder: {
    id: 'folder_browser',
    parentFolderId: null,
    title: 'Browser tests',
    isPrivate: false,
    isAgentReadOnly: false,
    createdAt: now,
    updatedAt: now,
  },
  childFolder: {
    id: 'folder_child_browser',
    parentFolderId: 'folder_browser',
    title: 'Child folder',
    isPrivate: false,
    isAgentReadOnly: false,
    createdAt: now,
    updatedAt: now,
  },
  source: {
    id: 'note_source',
    folderId: 'folder_browser',
    title: 'Source Note',
    content: 'Start here.',
    documentType: 'markdown',
    type: 'note',
    isApiEditable: true,
    updatedByActorType: 'user',
    updatedByActorId: 'user_browser',
    createdAt: now,
    updatedAt: now,
  } satisfies Note,
  linked: {
    id: 'note_linked',
    folderId: 'folder_browser',
    title: 'Linked Note',
    content:
      'See [[Target Note]], [[note_target|Target by ID]], and [[Missing Note]].\n\n```ts\nconst answer: number = 42;\n```\n\n```unknownlang\nfallback code\n```\n\n```\nplain code\n```',
    documentType: 'markdown',
    type: 'note',
    isApiEditable: true,
    updatedByActorType: 'user',
    updatedByActorId: 'user_browser',
    createdAt: now,
    updatedAt: now,
  } satisfies Note,
  canvas: {
    id: 'note_canvas',
    folderId: 'folder_browser',
    title: 'Canvas Note',
    content: '{"nodes":[],"edges":[]}',
    documentType: 'canvas.default',
    type: 'note',
    isApiEditable: true,
    updatedByActorType: 'user',
    updatedByActorId: 'user_browser',
    createdAt: now,
    updatedAt: now,
  } satisfies Note,
  child: {
    id: 'note_child',
    folderId: 'folder_child_browser',
    title: 'Child Note',
    content: 'Child content.',
    documentType: 'markdown',
    type: 'note',
    isApiEditable: true,
    updatedByActorType: 'user',
    updatedByActorId: 'user_browser',
    createdAt: now,
    updatedAt: now,
  } satisfies Note,
  template: {
    id: 'note_template',
    folderId: 'folder_browser',
    title: 'Browser Template',
    content: '# Template',
    documentType: 'markdown',
    type: 'template',
    isApiEditable: true,
    updatedByActorType: 'user',
    updatedByActorId: 'user_browser',
    createdAt: now,
    updatedAt: now,
  } satisfies Note,
  trashedNote: {
    id: 'note_trashed',
    folderId: 'folder_browser',
    title: 'Recoverable Note',
    documentType: 'markdown' as const,
    type: 'note' as const,
    createdAt: now,
    updatedAt: now,
    deletedAt: now,
    purgeAfter,
    originalFolderTitle: 'Browser tests',
    originalFolderAvailable: true,
  },
  trashedTemplate: {
    id: 'note_trashed_template',
    folderId: 'folder_missing',
    title: 'Recoverable Template',
    documentType: 'markdown' as const,
    type: 'template' as const,
    createdAt: now,
    updatedAt: now,
    deletedAt: now,
    purgeAfter,
    originalFolderTitle: null,
    originalFolderAvailable: false,
  },
  trashedFolder: {
    id: 'folder_trashed',
    parentFolderId: 'folder_missing',
    title: 'Recoverable Folder',
    createdAt: now,
    updatedAt: now,
    deletedAt: now,
    purgeAfter,
    originalParentTitle: null,
    originalParentAvailable: false,
    descendantFolderCount: 2,
    noteCount: 3,
  },
  trashedFolderContents: {
    rootFolderId: 'folder_trashed',
    folders: [
      {
        id: 'folder_trashed',
        parentFolderId: 'folder_missing',
        title: 'Recoverable Folder',
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
        purgeAfter,
      },
      {
        id: 'folder_trashed_research',
        parentFolderId: 'folder_trashed',
        title: 'Research',
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
        purgeAfter,
      },
      {
        id: 'folder_trashed_archive',
        parentFolderId: 'folder_trashed_research',
        title: 'Archive',
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
        purgeAfter,
      },
    ],
    notes: [
      {
        id: 'note_trashed_overview',
        folderId: 'folder_trashed',
        title: 'Project overview',
        documentType: 'markdown' as const,
        type: 'note' as const,
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
        purgeAfter,
      },
      {
        id: 'note_trashed_competitors',
        folderId: 'folder_trashed_research',
        title: 'Competitor notes',
        documentType: 'markdown' as const,
        type: 'note' as const,
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
        purgeAfter,
      },
      {
        id: 'note_trashed_canvas',
        folderId: 'folder_trashed_archive',
        title: 'Planning board',
        documentType: 'canvas.default' as const,
        type: 'note' as const,
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
        purgeAfter,
      },
    ],
  },
  target: {
    id: 'note_target',
    folderId: 'folder_browser',
    title: 'Target Note',
    content: 'Target content.',
    documentType: 'markdown',
    type: 'note',
    isApiEditable: true,
    updatedByActorType: 'user',
    updatedByActorId: 'user_browser',
    createdAt: now,
    updatedAt: now,
  } satisfies Note,
};

export async function mockBrowserApi(
  page: Page,
  options: {
    uploadFails?: boolean;
    folderCreateFails?: boolean;
    noteTrashFails?: boolean;
    trashLoadFails?: boolean;
    trashMutationFails?: boolean;
    emptyTrash?: boolean;
    automaticPurgeEnabled?: boolean;
  } = {}
) {
  const folders = [{ ...browserFixture.folder }, { ...browserFixture.childFolder }];
  const notes = new Map<string, Note>([
    [browserFixture.source.id, { ...browserFixture.source }],
    [browserFixture.linked.id, { ...browserFixture.linked }],
    [browserFixture.canvas.id, { ...browserFixture.canvas }],
    [browserFixture.template.id, { ...browserFixture.template }],
    [browserFixture.target.id, { ...browserFixture.target }],
    [browserFixture.child.id, { ...browserFixture.child }],
  ]);
  const trashNotes = options.emptyTrash
    ? []
    : [{ ...browserFixture.trashedNote }, { ...browserFixture.trashedTemplate }];
  const trashFolders = options.emptyTrash ? [] : [{ ...browserFixture.trashedFolder }];
  const trashMutationRequests: Array<{ method: string; path: string; body: unknown }> = [];
  const noteShareTokens = new Map<string, string>([
    [`note_share_${browserFixture.linked.id}`, browserFixture.linked.id],
    [`note_share_${browserFixture.target.id}`, browserFixture.target.id],
  ]);
  const saveRequests: Array<{ noteId: string; body: Record<string, unknown> }> = [];
  let hashVersion = 1;
  let folderShareLink: {
    id: string;
    folderId: string;
    permission: 'read';
    url: string;
    createdAt: string;
    updatedAt: string;
  } | null = null;

  await page.route('**/internal/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/internal', '');
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path === '/auth/get-session') {
      return json({
        user: {
          id: 'user_browser',
          name: 'Browser Test User',
          email: 'browser@example.com',
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now,
        },
        session: { id: 'session_browser', userId: 'user_browser', expiresAt: '2099-01-01T00:00:00.000Z' },
      });
    }

    if (path === '/trash' && method === 'GET') {
      if (options.trashLoadFails) return json({ error: 'Trash is temporarily unavailable' }, 500);
      return json({
        notes: trashNotes,
        folders: trashFolders,
        retention: { days: 30, automaticPurgeEnabled: options.automaticPurgeEnabled ?? false },
      });
    }

    if (path === `/trash/folders/${browserFixture.trashedFolder.id}/contents` && method === 'GET')
      return json(browserFixture.trashedFolderContents);

    const restoreTrashNoteMatch = path.match(/^\/trash\/notes\/(note_[a-zA-Z0-9_]+)\/restore$/);
    if (restoreTrashNoteMatch && method === 'POST') {
      const body = request.postDataJSON() as { folderId?: string };
      trashMutationRequests.push({ method, path, body });
      if (options.trashMutationFails) return json({ error: 'Trashed note not found' }, 404);
      const index = trashNotes.findIndex((note) => note.id === restoreTrashNoteMatch[1]);
      if (index < 0) return json({ error: 'Trashed note not found' }, 404);
      const [trashed] = trashNotes.splice(index, 1);
      const folderId = body.folderId ?? trashed.folderId;
      const note: Note = {
        id: trashed.id,
        folderId,
        title: trashed.title,
        content: '# Restored',
        documentType: trashed.documentType,
        type: trashed.type,
        isApiEditable: true,
        updatedByActorType: 'user',
        updatedByActorId: 'user_browser',
        createdAt: trashed.createdAt,
        updatedAt: now,
      };
      notes.set(note.id, note);
      return json({ note, restoredToOriginalFolder: !body.folderId });
    }

    const purgeTrashNoteMatch = path.match(/^\/trash\/notes\/(note_[a-zA-Z0-9_]+)$/);
    if (purgeTrashNoteMatch && method === 'DELETE') {
      trashMutationRequests.push({ method, path, body: null });
      if (options.trashMutationFails) return json({ error: 'Trashed note not found' }, 404);
      const index = trashNotes.findIndex((note) => note.id === purgeTrashNoteMatch[1]);
      if (index < 0) return json({ error: 'Trashed note not found' }, 404);
      trashNotes.splice(index, 1);
      return json({ ok: true, deletedAttachmentCount: 1 });
    }

    const restoreTrashFolderMatch = path.match(/^\/trash\/folders\/(folder_[a-zA-Z0-9_]+)\/restore$/);
    if (restoreTrashFolderMatch && method === 'POST') {
      trashMutationRequests.push({ method, path, body: request.postDataJSON() });
      if (options.trashMutationFails) return json({ error: 'Trashed folder not found' }, 404);
      const index = trashFolders.findIndex((folder) => folder.id === restoreTrashFolderMatch[1]);
      if (index < 0) return json({ error: 'Trashed folder not found' }, 404);
      const [trashed] = trashFolders.splice(index, 1);
      const folder = {
        id: trashed.id,
        parentFolderId: null,
        title: trashed.title,
        isPrivate: false,
        isAgentReadOnly: false,
        createdAt: trashed.createdAt,
        updatedAt: now,
      };
      folders.push(folder);
      return json({ folder, restoredAtTopLevel: true, noteCount: trashed.noteCount });
    }

    const purgeTrashFolderMatch = path.match(/^\/trash\/folders\/(folder_[a-zA-Z0-9_]+)$/);
    if (purgeTrashFolderMatch && method === 'DELETE') {
      trashMutationRequests.push({ method, path, body: null });
      if (options.trashMutationFails) return json({ error: 'Trashed folder not found' }, 404);
      const index = trashFolders.findIndex((folder) => folder.id === purgeTrashFolderMatch[1]);
      if (index < 0) return json({ error: 'Trashed folder not found' }, 404);
      const [trashed] = trashFolders.splice(index, 1);
      return json({
        ok: true,
        deletedFolderCount: trashed.descendantFolderCount + 1,
        deletedNoteCount: trashed.noteCount,
        deletedAttachmentCount: 0,
      });
    }

    if (path === '/folders' && method === 'GET') return json({ folders });

    if (path === '/folders' && method === 'POST') {
      if (options.folderCreateFails) return json({ error: 'Folder creation unavailable' }, 500);
      const body = request.postDataJSON() as { title?: string; parentFolderId?: string | null };
      const folder = {
        ...browserFixture.folder,
        id: `folder_created_${folders.length + 1}`,
        parentFolderId: body.parentFolderId ?? null,
        title: body.title ?? 'Untitled folder',
      };
      folders.push(folder);
      return json({ folder }, 201);
    }

    const folderMatch = path.match(/^\/folders\/(folder_[a-zA-Z0-9_]+)$/);
    if (folderMatch && method === 'DELETE') {
      const rootId = folderMatch[1];
      const deletedIds = new Set([rootId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const folder of folders) {
          if (folder.parentFolderId && deletedIds.has(folder.parentFolderId) && !deletedIds.has(folder.id)) {
            deletedIds.add(folder.id);
            changed = true;
          }
        }
      }
      const deletedNoteIds = [...notes.values()].filter((note) => deletedIds.has(note.folderId)).map((note) => note.id);
      for (const noteId of deletedNoteIds) notes.delete(noteId);
      for (let index = folders.length - 1; index >= 0; index -= 1) {
        if (deletedIds.has(folders[index].id)) folders.splice(index, 1);
      }
      return json({ ok: true, deletedAt: now, folderCount: deletedIds.size, noteCount: deletedNoteIds.length });
    }

    const folderNotesMatch = path.match(/^\/folders\/(folder_[a-zA-Z0-9_]+)\/notes$/);
    if (folderNotesMatch && method === 'GET') {
      if (!folders.some((folder) => folder.id === folderNotesMatch[1])) return json({ error: 'Folder not found' }, 404);
      const type = url.searchParams.get('type') === 'template' ? 'template' : 'note';
      return json({
        notes: [...notes.values()].filter((note) => note.folderId === folderNotesMatch[1] && note.type === type),
      });
    }

    if (path === '/notes/templates' && method === 'GET')
      return json({ templates: [...notes.values()].filter((note) => note.type === 'template') });

    if (path === `/folders/${browserFixture.folder.id}/share-link` && method === 'GET')
      return json({ shareLink: folderShareLink });

    if (path === `/folders/${browserFixture.folder.id}/share-link` && method === 'POST') {
      folderShareLink = {
        id: 'folder_share_browser',
        folderId: browserFixture.folder.id,
        permission: 'read',
        url: 'http://localhost:5173/share/folders/folder_share_token',
        createdAt: now,
        updatedAt: now,
      };
      return json({ shareLink: folderShareLink }, 201);
    }

    if (path === `/folders/${browserFixture.folder.id}/share-link` && method === 'DELETE') {
      folderShareLink = null;
      return json({ ok: true });
    }

    if (path === `/share/folders/folder_share_token` && method === 'GET')
      return json({
        folder: {
          id: browserFixture.folder.id,
          title: browserFixture.folder.title,
          updatedAt: browserFixture.folder.updatedAt,
        },
        folders: [
          {
            id: browserFixture.childFolder.id,
            parentFolderId: browserFixture.childFolder.parentFolderId,
            title: browserFixture.childFolder.title,
            updatedAt: browserFixture.childFolder.updatedAt,
          },
        ],
        notes: [...notes.values()]
          .filter((note) => note.type === 'note')
          .map((note) => ({
            id: note.id,
            folderId: note.folderId,
            title: note.title,
            content: note.content,
            documentType: note.documentType,
            updatedAt: note.updatedAt,
          })),
        share: { id: 'folder_share_browser', permission: 'read', createdAt: now },
      });

    const folderNoteWikilinksMatch = path.match(
      /^\/share\/folders\/folder_share_token\/notes\/(note_[a-zA-Z0-9_]+)\/wikilinks$/
    );
    if (folderNoteWikilinksMatch && method === 'GET') {
      const note = notes.get(folderNoteWikilinksMatch[1]);
      if (!note) return json({ error: 'Shared note not found' }, 404);
      return json({
        resolutions:
          note.id === browserFixture.linked.id
            ? [
                {
                  target: 'Target Note',
                  href: `/share/folders/folder_share_token?note=${browserFixture.target.id}`,
                },
                {
                  target: browserFixture.target.id,
                  href: `/share/folders/folder_share_token?note=${browserFixture.target.id}`,
                },
                { target: 'Missing Note', href: null },
              ]
            : [],
      });
    }

    const sharedNoteMatch = path.match(/^\/share\/(note_share_note_[a-zA-Z0-9_]+)$/);
    if (sharedNoteMatch && method === 'GET') {
      const token = sharedNoteMatch[1];
      const noteId = noteShareTokens.get(token);
      const note = noteId ? notes.get(noteId) : undefined;
      if (!note) return json({ error: 'Shared note not found' }, 404);
      return json({
        note: {
          title: note.title,
          content: note.content,
          documentType: note.documentType,
          updatedAt: note.updatedAt,
        },
        share: { id: `share_${note.id}`, permission: 'read', createdAt: now },
        resolutions:
          note.id === browserFixture.linked.id
            ? [
                { target: 'Target Note', href: `/share/note_share_${browserFixture.target.id}` },
                { target: browserFixture.target.id, href: `/share/note_share_${browserFixture.target.id}` },
                { target: 'Missing Note', href: null },
              ]
            : [],
      });
    }

    if (path === '/notes/recent' && method === 'GET')
      return json({
        notes: [...notes.values()]
          .filter((note) => note.type === 'note')
          .map((note) => ({ ...note, folderTitle: browserFixture.folder.title })),
      });

    if (path === '/notes/trash' && method === 'POST') {
      const body = request.postDataJSON() as { noteIds?: string[] };
      const noteIds = body.noteIds ?? [];
      for (const noteId of noteIds) notes.delete(noteId);
      return json({ ok: true, deletedAt: now, noteCount: noteIds.length });
    }

    if (path === '/notes/move' && method === 'POST') {
      const body = request.postDataJSON() as { noteIds?: string[]; targetFolderId?: string };
      const moved = (body.noteIds ?? []).map((noteId) => {
        const note = notes.get(noteId);
        if (!note) return null;
        Object.assign(note, { folderId: body.targetFolderId ?? note.folderId, updatedAt: now });
        return { note, contentHash: `hash_${++hashVersion}` };
      });
      return json({ notes: moved.filter(Boolean) });
    }

    if (path === '/notes/search' && method === 'GET') {
      const query = url.searchParams.get('q')?.toLowerCase() ?? '';
      return json({
        notes: [...notes.values()]
          .filter((note) => note.title.toLowerCase().includes(query))
          .map((note) => ({ ...note, folderTitle: browserFixture.folder.title })),
      });
    }

    if (path === `/attachments/notes/${browserFixture.source.id}/image-uploads` && method === 'POST')
      return json({ error: 'Signed uploads are not supported by the configured storage driver' }, 400);

    if (path === `/attachments/notes/${browserFixture.source.id}/images` && method === 'POST') {
      if (options.uploadFails) return json({ error: 'Attachment storage unavailable' }, 500);
      return json(
        {
          attachment: { id: 'attachment_browser', filename: 'browser.png' },
          markdownUrl: '/internal/attachments/attachment_browser/content',
          markdown: '![browser.png](/internal/attachments/attachment_browser/content)',
        },
        201
      );
    }

    const noteEventsMatch = path.match(/^\/notes\/(note_[a-zA-Z0-9]+)\/events$/);
    if (noteEventsMatch && method === 'GET') return json({ noteId: noteEventsMatch[1], events: [] });

    const noteMatch = path.match(/^\/notes\/(note_[a-zA-Z0-9]+)$/);
    if (noteMatch) {
      const note = notes.get(noteMatch[1]);
      if (!note) return json({ error: 'Note not found' }, 404);
      if (method === 'GET') return json({ note, contentHash: `hash_${hashVersion}` });
      if (method === 'DELETE') {
        if (options.noteTrashFails) return json({ error: 'Trash is temporarily unavailable' }, 500);
        notes.delete(note.id);
        return json({ ok: true, deletedAt: now });
      }
      if (method === 'PATCH') {
        const body = request.postDataJSON() as Partial<Pick<Note, 'title' | 'content'>>;
        Object.assign(note, body, { updatedAt: now });
        hashVersion += 1;
        saveRequests.push({ noteId: note.id, body });
        return json({ note, contentHash: `hash_${hashVersion}` });
      }
    }

    const statusMatch = path.match(/^\/notes\/(note_[a-zA-Z0-9]+)\/status$/);
    if (statusMatch) return json({ noteId: statusMatch[1], contentHash: `hash_${hashVersion}`, updatedAt: now });

    const backlinksMatch = path.match(/^\/notes\/(note_[a-zA-Z0-9]+)\/backlinks$/);
    if (backlinksMatch) {
      const noteId = backlinksMatch[1];
      return json({
        noteId,
        backlinks:
          noteId === browserFixture.target.id
            ? [
                {
                  id: 'link_browser',
                  sourceNoteId: browserFixture.linked.id,
                  sourceTitle: browserFixture.linked.title,
                  sourceFolderId: browserFixture.linked.folderId,
                  targetTitle: browserFixture.target.title,
                  label: null,
                  linkType: 'wikilink',
                  createdAt: now,
                  updatedAt: now,
                },
              ]
            : [],
      });
    }

    return json({ error: `Unhandled browser fixture request: ${method} ${path}` }, 404);
  });

  return {
    folders,
    notes,
    trashNotes,
    trashFolders,
    trashMutationRequests,
    saveRequests,
    async expectSavedContent(content: string) {
      await expect.poll(() => saveRequests.at(-1)?.body.content).toBe(content);
    },
  };
}
