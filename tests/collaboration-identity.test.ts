import { describe, expect, it } from 'vitest';
import {
  maskCollaborationEmail,
  normalizeCollaborationDisplayName,
  publicIdentityKey,
  serializeCollaborationUserIdentity,
} from '../src/api/lib/collaboration-identity';

describe('collaboration identity', () => {
  it('creates stable opaque keys without exposing internal ids', () => {
    const first = publicIdentityKey('user', 'internal-user-id');
    const second = publicIdentityKey('user', 'internal-user-id');

    expect(first).toBe(second);
    expect(first).toMatch(/^user_[a-f0-9]{16}$/);
    expect(first).not.toContain('internal-user-id');
    expect(publicIdentityKey('agent', 'internal-user-id')).toMatch(/^agent_[a-f0-9]{16}$/);
  });

  it.each([
    ['david@example.com', 'd•••@e•••.com'],
    ['+a@example.com', '+•••@e•••.com'],
    ['person@mail.example.org', 'p•••@m•••.e•••.org'],
    ['name@example.co.uk', 'n•••@e•••.co.uk'],
    ['person@project.github.io', 'p•••@p•••.github.io'],
    ['A@EXAMPLE.COM', 'A•••@e•••.com'],
  ])('masks %s without revealing its original length', (email, expected) => {
    expect(maskCollaborationEmail(email)).toBe(expected);
  });

  it.each([
    null,
    '',
    'not-an-email',
    '@example.com',
    'person@localhost',
    'person@example.com\u202e',
  ])('fails closed for malformed or unsafe email %s', (email) => {
    expect(maskCollaborationEmail(email)).toBe('Email hidden');
  });

  it('normalizes safe display names and rejects unsafe or oversized names', () => {
    expect(normalizeCollaborationDisplayName('  Taylor   Kennedy  ')).toBe('Taylor Kennedy');
    expect(normalizeCollaborationDisplayName('李 小龍')).toBe('李 小龍');
    expect(normalizeCollaborationDisplayName('Taylor\u202eKennedy')).toBeNull();
    expect(normalizeCollaborationDisplayName('a'.repeat(61))).toBeNull();
    expect(normalizeCollaborationDisplayName('   ')).toBeNull();
  });

  it('uses display name, masked email, and current-user labels without raw identity fields', () => {
    expect(
      serializeCollaborationUserIdentity({
        id: 'owner-id',
        name: 'Owner Name',
        email: 'owner@example.com',
        currentUserId: 'viewer-id',
      })
    ).toEqual({
      key: publicIdentityKey('user', 'owner-id'),
      type: 'user',
      displayName: 'Owner Name',
      maskedEmail: 'o•••@e•••.com',
      label: 'Owner Name',
      isCurrentUser: false,
    });

    expect(
      serializeCollaborationUserIdentity({
        id: 'email-only-id',
        name: '   ',
        email: 'person@example.com',
        currentUserId: 'viewer-id',
      })
    ).toMatchObject({ displayName: null, maskedEmail: 'p•••@e•••.com', label: 'p•••@e•••.com' });

    expect(
      serializeCollaborationUserIdentity({
        id: 'viewer-id',
        name: '',
        email: 'viewer@example.com',
        currentUserId: 'viewer-id',
      })
    ).toMatchObject({ label: 'You', isCurrentUser: true });
  });
});
