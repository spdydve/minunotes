import type { NotesMcpClient } from './server.js';

export class NotesConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotesConfigurationError';
  }
}

export class NotesApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'NotesApiError';
  }
}

export type McpConfig = {
  apiUrl: string;
  apiKey: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const apiUrl = env.NOTES_API_URL;
  const apiKey = env.NOTES_API_KEY;

  if (!apiUrl) throw new NotesConfigurationError('NOTES_API_URL is required');
  if (!apiKey) throw new NotesConfigurationError('NOTES_API_KEY is required');

  return { apiUrl, apiKey };
}

export function createClient(env: NodeJS.ProcessEnv = process.env): NotesMcpClient {
  const config = loadConfig(env);
  const baseUrl = normalizeApiBase(config.apiUrl);

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
        ...init.headers,
      },
    });

    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json') ? await response.json().catch(() => null) : null;

    if (!response.ok) {
      throw new NotesApiError(
        typeof data?.error === 'string' ? data.error : 'MinuNotes API request failed',
        response.status,
        data
      );
    }

    if (!data) throw new NotesApiError('MinuNotes API did not return JSON', response.status);
    return data;
  }

  return {
    folders: {
      list: () => request('/harness/folders'),
      create: ({ title, parentFolderId }) =>
        request('/harness/folders', { method: 'POST', body: JSON.stringify({ title, parentFolderId }) }),
    },
    notes: {
      search: (query) => request(`/harness/notes/search?q=${encodeURIComponent(query)}`),
      get: (noteId) => request(`/harness/notes/${encodeURIComponent(noteId)}`),
      create: (folderId, input) =>
        request('/harness/notes', {
          method: 'POST',
          body: JSON.stringify({ folderId, title: input.title, content: input.content }),
        }),
      edit: (noteId, edits, baseHash) =>
        request(`/harness/notes/${encodeURIComponent(noteId)}/edit`, {
          method: 'POST',
          body: JSON.stringify({ edits, baseHash }),
        }),
      move: (input) =>
        request('/harness/notes/move', {
          method: 'POST',
          body: JSON.stringify({ noteIds: input.noteIds, targetFolderId: input.targetFolderId }),
        }),
      searchLines: (input) =>
        request(
          `/harness/notes/search-lines${toQueryString({ q: input.query, folderId: input.folderId, context: input.context, limit: input.limit, caseSensitive: input.caseSensitive })}`
        ),
      lines: (noteId, input) => request(`/harness/notes/${encodeURIComponent(noteId)}/lines${toQueryString(input)}`),
      searchNoteLines: (noteId, input) =>
        request(
          `/harness/notes/${encodeURIComponent(noteId)}/search-lines${toQueryString({ q: input.query, context: input.context, limit: input.limit, caseSensitive: input.caseSensitive })}`
        ),
      outline: (noteId) => request(`/harness/notes/${encodeURIComponent(noteId)}/outline`),
      section: (noteId, sectionId) =>
        request(`/harness/notes/${encodeURIComponent(noteId)}/sections/${encodeURIComponent(sectionId)}`),
      events: (noteId, limit) =>
        request(`/harness/notes/${encodeURIComponent(noteId)}/events${toQueryString({ limit })}`),
      tags: (noteId) => request(`/harness/notes/${encodeURIComponent(noteId)}/tags`),
      replaceTags: (noteId, tags) =>
        request(`/harness/notes/${encodeURIComponent(noteId)}/tags`, {
          method: 'PUT',
          body: JSON.stringify({ tags }),
        }),
    },
    canvases: {
      create: (input) =>
        request('/harness/canvases', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      createFromSyntax: (input) =>
        request('/harness/canvases/from-syntax', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      replace: (noteId, input) =>
        request(`/harness/notes/${encodeURIComponent(noteId)}/canvas`, {
          method: 'PUT',
          body: JSON.stringify(input),
        }),
      replaceFromSyntax: (noteId, input) =>
        request(`/harness/notes/${encodeURIComponent(noteId)}/canvas/from-syntax`, {
          method: 'PUT',
          body: JSON.stringify(input),
        }),
      setNoteLink: (noteId, nodeId, input) =>
        request(`/harness/notes/${encodeURIComponent(noteId)}/canvas/nodes/${encodeURIComponent(nodeId)}/link-note`, {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      removeNoteLink: (noteId, nodeId, baseHash) =>
        request(
          `/harness/notes/${encodeURIComponent(noteId)}/canvas/nodes/${encodeURIComponent(nodeId)}/link${toQueryString({ baseHash })}`,
          { method: 'DELETE' }
        ),
    },
    tags: {
      list: () => request('/harness/tags'),
    },
  };
}

function normalizeApiBase(input: string) {
  const normalized = input.replace(/\/+$/, '');
  if (normalized.endsWith('/v1')) return normalized;
  if (normalized.endsWith('/api')) return `${normalized.slice(0, -4)}/v1`;
  return `${normalized}/v1`;
}

function toQueryString(input: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
