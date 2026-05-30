const LOCAL_FRONTEND_URL = "http://localhost:5173";

type StageName = string | undefined;

type StageUrls = {
  frontendUrl: string;
  apiUrl: string;
  betterAuthUrl: string;
};

function ensureUrl(value: string, name: string) {
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid ${name}: ${value}`);
  }
}

export function parseAllowedOrigins(value?: string, fallback = LOCAL_FRONTEND_URL) {
  const raw = value?.trim() ? value : fallback;
  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => ensureUrl(origin, "API_ALLOWED_ORIGINS"));

  if (!origins.includes(LOCAL_FRONTEND_URL)) origins.push(LOCAL_FRONTEND_URL);
  return Array.from(new Set(origins));
}

export function getStageUrls(stage: StageName, env = process.env): StageUrls {
  const normalizedStage = stage ?? "local";
  const isLocal = normalizedStage === "local" || normalizedStage === "davidkennedy";
  const defaultFrontendUrl = isLocal ? LOCAL_FRONTEND_URL : "https://notes.dpklabs.com";
  const frontendUrl = ensureUrl(env.FRONTEND_URL ?? defaultFrontendUrl, "FRONTEND_URL");
  const apiUrl = ensureUrl(env.API_URL ?? (isLocal ? frontendUrl : "https://api.notes.dpklabs.com"), "API_URL");
  const betterAuthUrl = ensureUrl(env.BETTER_AUTH_URL ?? `${apiUrl}/api/auth`, "BETTER_AUTH_URL");

  return { frontendUrl, apiUrl, betterAuthUrl };
}

export type AttachmentStorageDriver = "filesystem" | "s3" | "s3-compatible" | "uploadthing" | "cloudinary" | "imgix";

function parseAttachmentStorageDriver(value?: string): AttachmentStorageDriver {
  const driver = (value?.trim() || "filesystem") as AttachmentStorageDriver;
  if (["filesystem", "s3", "s3-compatible", "uploadthing", "cloudinary", "imgix"].includes(driver)) return driver;
  throw new Error(`Invalid ATTACHMENT_STORAGE_DRIVER: ${value}`);
}

export function getApiRuntimeConfig(env = process.env) {
  const frontendUrl = ensureUrl(env.FRONTEND_URL ?? LOCAL_FRONTEND_URL, "FRONTEND_URL");
  const apiUrl = ensureUrl(env.API_URL ?? frontendUrl, "API_URL");
  const betterAuthUrl = ensureUrl(env.BETTER_AUTH_URL ?? `${apiUrl}/api/auth`, "BETTER_AUTH_URL");
  const allowedOrigins = parseAllowedOrigins(env.API_ALLOWED_ORIGINS, frontendUrl);

  return {
    frontendUrl,
    apiUrl,
    betterAuthUrl,
    allowedOrigins,
    cookieDomain: env.COOKIE_DOMAIN?.trim() || undefined,
    allowedLoginEmails: (env.ALLOWED_LOGIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean),
    ses: {
      fromEmail: env.SES_FROM_EMAIL?.trim() || undefined,
      region: env.SES_REGION?.trim() || env.AWS_REGION?.trim() || "us-east-1",
    },
    attachmentStorage: {
      driver: parseAttachmentStorageDriver(env.ATTACHMENT_STORAGE_DRIVER),
      filesystemPath: env.ATTACHMENT_STORAGE_PATH?.trim() || ".notes-attachments",
      publicBaseUrl: env.ATTACHMENT_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || undefined,
      bucket: env.ATTACHMENT_BUCKET?.trim() || undefined,
      region: env.ATTACHMENT_REGION?.trim() || env.AWS_REGION?.trim() || undefined,
      endpoint: env.ATTACHMENT_ENDPOINT?.trim() || undefined,
      forcePathStyle: env.ATTACHMENT_FORCE_PATH_STYLE === "true",
    },
  };
}

export const defaults = {
  localFrontendUrl: LOCAL_FRONTEND_URL,
};
