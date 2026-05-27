import { describe, expect, it } from "vitest";
import { generateApiKey, getApiKeyFromHeaders, hashApiKey, parseApiKey, verifyApiKey } from "../src/api/lib/api-keys";

describe("API key generation and parsing", () => {
  it("generates ntak keys with uid and secret parts", () => {
    const { key, uid } = generateApiKey();

    expect(key.startsWith("ntak_")).toBe(true);
    expect(uid).toHaveLength(8);
    expect(parseApiKey(key)).toEqual(expect.objectContaining({ prefix: "ntak", uid }));
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
