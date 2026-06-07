#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { stdin } from "node:process";
import { NotesApiError, type NotesClient } from "@dpklabs/notes-sdk";
import { createClient } from "./config.js";
import { printJson, printRows } from "./output.js";

export async function main(argv = process.argv.slice(2), client?: NotesClient) {
  const json = consumeFlag(argv, "--json");
  const [resource, command, ...args] = argv;

  if (!resource || resource === "help" || resource === "--help") {
    printHelp();
    return;
  }

  client ??= createClient();

  if (resource === "folders") {
    if (command === "list") {
      const result = await client.folders.list();
      return json ? printJson(result) : printRows(result.folders, ["id", "title", "updatedAt"]);
    }
    if (command === "create") {
      const title = args.join(" ").trim();
      requireValue(title, "folder title");
      return printJson(await client.folders.create(title));
    }
  }

  if (resource === "notes") {
    if (command === "list") {
      const folderId = requireOption(args, "--folder");
      const result = await client.notes.list(folderId);
      return json ? printJson(result) : printRows(result.notes, ["id", "title", "updatedAt"]);
    }
    if (command === "get") {
      const noteId = requireArg(args, 0, "note id");
      return printJson(await client.notes.get(noteId));
    }
    if (command === "create") {
      const folderId = requireOption(args, "--folder");
      const title = option(args, "--title");
      const content = await readContentOption(args);
      return printJson(await client.notes.create(folderId, { title, content }));
    }
    if (command === "update") {
      const noteId = requireArg(args, 0, "note id");
      const title = option(args, "--title");
      const content = await readContentOption(args);
      return printJson(await client.notes.update(noteId, { title, content }));
    }
    if (command === "delete") {
      const noteId = requireArg(args, 0, "note id");
      return printJson(await client.notes.delete(noteId));
    }
    if (command === "duplicate") {
      const noteId = requireArg(args, 0, "note id");
      const title = option(args, "--title");
      return printJson(await client.notes.duplicate(noteId, title));
    }
  }

  if (resource === "templates") {
    if (command === "list") {
      const result = await client.templates.list();
      return json ? printJson(result) : printRows(result.templates, ["id", "title", "updatedAt"]);
    }
    if (command === "create") {
      const folderId = requireOption(args, "--folder");
      const title = option(args, "--title") ?? "Untitled template";
      const content = await readContentOption(args);
      return printJson(await client.notes.create(folderId, { title, content, type: "template" }));
    }
  }

  if (resource === "search") {
    const query = [command, ...args].filter(Boolean).join(" ").trim();
    requireValue(query, "search query");
    const result = await client.search.notes(query);
    return json ? printJson(result) : printRows(result.notes, ["id", "folderTitle", "title", "updatedAt"]);
  }

  throw new Error(`Unknown command: ${[resource, command].filter(Boolean).join(" ")}`);
}

function printHelp() {
  console.log(`Usage: notes <resource> <command> [options]

Environment:
  NOTES_API_URL    API base URL including /api
  NOTES_API_KEY    API key

Commands:
  notes folders list [--json]
  notes folders create <title>
  notes notes list --folder <folderId> [--json]
  notes notes get <noteId>
  notes notes create --folder <folderId> [--title <title>] [--content <file|->]
  notes notes update <noteId> [--title <title>] [--content <file|->]
  notes notes delete <noteId>
  notes notes duplicate <noteId> [--title <title>]
  notes templates list [--json]
  notes templates create --folder <folderId> [--title <title>] [--content <file|->]
  notes search <query> [--json]`);
}

function consumeFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function requireOption(args: string[], name: string) {
  const value = option(args, name);
  return requireValue(value, name);
}

function requireArg(args: string[], index: number, label: string) {
  return requireValue(args[index], label);
}

function requireValue(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

async function readContentOption(args: string[]) {
  const value = option(args, "--content");
  if (!value) return undefined;
  if (value === "-") return readStdin();
  return readFileSync(value, "utf8");
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    if (error instanceof NotesApiError) {
      console.error(`Notes API error (${error.status}): ${error.message}`);
    } else if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    process.exitCode = 1;
  });
}
