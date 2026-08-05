import { describe, expect, it, vi } from 'vitest';
import { createNotesMcpServer } from '../src/server';

function mockClient() {
  return {
    folders: {
      list: vi.fn(async () => ({ folders: [{ id: 'folder-1' }] })),
      create: vi.fn(async () => ({ folder: { id: 'folder-2' } })),
    },
    notes: {
      search: vi.fn(async () => ({ notes: [{ id: 'note-1' }] })),
      get: vi.fn(async () => ({ note: { id: 'note-1', title: 'Note', content: 'Body' }, contentHash: 'hash' })),
      create: vi.fn(async () => ({ note: { id: 'note-2' }, contentHash: 'hash' })),
      edit: vi.fn(async () => ({ note: { id: 'note-1' }, contentHash: 'next' })),
      move: vi.fn(async () => ({ targetFolderId: 'folder-2', notes: [{ id: 'note-1' }] })),
      searchLines: vi.fn(async () => ({ query: 'todo', matches: [] })),
      lines: vi.fn(async () => ({ noteId: 'note-1', lines: [] })),
      searchNoteLines: vi.fn(async () => ({ query: 'todo', matches: [] })),
      outline: vi.fn(async () => ({ noteId: 'note-1', sections: [{ id: 'intro' }] })),
      section: vi.fn(async () => ({ noteId: 'note-1', section: { id: 'intro' } })),
      events: vi.fn(async () => ({ noteId: 'note-1', events: [] })),
      tags: vi.fn(async () => ({ tags: [{ id: 'tag-1', name: 'release' }] })),
      replaceTags: vi.fn(async () => ({ tags: [{ id: 'tag-1', name: 'release' }] })),
    },
    canvases: {
      create: vi.fn(async () => ({ note: { id: 'canvas-1' }, contentHash: 'hash' })),
      createFromSyntax: vi.fn(async () => ({ note: { id: 'canvas-2' }, contentHash: 'hash', diagnostics: [] })),
      replace: vi.fn(async () => ({ note: { id: 'canvas-1' }, contentHash: 'next' })),
      replaceFromSyntax: vi.fn(async () => ({ note: { id: 'canvas-1' }, contentHash: 'next', diagnostics: [] })),
      setNoteLink: vi.fn(async () => ({ noteId: 'canvas-1', nodeId: 'node-1', contentHash: 'next' })),
      removeNoteLink: vi.fn(async () => ({ noteId: 'canvas-1', nodeId: 'node-1', contentHash: 'next' })),
    },
    tags: {
      list: vi.fn(async () => ({ tags: [{ id: 'tag-1', name: 'release' }] })),
    },
  };
}

function tools(server: unknown) {
  return (
    server as {
      _registeredTools: Record<
        string,
        { annotations: unknown; description?: string; handler: (args: never) => Promise<unknown> }
      >;
    }
  )._registeredTools;
}

