import { describe, expect, it, vi } from "vitest";
import { createNotesMcpServer } from "../src/server";

function mockClient() {
  return {
    folders: { list: vi.fn(async () => ({ folders: [{ id: "folder-1" }] })) },
    notes: {
      list: vi.fn(async () => ({ notes: [{ id: "note-1" }] })),
      get: vi.fn(async () => ({ note: { id: "template-1", title: "Template", content: "Body" }, contentHash: "hash" })),
      create: vi.fn(async () => ({ note: { id: "note-2" } })),
      update: vi.fn(async () => ({ note: { id: "note-1" }, contentHash: "hash" })),
      delete: vi.fn(async () => ({ ok: true })),
    },
    templates: { list: vi.fn(async () => ({ templates: [{ id: "template-1" }] })) },
    search: { notes: vi.fn(async () => ({ notes: [{ id: "note-1" }] })) },
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
      "notes_list_notes",
      "notes_get_note",
      "notes_create_note",
      "notes_update_note",
      "notes_delete_note",
      "notes_search",
      "notes_list_templates",
      "notes_create_from_template",
    ]);
    expect(registered.notes_list_folders.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(registered.notes_update_note.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(registered.notes_delete_note.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true });
  });

  it("calls SDK methods and returns structured content", async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    const result = await tools(server).notes_list_notes.handler({ folderId: "folder-1", type: "note" } as never);

    expect(client.notes.list).toHaveBeenCalledWith("folder-1", "note");
    expect(result).toMatchObject({
      structuredContent: { result: { notes: [{ id: "note-1" }] } },
      content: [{ type: "text", text: expect.stringContaining("note-1") }],
    });
  });

  it("creates notes from templates", async () => {
    const client = mockClient();
    const server = createNotesMcpServer(client as never);

    await tools(server).notes_create_from_template.handler({ templateId: "template-1", folderId: "folder-1", title: "New" } as never);

    expect(client.notes.get).toHaveBeenCalledWith("template-1");
    expect(client.notes.create).toHaveBeenCalledWith("folder-1", { title: "New", content: "Body", type: "note" });
  });
});
