import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { oauthClients, type OAuthClient } from "../db/schema";

export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const AUTHORIZATION_CODE_TTL_MS = 10 * 60 * 1000;

export function generateOAuthToken(prefix: "mnoac" | "mnort" | "mnocd") {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function hashOAuthToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseRedirectUris(client: Pick<OAuthClient, "redirectUris">) {
  try {
    const parsed = JSON.parse(client.redirectUris) as unknown;
    return Array.isArray(parsed) ? parsed.filter((uri): uri is string => typeof uri === "string") : [];
  } catch {
    return [];
  }
}

export function isRedirectUriAllowed(client: Pick<OAuthClient, "redirectUris">, redirectUri: string) {
  return parseRedirectUris(client).includes(redirectUri);
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifyPkce(input: { verifier: string; challenge: string; method: string }) {
  if (input.method !== "S256") return false;
  const actual = Buffer.from(pkceChallenge(input.verifier));
  const expected = Buffer.from(input.challenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function findOAuthClient(clientId: string) {
  const [client] = await db.select().from(oauthClients).where(and(eq(oauthClients.id, clientId), isNull(oauthClients.revokedAt))).limit(1);
  return client ?? null;
}

export function oauthError(error: string, description?: string) {
  return { error, ...(description ? { error_description: description } : {}) };
}
