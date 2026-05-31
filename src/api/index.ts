import { handle } from "hono/aws-lambda";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { type ApiKey } from "./db/schema";
import { auth } from "./lib/auth";
import { authenticationMiddleware, harnessAuthenticationMiddleware } from "./middleware/authentication";
import { createRateLimitMiddleware } from "./middleware/rate-limit";
import { createRequestSizeLimitMiddleware } from "./middleware/request-limits";
import { securityHeadersMiddleware } from "./middleware/security-headers";
import { getApiRuntimeConfig } from "./lib/env";
import { apiKeyRoutes } from "./routes/api-keys";
import { attachmentRoutes } from "./routes/attachments";
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

const { allowedOrigins } = getApiRuntimeConfig();
const authRateLimit = createRateLimitMiddleware({ windowMs: 60_000, max: 10, keyPrefix: "auth" });
const apiKeyRateLimit = createRateLimitMiddleware({ windowMs: 60_000, max: 30, keyPrefix: "api-keys" });
const harnessRateLimit = createRateLimitMiddleware({ windowMs: 60_000, max: 120, keyPrefix: "harness" });
const writeBodyLimit = createRequestSizeLimitMiddleware({ maxBytes: 256 * 1024 });
const uploadBodyLimit = createRequestSizeLimitMiddleware({ maxBytes: 12 * 1024 * 1024 });

app.use("*", securityHeadersMiddleware);
app.use("*", cors({
  origin: (origin) => {
    if (!origin) return "";
    return allowedOrigins.includes(origin) ? origin : "";
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  credentials: true,
}));
app.get("/health", (c) => c.json({ ok: true }));
app.use("/api/auth", authRateLimit);
app.use("/api/auth/*", authRateLimit);
app.route("/api/auth", authRoutes);
app.use("/api/folders", authenticationMiddleware);
app.use("/api/folders/*", authenticationMiddleware);
app.use("/api/notes/*", authenticationMiddleware);
app.use("/api/attachments", authenticationMiddleware);
app.use("/api/attachments/*", authenticationMiddleware);
app.use("/api/api-keys", authenticationMiddleware);
app.use("/api/api-keys/*", authenticationMiddleware);
app.use("/api/harness/*", harnessAuthenticationMiddleware);
app.use("/api/api-keys", apiKeyRateLimit);
app.use("/api/api-keys/*", apiKeyRateLimit);
app.use("/api/harness/*", harnessRateLimit);
app.use("/api/folders", writeBodyLimit);
app.use("/api/folders/:folderId", writeBodyLimit);
app.use("/api/folders/:folderId/notes", writeBodyLimit);
app.use("/api/notes/:noteId", writeBodyLimit);
app.use("/api/notes/:noteId/edit", writeBodyLimit);
app.use("/api/api-keys", writeBodyLimit);
app.use("/api/api-keys/:keyId", writeBodyLimit);
app.use("/api/harness/notes", writeBodyLimit);
app.use("/api/harness/notes/:noteId/edit", writeBodyLimit);
app.use("/api/attachments/notes/:noteId/images", uploadBodyLimit);
app.use("/api/attachments/notes/:noteId/image-uploads", writeBodyLimit);
app.use("/api/attachments/:attachmentId/complete", writeBodyLimit);
app.route("/api/folders", folderRoutes);
app.route("/api/notes", noteRoutes);
app.route("/api/attachments", attachmentRoutes);
app.route("/api/api-keys", apiKeyRoutes);
app.route("/api/harness", harnessRoutes);

app.onError((error, c) => {
  console.error("[API ERROR]", {
    method: c.req.method,
    path: c.req.path,
    message: error.message,
    stack: error.stack,
  });
  return c.json({ error: "Internal Server Error" }, 500);
});

export default app;
export const handler = handle(app);
