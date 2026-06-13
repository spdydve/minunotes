import { describe, expect, it, vi } from "vitest";
import { createNotesMcpServer } from "../src/server";

function mockClient() {
  return {
    folders: {
      list: vi.fn(async () => ({ folders: [{ id: "folder-1" }] })),
      create: vi.fn(async () => ({ folder: { id: "folder-2" } })),
    },
    notes: {
      search: vi.fn(async () => ({ notes: [{ id: "note-1" }] })),
      get: vi.fn(async () => ({ note: { id: "note-1", title: "Note", content: "Body" }, contentHash: "hash" })),
      create: vi.fn(async () => ({ note: { id: "note-2" }, contentHash: "hash" })),
      edit: vi.fn(async () => ({ note: { id: "note-1" }, contentHash: "next" })),
      searchLines: vi.fn(async () => ({ query: "todo", matches: [] })),
      lines: vi.fn(async () => ({ noteId: "note-1", lines: [] })),
      searchNoteLines: vi.fn(async () => ({ query: "todo", matches: [] })),
      section: vi.fn(async () => ({ noteId: "note-1", section: { id: "intro" } })),
    },
  };
}

function tools(server: unknown) {
  return (server as { _registeredTools: Record<string, { annotations: unknown; handler: (args: never) => Promise<unknown> }> })._registeredTools;
}

describe("createNotesMcpServer", () => {
  it("registers expected tools with standard annotations", () => {
    const server = createNotesMcpServer(mockClient() as never);
    const registered = tools(server);

    expect(Object.keys(registered)).toEqual([
      "notes_list_folders",
      "notes_create_folder",
      "notes_search",
      "notes_get_note",
      "notes_create_note",
      "notes_edit_note",
      "notes_search_lines",
      "notes_read_lines",
      "notes_search_note_lines",
      "notes_read_section",
    ]);
    expect(registered.notes_list_folders.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(registered.notes_create_folder.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(registered.notes_edit_note.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("calls harness client methods and returns structured content", async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    const result = await tools(server).notes_create_folder.handler({ title: "Agent Workspace" } as never);

    expect(client.folders.create).toHaveBeenCalledWith({ title: "Agent Workspace" });
    expect(result).toMatchObject({
      structuredContent: { result: { folder: { id: "folder-2" } } },
      content: [{ type: "text", text: expect.stringContaining("folder-2") }],
    });
  });

  it("creates notes", async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_create_note.handler({ folderId: "folder-1", title: "Hello", content: "Body" } as never);

    expect(client.notes.create).toHaveBeenCalledWith("folder-1", { title: "Hello", content: "Body" });
  });

  it("edits notes", async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_edit_note.handler({ noteId: "note-1", edits: [{ type: "append", text: "hello" }], baseHash: "hash" } as never);

    expect(client.notes.edit).toHaveBeenCalledWith("note-1", [{ type: "append", text: "hello" }], "hash");
  });

  it("searches lines across notes", async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_search_lines.handler({ query: "todo", folderId: "folder-1", context: 1, limit: 5, caseSensitive: true } as never);

    expect(client.notes.searchLines).toHaveBeenCalledWith({ query: "todo", folderId: "folder-1", context: 1, limit: 5, caseSensitive: true });
  });

  it("reads note lines", async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_read_lines.handler({ noteId: "note-1", from: 2, to: 4 } as never);

    expect(client.notes.lines).toHaveBeenCalledWith("note-1", { from: 2, to: 4 });
  });

  it("searches lines in one note", async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_search_note_lines.handler({ noteId: "note-1", query: "todo", context: 1, limit: 5 } as never);

    expect(client.notes.searchNoteLines).toHaveBeenCalledWith("note-1", { query: "todo", context: 1, limit: 5, caseSensitive: undefined });
  });

  it("reads note sections", async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_read_section.handler({ noteId: "note-1", sectionId: "intro" } as never);

    expect(client.notes.section).toHaveBeenCalledWith("note-1", "intro");
  });
});
