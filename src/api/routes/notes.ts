import { Hono } from "hono";
import { asc, eq, like, or } from "drizzle-orm";
import { db } from "../db/client";
import { folders, notes } from "../db/schema";

export const noteRoutes = new Hono();

noteRoutes.get("/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ notes: [] });

  const pattern = `%${q}%`;
  const rows = await db.select({
    id: notes.id,
    folderId: notes.folderId,
    title: notes.title,
    content: notes.content,
    createdAt: notes.createdAt,
    updatedAt: notes.updatedAt,
    folderTitle: folders.title,
  })
    .from(notes)
    .innerJoin(folders, eq(notes.folderId, folders.id))
    .where(or(like(notes.title, pattern), like(notes.content, pattern)))
    .orderBy(asc(notes.title))
    .limit(25);

  return c.json({ notes: rows });
});

noteRoutes.get("/:noteId", async (c) => {
  const [note] = await db.select().from(notes).where(eq(notes.id, c.req.param("noteId"))).limit(1);
  if (!note) return c.json({ error: "Note not found" }, 404);
  return c.json({ note });
});

noteRoutes.patch("/:noteId", async (c) => {
  const body = await c.req.json().catch(() => null) as { title?: string; content?: string; folderId?: string } | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const title = body.title?.trim();
  if (body.title !== undefined && !title) return c.json({ error: "Note title is required" }, 400);
  if (body.folderId !== undefined) {
    const [folder] = await db.select().from(folders).where(eq(folders.id, body.folderId)).limit(1);
    if (!folder) return c.json({ error: "Destination folder not found" }, 400);
  }

  const [note] = await db.update(notes)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(notes.id, c.req.param("noteId")))
    .returning();

  if (!note) return c.json({ error: "Note not found" }, 404);
  return c.json({ note });
});

noteRoutes.delete("/:noteId", async (c) => {
  await db.delete(notes).where(eq(notes.id, c.req.param("noteId")));
  return c.json({ ok: true });
});
