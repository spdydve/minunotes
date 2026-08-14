const LOCAL_FRONTEND_URL = 'http://localhost:5173';

type StageName = string | undefined;

type StageUrls = {
  frontendUrl: string;
  apiUrl: string;
  betterAuthUrl: string;
};

function ensureUrl(value: string, name: string) {
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`Invalid ${name}: ${value}`);
  }
}

function normalizeCookieDomain(value?: string) {
  const normalized = value?.trim().replace(/^\.+/, '');
  return normalized || undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${name}: expected a positive integer`);
  return parsed;
}

function parseEmailProtectionMode(value?: string): 'off' | 'observe' | 'enforce' {
  const mode = value?.trim() || 'off';
  if (mode === 'off' || mode === 'observe' || mode === 'enforce') return mode;
  throw new Error(`Invalid EMAIL_PROTECTION_MODE: ${value}`);
}

export function parseAllowedOrigins(value?: string, fallback = LOCAL_FRONTEND_URL) {
  const raw = value?.trim() ? value : fallback;
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => ensureUrl(origin, 'API_ALLOWED_ORIGINS'));

  if (!origins.includes(LOCAL_FRONTEND_URL)) origins.push(LOCAL_FRONTEND_URL);
  return Array.from(new Set(origins.map((origin) => new URL(origin).origin)));
}

export function getStageUrls(stage: StageName, env = process.env): StageUrls {
  const normalizedStage = stage ?? 'local';
  const isLocal = normalizedStage === 'local' || normalizedStage === 'davidkennedy';
  const defaultFrontendUrl = isLocal ? LOCAL_FRONTEND_URL : 'https://notes.minusculelabs.com';
  const frontendUrl = ensureUrl(env.FRONTEND_URL ?? defaultFrontendUrl, 'FRONTEND_URL');
  const apiUrl = ensureUrl(env.API_URL ?? (isLocal ? frontendUrl : 'https://api.notes.minusculelabs.com'), 'API_URL');
  const betterAuthUrl = ensureUrl(env.BETTER_AUTH_URL ?? `${apiUrl}/internal/auth`, 'BETTER_AUTH_URL');

  return { frontendUrl, apiUrl, betterAuthUrl };
}

export type AttachmentStorageDriver = 'filesystem' | 's3' | 's3-compatible' | 'uploadthing' | 'cloudinary' | 'imgix';

function parseAttachmentStorageDriver(value?: string): AttachmentStorageDriver {
  const driver = (value?.trim() || 'filesystem') as AttachmentStorageDriver;
  if (['filesystem', 's3', 's3-compatible', 'uploadthing', 'cloudinary', 'imgix'].includes(driver)) return driver;
  throw new Error(`Invalid ATTACHMENT_STORAGE_DRIVER: ${value}`);
}

export function getApiRuntimeConfig(env = process.env) {
  const frontendUrl = ensureUrl(env.FRONTEND_URL ?? LOCAL_FRONTEND_URL, 'FRONTEND_URL');
  const apiUrl = ensureUrl(env.API_URL ?? frontendUrl, 'API_URL');
  const betterAuthUrl = ensureUrl(env.BETTER_AUTH_URL ?? `${apiUrl}/internal/auth`, 'BETTER_AUTH_URL');
  const allowedOrigins = parseAllowedOrigins(env.API_ALLOWED_ORIGINS, frontendUrl);

  return {
    frontendUrl,
    apiUrl,
    betterAuthUrl,
    allowedOrigins,
    cookieDomain: normalizeCookieDomain(env.COOKIE_DOMAIN),
    cookiePrefix: env.COOKIE_PREFIX?.trim() || 'minunotes',
    allowedLoginEmails: (env.ALLOWED_LOGIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    ses: {
      fromEmail: env.SES_FROM_EMAIL?.trim() || undefined,
      region: env.SES_REGION?.trim() || env.AWS_REGION?.trim() || 'us-east-1',
    },
    emailProtection: {
      mode: parseEmailProtectionMode(env.EMAIL_PROTECTION_MODE),
      hashSecret: env.EMAIL_PROTECTION_HASH_SECRET?.trim() || env.BETTER_AUTH_SECRET?.trim() || '',
      bypassEmails: (env.EMAIL_PROTECTION_BYPASS_EMAILS ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
      sesTimeoutMs: parsePositiveInteger(env.EMAIL_PROTECTION_SES_TIMEOUT_MS, 2_000, 'EMAIL_PROTECTION_SES_TIMEOUT_MS'),
      emailRateMax: parsePositiveInteger(env.EMAIL_PROTECTION_EMAIL_RATE_MAX, 3, 'EMAIL_PROTECTION_EMAIL_RATE_MAX'),
      clientRateMax: parsePositiveInteger(env.EMAIL_PROTECTION_CLIENT_RATE_MAX, 10, 'EMAIL_PROTECTION_CLIENT_RATE_MAX'),
    },
    attachmentStorage: {
      driver: parseAttachmentStorageDriver(env.ATTACHMENT_STORAGE_DRIVER),
      filesystemPath: env.ATTACHMENT_STORAGE_PATH?.trim() || '.notes-attachments',
      publicBaseUrl: env.ATTACHMENT_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') || undefined,
      bucket: env.ATTACHMENT_BUCKET?.trim() || undefined,
      region: env.ATTACHMENT_REGION?.trim() || env.AWS_REGION?.trim() || undefined,
      endpoint: env.ATTACHMENT_ENDPOINT?.trim() || undefined,
      forcePathStyle: env.ATTACHMENT_FORCE_PATH_STYLE === 'true',
    },
  };
}

export const defaults = {
  localFrontendUrl: LOCAL_FRONTEND_URL,
};
