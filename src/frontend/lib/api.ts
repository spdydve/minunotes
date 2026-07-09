const API_URL = (import.meta.env.VITE_API_URL ?? "/internal").replace(/\/$/, "");

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
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
  });

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : null;

  if (!res.ok) throw new ApiError(data?.error ?? "Request failed", res.status);
  if (!data) throw new Error("API did not return JSON. Check VITE_API_URL.");

  return data as T;
}

export type Folder = { id: string; parentFolderId: string | null; title: string; isPrivate: boolean; isAgentReadOnly: boolean; createdAt: string; updatedAt: string };
export type ApiKeyPermission = { id: string; apiKeyId: string; folderId: string; canRead: boolean; canCreate: boolean; canEdit: boolean; createdAt: string; updatedAt: string };
export type ApiKeyAccessMode = "all" | "top_level" | "specific";
export type ApiKey = { id: string; name: string; uid: string; canCreateFolders: boolean; canRead: boolean; canCreate: boolean; canEdit: boolean; accessMode: ApiKeyAccessMode; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; permissions: ApiKeyPermission[] };
export type OAuthAuthorizationPermission = { id: string; authorizationId: string; folderId: string; canRead: boolean; canCreate: boolean; canEdit: boolean; createdAt: string; updatedAt: string };
export type OAuthClient = { id: string; userId: string | null; name: string; description: string | null; redirectUris: string; clientType: "public" | "confidential"; createdAt: string; updatedAt: string; revokedAt: string | null };
export type OAuthAuthorization = { id: string; userId: string; clientId: string; scope: string; accessMode: ApiKeyAccessMode; canCreateFolders: boolean; canRead: boolean; canCreate: boolean; canEdit: boolean; createdAt: string; updatedAt: string; revokedAt: string | null; lastUsedAt: string | null; client: OAuthClient; permissions: OAuthAuthorizationPermission[] };
export type OAuthAuthorizeRequest = { client_id: string; redirect_uri: string; response_type: string; code_challenge: string; code_challenge_method: string; state?: string; scope?: string }; 
export type OAuthAuthorizePreview = { client: OAuthClient; request: { scope: string; state: string | null; redirectUri: string } };
export type NoteType = "note" | "template";
export type DocumentType = "markdown" | "canvas.default" | "canvas.mindmap";
export type Note = { id: string; folderId: string; title: string; content: string; documentType: DocumentType; type: NoteType; isApiEditable: boolean; updatedByActorType: "user" | "agent" | "system" | null; updatedByActorId: string | null; updatedByActorUid?: string | null; createdAt: string; updatedAt: string };
export type NoteResponse = { note: Note; contentHash: string };
export type NoteStatus = { noteId: string; contentHash: string; updatedAt: string };
export type NoteShareLink = { id: string; noteId: string; permission: "read"; createdAt: string; updatedAt: string; expiresAt: string | null; revokedAt: string | null; url: string | null };
export type SharedNote = { title: string; content: string; documentType: DocumentType; updatedAt: string };
export type NoteEvent = { id: string; noteId: string; userId: string; actorType: "user" | "agent" | "system"; actorId: string | null; eventType: "create" | "update" | "edit_patch" | "move" | "toggle_api_editable" | "restore"; summary: string; beforeHash: string | null; afterHash: string | null; createdAt: string };
export type Backlink = { id: string; sourceNoteId: string; sourceTitle: string; sourceFolderId: string; targetTitle: string; label: string | null; linkType: "wikilink" | "internal-url" | "markdown-internal-url"; createdAt: string; updatedAt: string };
export type NoteLink = { id: string; sourceNoteId: string; targetNoteId: string | null; targetTitle: string; label: string | null; linkType: "wikilink" | "internal-url" | "markdown-internal-url"; createdAt: string; updatedAt: string };
export type BacklinksResponse = { noteId: string; backlinks: Backlink[] };
export type LinksResponse = { noteId: string; links: NoteLink[] };
export type Tag = { id: string; name: string; normalizedName: string; noteCount?: number }; 
export type Attachment = { id: string; userId: string; noteId: string; folderId: string; provider: string; filename: string; mimeType: string; size: number; contentHash: string; storageKey: string; status: "pending" | "ready"; createdAt: string; updatedAt: string };
export type UploadImageResponse = { attachment: Attachment; markdownUrl: string; markdown: string };
export type SignedImageUpload = UploadImageResponse & { signedUrl: string; method: "PUT"; headers: { "content-type": string } };
export type NoteVersionSummary = { id: string; noteId: string; title: string; reason: "create" | "autosave_checkpoint" | "before_agent_edit" | "before_restore" | "manual"; actorType: "user" | "agent" | "system"; actorId: string | null; stateHash: string; createdAt: string };
export type NoteVersion = NoteVersionSummary & { content: string; documentType: DocumentType; folderId: string; createdAtValue: string; isApiEditable: boolean };
export type NoteEventsResponse = { noteId: string; events: NoteEvent[] };
export type NoteVersionsResponse = { noteId: string; versions: NoteVersionSummary[] };
export type DocumentEdit =
  | { type: "append"; text: string }
  | { type: "replace_text"; oldText: string; newText: string }
  | { type: "replace_range"; from: number; to: number; text: string };
