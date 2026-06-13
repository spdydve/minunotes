import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import app from "../src/api/index";
import { mcpRoutes } from "../src/api/routes/mcp";

describe("hosted MCP route", () => {
  it("requires authentication", async () => {
    const response = await app.request("/api/mcp", { method: "POST" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("serves MCP initialize over streamable HTTP with API key auth", async () => {
    const testApp = new Hono();
    testApp.use("*", async (c, next) => {
      c.set("user", { id: "user_test", name: "Test User", email: "test@example.com" });
      c.set("session", null);
      c.set("apiKey", { id: "key_test" });
      await next();
    });
    testApp.route("/api/mcp", mcpRoutes);

    const response = await testApp.request("/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-api-key": "ntak_test" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "0.1.0" },
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "minunotes", version: "0.1.0" } },
    });
  });
});
