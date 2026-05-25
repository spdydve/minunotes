import { createHash, randomBytes } from "node:crypto";

export function generateApiKey() {
  return `notes_${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}
