import { describe, expect, it } from 'vitest';
import { getNoteEventSummary, getUpdateEventType } from '../src/api/harness/commands';

describe('getUpdateEventType', () => {
  const current = {
    title: 'Title',
    content: 'Hello',
    folderId: 'folder_a',
    isApiEditable: true,
  };

  it('classifies folder-only changes as move events', () => {
    expect(getUpdateEventType({ folderId: 'folder_b' }, current)).toBe('move');
  });

  it('classifies API editable toggles', () => {
    expect(getUpdateEventType({ isApiEditable: false }, current)).toBe('toggle_api_editable');
  });

  it('falls back to update for content changes', () => {
    expect(getUpdateEventType({ markdown: 'Updated' }, current)).toBe('update');
  });
});

describe('getNoteEventSummary', () => {
  it('builds update summaries from changed fields', () => {
    expect(getNoteEventSummary('update', { titleChanged: true, contentChanged: true })).toBe('Updated title, content');
  });

  it('builds toggle summaries', () => {
    expect(getNoteEventSummary('toggle_api_editable', { isApiEditable: true })).toBe('Enabled API editing');
    expect(getNoteEventSummary('toggle_api_editable', { isApiEditable: false })).toBe('Disabled API editing');
  });

  it('builds patch summaries', () => {
    expect(getNoteEventSummary('edit_patch', {})).toBe('Patched note content');
  });
});
