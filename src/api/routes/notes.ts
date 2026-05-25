import { Hono, type Context } from "hono";
import { and, asc, eq, like, or } from "drizzle-orm";
import { db } from "../db/client";
import { folders, notes } from "../db/schema";
import { readDocument, updateDocument } from "../harness/commands";
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

  const result = await readDocument({ documentId: c.req.param("noteId"), userId: user.id });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.value);
});

noteRoutes.patch("/:noteId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null) as { title?: string; content?: string; folderId?: string; baseHash?: string } | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const title = body.title?.trim();
  if (body.title !== undefined && !title) return c.json({ error: "Note title is required" }, 400);

  const result = await updateDocument({
    documentId: c.req.param("noteId"),
    userId: user.id,
    title,
    markdown: body.content,
    folderId: body.folderId,
    baseHash: body.baseHash,
    actorType: "user",
  });

  if (!result.ok) return c.json({ error: result.error, ...("currentHash" in result ? { currentHash: result.currentHash } : {}) }, result.status);
  return c.json(result.value);
});

noteRoutes.delete("/:noteId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  await db.delete(notes).where(and(eq(notes.id, c.req.param("noteId")), eq(notes.userId, user.id)));
  return c.json({ ok: true });
});
