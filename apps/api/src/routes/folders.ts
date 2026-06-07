import { Hono, type Context } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { folders, notes, templateFolderAssignments } from "../db/schema";
import { createDocument, listDocuments, listFolders } from "../harness/commands";
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

  const result = await listFolders({ userId: user.id });
  return c.json(result.value);
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

  const type = c.req.query("type") === "template" ? "template" : "note";
  const result = await listDocuments({ userId: user.id, folderId: c.req.param("folderId"), type });
  return c.json({ notes: result.value.documents });
});

folderRoutes.get("/:folderId/templates", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const rows = await db.select({ template: notes }).from(templateFolderAssignments)
    .innerJoin(notes, eq(templateFolderAssignments.templateId, notes.id))
    .where(and(eq(templateFolderAssignments.userId, user.id), eq(templateFolderAssignments.folderId, c.req.param("folderId")), eq(notes.type, "template")));
  return c.json({ templates: rows.map((row) => row.template) });
});

folderRoutes.post("/:folderId/notes", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({})) as { title?: string; content?: string; type?: "note" | "template" };
  const result = await createDocument({
    userId: user.id,
    folderId: c.req.param("folderId"),
    title: body.title,
    markdown: body.content,
    type: body.type === "template" ? "template" : "note",
    actorType: "user",
  });

  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ note: result.value.note }, 201);
});

folderRoutes.delete("/:folderId", async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const folderId = c.req.param("folderId");
  await db.delete(notes).where(and(eq(notes.folderId, folderId), eq(notes.userId, user.id)));
  await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.userId, user.id)));
  return c.json({ ok: true });
});
