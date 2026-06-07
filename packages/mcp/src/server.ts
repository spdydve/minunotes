import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NotesClient } from "@minunotes/sdk";
import { z } from "zod";

const noteTypeSchema = z.enum(["note", "template"]);
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
      description: "List folders available to the configured Notes API key.",
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => toolResult(await client.folders.list()),
  );

  server.registerTool(
    "notes_list_notes",
    {
      title: "List notes",
      description: "List notes or templates in a folder.",
      inputSchema: { folderId: z.string(), type: noteTypeSchema.default("note") },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ folderId, type }) => toolResult(await client.notes.list(folderId, type)),
  );

  server.registerTool(
    "notes_get_note",
    {
      title: "Get note",
      description: "Read a note or template by id.",
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
      description: "Create a note or template in a folder. Permissions are enforced by the Notes API key.",
      inputSchema: {
        folderId: z.string(),
        title: z.string().optional(),
        content: z.string().optional(),
        type: noteTypeSchema.default("note"),
      },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ folderId, title, content, type }) =>
      toolResult(await client.notes.create(folderId, { title, content, type })),
  );

  server.registerTool(
    "notes_update_note",
    {
      title: "Update note",
      description: "Update a note or template. Permissions are enforced by the Notes API key.",
      inputSchema: {
        noteId: z.string(),
        title: z.string().optional(),
        content: z.string().optional(),
        folderId: z.string().optional(),
        isApiEditable: z.boolean().optional(),
        baseHash: z.string().optional(),
      },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ noteId, title, content, folderId, isApiEditable, baseHash }) =>
      toolResult(await client.notes.update(noteId, { title, content, folderId, isApiEditable, baseHash })),
  );

  server.registerTool(
    "notes_delete_note",
    {
      title: "Delete note",
      description: "Delete a note or template by id. Permissions are enforced by the Notes API key.",
      inputSchema: { noteId: z.string() },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ noteId }) => toolResult(await client.notes.delete(noteId)),
  );

  server.registerTool(
    "notes_search",
    {
      title: "Search notes",
      description: "Search notes or templates.",
      inputSchema: { query: z.string(), type: noteTypeSchema.default("note") },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, type }) => toolResult(await client.search.notes(query, type)),
  );

  server.registerTool(
    "notes_list_templates",
    {
      title: "List templates",
      description: "List all templates visible to the configured Notes API key.",
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => toolResult(await client.templates.list()),
  );

  server.registerTool(
    "notes_create_from_template",
    {
      title: "Create from template",
      description: "Create a note by copying an existing template's content into a destination folder.",
      inputSchema: {
        templateId: z.string(),
        folderId: z.string(),
        title: z.string().optional(),
      },
      outputSchema: jsonObjectSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ templateId, folderId, title }) => {
      const { note: template } = await client.notes.get(templateId);
      return toolResult(await client.notes.create(folderId, {
        title: title ?? template.title,
        content: template.content,
        type: "note",
      }));
    },
  );

  server.registerPrompt(
    "summarize_note",
    {
      title: "Summarize note",
      description: "Prompt template for summarizing a note after fetching it with notes_get_note.",
      argsSchema: { noteId: z.string() },
    },
    ({ noteId }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Fetch note ${noteId} with notes_get_note, then summarize the note in concise bullet points.`,
          },
        },
      ],
    }),
  );

  return server;
}
