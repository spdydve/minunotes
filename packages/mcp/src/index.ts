#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient, NotesApiError } from './config.js';
import { createNotesMcpServer } from './server.js';

export async function main() {
  const server = createNotesMcpServer(createClient());
  await server.connect(new StdioServerTransport());
}

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
