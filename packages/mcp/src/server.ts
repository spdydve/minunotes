import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NotesClient } from "@minunotes/sdk";
import { z } from "zod";

const jsonObjectSchema = z.object({}).passthrough();

function toolResult(data: unknown) {
  return {
    structuredContent: { result: data },
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function createNotesMcpServer(client: NotesClient) {
  const server = new McpServer({ name: "minunotes", version: "0.1.0" });

  server.registerTool(
    "notes_list_folders",
    {
      title: "List folders",
      description: "List folders available to the configured MinuNotes API key.",
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => toolResult(await client.folders.list()),
  );

  server.registerTool(
    "notes_create_folder",
    {
      title: "Create folder",
      description: "Create a folder if the configured API key has folder creation permission. The new folder is automatically scoped to this key.",
      inputSchema: { title: z.string() },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ title }) => toolResult(await client.folders.create({ title })),
  );

  server.registerTool(
    "notes_search",
    {
      title: "Search notes",
      description: "Search notes visible to the configured MinuNotes API key.",
      inputSchema: { query: z.string() },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query }) => toolResult(await client.notes.search(query)),
  );

  server.registerTool(
    "notes_get_note",
    {
      title: "Get note",
      description: "Read a note by id.",
      inputSchema: { noteId: z.string() },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ noteId }) => toolResult(await client.notes.get(noteId)),
  );

  server.registerTool(
    "notes_create_note",
    {
      title: "Create note",
      description: "Create a note in a folder. Permissions are enforced by the MinuNotes API key.",
      inputSchema: { folderId: z.string(), title: z.string().optional(), content: z.string().optional() },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ folderId, title, content }) => toolResult(await client.notes.create(folderId, { title, content })),
  );

  server.registerTool(
    "notes_edit_note",
    {
      title: "Edit note",
      description: "Patch a note with structured edits. Use baseHash from notes_get_note when available.",
      inputSchema: {
        noteId: z.string(),
        baseHash: z.string().optional(),
        edits: z.array(z.union([
          z.object({ type: z.literal("append"), text: z.string() }),
          z.object({ type: z.literal("replace_text"), oldText: z.string(), newText: z.string() }),
          z.object({ type: z.literal("replace_range"), from: z.number(), to: z.number(), text: z.string() }),
        ])).min(1),
      },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ noteId, edits, baseHash }) => toolResult(await client.notes.edit(noteId, edits, baseHash)),
  );

  server.registerTool(
    "notes_read_lines",
    {
      title: "Read note lines",
      description: "Read numbered lines from a note.",
      inputSchema: { noteId: z.string(), from: z.number().optional(), to: z.number().optional() },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ noteId, from, to }) => toolResult(await client.notes.lines(noteId, { from, to })),
  );

  server.registerPrompt(
    "summarize_note",
    {
      title: "Summarize note",
      description: "Prompt template for summarizing a note after fetching it with notes_get_note.",
      argsSchema: { noteId: z.string() },
    },
    ({ noteId }) => ({
      messages: [{ role: "user", content: { type: "text", text: `Fetch note ${noteId} with notes_get_note, then summarize the note in concise bullet points.` } }],
    }),
  );

  return server;
}
