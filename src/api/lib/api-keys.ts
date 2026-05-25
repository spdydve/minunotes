import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const API_KEY_PREFIX = "ntak";
const HASH_LENGTH = 64;

function randomToken(bytes: number) {
  return randomBytes(bytes).toString("base64url");
}

export function generateApiKey() {
  const uid = randomToken(6).slice(0, 8);
  const secret = randomToken(24);
  return { key: `${API_KEY_PREFIX}_${uid}_${secret}`, uid };
}

export function parseApiKey(key: string) {
  const [prefix, uid, secret] = key.split("_");
  if (prefix !== API_KEY_PREFIX || !uid || !secret) return null;
  return { prefix, uid, secret };
}

export function hashApiKey(key: string, salt = randomToken(16)) {
  const hash = scryptSync(key, salt, HASH_LENGTH).toString("hex");
  return { hash, salt };
}

export function verifyApiKey(key: string, hash: string, salt: string) {
  const candidate = scryptSync(key, salt, HASH_LENGTH);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function getApiKeyFromHeaders(headers: Headers) {
  const headerKey = headers.get("x-api-key")?.trim();
  if (headerKey) return headerKey;

  const authorization = headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : null;
}
