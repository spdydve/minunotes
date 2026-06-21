import { describe, expect, it } from "vitest";
import app from "../src/api/index";

describe("harness OpenAPI spec", () => {
  it("serves the harness OpenAPI document", async () => {
    const response = await app.request("/api/openapi.json");

    expect(response.status).toBe(200);
    const spec = await response.json() as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    };

    expect(spec.openapi).toBe("3.1.0");
    expect(spec.components.securitySchemes.ApiKeyAuth).toMatchObject({ type: "apiKey", in: "header", name: "X-API-Key" });
    expect(spec.paths).toHaveProperty("/api/harness/folders");
    expect(spec.paths).toHaveProperty("/api/harness/notes/{noteId}/edit");
    expect(spec.paths).toHaveProperty("/api/harness/notes/orphans");
    expect(spec.paths).toHaveProperty("/api/harness/notes/{noteId}/links");
    expect(spec.paths).toHaveProperty("/api/harness/notes/{noteId}/backlinks");
    expect(spec.paths).toHaveProperty("/api/harness/notes/{noteId}/tags");
    expect(spec.paths).toHaveProperty("/api/harness/notes/{noteId}/sections/{sectionId}");
  });

  it("also serves the spec under the harness namespace", async () => {
    const response = await app.request("/api/harness/openapi.json");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ info: { title: "MinuNotes Harness API" } });
  });
});
