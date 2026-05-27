import { handle } from "hono/aws-lambda";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./lib/auth";
import { authenticationMiddleware, harnessAuthenticationMiddleware } from "./middleware/authentication";
import { type ApiKey } from "./db/schema";
import { apiKeyRoutes } from "./routes/api-keys";
import { authRoutes } from "./routes/auth";
import { folderRoutes } from "./routes/folders";
import { harnessRoutes } from "./routes/harness";
import { noteRoutes } from "./routes/notes";

const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
    apiKey: ApiKey | null;
  };
}>();

app.use("*", cors());
app.get("/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes);
app.use("/api/folders/*", authenticationMiddleware);
app.use("/api/notes/*", authenticationMiddleware);
app.use("/api/api-keys/*", authenticationMiddleware);
app.use("/api/harness/*", harnessAuthenticationMiddleware);
app.route("/api/folders", folderRoutes);
app.route("/api/notes", noteRoutes);
app.route("/api/api-keys", apiKeyRoutes);
app.route("/api/harness", harnessRoutes);

export default app;
export const handler = handle(app);
