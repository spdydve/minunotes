import { NotesApiError, NotesConfigurationError } from "./errors.js";
import type {
  CreateFolderInput,
  CreateNoteInput,
  DocumentEdit,
  DocumentSection,
  Folder,
  Note,
  NoteEventsResponse,
  NoteResponse,
  SearchNote,
  SectionResponse,
  UpdateNoteInput,
} from "./types.js";

type FetchLike = typeof fetch;

export type NotesClientOptions = {
  /** API base URL. Accepts either https://api.example.com or https://api.example.com/api. */
  baseUrl: string;
  apiKey: string;
  fetch?: FetchLike;
};

export class NotesClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: NotesClientOptions) {
    if (!options.baseUrl?.trim()) throw new NotesConfigurationError("baseUrl is required");
    if (!options.apiKey?.trim()) throw new NotesConfigurationError("apiKey is required");

    const normalized = options.baseUrl.replace(/\/$/, "");
    this.baseUrl = normalized.endsWith("/api") ? normalized : `${normalized}/api`;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        ...init.headers,
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json") ? await response.json() : null;

    if (!response.ok) {
      throw new NotesApiError(
        typeof data?.error === "string" ? data.error : "Notes API request failed",
        response.status,
        data,
      );
    }

    if (!data) throw new NotesApiError("Notes API did not return JSON", response.status);
    return data as T;
  }

  folders = {
    list: () => this.request<{ folders: Folder[] }>("/harness/folders"),
    create: (input: CreateFolderInput | string) => {
      const title = typeof input === "string" ? input : input.title;
      return this.request<{ folder: Folder }>("/harness/folders", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
    },
  };

  notes = {
    search: (query: string) =>
      this.request<{ notes: SearchNote[] }>(`/harness/notes/search?q=${encodeURIComponent(query)}`),
    create: (folderId: string, input: CreateNoteInput = {}) =>
      this.request<NoteResponse>("/harness/notes", {
        method: "POST",
        body: JSON.stringify({ folderId, title: input.title, content: input.content }),
      }),
    get: (noteId: string) =>
      this.request<NoteResponse>(`/harness/notes/${encodeURIComponent(noteId)}`),
    events: (noteId: string, limit?: number) =>
      this.request<NoteEventsResponse>(`/harness/notes/${encodeURIComponent(noteId)}/events${limit ? `?limit=${encodeURIComponent(String(limit))}` : ""}`),
    lines: (noteId: string, input: { from?: number; to?: number } = {}) => {
      const params = new URLSearchParams();
      if (input.from !== undefined) params.set("from", String(input.from));
      if (input.to !== undefined) params.set("to", String(input.to));
      const query = params.toString();
      return this.request(`/harness/notes/${encodeURIComponent(noteId)}/lines${query ? `?${query}` : ""}`);
    },
    outline: (noteId: string) =>
      this.request<{ noteId: string; contentHash: string; sections: DocumentSection[] }>(
        `/harness/notes/${encodeURIComponent(noteId)}/outline`,
      ),
    section: (noteId: string, sectionId: string) =>
      this.request<SectionResponse>(
        `/harness/notes/${encodeURIComponent(noteId)}/sections/${encodeURIComponent(sectionId)}`,
      ),
    update: async (noteId: string, input: UpdateNoteInput) => {
      if (input.content === undefined) throw new NotesConfigurationError("content is required for harness note update");
      const current = await this.notes.get(noteId);
      return this.notes.edit(noteId, [{ type: "replace_range", from: 0, to: current.note.content.length, text: input.content }], input.baseHash ?? current.contentHash);
    },
    edit: (noteId: string, edits: DocumentEdit[], baseHash?: string) =>
      this.request<NoteResponse>(`/harness/notes/${encodeURIComponent(noteId)}/edit`, {
        method: "POST",
        body: JSON.stringify({ edits, baseHash }),
      }),
  };

  search = {
    notes: (query: string) => this.notes.search(query),
  };
}
