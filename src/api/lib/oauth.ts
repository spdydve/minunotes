import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { type OAuthClient, oauthClients } from '../db/schema';

export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const AUTHORIZATION_CODE_TTL_MS = 10 * 60 * 1000;

export function generateOAuthToken(prefix: 'mnoac' | 'mnort' | 'mnocd') {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export function hashOAuthToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function parseRedirectUris(client: Pick<OAuthClient, 'redirectUris'>) {
  try {
    const parsed = JSON.parse(client.redirectUris) as unknown;
    return Array.isArray(parsed) ? parsed.filter((uri): uri is string => typeof uri === 'string') : [];
  } catch {
    return [];
  }
}

export function isRedirectUriAllowed(client: Pick<OAuthClient, 'redirectUris'>, redirectUri: string) {
  return parseRedirectUris(client).includes(redirectUri);
}

export function validateOAuthRedirectUri(uri: string) {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === 'https:') return { ok: true as const, url: parsed };
    if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'))
      return { ok: true as const, url: parsed };
    return { ok: false as const, error: 'Redirect URIs must use HTTPS unless they target localhost' };
  } catch {
    return { ok: false as const, error: 'Redirect URIs must be valid URLs' };
  }
}

export function validateDcrRedirectUri(uri: string) {
  const result = validateOAuthRedirectUri(uri);
  if (!result.ok) return result;
  const hostname = result.url.hostname.toLowerCase();
  const allowed =
    hostname === 'chatgpt.com' ||
    hostname.endsWith('.chatgpt.com') ||
    hostname === 'chat.openai.com' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1';
  if (!allowed)
    return { ok: false as const, error: 'Dynamic client registration is limited to trusted connector redirect hosts' };
  return result;
}

export function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function verifyPkce(input: { verifier: string; challenge: string; method: string }) {
  if (input.method !== 'S256') return false;
  const actual = Buffer.from(pkceChallenge(input.verifier));
  const expected = Buffer.from(input.challenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function findOAuthClient(clientId: string) {
  const [client] = await db
    .select()
    .from(oauthClients)
    .where(and(eq(oauthClients.id, clientId), isNull(oauthClients.revokedAt)))
    .limit(1);
  return client ?? null;
}

export function oauthError(error: string, description?: string) {
  return { error, ...(description ? { error_description: description } : {}) };
}
