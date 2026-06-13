import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { createNotesMcpServer, type NotesMcpClient } from "../../../packages/mcp/src/server";
import type { ApiKey } from "../db/schema";
import { getApiKeyFromHeaders } from "../lib/api-keys";
import { auth } from "../lib/auth";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  apiKey: ApiKey | null;
};

export const mcpRoutes = new Hono<{ Variables: Variables }>();

mcpRoutes.all("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const apiKey = getApiKeyFromHeaders(c.req.raw.headers);
  if (!apiKey || !c.get("apiKey")) return c.json({ error: "Hosted MCP requires X-API-Key authentication" }, 401);

  const client = createHostedMcpClient(new URL(c.req.url).origin, apiKey);
  const server = createNotesMcpServer(client);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

function createHostedMcpClient(origin: string, apiKey: string): NotesMcpClient {
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${origin}/api/harness${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
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
      create: ({ title }) => request("/folders", { method: "POST", body: JSON.stringify({ title }) }),
    },
    notes: {
      search: (query) => request(`/notes/search?q=${encodeURIComponent(query)}`),
      get: (noteId) => request(`/notes/${encodeURIComponent(noteId)}`),
      create: (folderId, input) => request("/notes", { method: "POST", body: JSON.stringify({ folderId, title: input.title, content: input.content }) }),
      edit: (noteId, edits, baseHash) => request(`/notes/${encodeURIComponent(noteId)}/edit`, { method: "POST", body: JSON.stringify({ edits, baseHash }) }),
      lines: (noteId, input) => {
        const params = new URLSearchParams();
        if (input.from !== undefined) params.set("from", String(input.from));
        if (input.to !== undefined) params.set("to", String(input.to));
        const query = params.toString();
        return request(`/notes/${encodeURIComponent(noteId)}/lines${query ? `?${query}` : ""}`);
      },
    },
  };
}
