import { handle } from "hono/aws-lambda";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { folderRoutes } from "./routes/folders";
import { noteRoutes } from "./routes/notes";

const app = new Hono();

app.use("*", cors());
app.get("/health", (c) => c.json({ ok: true }));
app.route("/folders", folderRoutes);
app.route("/notes", noteRoutes);

export default app;
export const handler = handle(app);
