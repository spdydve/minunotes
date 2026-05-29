const LOCAL_FRONTEND_URL = "http://localhost:5173";

type StageName = string | undefined;

type StageUrls = {
  frontendUrl: string;
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
  const frontendUrl = ensureUrl(env.FRONTEND_URL ?? LOCAL_FRONTEND_URL, "FRONTEND_URL");
  const betterAuthUrl = ensureUrl(env.BETTER_AUTH_URL ?? `${frontendUrl}/api/auth`, "BETTER_AUTH_URL");

  if (normalizedStage === "local" || normalizedStage === "davidkennedy") {
    return { frontendUrl, betterAuthUrl };
  }

  return { frontendUrl, betterAuthUrl };
}

export function getApiRuntimeConfig(env = process.env) {
  const frontendUrl = ensureUrl(env.FRONTEND_URL ?? LOCAL_FRONTEND_URL, "FRONTEND_URL");
  const betterAuthUrl = ensureUrl(env.BETTER_AUTH_URL ?? `${frontendUrl}/api/auth`, "BETTER_AUTH_URL");
  const allowedOrigins = parseAllowedOrigins(env.API_ALLOWED_ORIGINS, frontendUrl);

  return {
    frontendUrl,
    betterAuthUrl,
    allowedOrigins,
    cookieDomain: env.COOKIE_DOMAIN?.trim() || undefined,
  };
}

export const defaults = {
  localFrontendUrl: LOCAL_FRONTEND_URL,
};
