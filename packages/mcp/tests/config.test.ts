import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient, loadConfig, NotesConfigurationError } from '../src/config';

describe('config', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads API URL and key from env', () => {
    expect(loadConfig({ NOTES_API_URL: 'https://example.com/api', NOTES_API_KEY: 'key' })).toEqual({
      apiUrl: 'https://example.com/api',
      apiKey: 'key',
    });
  });

  it('requires API URL and key', () => {
    expect(() => loadConfig({ NOTES_API_KEY: 'key' })).toThrow(NotesConfigurationError);
    expect(() => loadConfig({ NOTES_API_URL: 'https://example.com/api' })).toThrow(NotesConfigurationError);
  });

  it.each([
    ['https://example.com', 'https://example.com/v1/harness/folders'],
    ['https://example.com/', 'https://example.com/v1/harness/folders'],
    ['https://example.com/api', 'https://example.com/v1/harness/folders'],
    ['https://example.com/v1', 'https://example.com/v1/harness/folders'],
  ])('calls v1 harness endpoints for NOTES_API_URL=%s', async (apiUrl, expectedUrl) => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ folders: [] }), { headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    await createClient({ NOTES_API_URL: apiUrl, NOTES_API_KEY: 'key' }).folders.list();

    expect(fetchMock).toHaveBeenCalledWith(
      expectedUrl,
      expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'key' }) })
    );
  });

  it('calls canvas lifecycle endpoints with matching payloads', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ note: { id: 'canvas-1' } }), { headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient({ NOTES_API_URL: 'https://example.com', NOTES_API_KEY: 'key' });
    const canvas = { nodes: [], edges: [] };

    await client.canvases.create({ folderId: 'folder-1', title: 'Flow', canvas });
    await client.canvases.createFromSyntax({ folderId: 'folder-1', syntax: 'diagram "Flow" { A > B }' });
    await client.canvases.replace('canvas/1', { baseHash: 'hash', canvas });
    await client.canvases.replaceFromSyntax('canvas/1', {
      baseHash: 'hash',
      syntax: 'diagram "Flow" { A > C }',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://example.com/v1/harness/canvases',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ folderId: 'folder-1', title: 'Flow', canvas }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/v1/harness/canvases/from-syntax',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ folderId: 'folder-1', syntax: 'diagram "Flow" { A > B }' }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://example.com/v1/harness/notes/canvas%2F1/canvas',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ baseHash: 'hash', canvas }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://example.com/v1/harness/notes/canvas%2F1/canvas/from-syntax',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ baseHash: 'hash', syntax: 'diagram "Flow" { A > C }' }),
      })
    );
  });

  it('calls focused canvas note-link endpoints', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ noteId: 'canvas-1' }), { headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient({ NOTES_API_URL: 'https://example.com', NOTES_API_KEY: 'key' });

    await client.canvases.setNoteLink('canvas/1', 'node/1', { targetNoteId: 'note-1', baseHash: 'hash' });
    await client.canvases.removeNoteLink('canvas/1', 'node/1', 'next hash');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://example.com/v1/harness/notes/canvas%2F1/canvas/nodes/node%2F1/link-note',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ targetNoteId: 'note-1', baseHash: 'hash' }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/v1/harness/notes/canvas%2F1/canvas/nodes/node%2F1/link?baseHash=next+hash',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('calls outline, event, and tag endpoints', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({}), { headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient({ NOTES_API_URL: 'https://example.com', NOTES_API_KEY: 'key' });

    await client.notes.outline('note/1');
    await client.notes.events('note/1', 10);
    await client.tags.list();
    await client.notes.tags('note/1');
    await client.notes.replaceTags('note/1', ['release']);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://example.com/v1/harness/notes/note%2F1/outline',
      'https://example.com/v1/harness/notes/note%2F1/events?limit=10',
      'https://example.com/v1/harness/tags',
      'https://example.com/v1/harness/notes/note%2F1/tags',
      'https://example.com/v1/harness/notes/note%2F1/tags',
    ]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://example.com/v1/harness/notes/note%2F1/tags',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ tags: ['release'] }) })
    );
  });

  it('moves notes through the v1 harness endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ targetFolderId: 'folder-2', notes: [] }), {
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    await createClient({ NOTES_API_URL: 'https://example.com', NOTES_API_KEY: 'key' }).notes.move({
      noteIds: ['note-1'],
      targetFolderId: 'folder-2',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/v1/harness/notes/move',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ noteIds: ['note-1'], targetFolderId: 'folder-2' }),
      })
    );
  });
});
