import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { notes } from "../db/schema";

export const noteRoutes = new Hono();

noteRoutes.get("/:noteId", async (c) => {
  const [note] = await db.select().from(notes).where(eq(notes.id, c.req.param("noteId"))).limit(1);
  if (!note) return c.json({ error: "Note not found" }, 404);
  return c.json({ note });
});

noteRoutes.patch("/:noteId", async (c) => {
  const body = await c.req.json().catch(() => null) as { title?: string; content?: string } | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const title = body.title?.trim();
  if (body.title !== undefined && !title) return c.json({ error: "Note title is required" }, 400);

  const [note] = await db.update(notes)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
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
