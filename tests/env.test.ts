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

  it("normalizes origins by removing paths", () => {
    expect(parseAllowedOrigins("https://notes.example.com/api/auth", "https://notes.example.com")).toEqual([
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
      API_URL: "https://api.notes.example.com",
      BETTER_AUTH_URL: "https://api.notes.example.com/api/auth",
    })).toEqual({
      frontendUrl: "https://notes.example.com",
      apiUrl: "https://api.notes.example.com",
      betterAuthUrl: "https://api.notes.example.com/api/auth",
    });
  });

  it("derives the auth url from the api url when omitted", () => {
    expect(getStageUrls("production", {
      ...process.env,
      FRONTEND_URL: "https://notes.example.com",
      API_URL: "https://api.notes.example.com",
      BETTER_AUTH_URL: undefined,
    })).toEqual({
      frontendUrl: "https://notes.example.com",
      apiUrl: "https://api.notes.example.com",
      betterAuthUrl: "https://api.notes.example.com/api/auth",
    });
  });
});

describe("getApiRuntimeConfig", () => {
  it("returns normalized runtime config", () => {
    expect(getApiRuntimeConfig({
      ...process.env,
      FRONTEND_URL: "https://notes.example.com/",
      API_URL: "https://api.notes.example.com/",
      API_ALLOWED_ORIGINS: "https://notes.example.com, https://admin.example.com",
      COOKIE_DOMAIN: ".example.com",
      ALLOWED_LOGIN_EMAILS: "owner@example.com, admin@example.com",
      SES_FROM_EMAIL: "MinuNotes <notes@example.com>",
      SES_REGION: "us-west-2",
      ATTACHMENT_STORAGE_DRIVER: "filesystem",
      ATTACHMENT_STORAGE_PATH: "/data/attachments",
      ATTACHMENT_PUBLIC_BASE_URL: "https://images.example.com/",
      ATTACHMENT_BUCKET: "notes-attachments",
      ATTACHMENT_REGION: "us-east-1",
      ATTACHMENT_ENDPOINT: "https://s3.example.com",
      ATTACHMENT_FORCE_PATH_STYLE: "true",
    })).toEqual({
      frontendUrl: "https://notes.example.com",
      apiUrl: "https://api.notes.example.com",
      betterAuthUrl: "https://api.notes.example.com/api/auth",
      allowedOrigins: [
        "https://notes.example.com",
        "https://admin.example.com",
        defaults.localFrontendUrl,
      ],
      cookieDomain: ".example.com",
      allowedLoginEmails: ["owner@example.com", "admin@example.com"],
      ses: {
        fromEmail: "MinuNotes <notes@example.com>",
        region: "us-west-2",
      },
      attachmentStorage: {
        driver: "filesystem",
        filesystemPath: "/data/attachments",
        publicBaseUrl: "https://images.example.com",
        bucket: "notes-attachments",
        region: "us-east-1",
        endpoint: "https://s3.example.com",
        forcePathStyle: true,
      },
    });
  });

  it("rejects unknown attachment storage drivers", () => {
    expect(() => getApiRuntimeConfig({
      ...process.env,
      ATTACHMENT_STORAGE_DRIVER: "unknown",
    })).toThrow("Invalid ATTACHMENT_STORAGE_DRIVER");
  });
});
