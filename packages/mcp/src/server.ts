import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type DocumentEdit =
  | { type: "append"; text: string }
  | { type: "replace_text"; oldText: string; newText: string }
  | { type: "replace_range"; from: number; to: number; text: string };

const jsonObjectSchema = z.object({}).passthrough();

function toolResult(data: unknown) {
  return {
    structuredContent: { result: data },
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export type NotesMcpClient = {
  folders: {
    list: () => Promise<unknown>;
    create: (input: { title: string; parentFolderId?: string }) => Promise<unknown>;
  };
  notes: {
    search: (query: string) => Promise<unknown>;
    get: (noteId: string) => Promise<unknown>;
    create: (folderId: string, input: { title?: string; content?: string }) => Promise<unknown>;
    edit: (noteId: string, edits: DocumentEdit[], baseHash?: string) => Promise<unknown>;
    searchLines: (input: { query: string; folderId?: string; context?: number; limit?: number; caseSensitive?: boolean }) => Promise<unknown>;
    lines: (noteId: string, input: { from?: number; to?: number }) => Promise<unknown>;
    searchNoteLines: (noteId: string, input: { query: string; context?: number; limit?: number; caseSensitive?: boolean }) => Promise<unknown>;
    section: (noteId: string, sectionId: string) => Promise<unknown>;
  };
};

export function createNotesMcpServer(client: NotesMcpClient) {
  const server = new McpServer({ name: "minunotes", version: "0.1.0" });

  server.registerTool(
    "notes_list_folders",
    {
      title: "List folders",
      description: "List folders available to the authorized MinuNotes connection.",
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => toolResult(await client.folders.list()),
  );

  server.registerTool(
    "notes_create_folder",
    {
      title: "Create folder",
      description: "Create a folder or subfolder if the authorized MinuNotes connection has folder creation permission. The new folder is automatically scoped to this connection.",
      inputSchema: { title: z.string(), parentFolderId: z.string().optional() },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ title, parentFolderId }) => toolResult(await client.folders.create({ title, parentFolderId })),
  );

  server.registerTool(
    "notes_search",
    {
      title: "Search notes",
      description: "Search notes visible to the authorized MinuNotes connection.",
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
      description: "Create a note in a folder. Permissions are enforced by the authorized MinuNotes connection.",
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
    "notes_search_lines",
    {
      title: "Search note lines",
      description: "Search matching lines across notes visible to the authorized MinuNotes connection.",
      inputSchema: { query: z.string(), folderId: z.string().optional(), context: z.number().optional(), limit: z.number().optional(), caseSensitive: z.boolean().optional() },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, folderId, context, limit, caseSensitive }) => toolResult(await client.notes.searchLines({ query, folderId, context, limit, caseSensitive })),
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

  server.registerTool(
    "notes_search_note_lines",
    {
      title: "Search lines in note",
      description: "Search matching lines within a single note.",
      inputSchema: { noteId: z.string(), query: z.string(), context: z.number().optional(), limit: z.number().optional(), caseSensitive: z.boolean().optional() },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ noteId, query, context, limit, caseSensitive }) => toolResult(await client.notes.searchNoteLines(noteId, { query, context, limit, caseSensitive })),
  );

  server.registerTool(
    "notes_read_section",
    {
      title: "Read note section",
      description: "Read a section from a note by section id from the note outline.",
      inputSchema: { noteId: z.string(), sectionId: z.string() },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ noteId, sectionId }) => toolResult(await client.notes.section(noteId, sectionId)),
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
