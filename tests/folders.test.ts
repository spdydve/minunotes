import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const tempDirs: string[] = [];

async function runMigrations(libsql: { executeMultiple: (sql: string) => Promise<unknown> }) {
  for (let index = 0; index <= 13; index += 1) {
    const [file] = await Array.fromAsync((await import("node:fs/promises")).glob(`drizzle/${String(index).padStart(4, "0")}_*.sql`));
    if (!file) throw new Error(`Missing migration ${index}`);
    await libsql.executeMultiple(await readFile(file, "utf8"));
  }
}

async function setupFolderApp() {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), "notes-folders-"));
  tempDirs.push(dir);
  vi.stubEnv("TURSO_DB_URL", `file:${path.join(dir, "test.db")}`);

  const [{ db, libsql }, schema, { folderRoutes }] = await Promise.all([
    import("../src/api/db/client"),
    import("../src/api/db/schema"),
    import("../src/api/routes/folders"),
  ]);

  await runMigrations(libsql);

  const user = { id: "user_test", name: "Test User", email: "test@example.com", emailVerified: true, image: null, createdAt: new Date(), updatedAt: new Date() };
  await db.insert(schema.user).values(user);

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", user);
    c.set("session", null);
    await next();
  });
  app.route("/api/folders", folderRoutes);

  return { app, db, schema, user };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("folder hierarchy", () => {
  it("creates folders up to depth 4 and rejects deeper folders", async () => {
    const { app } = await setupFolderApp();

    let parentFolderId: string | null = null;
    const folderIds: string[] = [];
    for (const title of ["Project", "Area", "Topic", "Detail", "Item"]) {
      const response = await app.request("/api/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, parentFolderId }),
      });
      expect(response.status).toBe(201);
      const { folder } = await response.json() as { folder: { id: string; parentFolderId: string | null } };
      expect(folder.parentFolderId).toBe(parentFolderId);
      folderIds.push(folder.id);
      parentFolderId = folder.id;
    }

    const tooDeepResponse = await app.request("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Too deep", parentFolderId: folderIds.at(-1) }),
    });
    expect(tooDeepResponse.status).toBe(400);
  });

  it("toggles private folders and blocks deleting folders with children", async () => {
    const { app } = await setupFolderApp();

    const parentResponse = await app.request("/api/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Parent" }) });
    const { folder: parent } = await parentResponse.json() as { folder: { id: string } };
    await app.request("/api/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Child", parentFolderId: parent.id }) });

    const privateResponse = await app.request(`/api/folders/${parent.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isPrivate: true }) });
    expect(privateResponse.status).toBe(200);
    const { folder } = await privateResponse.json() as { folder: { isPrivate: boolean } };
    expect(folder.isPrivate).toBe(true);

    const deleteResponse = await app.request(`/api/folders/${parent.id}`, { method: "DELETE" });
    expect(deleteResponse.status).toBe(400);
  });
});
