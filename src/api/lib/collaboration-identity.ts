import { createHash } from 'node:crypto';
import { getPublicSuffix } from 'tldts';

export type CollaborationIdentityType = 'user' | 'agent' | 'former';

export type CollaborationIdentity = {
  key: string;
  type: CollaborationIdentityType;
  displayName: string | null;
  maskedEmail: string | null;
  label: string;
  isCurrentUser: boolean;
};

const DANGEROUS_DISPLAY_CHARACTERS = /[\p{Cc}\p{Zl}\p{Zp}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function firstSafeGrapheme(value: string) {
  for (const { segment } of segmenter.segment(value)) {
    if (!segment.trim() || DANGEROUS_DISPLAY_CHARACTERS.test(segment)) continue;
    return segment;
  }
  return null;
}

function maskPart(value: string) {
  const first = firstSafeGrapheme(value);
  return first ? `${first}•••` : null;
}

export function publicIdentityKey(type: Exclude<CollaborationIdentityType, 'former'>, internalId: string) {
  return `${type}_${createHash('sha256').update(internalId).digest('hex').slice(0, 16)}`;
}

export function normalizeCollaborationDisplayName(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!normalized || DANGEROUS_DISPLAY_CHARACTERS.test(normalized)) return null;
  if ([...segmenter.segment(normalized)].length > 60) return null;
  return normalized;
}

export function maskCollaborationEmail(value: string | null | undefined) {
  if (!value || DANGEROUS_DISPLAY_CHARACTERS.test(value)) return 'Email hidden';
  const normalized = value.normalize('NFKC').trim();
  const separator = normalized.lastIndexOf('@');
  if (separator <= 0 || separator === normalized.length - 1) return 'Email hidden';

  const local = maskPart(normalized.slice(0, separator));
  const domain = normalized.slice(separator + 1).toLocaleLowerCase('en-US');
  const suffix = getPublicSuffix(domain, { allowPrivateDomains: true });
  if (!local || !suffix || domain === suffix) return 'Email hidden';

  const labels = domain.split('.');
  const suffixLabels = suffix.split('.');
  if (labels.length <= suffixLabels.length) return 'Email hidden';
  const maskedDomain = labels
    .slice(0, -suffixLabels.length)
    .map(maskPart)
    .filter((label): label is string => Boolean(label));
  if (maskedDomain.length !== labels.length - suffixLabels.length) return 'Email hidden';

  return `${local}@${[...maskedDomain, ...suffixLabels].join('.')}`;
}

export function serializeCollaborationUserIdentity(input: {
  id: string;
  name: string | null | undefined;
  email: string | null | undefined;
  currentUserId?: string | null;
}): CollaborationIdentity {
  const displayName = normalizeCollaborationDisplayName(input.name);
  const maskedEmail = maskCollaborationEmail(input.email);
  const isCurrentUser = input.id === input.currentUserId;
  return {
    key: publicIdentityKey('user', input.id),
    type: 'user',
    displayName,
    maskedEmail,
    label: isCurrentUser ? 'You' : (displayName ?? maskedEmail),
    isCurrentUser,
  };
}
