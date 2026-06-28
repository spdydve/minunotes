import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const tempDirs: string[] = [];

async function runMigrations(libsql: { executeMultiple: (sql: string) => Promise<unknown> }) {
  for (let index = 0; index <= 22; index += 1) {
    const [file] = await Array.fromAsync((await import("node:fs/promises")).glob(`drizzle/${String(index).padStart(4, "0")}_*.sql`));
    if (!file) throw new Error(`Missing migration ${index}`);
    await libsql.executeMultiple(await readFile(file, "utf8"));
  }
}

async function setupHarnessApp() {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), "notes-harness-canvas-"));
  tempDirs.push(dir);
  vi.stubEnv("TURSO_DB_URL", `file:${path.join(dir, "test.db")}`);

  const [{ db, libsql }, schema, { harnessRoutes }] = await Promise.all([
    import("../src/api/db/client"),
    import("../src/api/db/schema"),
    import("../src/api/routes/harness"),
  ]);

  await runMigrations(libsql);

  const user = { id: "user_test", name: "Test User", email: "test@example.com", emailVerified: true, image: null, createdAt: new Date(), updatedAt: new Date() };
  const apiKey = {
    id: "agent_key_test",
    userId: user.id,
    name: "Test key",
    uid: "ABCDEFGH",
    hash: "hash",
    salt: "salt",
    canCreateFolders: true,
    canRead: true,
    canCreate: true,
    canEdit: true,
    accessMode: "all" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
  };
  const folder = { id: "folder_canvas", userId: user.id, parentFolderId: null, title: "Canvas", isPrivate: false, isAgentReadOnly: false, createdAt: new Date(), updatedAt: new Date() };

  await db.insert(schema.user).values(user);
  await db.insert(schema.apiKeys).values(apiKey);
  await db.insert(schema.folders).values(folder);

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", user);
    c.set("session", null);
    c.set("apiKey", apiKey);
    await next();
  });
  app.route("/api/harness", harnessRoutes);

  return { app, folder };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("harness canvas operations", () => {
  it("creates a canvas note from raw JSON", async () => {
    const { app, folder } = await setupHarnessApp();
    const canvas = { nodes: [{ id: "a", type: "text", text: "A", x: 0, y: 0, width: 120, height: 48 }], edges: [] };

    const response = await app.request("/api/harness/canvases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: folder.id, title: "Raw canvas", canvas }),
    });

    expect(response.status).toBe(201);
    const { note } = await response.json() as { note: { title: string; documentType: string; content: string } };
    expect(note.title).toBe("Raw canvas");
    expect(note.documentType).toBe("canvas.default");
    expect(JSON.parse(note.content)).toEqual(canvas);
  });

  it("creates a mind map note from diagram syntax", async () => {
    const { app, folder } = await setupHarnessApp();

    const response = await app.request("/api/harness/canvases/from-syntax", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        folderId: folder.id,
        syntax: `diagram "Product plan" {\n  layout mindmap\n  Product\n  Product > Research\n  Product > Build\n}`,
      }),
    });

    expect(response.status).toBe(201);
    const { note, diagnostics } = await response.json() as { note: { title: string; documentType: string; content: string }; diagnostics: unknown[] };
    expect(note.title).toBe("Product plan");
    expect(note.documentType).toBe("canvas.mindmap");
    expect(diagnostics).toEqual([]);
    const canvas = JSON.parse(note.content) as { nodes: Array<{ id: string; text?: string }>; edges: Array<{ fromNode: string; toNode: string }> };
    expect(canvas.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["Product", "Research", "Build"]));
    expect(canvas.edges).toEqual(expect.arrayContaining([expect.objectContaining({ fromNode: "Product", toNode: "Research" })]));
  });

  it("replaces a canvas note from diagram syntax and rejects markdown patch edits", async () => {
    const { app, folder } = await setupHarnessApp();
    const create = await app.request("/api/harness/canvases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: folder.id, title: "Flow" }),
    });
    expect(create.status).toBe(201);
    const created = await create.json() as { note: { id: string } };

    const replace = await app.request(`/api/harness/notes/${created.note.id}/canvas/from-syntax`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ syntax: `diagram "Auth flow" {\n  User > Login\n  Login > Dashboard\n}` }),
    });
    expect(replace.status).toBe(200);
    const replaced = await replace.json() as { note: { title: string; documentType: string; content: string } };
    expect(replaced.note.title).toBe("Auth flow");
    expect(replaced.note.documentType).toBe("canvas.default");
    expect(JSON.parse(replaced.note.content).nodes.map((node: { id: string }) => node.id)).toEqual(expect.arrayContaining(["User", "Login", "Dashboard"]));

    const patch = await app.request(`/api/harness/notes/${created.note.id}/edit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ edits: [{ type: "append", text: "nope" }] }),
    });
    expect(patch.status).toBe(400);
  });
});
