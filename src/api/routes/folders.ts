import { Hono, type Context } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { folders, notes } from "../db/schema";
import { createId } from "../lib/id";
import { auth } from "../lib/auth";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const folderRoutes = new Hono<{ Variables: Variables }>();

function getUser(c: Context<{ Variables: Variables }>) {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

folderRoutes.get("/", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const rows = await db.select().from(folders).where(eq(folders.userId, user.id)).orderBy(asc(folders.title));
  return c.json({ folders: rows });
});

folderRoutes.post("/", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null) as { title?: string } | null;
  const title = body?.title?.trim();
  if (!title) return c.json({ error: "Folder title is required" }, 400);

  const folder = { id: createId("folder"), userId: user.id, title, createdAt: new Date(), updatedAt: new Date() };
  await db.insert(folders).values(folder);
  return c.json({ folder }, 201);
});

folderRoutes.patch("/:folderId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null) as { title?: string } | null;
  const title = body?.title?.trim();
  if (!title) return c.json({ error: "Folder title is required" }, 400);

  const [folder] = await db.update(folders)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(folders.id, c.req.param("folderId")), eq(folders.userId, user.id)))
    .returning();

  if (!folder) return c.json({ error: "Folder not found" }, 404);
  return c.json({ folder });
});

folderRoutes.get("/:folderId/notes", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const folderId = c.req.param("folderId");
  const rows = await db.select().from(notes).where(and(eq(notes.folderId, folderId), eq(notes.userId, user.id))).orderBy(asc(notes.title));
  return c.json({ notes: rows });
});

folderRoutes.post("/:folderId/notes", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const folderId = c.req.param("folderId");
  const [folder] = await db.select().from(folders).where(and(eq(folders.id, folderId), eq(folders.userId, user.id))).limit(1);
  if (!folder) return c.json({ error: "Folder not found" }, 404);

  const note = { id: createId("note"), folderId, userId: user.id, title: "Untitled note", content: "", createdAt: new Date(), updatedAt: new Date() };
  await db.insert(notes).values(note);
  return c.json({ note }, 201);
});

folderRoutes.delete("/:folderId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const folderId = c.req.param("folderId");
  await db.delete(notes).where(and(eq(notes.folderId, folderId), eq(notes.userId, user.id)));
  await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.userId, user.id)));
  return c.json({ ok: true });
});