export type DocumentSection = { id: string; heading: string; level: number; from: number; to: number; contentFrom: number; contentTo: number };
export type SectionResponse = { noteId: string; contentHash: string; section: DocumentSection & { markdown: string; content: string } };
export type SearchNote = Note & { folderTitle: string };

async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method: "POST", body: formData, credentials: "include" });
  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : null;

  if (!res.ok) throw new ApiError(data?.error ?? "Request failed", res.status);
  if (!data) throw new Error("API did not return JSON. Check VITE_API_URL.");

  return data as T;
}

export const api = {
  apiKeys: () => request<{ keys: ApiKey[] }>("/api-keys"),
  oauthClients: () => request<{ clients: OAuthClient[] }>("/oauth/clients"),
  createOAuthClient: (data: { name: string; description?: string | null; redirectUris: string[] }) => request<{ client: OAuthClient }>("/oauth/clients", { method: "POST", body: JSON.stringify(data) }),
  revokeOAuthClient: (clientId: string) => request<{ ok: true }>(`/oauth/clients/${clientId}`, { method: "DELETE" }),
  oauthAuthorizations: () => request<{ authorizations: OAuthAuthorization[] }>("/oauth/authorizations"),
  revokeOAuthAuthorization: (authorizationId: string) => request<{ ok: true }>(`/oauth/authorizations/${authorizationId}`, { method: "DELETE" }),
  oauthAuthorizePreview: (params: OAuthAuthorizeRequest) => request<OAuthAuthorizePreview>(`/oauth/authorize/preview?${new URLSearchParams(params).toString()}`),
  approveOAuthAuthorization: (data: OAuthAuthorizeRequest & { accessMode: ApiKeyAccessMode; canRead: boolean; canCreate: boolean; canEdit: boolean; canCreateFolders: boolean; folderIds: string[] }) => request<{ redirectUrl: string }>("/oauth/authorize/approve", { method: "POST", body: JSON.stringify({ clientId: data.client_id, redirectUri: data.redirect_uri, responseType: data.response_type, codeChallenge: data.code_challenge, codeChallengeMethod: data.code_challenge_method, state: data.state, scope: data.scope, accessMode: data.accessMode, canRead: data.canRead, canCreate: data.canCreate, canEdit: data.canEdit, canCreateFolders: data.canCreateFolders, folderIds: data.folderIds }) }),
  createApiKey: (data: { name: string; accessMode?: ApiKeyAccessMode; canCreateFolders?: boolean; canRead?: boolean; canCreate?: boolean; canEdit?: boolean; permissions: Array<{ folderId: string; canRead?: boolean; canCreate?: boolean; canEdit?: boolean }> }) => request<{ key: string; apiKey: ApiKey }>("/api-keys", { method: "POST", body: JSON.stringify(data) }),
  updateApiKey: (keyId: string, data: { name?: string; accessMode?: ApiKeyAccessMode; canCreateFolders?: boolean; canRead?: boolean; canCreate?: boolean; canEdit?: boolean; permissions?: Array<{ folderId: string; canRead?: boolean; canCreate?: boolean; canEdit?: boolean }> }) => request<{ apiKey: ApiKey }>(`/api-keys/${keyId}`, { method: "PATCH", body: JSON.stringify(data) }),
  revokeApiKey: (keyId: string) => request<{ ok: true }>(`/api-keys/${keyId}`, { method: "DELETE" }),
  folders: () => request<{ folders: Folder[] }>("/folders"),
  createFolder: (title: string, parentFolderId?: string | null) => request<{ folder: Folder }>("/folders", { method: "POST", body: JSON.stringify({ title, parentFolderId }) }),
  renameFolder: (folderId: string, title: string) => request<{ folder: Folder }>(`/folders/${folderId}`, { method: "PATCH", body: JSON.stringify({ title }) }),
  updateFolder: (folderId: string, data: { title?: string; isPrivate?: boolean; isAgentReadOnly?: boolean; parentFolderId?: string | null }) => request<{ folder: Folder }>(`/folders/${folderId}`, { method: "PATCH", body: JSON.stringify(data) }),
  moveFolder: (folderId: string, parentFolderId: string | null) => request<{ folder: Folder }>(`/folders/${folderId}`, { method: "PATCH", body: JSON.stringify({ parentFolderId }) }),
  deleteFolder: (folderId: string) => request<{ ok: true }>(`/folders/${folderId}`, { method: "DELETE" }),
  templates: () => request<{ templates: Note[] }>("/notes/templates"),
  folderTemplates: (folderId: string) => request<{ templates: Note[] }>(`/folders/${folderId}/templates`),
  templateFolders: (templateId: string) => request<{ folders: Folder[] }>(`/notes/templates/${templateId}/folders`),
  updateTemplateFolders: (templateId: string, folderIds: string[]) => request<{ ok: true }>(`/notes/templates/${templateId}/folders`, { method: "PUT", body: JSON.stringify({ folderIds }) }),
  notes: (folderId: string, type: NoteType = "note") => request<{ notes: Note[] }>(`/folders/${folderId}/notes?type=${type}`),
  recentNotes: (limit = 10) => request<{ notes: Note[] }>(`/notes/recent?limit=${limit}`),
  createNote: (folderId: string, data?: { title?: string; content?: string; type?: NoteType; documentType?: DocumentType }) => request<{ note: Note }>(`/folders/${folderId}/notes`, { method: "POST", body: JSON.stringify(data ?? {}) }),
  note: (noteId: string) => request<NoteResponse>(`/notes/${noteId}`),
  noteStatus: (noteId: string) => request<NoteStatus>(`/notes/${noteId}/status`),
  noteShareLink: (noteId: string) => request<{ shareLink: NoteShareLink | null }>(`/notes/${noteId}/share-link`),
  createNoteShareLink: (noteId: string, regenerate = false) => request<{ shareLink: NoteShareLink }>(`/notes/${noteId}/share-link`, { method: "POST", body: JSON.stringify({ regenerate }) }),
  revokeNoteShareLink: (noteId: string) => request<{ ok: true }>(`/notes/${noteId}/share-link`, { method: "DELETE" }),
  sharedNote: (token: string) => request<{ note: SharedNote; share: { id: string; permission: "read"; createdAt: string } }>(`/share/${encodeURIComponent(token)}`),
  noteEvents: (noteId: string, limit = 25) => request<NoteEventsResponse>(`/notes/${noteId}/events?limit=${limit}`),
  noteVersions: (noteId: string, limit = 100) => request<NoteVersionsResponse>(`/notes/${noteId}/versions?limit=${limit}`),
  noteVersion: (noteId: string, versionId: string) => request<{ version: NoteVersion }>(`/notes/${noteId}/versions/${versionId}`),
  restoreNoteVersion: (noteId: string, versionId: string) => request<NoteResponse & { version: NoteVersion }>(`/notes/${noteId}/versions/${versionId}/restore`, { method: "POST", body: JSON.stringify({}) }),
  tags: () => request<{ tags: Tag[] }>("/notes/tags"),
  noteTags: (noteId: string) => request<{ tags: Tag[] }>(`/notes/${noteId}/tags`),
  updateNoteTags: (noteId: string, tags: string[]) => request<{ tags: Tag[] }>(`/notes/${noteId}/tags`, { method: "PUT", body: JSON.stringify({ tags }) }),
  links: (noteId: string) => request<LinksResponse>(`/notes/${noteId}/links`),
  backlinks: (noteId: string) => request<BacklinksResponse>(`/notes/${noteId}/backlinks`),
  orphanNotes: () => request<{ notes: Array<Pick<Note, "id" | "folderId" | "title" | "type" | "createdAt" | "updatedAt">> }>("/notes/orphans"),
  noteOutline: (noteId: string) => request<{ noteId: string; contentHash: string; sections: DocumentSection[] }>(`/notes/${noteId}/outline`),
  noteSection: (noteId: string, sectionId: string) => request<SectionResponse>(`/notes/${noteId}/sections/${encodeURIComponent(sectionId)}`),
  editNote: (noteId: string, data: { edits: DocumentEdit[]; baseHash?: string }) => request<NoteResponse>(`/notes/${noteId}/edit`, { method: "POST", body: JSON.stringify(data) }),
  saveNote: (noteId: string, data: Partial<Pick<Note, "title" | "content" | "isApiEditable" | "createdAt">> & { baseHash?: string }) => request<NoteResponse>(`/notes/${noteId}`, { method: "PATCH", body: JSON.stringify(data) }),
  moveNote: (noteId: string, folderId: string) => request<NoteResponse>(`/notes/${noteId}`, { method: "PATCH", body: JSON.stringify({ folderId }) }),
  searchNotes: (q: string, type: NoteType = "note", limit?: number, tag?: string) => request<{ notes: SearchNote[] }>(`/notes/search?q=${encodeURIComponent(q)}&type=${type}${limit ? `&limit=${limit}` : ""}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`),
  uploadNoteImage: async (noteId: string, file: File) => {
    try {
      const { uploads } = await request<{ uploads: SignedImageUpload[] }>(`/attachments/notes/${noteId}/image-uploads`, {
        method: "POST",
        body: JSON.stringify({ files: [{ filename: file.name, mimeType: file.type, size: file.size }] }),
      });
      const upload = uploads[0];
      if (!upload) throw new Error("API did not return an upload URL");

      const uploadResponse = await fetch(upload.signedUrl, {
        method: upload.method,
        headers: upload.headers,
        body: file,
      });
      if (!uploadResponse.ok) throw new ApiError("Image upload failed", uploadResponse.status);

      return request<UploadImageResponse>(`/attachments/${upload.attachment.id}/complete`, { method: "POST", body: JSON.stringify({}) });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 400) throw error;
      const formData = new FormData();
      formData.set("image", file);
      return uploadRequest<UploadImageResponse>(`/attachments/notes/${noteId}/images`, formData);
    }
  },
  deleteNote: (noteId: string) => request<{ ok: true }>(`/notes/${noteId}`, { method: "DELETE" }),
};
