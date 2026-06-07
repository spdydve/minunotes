import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ATTACHMENT_CLEANUP_GRACE_DAYS, getAttachmentCleanupCutoff, getAttachmentCleanupGraceDays } from "../apps/api/src/attachments/cleanup";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("attachment cleanup config", () => {
  it("defaults to the standard grace period", () => {
    expect(getAttachmentCleanupGraceDays()).toBe(DEFAULT_ATTACHMENT_CLEANUP_GRACE_DAYS);
  });

  it("reads the grace period from env", () => {
    vi.stubEnv("ATTACHMENT_CLEANUP_GRACE_DAYS", "7");
    expect(getAttachmentCleanupGraceDays()).toBe(7);
  });

  it("calculates the cleanup cutoff", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    expect(getAttachmentCleanupCutoff(7, now).toISOString()).toBe("2026-05-25T00:00:00.000Z");
  });
});
