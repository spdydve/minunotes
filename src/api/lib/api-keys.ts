import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const API_KEY_PREFIX = 'ntak';
const HASH_LENGTH = 64;
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const API_KEY_UID_LENGTH = 8;
const API_KEY_SECRET_LENGTH = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9]+$/;

function randomToken(length: number) {
  const bytes = randomBytes(length);
  let token = '';
  for (const byte of bytes) token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length];
  return token;
}

export function generateApiKey() {
  const uid = randomToken(API_KEY_UID_LENGTH);
  const secret = randomToken(API_KEY_SECRET_LENGTH);
  return { key: `${API_KEY_PREFIX}_${uid}_${secret}`, uid };
}

export function parseApiKey(key: string) {
  const keyPrefix = `${API_KEY_PREFIX}_`;
  if (!key.startsWith(keyPrefix)) return null;

  const uid = key.slice(keyPrefix.length, keyPrefix.length + API_KEY_UID_LENGTH);
  const separator = key[keyPrefix.length + API_KEY_UID_LENGTH];
  const secret = key.slice(keyPrefix.length + API_KEY_UID_LENGTH + 1);

  if (
    uid.length !== API_KEY_UID_LENGTH ||
    separator !== '_' ||
    secret.length !== API_KEY_SECRET_LENGTH ||
    !TOKEN_PATTERN.test(uid) ||
    !TOKEN_PATTERN.test(secret)
  )
    return null;
  return { prefix: API_KEY_PREFIX, uid, secret };
}

export function hashApiKey(key: string, salt = randomToken(16)) {
  const hash = scryptSync(key, salt, HASH_LENGTH).toString('hex');
  return { hash, salt };
}

export function verifyApiKey(key: string, hash: string, salt: string) {
  const candidate = scryptSync(key, salt, HASH_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function getApiKeyFromHeaders(headers: Headers) {
  return headers.get('x-api-key')?.trim() || null;
}
