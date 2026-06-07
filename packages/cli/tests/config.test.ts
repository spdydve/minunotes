import { describe, expect, it } from "vitest";
import { NotesConfigurationError } from "@dpklabs/notes-sdk";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("loads API URL and key from env", () => {
    expect(loadConfig({ NOTES_API_URL: "https://example.com/api", NOTES_API_KEY: "key" })).toEqual({
      apiUrl: "https://example.com/api",
      apiKey: "key",
    });
  });

  it("requires API URL and key", () => {
    expect(() => loadConfig({ NOTES_API_KEY: "key" })).toThrow(NotesConfigurationError);
    expect(() => loadConfig({ NOTES_API_URL: "https://example.com/api" })).toThrow(NotesConfigurationError);
  });
});
