import { handle } from "hono/aws-lambda";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./lib/auth";
import { authenticationMiddleware } from "./middleware/authentication";
import { authRoutes } from "./routes/auth";
import { folderRoutes } from "./routes/folders";
import { noteRoutes } from "./routes/notes";

const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

app.use("*", cors());
app.get("/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes);
app.use("/api/folders/*", authenticationMiddleware);
app.use("/api/notes/*", authenticationMiddleware);
app.route("/api/folders", folderRoutes);
app.route("/api/notes", noteRoutes);

export default app;
export const handler = handle(app);
