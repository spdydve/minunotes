import { handle } from "hono/aws-lambda";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { type ApiKey, type OAuthAuthorization } from "./db/schema";
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
import { oauthRoutes } from "./routes/oauth";
import { shareRoutes } from "./routes/share";

const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
    apiKey: ApiKey | null;
    oauthAuthorization: OAuthAuthorization | null;
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
function oauthAuthorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}

function mcpProtectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["notes.read", "notes.create", "notes.edit"],
    resource_documentation: `${origin}/v1/openapi.json`,
  };
}

app.get("/.well-known/oauth-authorization-server", (c) => c.json(oauthAuthorizationServerMetadata(new URL(c.req.url).origin)));
app.get("/.well-known/oauth-protected-resource", (c) => c.json(mcpProtectedResourceMetadata(new URL(c.req.url).origin)));
app.get("/mcp/.well-known/oauth-protected-resource", (c) => c.json(mcpProtectedResourceMetadata(new URL(c.req.url).origin)));
app.get("/api/mcp/.well-known/oauth-protected-resource", (c) => c.json(mcpProtectedResourceMetadata(new URL(c.req.url).origin)));
app.get("/openapi.json", (c) => c.json(harnessOpenApiSpec));
app.get("/v1/openapi.json", (c) => c.json(harnessOpenApiSpec));
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
app.use("/internal/auth", authRateLimit);
app.use("/internal/auth/*", authRateLimit);
app.use("/api/auth", authRateLimit);
app.use("/api/auth/*", authRateLimit);
app.use("/api/oauth/token", authRateLimit);
app.use("/api/oauth/revoke", authRateLimit);
app.use("/oauth/token", authRateLimit);
app.use("/oauth/revoke", authRateLimit);
app.use("/internal/oauth/token", authRateLimit);
app.use("/internal/oauth/revoke", authRateLimit);
app.route("/internal/auth", authRoutes);
app.route("/api/auth", authRoutes);
app.use("/api/oauth/authorize", authenticationMiddleware);
app.use("/api/oauth/clients", authenticationMiddleware);
app.use("/api/oauth/clients/*", authenticationMiddleware);
app.use("/api/oauth/authorizations", authenticationMiddleware);
app.use("/api/oauth/authorizations/*", authenticationMiddleware);
app.use("/internal/oauth/authorize", authenticationMiddleware);
app.use("/internal/oauth/clients", authenticationMiddleware);
app.use("/internal/oauth/clients/*", authenticationMiddleware);
app.use("/internal/oauth/authorizations", authenticationMiddleware);
app.use("/internal/oauth/authorizations/*", authenticationMiddleware);
app.use("/oauth/authorize", authenticationMiddleware);
app.use("/oauth/clients", authenticationMiddleware);
app.use("/oauth/clients/*", authenticationMiddleware);
app.use("/oauth/authorizations", authenticationMiddleware);
app.use("/oauth/authorizations/*", authenticationMiddleware);
app.use("/internal/folders", authenticationMiddleware);
app.use("/internal/folders/*", authenticationMiddleware);
app.use("/internal/notes/*", authenticationMiddleware);
app.use("/internal/attachments", authenticationMiddleware);
app.use("/internal/attachments/*", authenticationMiddleware);
app.use("/internal/api-keys", authenticationMiddleware);
app.use("/internal/api-keys/*", authenticationMiddleware);
app.use("/api/folders", authenticationMiddleware);
app.use("/api/folders/*", authenticationMiddleware);
app.use("/api/notes/*", authenticationMiddleware);
app.use("/api/attachments", authenticationMiddleware);
app.use("/api/attachments/*", authenticationMiddleware);
app.use("/api/api-keys", authenticationMiddleware);
app.use("/api/api-keys/*", authenticationMiddleware);
app.use("/v1/harness/*", harnessAuthenticationMiddleware);
app.use("/mcp", harnessAuthenticationMiddleware);
app.use("/mcp/*", harnessAuthenticationMiddleware);
app.use("/api/harness/*", harnessAuthenticationMiddleware);
app.use("/api/mcp", harnessAuthenticationMiddleware);
app.use("/api/mcp/*", harnessAuthenticationMiddleware);
app.use("/internal/api-keys", apiKeyRateLimit);
app.use("/internal/api-keys/*", apiKeyRateLimit);
app.use("/api/api-keys", apiKeyRateLimit);
app.use("/api/api-keys/*", apiKeyRateLimit);
app.use("/v1/harness/*", harnessRateLimit);
app.use("/mcp", harnessRateLimit);
app.use("/mcp/*", harnessRateLimit);
app.use("/api/harness/*", harnessRateLimit);
app.use("/api/mcp", harnessRateLimit);
app.use("/api/mcp/*", harnessRateLimit);
app.use("/internal/folders", writeBodyLimit);
app.use("/internal/folders/:folderId", writeBodyLimit);
app.use("/internal/folders/:folderId/notes", writeBodyLimit);
app.use("/internal/notes/:noteId", writeBodyLimit);
app.use("/internal/notes/:noteId/edit", writeBodyLimit);
app.use("/internal/notes/:noteId/share-link", writeBodyLimit);
app.use("/internal/api-keys", writeBodyLimit);
app.use("/internal/api-keys/:keyId", writeBodyLimit);
app.use("/api/folders", writeBodyLimit);
app.use("/api/folders/:folderId", writeBodyLimit);
app.use("/api/folders/:folderId/notes", writeBodyLimit);
app.use("/api/notes/:noteId", writeBodyLimit);
app.use("/api/notes/:noteId/edit", writeBodyLimit);
app.use("/api/notes/:noteId/share-link", writeBodyLimit);
app.use("/api/api-keys", writeBodyLimit);
app.use("/api/api-keys/:keyId", writeBodyLimit);
app.use("/internal/oauth/clients", writeBodyLimit);
app.use("/internal/oauth/clients/:clientId", writeBodyLimit);
app.use("/api/oauth/clients", writeBodyLimit);
app.use("/api/oauth/clients/:clientId", writeBodyLimit);
app.use("/oauth/clients", writeBodyLimit);
app.use("/oauth/clients/:clientId", writeBodyLimit);
app.use("/v1/harness/folders", writeBodyLimit);
app.use("/v1/harness/notes", writeBodyLimit);
app.use("/v1/harness/notes/:noteId/edit", writeBodyLimit);
app.use("/api/harness/folders", writeBodyLimit);
app.use("/api/harness/notes", writeBodyLimit);
app.use("/api/harness/notes/:noteId/edit", writeBodyLimit);
app.use("/mcp", writeBodyLimit);
app.use("/mcp/*", writeBodyLimit);
app.use("/api/mcp", writeBodyLimit);
app.use("/api/mcp/*", writeBodyLimit);
app.use("/internal/attachments/notes/:noteId/images", uploadBodyLimit);
app.use("/internal/attachments/notes/:noteId/image-uploads", writeBodyLimit);
app.use("/internal/attachments/:attachmentId/complete", writeBodyLimit);
app.use("/api/attachments/notes/:noteId/images", uploadBodyLimit);
app.use("/api/attachments/notes/:noteId/image-uploads", writeBodyLimit);
app.use("/api/attachments/:attachmentId/complete", writeBodyLimit);
app.route("/internal/folders", folderRoutes);
app.route("/internal/notes", noteRoutes);
app.route("/internal/share", shareRoutes);
app.route("/internal/oauth", oauthRoutes);
app.route("/internal/attachments", attachmentRoutes);
app.route("/internal/api-keys", apiKeyRoutes);
app.route("/v1/harness", harnessRoutes);
app.route("/mcp", mcpRoutes);
app.route("/oauth", oauthRoutes);
app.route("/api/folders", folderRoutes);
app.route("/api/notes", noteRoutes);
app.route("/api/share", shareRoutes);
app.route("/api/oauth", oauthRoutes);
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
