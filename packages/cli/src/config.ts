import { NotesClient, NotesConfigurationError } from "@dpklabs/notes-sdk";

export type CliConfig = {
  apiUrl: string;
  apiKey: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CliConfig {
  const apiUrl = env.NOTES_API_URL;
  const apiKey = env.NOTES_API_KEY;

  if (!apiUrl) throw new NotesConfigurationError("NOTES_API_URL is required");
  if (!apiKey) throw new NotesConfigurationError("NOTES_API_KEY is required");

  return { apiUrl, apiKey };
}

export function createClient(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env);
  return new NotesClient({ baseUrl: config.apiUrl, apiKey: config.apiKey });
}
