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
});
