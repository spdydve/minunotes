import { describe, expect, it } from 'vitest';
import type { CollaborationIdentity } from '../src/frontend/lib/api';
import {
  AVATAR_PALETTE_SIZE,
  AVATAR_PALETTE_VERSION,
  getAvatarInitials,
  getAvatarPaletteIndex,
} from '../src/frontend/lib/avatar';

function identity(overrides: Partial<CollaborationIdentity> = {}): CollaborationIdentity {
  return {
    key: 'user_stableidentity',
    type: 'user',
    displayName: 'Taylor Kennedy',
    maskedEmail: 't•••@e•••.com',
    label: 'Taylor Kennedy',
    isCurrentUser: false,
    ...overrides,
  };
}

describe('avatar presentation', () => {
  it('uses a fixed versioned palette and stable opaque-key assignment', () => {
    expect(AVATAR_PALETTE_VERSION).toBe('avatar-v1');
    expect(AVATAR_PALETTE_SIZE).toBe(16);
    const index = getAvatarPaletteIndex('user_stableidentity');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(AVATAR_PALETTE_SIZE);
    expect(getAvatarPaletteIndex('user_stableidentity')).toBe(index);
  });

  it('does not change color when display identity changes', () => {
    const before = identity();
    const after = identity({ displayName: 'Renamed Person', maskedEmail: 'r•••@n•••.net' });
    expect(getAvatarPaletteIndex(before.key)).toBe(getAvatarPaletteIndex(after.key));
  });

  it.each([
    [identity(), 'TK'],
    [identity({ displayName: 'Taylor' }), 'TA'],
    [identity({ displayName: '李 小龍' }), '李小'],
    [identity({ displayName: '🌱 Taylor' }), 'TA'],
    [identity({ displayName: null, maskedEmail: 'd•••@e•••.com' }), 'D'],
  ])('derives grapheme-safe initials', (value, expected) => {
    expect(getAvatarInitials(value)).toBe(expected);
  });

  it('uses icons rather than initials for non-human and unsafe fallback identities', () => {
    expect(getAvatarInitials(identity({ type: 'agent' }))).toBeNull();
    expect(getAvatarInitials(identity({ type: 'former', displayName: null, maskedEmail: null }))).toBeNull();
    expect(getAvatarInitials(identity({ displayName: '🌱', maskedEmail: '•••@e•••.com' }))).toBeNull();
  });
});
