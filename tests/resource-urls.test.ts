import { describe, expect, it } from 'vitest';
import { createMinuNotesResourceUrlResolver } from '../src/frontend/lib/resource-urls';

const resolver = createMinuNotesResourceUrlResolver({
  apiUrl: 'https://api.notes.minusculelabs.com/internal',
  browserOrigin: 'https://notes.minusculelabs.com',
  legacyApiOrigins: ['https://api.notes.dpklabs.com'],
});

describe('MinuNotes resource URL resolver', () => {
  it('resolves canonical attachment paths against the configured API origin', () => {
    expect(resolver('/internal/attachments/att_123/content', { kind: 'image' })).toBe(
      'https://api.notes.minusculelabs.com/internal/attachments/att_123/content'
    );
  });

  it('preserves attachment query strings and fragments', () => {
    expect(resolver('/internal/attachments/att_123/content?download=1#preview', { kind: 'link' })).toBe(
      'https://api.notes.minusculelabs.com/internal/attachments/att_123/content?download=1#preview'
    );
  });

  it('moves approved legacy attachment URLs to the configured API origin', () => {
    expect(resolver('https://api.notes.dpklabs.com/internal/attachments/att_legacy/content', { kind: 'image' })).toBe(
      'https://api.notes.minusculelabs.com/internal/attachments/att_legacy/content'
    );
  });

  it('leaves current absolute attachment URLs stable', () => {
    const current = 'https://api.notes.minusculelabs.com/internal/attachments/att_current/content';
    expect(resolver(current, { kind: 'link' })).toBe(current);
  });

  it.each([
    'https://example.com/internal/attachments/att_external/content',
    '//api.notes.dpklabs.com/internal/attachments/att_protocol_relative/content',
    '/internal/attachments/not-an-attachment/content',
    '/notes/note_123',
    './attachments/att_123/content',
    'mailto:person@example.com',
  ])('leaves unrelated or unapproved resources unchanged: %s', (source) => {
    expect(resolver(source, { kind: 'link' })).toBe(source);
  });

  it('supports same-origin local API paths', () => {
    const localResolver = createMinuNotesResourceUrlResolver({
      apiUrl: '/internal',
      browserOrigin: 'http://localhost:5173',
    });

    expect(localResolver('/internal/attachments/att_local/content', { kind: 'image' })).toBe(
      'http://localhost:5173/internal/attachments/att_local/content'
    );
  });
});