describe('createNotesMcpServer', () => {
  it('registers expected tools with standard annotations', () => {
    const server = createNotesMcpServer(mockClient() as never);
    const registered = tools(server);

    expect(Object.keys(registered)).toEqual([
      'notes_list_folders',
      'notes_create_folder',
      'notes_search',
      'notes_get_note',
      'notes_create_note',
      'notes_create_canvas',
      'notes_create_canvas_from_syntax',
      'notes_replace_canvas',
      'notes_replace_canvas_from_syntax',
      'notes_set_canvas_node_note_link',
      'notes_remove_canvas_node_note_link',
      'notes_edit_note',
      'notes_move_notes',
      'notes_search_lines',
      'notes_read_lines',
      'notes_search_note_lines',
      'notes_read_outline',
      'notes_read_events',
      'notes_read_section',
      'notes_list_tags',
      'notes_read_note_tags',
      'notes_replace_note_tags',
    ]);
    expect(Object.keys(registered).filter((name) => /trash|restore|permanent.*delete/i.test(name))).toEqual([]);
    expect(registered.notes_list_folders.description).toContain('Trashed folder subtrees are excluded');
    expect(registered.notes_search.description).toContain('Trashed content is excluded');
    expect(registered.notes_get_note.description).toContain('Trashed content returns not found');
    expect(registered.notes_list_folders.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(registered.notes_create_folder.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(registered.notes_edit_note.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(registered.notes_move_notes.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(registered.notes_create_canvas.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(registered.notes_replace_canvas.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(registered.notes_read_outline.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(registered.notes_replace_note_tags.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it('calls harness client methods and returns structured content', async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    const result = await tools(server).notes_create_folder.handler({ title: 'Agent Workspace' } as never);

    expect(client.folders.create).toHaveBeenCalledWith({ title: 'Agent Workspace' });
    expect(result).toMatchObject({
      structuredContent: { result: { folder: { id: 'folder-2' } } },
      content: [{ type: 'text', text: expect.stringContaining('folder-2') }],
    });
  });

  it('creates notes', async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_create_note.handler({ folderId: 'folder-1', title: 'Hello', content: 'Body' } as never);

    expect(client.notes.create).toHaveBeenCalledWith('folder-1', { title: 'Hello', content: 'Body' });
  });

  it('creates and replaces canvases from JSON and syntax', async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);
    const canvas = { nodes: [], edges: [] };

    await tools(server).notes_create_canvas.handler({
      folderId: 'folder-1',
      title: 'Flow',
      canvas,
      documentType: 'canvas.default',
    } as never);
    await tools(server).notes_create_canvas_from_syntax.handler({
      folderId: 'folder-1',
      syntax: 'diagram "Flow" { A > B }',
      documentType: 'canvas.mindmap',
    } as never);
    await tools(server).notes_replace_canvas.handler({
      noteId: 'canvas-1',
      baseHash: 'hash',
      canvas,
    } as never);
    await tools(server).notes_replace_canvas_from_syntax.handler({
      noteId: 'canvas-1',
      baseHash: 'hash',
      title: 'Updated flow',
      syntax: 'diagram "Flow" { A > C }',
    } as never);

    expect(client.canvases.create).toHaveBeenCalledWith({
      folderId: 'folder-1',
      title: 'Flow',
      canvas,
      documentType: 'canvas.default',
    });
    expect(client.canvases.createFromSyntax).toHaveBeenCalledWith({
      folderId: 'folder-1',
      title: undefined,
      syntax: 'diagram "Flow" { A > B }',
      documentType: 'canvas.mindmap',
    });
    expect(client.canvases.replace).toHaveBeenCalledWith('canvas-1', {
      baseHash: 'hash',
      title: undefined,
      canvas,
      documentType: undefined,
    });
    expect(client.canvases.replaceFromSyntax).toHaveBeenCalledWith('canvas-1', {
      baseHash: 'hash',
      title: 'Updated flow',
      syntax: 'diagram "Flow" { A > C }',
      documentType: undefined,
    });
  });

  it('sets and removes canvas node note links', async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_set_canvas_node_note_link.handler({
      noteId: 'canvas-1',
      nodeId: 'node-1',
      targetNoteId: 'note-1',
      baseHash: 'hash',
    } as never);
    await tools(server).notes_remove_canvas_node_note_link.handler({
      noteId: 'canvas-1',
      nodeId: 'node-1',
      baseHash: 'next',
    } as never);

    expect(client.canvases.setNoteLink).toHaveBeenCalledWith('canvas-1', 'node-1', {
      targetNoteId: 'note-1',
      baseHash: 'hash',
    });
    expect(client.canvases.removeNoteLink).toHaveBeenCalledWith('canvas-1', 'node-1', 'next');
  });

  it('edits notes', async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_edit_note.handler({
      noteId: 'note-1',
      edits: [{ type: 'append', text: 'hello' }],
      baseHash: 'hash',
    } as never);

    expect(client.notes.edit).toHaveBeenCalledWith('note-1', [{ type: 'append', text: 'hello' }], 'hash');
  });

  it('moves notes', async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_move_notes.handler({
      noteIds: ['note-1', 'note-2'],
      targetFolderId: 'folder-2',
    } as never);

    expect(client.notes.move).toHaveBeenCalledWith({ noteIds: ['note-1', 'note-2'], targetFolderId: 'folder-2' });
  });

  it('searches lines across notes', async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_search_lines.handler({
      query: 'todo',
      folderId: 'folder-1',
      context: 1,
      limit: 5,
      caseSensitive: true,
    } as never);

    expect(client.notes.searchLines).toHaveBeenCalledWith({
      query: 'todo',
      folderId: 'folder-1',
      context: 1,
      limit: 5,
      caseSensitive: true,
    });
  });

  it('reads note lines', async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_read_lines.handler({ noteId: 'note-1', from: 2, to: 4 } as never);

    expect(client.notes.lines).toHaveBeenCalledWith('note-1', { from: 2, to: 4 });
  });

  it('searches lines in one note', async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_search_note_lines.handler({
      noteId: 'note-1',
      query: 'todo',
      context: 1,
      limit: 5,
    } as never);

    expect(client.notes.searchNoteLines).toHaveBeenCalledWith('note-1', {
      query: 'todo',
      context: 1,
      limit: 5,
      caseSensitive: undefined,
    });
  });

  it('reads note outlines and events', async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_read_outline.handler({ noteId: 'note-1' } as never);
    await tools(server).notes_read_events.handler({ noteId: 'note-1', limit: 10 } as never);

    expect(client.notes.outline).toHaveBeenCalledWith('note-1');
    expect(client.notes.events).toHaveBeenCalledWith('note-1', 10);
  });

  it('reads and replaces tags', async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_list_tags.handler({} as never);
    await tools(server).notes_read_note_tags.handler({ noteId: 'note-1' } as never);
    await tools(server).notes_replace_note_tags.handler({ noteId: 'note-1', tags: ['release'] } as never);

    expect(client.tags.list).toHaveBeenCalledOnce();
    expect(client.notes.tags).toHaveBeenCalledWith('note-1');
    expect(client.notes.replaceTags).toHaveBeenCalledWith('note-1', ['release']);
  });

  it('reads note sections', async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_read_section.handler({ noteId: 'note-1', sectionId: 'intro' } as never);

    expect(client.notes.section).toHaveBeenCalledWith('note-1', 'intro');
  });
});
