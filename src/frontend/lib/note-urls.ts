import type { WikiLinkPasteResolver } from '@dpklabs/minueditor';

const NOTE_PATH_PATTERN = /^\/notes\/(note_[a-zA-Z0-9_-]+)\/?$/;

function parseHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
    if (url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function createInternalNoteUrlPasteResolver(options: {
  browserOrigin: string;
  additionalOrigins?: readonly string[];
}): WikiLinkPasteResolver {
  const allowedOrigins = new Set<string>();
  for (const candidate of [options.browserOrigin, ...(options.additionalOrigins ?? [])]) {
    const origin = parseHttpOrigin(candidate.trim());
    if (origin) allowedOrigins.add(origin);
  }

  return (sourceUrl) => {
    let url: URL;
    try {
      url = new URL(sourceUrl);
    } catch {
      return null;
    }

    if (!allowedOrigins.has(url.origin) || url.username || url.password || url.search || url.hash) return null;

    const match = NOTE_PATH_PATTERN.exec(url.pathname);
    return match ? { target: match[1] } : null;
  };
}

export function createConfiguredInternalNoteUrlPasteResolver() {
  const browserOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const additionalOrigins = String(import.meta.env.VITE_INTERNAL_NOTE_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return createInternalNoteUrlPasteResolver({ browserOrigin, additionalOrigins });
}
