import { Hono, type Context } from "hono";
import { and, asc, eq, like, or } from "drizzle-orm";
import { db } from "../db/client";
import { folders, notes } from "../db/schema";
import { auth } from "../lib/auth";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const noteRoutes = new Hono<{ Variables: Variables }>();

function getUser(c: Context<{ Variables: Variables }>) {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

noteRoutes.get("/search", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ notes: [] });

  const pattern = `%${q}%`;
  const rows = await db.select({
    id: notes.id,
    folderId: notes.folderId,
    userId: notes.userId,
    title: notes.title,
    content: notes.content,
    createdAt: notes.createdAt,
    updatedAt: notes.updatedAt,
    folderTitle: folders.title,
  })
    .from(notes)
    .innerJoin(folders, and(eq(notes.folderId, folders.id), eq(folders.userId, user.id)))
    .where(and(eq(notes.userId, user.id), or(like(notes.title, pattern), like(notes.content, pattern))))
    .orderBy(asc(notes.title))
    .limit(25);

  return c.json({ notes: rows });
});

noteRoutes.get("/:noteId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const [note] = await db.select().from(notes).where(and(eq(notes.id, c.req.param("noteId")), eq(notes.userId, user.id))).limit(1);
  if (!note) return c.json({ error: "Note not found" }, 404);
  return c.json({ note });
});

noteRoutes.patch("/:noteId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null) as { title?: string; content?: string; folderId?: string } | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const title = body.title?.trim();
  if (body.title !== undefined && !title) return c.json({ error: "Note title is required" }, 400);
  if (body.folderId !== undefined) {
    const [folder] = await db.select().from(folders).where(and(eq(folders.id, body.folderId), eq(folders.userId, user.id))).limit(1);
    if (!folder) return c.json({ error: "Destination folder not found" }, 400);
  }

  const [note] = await db.update(notes)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(notes.id, c.req.param("noteId")), eq(notes.userId, user.id)))
    .returning();

  if (!note) return c.json({ error: "Note not found" }, 404);
  return c.json({ note });
});

noteRoutes.delete("/:noteId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  await db.delete(notes).where(and(eq(notes.id, c.req.param("noteId")), eq(notes.userId, user.id)));
  return c.json({ ok: true });
});
