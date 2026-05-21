import { Hono } from "hono";
import { eq, asc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { folders, notes } from "../db/schema";
import { createId } from "../lib/id";

export const folderRoutes = new Hono();

folderRoutes.get("/", async (c) => {
  const rows = await db.select().from(folders).orderBy(asc(folders.title));
  return c.json({ folders: rows });
});

folderRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null) as { title?: string } | null;
  const title = body?.title?.trim();
  if (!title) return c.json({ error: "Folder title is required" }, 400);

  const folder = { id: createId("folder"), title, createdAt: new Date(), updatedAt: new Date() };
  await db.insert(folders).values(folder);
  return c.json({ folder }, 201);
});

folderRoutes.get("/:folderId/notes", async (c) => {
  const folderId = c.req.param("folderId");
  const rows = await db.select().from(notes).where(eq(notes.folderId, folderId)).orderBy(asc(notes.title));
  return c.json({ notes: rows });
});

folderRoutes.post("/:folderId/notes", async (c) => {
  const folderId = c.req.param("folderId");
  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1);
  if (!folder) return c.json({ error: "Folder not found" }, 404);

  const note = { id: createId("note"), folderId, title: "Untitled note", content: "", createdAt: new Date(), updatedAt: new Date() };
  await db.insert(notes).values(note);
  return c.json({ note }, 201);
});

folderRoutes.delete("/:folderId", async (c) => {
  const folderId = c.req.param("folderId");
  await db.delete(notes).where(eq(notes.folderId, folderId));
  await db.delete(folders).where(eq(folders.id, folderId));
  return c.json({ ok: true });
});
