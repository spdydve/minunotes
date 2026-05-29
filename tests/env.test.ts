import { describe, expect, it } from "vitest";
import { defaults, getApiRuntimeConfig, getStageUrls, parseAllowedOrigins } from "../src/api/lib/env";

describe("parseAllowedOrigins", () => {
  it("parses and deduplicates configured origins", () => {
    expect(parseAllowedOrigins("https://app.example.com, https://app.example.com")).toEqual([
      "https://app.example.com",
      defaults.localFrontendUrl,
    ]);
  });

  it("falls back to the provided frontend url", () => {
    expect(parseAllowedOrigins(undefined, "https://notes.example.com")).toEqual([
      "https://notes.example.com",
      defaults.localFrontendUrl,
    ]);
  });
});

describe("getStageUrls", () => {
  it("uses explicit env values when present", () => {
    expect(getStageUrls("production", {
      ...process.env,
      FRONTEND_URL: "https://notes.example.com",
      BETTER_AUTH_URL: "https://notes.example.com/api/auth",
    })).toEqual({
      frontendUrl: "https://notes.example.com",
      betterAuthUrl: "https://notes.example.com/api/auth",
    });
  });

  it("derives the auth url from the frontend url when omitted", () => {
    expect(getStageUrls("local", {
      ...process.env,
      FRONTEND_URL: "https://notes.example.com",
      BETTER_AUTH_URL: undefined,
    })).toEqual({
      frontendUrl: "https://notes.example.com",
      betterAuthUrl: "https://notes.example.com/api/auth",
    });
  });
});

describe("getApiRuntimeConfig", () => {
  it("returns normalized runtime config", () => {
    expect(getApiRuntimeConfig({
      ...process.env,
      FRONTEND_URL: "https://notes.example.com/",
      API_ALLOWED_ORIGINS: "https://notes.example.com, https://admin.example.com",
      COOKIE_DOMAIN: ".example.com",
    })).toEqual({
      frontendUrl: "https://notes.example.com",
      betterAuthUrl: "https://notes.example.com/api/auth",
      allowedOrigins: [
        "https://notes.example.com",
        "https://admin.example.com",
        defaults.localFrontendUrl,
      ],
      cookieDomain: ".example.com",
    });
  });
});
