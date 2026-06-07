import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/index";

function mockClient() {
  return {
    folders: {
      list: vi.fn(async () => ({ folders: [{ id: "folder-1", title: "Inbox", updatedAt: "now" }] })),
      create: vi.fn(async (title: string) => ({ folder: { id: "folder-1", title } })),
    },
    notes: {
      list: vi.fn(async () => ({ notes: [{ id: "note-1", title: "Note", updatedAt: "now" }] })),
      get: vi.fn(async () => ({ note: { id: "note-1" }, contentHash: "hash" })),
      create: vi.fn(async () => ({ note: { id: "note-1" } })),
      update: vi.fn(async () => ({ note: { id: "note-1" }, contentHash: "hash" })),
      delete: vi.fn(async () => ({ ok: true })),
      duplicate: vi.fn(async () => ({ note: { id: "note-2" } })),
    },
    templates: {
      list: vi.fn(async () => ({ templates: [{ id: "template-1", title: "Template", updatedAt: "now" }] })),
    },
    search: {
      notes: vi.fn(async () => ({ notes: [{ id: "note-1", folderTitle: "Inbox", title: "Note", updatedAt: "now" }] })),
    },
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

  it("creates notes", async () => {
    const client = mockClient();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["notes", "create", "--folder", "folder-1", "--title", "Hello"], client as never);

    expect(client.notes.create).toHaveBeenCalledWith("folder-1", { title: "Hello", content: undefined });
  });

  it("lists templates", async () => {
    const client = mockClient();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["templates", "list", "--json"], client as never);

    expect(client.templates.list).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("template-1"));
  });

  it("searches notes", async () => {
    const client = mockClient();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main(["search", "hello", "world"], client as never);

    expect(client.search.notes).toHaveBeenCalledWith("hello world");
  });
});
