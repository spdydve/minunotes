import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { parseInternalNoteUrls, parseWikiLinks } from "../src/api/notes/links";

const tempDirs: string[] = [];

async function runMigrations(libsql: { executeMultiple: (sql: string) => Promise<unknown> }) {
  for (let index = 0; index <= 20; index += 1) {
    const [file] = await Array.fromAsync((await import("node:fs/promises")).glob(`drizzle/${String(index).padStart(4, "0")}_*.sql`));
    if (!file) throw new Error(`Missing migration ${index}`);
    await libsql.executeMultiple(await readFile(file, "utf8"));
  }
}

async function setupNoteLinksApp() {
  vi.resetModules();
  const dir = await mkdtemp(path.join(tmpdir(), "notes-links-"));
  tempDirs.push(dir);
  vi.stubEnv("TURSO_DB_URL", `file:${path.join(dir, "test.db")}`);

  const [{ db, libsql }, schema, { folderRoutes }, { noteRoutes }, { harnessRoutes }] = await Promise.all([
    import("../src/api/db/client"),
    import("../src/api/db/schema"),
    import("../src/api/routes/folders"),
    import("../src/api/routes/notes"),
    import("../src/api/routes/harness"),
  ]);

  await runMigrations(libsql);

  const userA = { id: "user_a", name: "User A", email: "a@example.com", emailVerified: true, image: null, createdAt: new Date(), updatedAt: new Date() };
  const userB = { id: "user_b", name: "User B", email: "b@example.com", emailVerified: true, image: null, createdAt: new Date(), updatedAt: new Date() };
  const folderA = { id: "folder_a", userId: userA.id, parentFolderId: null, title: "A Folder", isPrivate: false, isAgentReadOnly: false, createdAt: new Date(), updatedAt: new Date() };
  const folderB = { id: "folder_b", userId: userB.id, parentFolderId: null, title: "B Folder", isPrivate: false, isAgentReadOnly: false, createdAt: new Date(), updatedAt: new Date() };

  await db.insert(schema.user).values([userA, userB]);
  await db.insert(schema.folders).values([folderA, folderB]);

  const app = new Hono();
  app.use("*", async (c, next) => {
    const currentUser = c.req.header("x-user") === "b" ? userB : userA;
    c.set("user", currentUser);
    c.set("session", { id: `session_${currentUser.id}`, userId: currentUser.id });
    await next();
  });
  app.route("/api/folders", folderRoutes);
  app.route("/api/notes", noteRoutes);
  app.route("/api/harness", harnessRoutes);

  return { app, db, schema, folderA, folderB };
}

