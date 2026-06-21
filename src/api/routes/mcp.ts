import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { createNotesMcpServer, type NotesMcpClient } from "../../../packages/mcp/src/server";
import type { ApiKey, OAuthAuthorization } from "../db/schema";
import { getApiKeyFromHeaders } from "../lib/api-keys";
import { auth } from "../lib/auth";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  apiKey: ApiKey | null;
  oauthAuthorization: OAuthAuthorization | null;
};

export const mcpRoutes = new Hono<{ Variables: Variables }>();

mcpRoutes.all("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const apiKey = getApiKeyFromHeaders(c.req.raw.headers);
  const bearer = c.req.raw.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if ((!apiKey || !c.get("apiKey")) && (!bearer || !c.get("oauthAuthorization"))) return c.json({ error: "Hosted MCP requires X-API-Key or Bearer authentication" }, 401);

  const client = createHostedMcpClient(new URL(c.req.url).origin, apiKey ? { "x-api-key": apiKey } : { authorization: `Bearer ${bearer}` });
  const server = createNotesMcpServer(client);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

function toQueryString(input: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function createHostedMcpClient(origin: string, authHeaders: Record<string, string>): NotesMcpClient {
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${origin}/api/harness${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...authHeaders,
        ...init.headers,
      },
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = typeof body?.error === "string" ? body.error : "MinuNotes harness request failed";
      throw new Error(`${message} (${response.status})`);
    }
    return body;
  }

  return {
    folders: {
      list: () => request("/folders"),
      create: ({ title, parentFolderId }) => request("/folders", { method: "POST", body: JSON.stringify({ title, parentFolderId }) }),
    },
    notes: {
      search: (query) => request(`/notes/search?q=${encodeURIComponent(query)}`),
      get: (noteId) => request(`/notes/${encodeURIComponent(noteId)}`),
      create: (folderId, input) => request("/notes", { method: "POST", body: JSON.stringify({ folderId, title: input.title, content: input.content }) }),
      edit: (noteId, edits, baseHash) => request(`/notes/${encodeURIComponent(noteId)}/edit`, { method: "POST", body: JSON.stringify({ edits, baseHash }) }),
      searchLines: (input) => request(`/notes/search-lines${toQueryString({ q: input.query, folderId: input.folderId, context: input.context, limit: input.limit, caseSensitive: input.caseSensitive })}`),
      lines: (noteId, input) => request(`/notes/${encodeURIComponent(noteId)}/lines${toQueryString(input)}`),
      searchNoteLines: (noteId, input) => request(`/notes/${encodeURIComponent(noteId)}/search-lines${toQueryString({ q: input.query, context: input.context, limit: input.limit, caseSensitive: input.caseSensitive })}`),
      section: (noteId, sectionId) => request(`/notes/${encodeURIComponent(noteId)}/sections/${encodeURIComponent(sectionId)}`),
    },
  };
}
