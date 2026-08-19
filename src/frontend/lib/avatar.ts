import type { CollaborationIdentity } from './api';

export const AVATAR_PALETTE_VERSION = 'avatar-v1';
export const AVATAR_PALETTE_SIZE = 16;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const SAFE_INITIAL = /[\p{L}\p{N}]/u;

export function hashAvatarIdentityKey(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}

export function getAvatarPaletteIndex(identityKey: string) {
  return hashAvatarIdentityKey(`${AVATAR_PALETTE_VERSION}:${identityKey}`) % AVATAR_PALETTE_SIZE;
}

function safeGraphemes(value: string) {
  return [...graphemeSegmenter.segment(value)]
    .map(({ segment }) => segment)
    .filter((segment) => SAFE_INITIAL.test(segment));
}

export function getAvatarInitials(identity: Pick<CollaborationIdentity, 'type' | 'displayName' | 'maskedEmail'>) {
  if (identity.type !== 'user') return null;
  const displayName = identity.displayName?.trim();
  if (displayName) {
    const words = displayName
      .split(/\s+/u)
      .map(safeGraphemes)
      .filter((word) => word.length > 0);
    if (words.length === 1) return words[0]?.slice(0, 2).join('').toLocaleUpperCase() || null;
    if (words.length > 1) return `${words[0]?.[0] ?? ''}${words.at(-1)?.[0] ?? ''}`.toLocaleUpperCase() || null;
  }

  const localPart = identity.maskedEmail?.split('@')[0] ?? '';
  return safeGraphemes(localPart)[0]?.toLocaleUpperCase() ?? null;
}
