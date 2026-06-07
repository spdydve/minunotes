import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NotesClient } from "@dpklabs/notes-sdk";
import { z } from "zod";

function asText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function createNotesMcpServer(client: NotesClient) {
  const server = new McpServer({ name: "dpklabs-notes", version: "0.1.0" });

  server.tool("notes_list_folders", "List folders available to the API key.", {}, async () => {
    return asText(await client.folders.list());
  });

  server.tool(
    "notes_list_notes",
    "List notes in a folder.",
    { folderId: z.string(), type: z.enum(["note", "template"]).default("note") },
    async ({ folderId, type }) => asText(await client.notes.list(folderId, type)),
  );

  server.tool(
    "notes_get_note",
    "Get a note by id.",
    { noteId: z.string() },
    async ({ noteId }) => asText(await client.notes.get(noteId)),
  );

  server.tool(
    "notes_create_note",
    "Create a note in a folder.",
    {
      folderId: z.string(),
      title: z.string().optional(),
      content: z.string().optional(),
      type: z.enum(["note", "template"]).default("note"),
    },
    async ({ folderId, title, content, type }) =>
      asText(await client.notes.create(folderId, { title, content, type })),
  );

  server.tool(
    "notes_update_note",
    "Update a note. Permissions are enforced by the Notes API key.",
    {
      noteId: z.string(),
      title: z.string().optional(),
      content: z.string().optional(),
      folderId: z.string().optional(),
      isApiEditable: z.boolean().optional(),
      baseHash: z.string().optional(),
    },
    async ({ noteId, title, content, folderId, isApiEditable, baseHash }) =>
      asText(await client.notes.update(noteId, { title, content, folderId, isApiEditable, baseHash })),
  );

  server.tool(
    "notes_delete_note",
    "Delete a note by id.",
    { noteId: z.string() },
    async ({ noteId }) => asText(await client.notes.delete(noteId)),
  );

  server.tool(
    "notes_search",
    "Search notes.",
    { query: z.string(), type: z.enum(["note", "template"]).default("note") },
    async ({ query, type }) => asText(await client.search.notes(query, type)),
  );

  server.tool("notes_list_templates", "List templates.", {}, async () => {
    return asText(await client.templates.list());
  });

  server.tool(
    "notes_create_from_template",
    "Create a note by copying an existing template's content.",
    {
      templateId: z.string(),
      folderId: z.string(),
      title: z.string().optional(),
    },
    async ({ templateId, folderId, title }) => {
      const { note: template } = await client.notes.get(templateId);
      return asText(await client.notes.create(folderId, {
        title: title ?? template.title,
        content: template.content,
        type: "note",
      }));
    },
  );

  return server;
}
