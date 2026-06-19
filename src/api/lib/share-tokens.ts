import { createHash, randomBytes } from "node:crypto";
import { getApiRuntimeConfig } from "./env";

const SHARE_TOKEN_BYTES = 32;

export function generateShareToken() {
  return randomBytes(SHARE_TOKEN_BYTES).toString("base64url");
}

export function hashShareToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildShareUrl(token: string) {
  const { frontendUrl } = getApiRuntimeConfig();
  return `${frontendUrl}/share/${encodeURIComponent(token)}`;
}
