import { describe, expect, it, vi } from "vitest";
import { NotesApiError, NotesClient, NotesConfigurationError } from "../src";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json", ...init.headers } });
}

describe("NotesClient", () => {
  it("requires baseUrl and apiKey", () => {
    expect(() => new NotesClient({ baseUrl: "", apiKey: "key" })).toThrow(NotesConfigurationError);
    expect(() => new NotesClient({ baseUrl: "https://example.com", apiKey: "" })).toThrow(NotesConfigurationError);
  });

  it("normalizes API origins and sends API key auth", async () => {
    const fetch = vi.fn(async () => jsonResponse({ folders: [] }));
    const client = new NotesClient({ baseUrl: "https://example.com/", apiKey: "test-key", fetch });

    await client.folders.list();

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/harness/folders", expect.objectContaining({
      headers: expect.objectContaining({ "content-type": "application/json", "x-api-key": "test-key" }),
    }));
  });

  it("does not duplicate /api when provided an API base", async () => {
    const fetch = vi.fn(async () => jsonResponse({ folders: [] }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.folders.list();

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/harness/folders", expect.any(Object));
  });

  it("creates scoped folders through the harness", async () => {
    const fetch = vi.fn(async () => jsonResponse({ folder: { id: "folder-1" } }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.folders.create("Agent Workspace");

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/harness/folders", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ title: "Agent Workspace" }),
    }));
  });

  it("creates scoped folders from object input", async () => {
    const fetch = vi.fn(async () => jsonResponse({ folder: { id: "folder-1" } }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.folders.create({ title: "Agent Workspace" });

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/harness/folders", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ title: "Agent Workspace" }),
    }));
  });

  it("creates notes through the harness", async () => {
    const fetch = vi.fn(async () => jsonResponse({ note: { id: "note-1" }, contentHash: "hash" }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.notes.create("folder 1", { title: "Hello", content: "Body" });

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/harness/notes", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ folderId: "folder 1", title: "Hello", content: "Body" }),
    }));
  });

  it("edits notes through the harness", async () => {
    const fetch = vi.fn(async () => jsonResponse({ note: { id: "note-1" }, contentHash: "next" }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.notes.edit("note 1", [{ type: "append", text: "hi" }], "hash");

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/harness/notes/note%201/edit", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ edits: [{ type: "append", text: "hi" }], baseHash: "hash" }),
    }));
  });

  it("searches notes through the harness", async () => {
    const fetch = vi.fn(async () => jsonResponse({ notes: [] }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.search.notes("hello world");

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/harness/notes/search?q=hello%20world", expect.any(Object));
  });

  it("updates notes by replacing the current harness content with the current hash", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ note: { id: "note-1", content: "old content" }, contentHash: "hash-1" }))
      .mockResolvedValueOnce(jsonResponse({ note: { id: "note-1", content: "new content" }, contentHash: "hash-2" }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.notes.update("note 1", { content: "new content" });

    expect(fetch).toHaveBeenNthCalledWith(1, "https://example.com/api/harness/notes/note%201", expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, "https://example.com/api/harness/notes/note%201/edit", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ edits: [{ type: "replace_range", from: 0, to: "old content".length, text: "new content" }], baseHash: "hash-1" }),
    }));
  });

  it("reads note events with an optional limit", async () => {
    const fetch = vi.fn(async () => jsonResponse({ noteId: "note-1", events: [] }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.notes.events("note 1", 10);

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/harness/notes/note%201/events?limit=10", expect.any(Object));
  });

  it("throws typed API errors", async () => {
    const fetch = vi.fn(async () => jsonResponse({ error: "Forbidden" }, { status: 403 }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await expect(client.folders.list()).rejects.toMatchObject({ name: "NotesApiError", message: "Forbidden", status: 403 } satisfies Partial<NotesApiError>);
  });
});
