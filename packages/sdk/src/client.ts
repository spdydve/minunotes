import { NotesApiError, NotesConfigurationError } from "./errors";
import type {
  CreateFolderInput,
  CreateNoteInput,
  DocumentEdit,
  DocumentSection,
  Folder,
  Note,
  NoteResponse,
  NoteStatus,
  NoteType,
  SearchNote,
  SectionResponse,
  UpdateFolderInput,
  UpdateNoteInput,
} from "./types";

type FetchLike = typeof fetch;

export type NotesClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetch?: FetchLike;
};

export class NotesClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: NotesClientOptions) {
    if (!options.baseUrl?.trim()) {
      throw new NotesConfigurationError("baseUrl is required");
    }
    if (!options.apiKey?.trim()) {
      throw new NotesConfigurationError("apiKey is required");
    }

    this.baseUrl = options.baseUrl.replace(/\/$/, "");
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
    const data = contentType.includes("application/json")
      ? await response.json()
      : null;

    if (!response.ok) {
      throw new NotesApiError(
        typeof data?.error === "string" ? data.error : "Notes API request failed",
        response.status,
        data,
      );
    }

    if (!data) {
      throw new NotesApiError("Notes API did not return JSON", response.status);
    }

    return data as T;
  }

  folders = {
    list: () => this.request<{ folders: Folder[] }>("/folders"),
    create: (input: CreateFolderInput | string) => {
      const title = typeof input === "string" ? input : input.title;
      return this.request<{ folder: Folder }>("/folders", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
    },
    update: (folderId: string, input: UpdateFolderInput) =>
      this.request<{ folder: Folder }>(`/folders/${encodeURIComponent(folderId)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    delete: (folderId: string) =>
      this.request<{ ok: true }>(`/folders/${encodeURIComponent(folderId)}`, {
        method: "DELETE",
      }),
    templates: (folderId: string) =>
      this.request<{ templates: Note[] }>(`/folders/${encodeURIComponent(folderId)}/templates`),
  };

  notes = {
    list: (folderId: string, type: NoteType = "note") =>
      this.request<{ notes: Note[] }>(
        `/folders/${encodeURIComponent(folderId)}/notes?type=${encodeURIComponent(type)}`,
      ),
    create: (folderId: string, input: CreateNoteInput = {}) =>
      this.request<{ note: Note }>(`/folders/${encodeURIComponent(folderId)}/notes`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    get: (noteId: string) =>
      this.request<NoteResponse>(`/notes/${encodeURIComponent(noteId)}`),
    status: (noteId: string) =>
      this.request<NoteStatus>(`/notes/${encodeURIComponent(noteId)}/status`),
    outline: (noteId: string) =>
      this.request<{ noteId: string; contentHash: string; sections: DocumentSection[] }>(
        `/notes/${encodeURIComponent(noteId)}/outline`,
      ),
    section: (noteId: string, sectionId: string) =>
      this.request<SectionResponse>(
        `/notes/${encodeURIComponent(noteId)}/sections/${encodeURIComponent(sectionId)}`,
      ),
    update: (noteId: string, input: UpdateNoteInput) =>
      this.request<NoteResponse>(`/notes/${encodeURIComponent(noteId)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    edit: (noteId: string, edits: DocumentEdit[], baseHash?: string) =>
      this.request<NoteResponse>(`/notes/${encodeURIComponent(noteId)}/edit`, {
        method: "POST",
        body: JSON.stringify({ edits, baseHash }),
      }),
    delete: (noteId: string) =>
      this.request<{ ok: true }>(`/notes/${encodeURIComponent(noteId)}`, {
        method: "DELETE",
      }),
    duplicate: async (noteId: string, title?: string) => {
      const { note } = await this.notes.get(noteId);
      return this.notes.create(note.folderId, {
        title: title ?? `${note.title} copy`,
        content: note.content,
        type: note.type,
      });
    },
  };

  templates = {
    list: () => this.request<{ templates: Note[] }>("/notes/templates"),
    folders: (templateId: string) =>
      this.request<{ folders: Folder[] }>(`/notes/templates/${encodeURIComponent(templateId)}/folders`),
    updateFolders: (templateId: string, folderIds: string[]) =>
      this.request<{ ok: true }>(`/notes/templates/${encodeURIComponent(templateId)}/folders`, {
        method: "PUT",
        body: JSON.stringify({ folderIds }),
      }),
  };

  search = {
    notes: (query: string, type: NoteType = "note") =>
      this.request<{ notes: SearchNote[] }>(
        `/notes/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`,
      ),
  };
}
