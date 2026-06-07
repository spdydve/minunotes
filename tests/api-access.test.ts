import { beforeEach, describe, expect, it } from "vitest";
import { generateApiKey, getApiKeyFromHeaders, hashApiKey, parseApiKey, verifyApiKey } from "../apps/api/src/lib/api-keys";
import { consumeRateLimit, getClientAddress, resetRateLimitStore } from "../apps/api/src/middleware/rate-limit";
import { isRequestBodyTooLarge } from "../apps/api/src/middleware/request-limits";

describe("API key generation and parsing", () => {
  it("generates ntak keys with uid and secret parts", () => {
    const { key, uid } = generateApiKey();

    expect(key.startsWith("ntak_")).toBe(true);
    expect(uid).toHaveLength(8);
    expect(key).toMatch(/^ntak_[A-Za-z0-9]{8}_[A-Za-z0-9]{32}$/);
    expect(parseApiKey(key)).toEqual(expect.objectContaining({ prefix: "ntak", uid }));
  });

  it("rejects keys with special characters in uid or secret", () => {
    expect(parseApiKey("ntak_ab_cd-ef_secretwithonlyalphanumericchars12")).toBeNull();
    expect(parseApiKey("ntak_abcdefgh_secret_with_under-scores1234567")).toBeNull();
  });

  it("rejects malformed keys", () => {
    expect(parseApiKey("notes_bad")).toBeNull();
    expect(parseApiKey("ntak_onlyuid")).toBeNull();
    expect(parseApiKey("wrongprefix_uid_secret")).toBeNull();
  });
});

describe("API key hashing and verification", () => {
  it("verifies the original key and rejects a different key", () => {
    const { key } = generateApiKey();
    const { hash, salt } = hashApiKey(key);

    expect(verifyApiKey(key, hash, salt)).toBe(true);
    expect(verifyApiKey(`${key}_different`, hash, salt)).toBe(false);
  });

  it("produces different salts and hashes for the same key when not provided a salt", () => {
    const { key } = generateApiKey();
    const first = hashApiKey(key);
    const second = hashApiKey(key);

    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it("is deterministic when the same salt is provided", () => {
    const { key } = generateApiKey();
    const salt = "fixed-test-salt";

    expect(hashApiKey(key, salt)).toEqual(hashApiKey(key, salt));
  });
});

describe("API key header extraction", () => {
  it("prefers x-api-key over authorization bearer", () => {
    const headers = new Headers({
      "x-api-key": "ntak_uid_secret",
      authorization: "Bearer ntak_other_secret",
    });

    expect(getApiKeyFromHeaders(headers)).toBe("ntak_uid_secret");
  });

  it("falls back to authorization bearer", () => {
    const headers = new Headers({ authorization: "Bearer ntak_uid_secret" });
    expect(getApiKeyFromHeaders(headers)).toBe("ntak_uid_secret");
  });

  it("returns null when neither header is present", () => {
    expect(getApiKeyFromHeaders(new Headers())).toBeNull();
  });
});

describe("rate limiting", () => {
  beforeEach(() => resetRateLimitStore());

  it("uses forwarded client address when present", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.2" });
    expect(getClientAddress(headers)).toBe("203.0.113.1");
  });

  it("allows requests until the limit is exceeded", () => {
    const first = consumeRateLimit("auth:203.0.113.1", { windowMs: 60_000, max: 2 }, 1_000);
    const second = consumeRateLimit("auth:203.0.113.1", { windowMs: 60_000, max: 2 }, 2_000);
    const third = consumeRateLimit("auth:203.0.113.1", { windowMs: 60_000, max: 2 }, 3_000);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("resets after the rate limit window", () => {
    consumeRateLimit("harness:203.0.113.1", { windowMs: 1_000, max: 1 }, 1_000);
    const next = consumeRateLimit("harness:203.0.113.1", { windowMs: 1_000, max: 1 }, 2_001);

    expect(next.allowed).toBe(true);
  });
});

describe("request size limits", () => {
  it("rejects requests above the configured content length", () => {
    expect(isRequestBodyTooLarge(300_000, 256 * 1024)).toBe(true);
  });

  it("rejects requests above the measured body size", () => {
    expect(isRequestBodyTooLarge(null, 10, 11)).toBe(true);
  });

  it("allows requests within the configured limit", () => {
    expect(isRequestBodyTooLarge(512, 1024, 512)).toBe(false);
  });
});