async function createNote(app: Hono, folderId: string, title: string, content = "") {
  const response = await app.request(`/api/folders/${folderId}/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, content }),
  });
  expect(response.status).toBe(201);
  const { note } = await response.json() as { note: { id: string; title: string; content: string } };
  return note;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("note link parser", () => {
  it("parses plain and labeled wikilinks", () => {
    expect(parseWikiLinks("See [[Project Plan]] and [[Roadmap|the roadmap]].")).toMatchObject([
      { targetTitle: "Project Plan", targetNoteId: null, label: null, linkType: "wikilink" },
      { targetTitle: "Roadmap", targetNoteId: null, label: "the roadmap", linkType: "wikilink" },
    ]);
  });

  it("treats note-id wikilink targets as direct note links", () => {
    expect(parseWikiLinks("See [[note_abc123|Name with | pipe]].")).toMatchObject([
      { targetTitle: "note_abc123", targetNoteId: "note_abc123", label: "Name with | pipe", linkType: "wikilink" },
    ]);
  });

  it("parses raw and markdown internal note URLs", () => {
    const raw = "http://localhost:5173/notes/note_abc123";
    const markdown = "[Note B](http://localhost:5173/notes/note_def456)";
    expect(parseInternalNoteUrls(`${raw}\n${markdown}`)).toMatchObject([
      { targetNoteId: "note_def456", label: "Note B", linkType: "markdown-internal-url" },
      { targetNoteId: "note_abc123", label: null, linkType: "internal-url" },
    ]);
  });
});

describe("note link indexing", () => {
  it("indexes resolved links and returns backlinks", async () => {
    const { app, folderA } = await setupNoteLinksApp();
    const target = await createNote(app, folderA.id, "Target Note");
    const source = await createNote(app, folderA.id, "Source Note", "See [[Target Note|target]].");

    const response = await app.request(`/api/notes/${target.id}/backlinks`);
    expect(response.status).toBe(200);
    const body = await response.json() as { backlinks: Array<{ sourceNoteId: string; sourceTitle: string; targetTitle: string; label: string | null }> };
    expect(body.backlinks).toEqual([{ sourceNoteId: source.id, sourceTitle: "Source Note", sourceFolderId: folderA.id, targetTitle: "Target Note", label: "target", linkType: "wikilink", id: expect.any(String), createdAt: expect.any(String), updatedAt: expect.any(String) }]);
  });

  it("indexes note-id wikilinks with labels that contain pipes", async () => {
    const { app, folderA } = await setupNoteLinksApp();
    const target = await createNote(app, folderA.id, "Name with | pipe");
    const source = await createNote(app, folderA.id, "Source Note", `See [[${target.id}|Name with | pipe]].`);

    const response = await app.request(`/api/notes/${target.id}/backlinks`);
    expect(response.status).toBe(200);
    const body = await response.json() as { backlinks: Array<{ sourceNoteId: string; targetTitle: string; label: string | null }> };
    expect(body.backlinks).toContainEqual(expect.objectContaining({ sourceNoteId: source.id, targetTitle: "Name with | pipe", label: "Name with | pipe" }));
  });

  it("returns backlinks through the harness API", async () => {
    const { app, folderA } = await setupNoteLinksApp();
    const target = await createNote(app, folderA.id, "Target Note");
    const source = await createNote(app, folderA.id, "Source Note", "See [[Target Note]].");

    const response = await app.request(`/api/harness/notes/${target.id}/backlinks`);
    expect(response.status).toBe(200);
    const body = await response.json() as { noteId: string; backlinks: Array<{ sourceNoteId: string; sourceTitle: string; linkType: string }> };
    expect(body.noteId).toBe(target.id);
    expect(body.backlinks).toContainEqual(expect.objectContaining({ sourceNoteId: source.id, sourceTitle: "Source Note", linkType: "wikilink" }));
  });

  it("returns outgoing links with resolved and unresolved targets", async () => {
    const { app, folderA } = await setupNoteLinksApp();
    const target = await createNote(app, folderA.id, "Target Note");
    const source = await createNote(app, folderA.id, "Source Note", "See [[Target Note]] and [[Missing Note]].");

    const response = await app.request(`/api/notes/${source.id}/links`);
    expect(response.status).toBe(200);
    const body = await response.json() as { noteId: string; links: Array<{ targetNoteId: string | null; targetTitle: string; linkType: string }> };
    expect(body.noteId).toBe(source.id);
    expect(body.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetNoteId: target.id, targetTitle: "Target Note", linkType: "wikilink" }),
      expect.objectContaining({ targetNoteId: null, targetTitle: "Missing Note", linkType: "wikilink" }),
    ]));
  });

  it("returns orphan notes with no incoming links", async () => {
    const { app, folderA } = await setupNoteLinksApp();
    const linked = await createNote(app, folderA.id, "Linked Note");
    const orphan = await createNote(app, folderA.id, "Orphan Note");
    await createNote(app, folderA.id, "Source Note", "See [[Linked Note]].");

    const response = await app.request("/api/notes/orphans");
    expect(response.status).toBe(200);
    const body = await response.json() as { notes: Array<{ id: string; title: string }> };
    expect(body.notes).toContainEqual(expect.objectContaining({ id: orphan.id, title: "Orphan Note" }));
    expect(body.notes).not.toContainEqual(expect.objectContaining({ id: linked.id }));
  });

  it("returns graph endpoints through the harness API", async () => {
    const { app, folderA } = await setupNoteLinksApp();
    const target = await createNote(app, folderA.id, "Target Note");
    const source = await createNote(app, folderA.id, "Source Note", "See [[Target Note]].");

    const linksResponse = await app.request(`/api/harness/notes/${source.id}/links`);
    expect(linksResponse.status).toBe(200);
    await expect(linksResponse.json()).resolves.toMatchObject({ noteId: source.id, links: [expect.objectContaining({ targetNoteId: target.id, targetTitle: "Target Note" })] });

    const orphansResponse = await app.request("/api/harness/notes/orphans");
    expect(orphansResponse.status).toBe(200);
    await expect(orphansResponse.json()).resolves.toMatchObject({ notes: expect.any(Array) });
  });

  it("indexes unresolved links and resolves them when a matching note is created", async () => {
    const { app, folderA } = await setupNoteLinksApp();
    await createNote(app, folderA.id, "Source Note", "See [[Future Note]].");
    const target = await createNote(app, folderA.id, "Future Note");

    const response = await app.request(`/api/notes/${target.id}/backlinks`);
    expect(response.status).toBe(200);
    const body = await response.json() as { backlinks: Array<{ sourceTitle: string; targetTitle: string }> };
    expect(body.backlinks).toMatchObject([{ sourceTitle: "Source Note", targetTitle: "Future Note" }]);
  });

  it("indexes internal note URLs and returns backlinks", async () => {
    const { app, folderA } = await setupNoteLinksApp();
    const target = await createNote(app, folderA.id, "Target Note");
    const source = await createNote(app, folderA.id, "Source Note", `See http://localhost:5173/notes/${target.id}\n\n[Target](/notes/${target.id})`);

    const response = await app.request(`/api/notes/${target.id}/backlinks`);
    expect(response.status).toBe(200);
    const body = await response.json() as { backlinks: Array<{ sourceNoteId: string; sourceTitle: string; linkType: string }> };
    expect(body.backlinks).toContainEqual(expect.objectContaining({ sourceNoteId: source.id, sourceTitle: "Source Note", linkType: "internal-url" }));
  });

  it("does not expose backlinks across users", async () => {
    const { app, folderA, folderB } = await setupNoteLinksApp();
    const target = await createNote(app, folderA.id, "Target Note");
    await createNote(app, folderA.id, "Source Note", "See [[Target Note]].");

    const otherUserRead = await app.request(`/api/notes/${target.id}/backlinks`, { headers: { "x-user": "b" } });
    expect(otherUserRead.status).toBe(404);

    const otherTarget = await app.request(`/api/folders/${folderB.id}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user": "b" },
      body: JSON.stringify({ title: "Target Note", content: "" }),
    });
    expect(otherTarget.status).toBe(201);
  });
});
