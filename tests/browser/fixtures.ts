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

export async function mockBrowserApi(page: Page, options: { uploadFails?: boolean } = {}) {
  const notes = new Map<string, Note>([
    [browserFixture.source.id, { ...browserFixture.source }],
    [browserFixture.canvas.id, { ...browserFixture.canvas }],
    [browserFixture.target.id, { ...browserFixture.target }],
  ]);
  const saveRequests: Array<{ noteId: string; body: Record<string, unknown> }> = [];
  let hashVersion = 1;

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

    if (path === '/folders' && method === 'GET') return json({ folders: [browserFixture.folder] });
    if (path === '/notes/recent' && method === 'GET')
      return json({
        notes: [...notes.values()].map((note) => ({ ...note, folderTitle: browserFixture.folder.title })),
      });

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

    const noteMatch = path.match(/^\/notes\/(note_[a-zA-Z0-9]+)$/);
    if (noteMatch) {
      const note = notes.get(noteMatch[1]);
      if (!note) return json({ error: 'Note not found' }, 404);
      if (method === 'GET') return json({ note, contentHash: `hash_${hashVersion}` });
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
    if (backlinksMatch) return json({ noteId: backlinksMatch[1], backlinks: [] });

    return json({ error: `Unhandled browser fixture request: ${method} ${path}` }, 404);
  });

  return {
    notes,
    saveRequests,
    async expectSavedContent(content: string) {
      await expect.poll(() => saveRequests.at(-1)?.body.content).toBe(content);
    },
  };
}
