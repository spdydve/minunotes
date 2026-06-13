import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/index";

function mockClient() {
  return {
    folders: {
      list: vi.fn(async () => ({ folders: [{ id: "folder-1", title: "Inbox", updatedAt: "now" }] })),
      create: vi.fn(async (title: string) => ({ folder: { id: "folder-1", title } })),
    },
    notes: {
      search: vi.fn(async () => ({ notes: [{ id: "note-1", folderTitle: "Inbox", title: "Note", updatedAt: "now" }] })),
      get: vi.fn(async () => ({ note: { id: "note-1" }, contentHash: "hash" })),
      create: vi.fn(async () => ({ note: { id: "note-1" }, contentHash: "hash" })),
      update: vi.fn(async () => ({ note: { id: "note-1" }, contentHash: "hash" })),
      edit: vi.fn(async () => ({ note: { id: "note-1" }, contentHash: "hash" })),
      events: vi.fn(async () => ({ noteId: "note-1", events: [] })),
    },
    search: { notes: vi.fn(async () => ({ notes: [{ id: "note-1", folderTitle: "Inbox", title: "Note", updatedAt: "now" }] })) },
  };
}

describe("CLI commands", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists folders", async () => {
    const client = mockClient();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["folders", "list", "--json"], client as never);

    expect(client.folders.list).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("folder-1"));
  });

  it("creates folders", async () => {
    const client = mockClient();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["folders", "create", "Agent", "Workspace"], client as never);

    expect(client.folders.create).toHaveBeenCalledWith("Agent Workspace");
  });

  it("creates notes", async () => {
    const client = mockClient();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["notes", "create", "--folder", "folder-1", "--title", "Hello"], client as never);

    expect(client.notes.create).toHaveBeenCalledWith("folder-1", { title: "Hello", content: undefined });
  });

  it("edits notes", async () => {
    const client = mockClient();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["notes", "edit", "note-1", "--old", "before", "--new", "after", "--base-hash", "hash"], client as never);

    expect(client.notes.edit).toHaveBeenCalledWith("note-1", [{ type: "replace_text", oldText: "before", newText: "after" }], "hash");
  });

  it("searches notes", async () => {
    const client = mockClient();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["search", "hello", "world"], client as never);

    expect(client.search.notes).toHaveBeenCalledWith("hello world");
  });
});
