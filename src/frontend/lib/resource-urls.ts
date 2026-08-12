import type { ResourceUrlResolver } from '@dpklabs/minueditor';

const ATTACHMENT_PATH_PATTERN = /^\/internal\/attachments\/att_[a-zA-Z0-9_-]+\/content$/;
const DEFAULT_BROWSER_ORIGIN = 'http://localhost';

export type MinuNotesResourceUrlOptions = {
  apiUrl: string;
  browserOrigin?: string;
  legacyApiOrigins?: string[];
};

function normalizeOrigin(value: string) {
  return new URL(value).origin;
}

function parseAppAttachmentPath(source: string, allowedAbsoluteOrigins: Set<string>) {
  if (source.startsWith('/') && !source.startsWith('//')) {
    const parsed = new URL(source, DEFAULT_BROWSER_ORIGIN);
    return ATTACHMENT_PATH_PATTERN.test(parsed.pathname) ? `${parsed.pathname}${parsed.search}${parsed.hash}` : null;
  }

  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return null;
  }
  if (!allowedAbsoluteOrigins.has(parsed.origin) || !ATTACHMENT_PATH_PATTERN.test(parsed.pathname)) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function createMinuNotesResourceUrlResolver({
  apiUrl,
  browserOrigin = DEFAULT_BROWSER_ORIGIN,
  legacyApiOrigins = [],
}: MinuNotesResourceUrlOptions): ResourceUrlResolver {
  const configuredApiUrl = new URL(apiUrl, browserOrigin);
  const allowedAbsoluteOrigins = new Set([
    configuredApiUrl.origin,
    ...legacyApiOrigins.map((origin) => normalizeOrigin(origin)),
  ]);

  return (source) => {
    const attachmentPath = parseAppAttachmentPath(source, allowedAbsoluteOrigins);
    return attachmentPath ? new URL(attachmentPath, configuredApiUrl.origin).toString() : source;
  };
}

const browserOrigin = typeof window === 'undefined' ? DEFAULT_BROWSER_ORIGIN : window.location.origin;
const configuredApiUrl = (import.meta.env.VITE_API_URL ?? '/internal').replace(/\/$/, '');
const legacyApiOrigins = String(import.meta.env.VITE_LEGACY_ATTACHMENT_ORIGINS ?? '')
  .split(',')
  .map((origin: string) => origin.trim())
  .filter(Boolean);

export const minuNotesResourceUrlResolver = createMinuNotesResourceUrlResolver({
  apiUrl: configuredApiUrl,
  browserOrigin,
  legacyApiOrigins,
});
