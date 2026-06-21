import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const tempDirs: string[] = [];

async function runMigrations(libsql: { executeMultiple: (sql: string) => Promise<unknown> }) {
  for (let index = 0; index <= 19; index += 1) {
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

async function createFolder(app: Hono, title: string, parentFolderId?: string | null) {
  const response = await app.request("/api/folders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, parentFolderId }),
  });
  expect(response.status).toBe(201);
  const { folder } = await response.json() as { folder: { id: string; parentFolderId: string | null } };
  return folder;
}

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

    const parent = await createFolder(app, "Parent");
    await createFolder(app, "Child", parent.id);

    const privateResponse = await app.request(`/api/folders/${parent.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isPrivate: true }) });
    expect(privateResponse.status).toBe(200);
    const { folder } = await privateResponse.json() as { folder: { isPrivate: boolean } };
    expect(folder.isPrivate).toBe(true);

    const deleteResponse = await app.request(`/api/folders/${parent.id}`, { method: "DELETE" });
    expect(deleteResponse.status).toBe(400);
  });

  it("moves folders to another parent and top level", async () => {
    const { app } = await setupFolderApp();

    const first = await createFolder(app, "First");
    const second = await createFolder(app, "Second");
    const child = await createFolder(app, "Child", first.id);

    const moveUnderSecond = await app.request(`/api/folders/${child.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentFolderId: second.id }) });
    expect(moveUnderSecond.status).toBe(200);
    const { folder: moved } = await moveUnderSecond.json() as { folder: { parentFolderId: string | null } };
    expect(moved.parentFolderId).toBe(second.id);

    const moveTopLevel = await app.request(`/api/folders/${child.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentFolderId: null }) });
    expect(moveTopLevel.status).toBe(200);
    const { folder: topLevel } = await moveTopLevel.json() as { folder: { parentFolderId: string | null } };
    expect(topLevel.parentFolderId).toBeNull();
  });

  it("rejects moving folders into themselves or descendants", async () => {
    const { app } = await setupFolderApp();

    const parent = await createFolder(app, "Parent");
    const child = await createFolder(app, "Child", parent.id);

    const intoSelf = await app.request(`/api/folders/${parent.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentFolderId: parent.id }) });
    expect(intoSelf.status).toBe(400);

    const intoDescendant = await app.request(`/api/folders/${parent.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentFolderId: child.id }) });
    expect(intoDescendant.status).toBe(400);
  });

  it("rejects moves that exceed max depth or target private folders", async () => {
    const { app } = await setupFolderApp();

    let parentFolderId: string | null = null;
    for (const title of ["A", "B", "C", "D"]) {
      const folder = await createFolder(app, title, parentFolderId);
      parentFolderId = folder.id;
    }
    const deepParentId = parentFolderId;
    const subtreeRoot = await createFolder(app, "Subtree");
    await createFolder(app, "Subtree child", subtreeRoot.id);

    const tooDeep = await app.request(`/api/folders/${subtreeRoot.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentFolderId: deepParentId }) });
    expect(tooDeep.status).toBe(400);

    const privateParent = await createFolder(app, "Private parent");
    const privateResponse = await app.request(`/api/folders/${privateParent.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isPrivate: true }) });
    expect(privateResponse.status).toBe(200);

    const intoPrivate = await app.request(`/api/folders/${subtreeRoot.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentFolderId: privateParent.id }) });
    expect(intoPrivate.status).toBe(403);
  });
});
