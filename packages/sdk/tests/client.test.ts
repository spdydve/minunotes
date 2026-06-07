import { describe, expect, it, vi } from "vitest";
import { NotesApiError, NotesClient, NotesConfigurationError } from "../src";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

describe("NotesClient", () => {
  it("requires baseUrl and apiKey", () => {
    expect(() => new NotesClient({ baseUrl: "", apiKey: "key" })).toThrow(NotesConfigurationError);
    expect(() => new NotesClient({ baseUrl: "https://example.com/api", apiKey: "" })).toThrow(NotesConfigurationError);
  });

  it("sends api key auth and JSON headers", async () => {
    const fetch = vi.fn(async () => jsonResponse({ folders: [] }));
    const client = new NotesClient({ baseUrl: "https://example.com/api/", apiKey: "test-key", fetch });

    await client.folders.list();

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/folders", expect.objectContaining({
      headers: expect.objectContaining({
        "content-type": "application/json",
        "x-api-key": "test-key",
      }),
    }));
  });

  it("creates notes", async () => {
    const fetch = vi.fn(async () => jsonResponse({ note: { id: "note-1" } }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.notes.create("folder 1", { title: "Hello" });

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/folders/folder%201/notes", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ title: "Hello" }),
    }));
  });

  it("throws typed API errors", async () => {
    const fetch = vi.fn(async () => jsonResponse({ error: "Forbidden" }, { status: 403 }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await expect(client.folders.list()).rejects.toMatchObject({
      name: "NotesApiError",
      message: "Forbidden",
      status: 403,
    } satisfies Partial<NotesApiError>);
  });

  it("duplicates notes client-side", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ note: { id: "note-1", folderId: "folder-1", title: "Original", content: "Body", type: "note" }, contentHash: "hash" }))
      .mockResolvedValueOnce(jsonResponse({ note: { id: "note-2" } }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.notes.duplicate("note-1");

    expect(fetch).toHaveBeenLastCalledWith("https://example.com/api/folders/folder-1/notes", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ title: "Original copy", content: "Body", type: "note" }),
    }));
  });

  it("calls template endpoints", async () => {
    const fetch = vi.fn(async () => jsonResponse({ templates: [] }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.templates.list();

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/notes/templates", expect.any(Object));
  });

  it("updates template folder assignments", async () => {
    const fetch = vi.fn(async () => jsonResponse({ ok: true }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.templates.updateFolders("template 1", ["folder-1"]);

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/notes/templates/template%201/folders", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ folderIds: ["folder-1"] }),
    }));
  });

  it("searches notes with encoded query", async () => {
    const fetch = vi.fn(async () => jsonResponse({ notes: [] }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.search.notes("hello world", "template");

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/notes/search?q=hello%20world&type=template", expect.any(Object));
  });

  it("updates and deletes notes", async () => {
    const fetch = vi.fn(async () => jsonResponse({ ok: true }));
    const client = new NotesClient({ baseUrl: "https://example.com/api", apiKey: "test-key", fetch });

    await client.notes.update("note 1", { title: "Updated" });
    await client.notes.delete("note 1");

    expect(fetch).toHaveBeenNthCalledWith(1, "https://example.com/api/notes/note%201", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ title: "Updated" }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, "https://example.com/api/notes/note%201", expect.objectContaining({ method: "DELETE" }));
  });
});
