const API_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : null;

  if (!res.ok) throw new ApiError(data?.error ?? "Request failed", res.status);
  if (!data) throw new Error("API did not return JSON. Check VITE_API_URL.");

  return data as T;
}

export type Folder = { id: string; title: string; createdAt: string; updatedAt: string };
export type ApiKeyPermission = { id: string; apiKeyId: string; folderId: string; canRead: boolean; canCreate: boolean; canEdit: boolean; createdAt: string; updatedAt: string };
export type ApiKey = { id: string; name: string; uid: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; permissions: ApiKeyPermission[] };
export type Note = { id: string; folderId: string; title: string; content: string; isApiEditable: boolean; createdAt: string; updatedAt: string };
export type NoteResponse = { note: Note; contentHash: string };
export type NoteStatus = { noteId: string; contentHash: string; updatedAt: string };
export type DocumentEdit =
  | { type: "append"; text: string }
  | { type: "replace_text"; oldText: string; newText: string }
  | { type: "replace_range"; from: number; to: number; text: string };
export type DocumentSection = { id: string; heading: string; level: number; from: number; to: number; contentFrom: number; contentTo: number };
export type SectionResponse = { noteId: string; contentHash: string; section: DocumentSection & { markdown: string; content: string } };
export type SearchNote = Note & { folderTitle: string };

export const api = {
  apiKeys: () => request<{ keys: ApiKey[] }>("/api-keys"),
  createApiKey: (data: { name: string; permissions: Array<{ folderId: string; canRead: boolean; canCreate: boolean; canEdit: boolean }> }) => request<{ key: string; apiKey: ApiKey }>("/api-keys", { method: "POST", body: JSON.stringify(data) }),
  revokeApiKey: (keyId: string) => request<{ ok: true }>(`/api-keys/${keyId}`, { method: "DELETE" }),
  folders: () => request<{ folders: Folder[] }>("/folders"),
  createFolder: (title: string) => request<{ folder: Folder }>("/folders", { method: "POST", body: JSON.stringify({ title }) }),
  renameFolder: (folderId: string, title: string) => request<{ folder: Folder }>(`/folders/${folderId}`, { method: "PATCH", body: JSON.stringify({ title }) }),
  deleteFolder: (folderId: string) => request<{ ok: true }>(`/folders/${folderId}`, { method: "DELETE" }),
  notes: (folderId: string) => request<{ notes: Note[] }>(`/folders/${folderId}/notes`),
  createNote: (folderId: string, data?: { title?: string; content?: string }) => request<{ note: Note }>(`/folders/${folderId}/notes`, { method: "POST", body: JSON.stringify(data ?? {}) }),
  note: (noteId: string) => request<NoteResponse>(`/notes/${noteId}`),
  noteStatus: (noteId: string) => request<NoteStatus>(`/notes/${noteId}/status`),
  noteOutline: (noteId: string) => request<{ noteId: string; contentHash: string; sections: DocumentSection[] }>(`/notes/${noteId}/outline`),
  noteSection: (noteId: string, sectionId: string) => request<SectionResponse>(`/notes/${noteId}/sections/${encodeURIComponent(sectionId)}`),
  editNote: (noteId: string, data: { edits: DocumentEdit[]; baseHash?: string }) => request<NoteResponse>(`/notes/${noteId}/edit`, { method: "POST", body: JSON.stringify(data) }),
  saveNote: (noteId: string, data: Partial<Pick<Note, "title" | "content" | "isApiEditable">> & { baseHash?: string }) => request<NoteResponse>(`/notes/${noteId}`, { method: "PATCH", body: JSON.stringify(data) }),
  moveNote: (noteId: string, folderId: string) => request<NoteResponse>(`/notes/${noteId}`, { method: "PATCH", body: JSON.stringify({ folderId }) }),
  searchNotes: (q: string) => request<{ notes: SearchNote[] }>(`/notes/search?q=${encodeURIComponent(q)}`),
  deleteNote: (noteId: string) => request<{ ok: true }>(`/notes/${noteId}`, { method: "DELETE" }),
};
