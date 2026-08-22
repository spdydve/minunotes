import { describe, expect, it } from 'vitest';
import {
  applyCommentPermissionToFolders,
  applyFolderPermission,
  derivePermissionCeiling,
  permissionSelectionState,
} from '../src/frontend/components/api-key-access-dialog';

describe('API key folder permissions', () => {
  it('applies an individual Comment toggle only to its selected folder', () => {
    const current = new Map([
      ['folder-a', { canRead: true, canCreate: false, canEdit: false, canComment: false }],
      ['folder-b', { canRead: true, canCreate: false, canEdit: false, canComment: false }],
    ]);

    const enabled = applyFolderPermission(current, 'folder-a', 'canComment', true);
    expect(enabled.get('folder-a')).toMatchObject({ canRead: true, canComment: true });
    expect(enabled.get('folder-b')).toMatchObject({ canRead: true, canComment: false });
  });

  it('applies the bulk Comment toggle to every selected folder', () => {
    const current = new Map([
      ['folder-a', { canRead: false, canCreate: true, canEdit: false, canComment: false }],
      ['folder-b', { canRead: true, canCreate: false, canEdit: true, canComment: false }],
      ['folder-unselected', { canRead: true, canCreate: false, canEdit: false, canComment: false }],
    ]);

    const enabled = applyCommentPermissionToFolders(current, ['folder-a', 'folder-b'], true);
    expect(enabled.get('folder-a')).toEqual({ canRead: true, canCreate: true, canEdit: false, canComment: true });
    expect(enabled.get('folder-b')).toEqual({ canRead: true, canCreate: false, canEdit: true, canComment: true });
    expect(enabled.get('folder-unselected')?.canComment).toBe(false);

    const disabled = applyCommentPermissionToFolders(enabled, ['folder-a', 'folder-b'], false);
    expect(disabled.get('folder-a')).toMatchObject({ canRead: true, canComment: false });
    expect(disabled.get('folder-b')).toMatchObject({ canRead: true, canComment: false });
  });

  it('derives the persisted ceiling from restricted folder rules', () => {
    expect(
      derivePermissionCeiling([
        { canRead: true, canCreate: false, canEdit: false, canComment: true },
        { canRead: true, canCreate: false, canEdit: true, canComment: false },
      ])
    ).toEqual({ canRead: true, canCreate: false, canEdit: true, canComment: true });
  });

  it('reports mixed bulk permission state', () => {
    const permissions = [
      { canRead: true, canCreate: false, canEdit: false, canComment: true },
      { canRead: true, canCreate: false, canEdit: false, canComment: false },
    ];
    expect(permissionSelectionState(permissions, 'canComment')).toEqual({ checked: false, mixed: true });
    expect(permissionSelectionState(permissions, 'canRead')).toEqual({ checked: true, mixed: false });
  });
});
