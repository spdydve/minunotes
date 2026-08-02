import { describe, expect, it } from 'vitest';
import { searchShortcutLabel } from '../src/frontend/components/search-dialog';
import { internalNoteLinkTarget } from '../src/frontend/lib/link-policy';
import {
  buildAppNavigationModel,
  type NavigationFolder,
  noteIdFromNavigationPath,
} from '../src/frontend/lib/navigation';

const folders: NavigationFolder[] = [
  { id: 'folder_root', parentFolderId: null, title: 'Projects' },
  { id: 'folder_child', parentFolderId: 'folder_root', title: 'Research' },
];

function labels(pathname: string, note?: Parameters<typeof buildAppNavigationModel>[0]['note']) {
  return buildAppNavigationModel({ pathname, folders, note }).breadcrumbs.map((item) => item.label);
}

describe('app navigation model', () => {
  it('identifies note routes including activity', () => {
    expect(noteIdFromNavigationPath('/notes/note_123')).toBe('note_123');
    expect(noteIdFromNavigationPath('/notes/note_123/activity')).toBe('note_123');
    expect(noteIdFromNavigationPath('/folders/folder_root')).toBeNull();
  });

  it('builds nested folder breadcrumbs', () => {
    const model = buildAppNavigationModel({ pathname: '/folders/folder_child', folders });
    expect(model.activeFolderId).toBe('folder_child');
    expect(model.mobileTitle).toBe('Research');
    expect(model.parent?.label).toBe('Projects');
    expect(model.breadcrumbs.map((item) => item.label)).toEqual(['Home', 'Projects', 'Research']);
  });

  it('adds folder settings and template creation context', () => {
    expect(labels('/folders/folder_child/settings')).toEqual(['Home', 'Projects', 'Research', 'Settings']);
    expect(labels('/folders/folder_child/new-from-template')).toEqual([
      'Home',
      'Projects',
      'Research',
      'New from template',
    ]);
  });

  it('builds note and activity context from the note folder', () => {
    const note = { id: 'note_1', folderId: 'folder_child', title: 'Findings', type: 'note' as const };
    expect(labels('/notes/note_1', note)).toEqual(['Home', 'Projects', 'Research', 'Findings']);
    const activity = buildAppNavigationModel({ pathname: '/notes/note_1/activity', folders, note });
    expect(activity.breadcrumbs.map((item) => item.label)).toEqual([
      'Home',
      'Projects',
      'Research',
      'Findings',
      'Activity',
    ]);
    expect(activity.parent?.label).toBe('Findings');
  });

  it('uses Templates as the structural parent for templates', () => {
    const note = { id: 'note_template', folderId: 'folder_root', title: 'Weekly plan', type: 'template' as const };
    const model = buildAppNavigationModel({ pathname: '/notes/note_template', folders, note });
    expect(model.section).toBe('templates');
    expect(model.activeFolderId).toBeNull();
    expect(model.parent?.label).toBe('Templates');
    expect(model.breadcrumbs.map((item) => item.label)).toEqual(['Templates', 'Weekly plan']);
  });

  it('falls back safely while note context is loading', () => {
    const model = buildAppNavigationModel({ pathname: '/notes/note_missing', folders, note: null });
    expect(model.breadcrumbs.map((item) => item.label)).toEqual(['Home', 'Note']);
    expect(model.parent?.label).toBe('Home');
  });

  it('models top-level settings and resources', () => {
    expect(labels('/settings/api-access')).toEqual(['Home', 'API Access']);
    expect(labels('/resources/wikilinks-backlinks')).toEqual(['Home', 'Resources', 'Wikilinks Backlinks']);
  });
});

describe('search shortcut presentation', () => {
  it('uses the Command symbol on Apple platforms and Ctrl elsewhere', () => {
    expect(searchShortcutLabel('MacIntel')).toBe('⌘K');
    expect(searchShortcutLabel('iPhone')).toBe('⌘K');
    expect(searchShortcutLabel('Win32')).toBe('Ctrl+K');
    expect(searchShortcutLabel('Linux x86_64')).toBe('Ctrl+K');
  });
});

describe('internal note link policy', () => {
  it('keeps wikilinks in the current tab and canvas links in a new tab', () => {
    expect(internalNoteLinkTarget('wikilink')).toBe('current-tab');
    expect(internalNoteLinkTarget('canvas-node')).toBe('new-tab');
  });
});
