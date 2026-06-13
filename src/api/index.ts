import { handle } from "hono/aws-lambda";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { type ApiKey } from "./db/schema";
import { libsql } from "./db/client";
import { auth } from "./lib/auth";
import { authenticationMiddleware, harnessAuthenticationMiddleware } from "./middleware/authentication";
import { createRateLimitMiddleware } from "./middleware/rate-limit";
import { createRequestSizeLimitMiddleware } from "./middleware/request-limits";
import { securityHeadersMiddleware } from "./middleware/security-headers";
import { getApiRuntimeConfig } from "./lib/env";
import { harnessOpenApiSpec } from "./openapi/harness";
import { apiKeyRoutes } from "./routes/api-keys";
import { attachmentRoutes } from "./routes/attachments";
import { authRoutes } from "./routes/auth";
import { folderRoutes } from "./routes/folders";
import { harnessRoutes } from "./routes/harness";
import { mcpRoutes } from "./routes/mcp";
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
  allowHeaders: ["Content-Type", "Authorization", "X-API-Key", "Mcp-Session-Id", "MCP-Protocol-Version", "Last-Event-ID"],
  exposeHeaders: ["Mcp-Session-Id"],
  credentials: true,
}));
app.get("/api/openapi.json", (c) => c.json(harnessOpenApiSpec));
app.get("/api/harness/openapi.json", (c) => c.json(harnessOpenApiSpec));
app.get("/health", async (c) => {
  let dbOk = false;
  try {
    await libsql.execute("select 1");
    dbOk = true;
  } catch (error) {
    console.error("[HEALTH CHECK DB ERROR]", error);
  }

  return c.json({
    ok: dbOk,
    environment: process.env.ENVIRONMENT ?? "unknown",
    time: new Date().toISOString(),
    db: dbOk,
  }, dbOk ? 200 : 503);
});
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
app.use("/api/mcp", harnessAuthenticationMiddleware);
app.use("/api/mcp/*", harnessAuthenticationMiddleware);
app.use("/api/api-keys", apiKeyRateLimit);
app.use("/api/api-keys/*", apiKeyRateLimit);
app.use("/api/harness/*", harnessRateLimit);
app.use("/api/mcp", harnessRateLimit);
app.use("/api/mcp/*", harnessRateLimit);
app.use("/api/folders", writeBodyLimit);
app.use("/api/folders/:folderId", writeBodyLimit);
app.use("/api/folders/:folderId/notes", writeBodyLimit);
app.use("/api/notes/:noteId", writeBodyLimit);
app.use("/api/notes/:noteId/edit", writeBodyLimit);
app.use("/api/api-keys", writeBodyLimit);
app.use("/api/api-keys/:keyId", writeBodyLimit);
app.use("/api/harness/folders", writeBodyLimit);
app.use("/api/harness/notes", writeBodyLimit);
app.use("/api/harness/notes/:noteId/edit", writeBodyLimit);
app.use("/api/mcp", writeBodyLimit);
app.use("/api/mcp/*", writeBodyLimit);
app.use("/api/attachments/notes/:noteId/images", uploadBodyLimit);
app.use("/api/attachments/notes/:noteId/image-uploads", writeBodyLimit);
app.use("/api/attachments/:attachmentId/complete", writeBodyLimit);
app.route("/api/folders", folderRoutes);
app.route("/api/notes", noteRoutes);
app.route("/api/attachments", attachmentRoutes);
app.route("/api/api-keys", apiKeyRoutes);
app.route("/api/harness", harnessRoutes);
app.route("/api/mcp", mcpRoutes);

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
