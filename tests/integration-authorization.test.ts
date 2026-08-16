import { describe, expect, it } from 'vitest';
import {
  type AuthorizationCapabilities,
  type AuthorizationFolderRule,
  authorizationAllowsFolderCapability,
  nearestAuthorizationFolderRule,
} from '../src/api/lib/integration-authorization';

const full: AuthorizationCapabilities = {
  canRead: true,
  canCreate: true,
  canEdit: true,
  canComment: true,
};

const folders = new Map([
  ['reference', { id: 'reference', parentFolderId: null }],
  ['reference-child', { id: 'reference-child', parentFolderId: 'reference' }],
  ['inbox', { id: 'inbox', parentFolderId: null }],
  ['open-area', { id: 'open-area', parentFolderId: null }],
  ['sandbox', { id: 'sandbox', parentFolderId: 'open-area' }],
]);

function rule(
  folderId: string,
  capabilities: Partial<AuthorizationCapabilities>,
  appliesTo: 'exact' | 'subtree' = 'exact'
): AuthorizationFolderRule {
  return { folderId, appliesTo, ...full, ...capabilities };
}

function allows(input: {
  capability: 'read' | 'create' | 'edit' | 'comment';
  folderId: string;
  rules?: AuthorizationFolderRule[];
  accessMode?: 'all' | 'top_level' | 'specific';
  capabilities?: AuthorizationCapabilities;
  privateFolderIds?: Set<string>;
  agentReadOnlyFolderIds?: Set<string>;
}) {
  return authorizationAllowsFolderCapability({
    capabilities: input.capabilities ?? full,
    accessMode: input.accessMode ?? 'all',
    rules: input.rules ?? [],
    folderId: input.folderId,
    byId: folders,
    privateFolderIds: input.privateFolderIds ?? new Set(),
    agentReadOnlyFolderIds: input.agentReadOnlyFolderIds ?? new Set(),
    capability: input.capability,
  });
}

describe('integration authorization folder rules', () => {
  it('uses the global capability ceiling when an all-access authorization has no folder rule', () => {
    expect(allows({ folderId: 'inbox', capability: 'edit' })).toBe(true);
    expect(allows({ folderId: 'inbox', capability: 'edit', capabilities: { ...full, canEdit: false } })).toBe(false);
  });

  it('supports read-only, read/create, and unrestricted folders under one global authorization', () => {
    const rules = [
      rule('reference', { canCreate: false, canEdit: false, canComment: false }),
      rule('inbox', { canEdit: false, canComment: false }),
    ];

    expect(allows({ folderId: 'reference', capability: 'read', rules })).toBe(true);
    expect(allows({ folderId: 'reference', capability: 'create', rules })).toBe(false);
    expect(allows({ folderId: 'inbox', capability: 'create', rules })).toBe(true);
    expect(allows({ folderId: 'inbox', capability: 'edit', rules })).toBe(false);
    expect(allows({ folderId: 'open-area', capability: 'edit', rules })).toBe(true);
  });

  it('uses the nearest subtree rule and permits a more specific child restriction', () => {
    const rules = [
      rule('open-area', { canEdit: true }, 'subtree'),
      rule('sandbox', { canCreate: false, canEdit: false, canComment: false }, 'subtree'),
    ];

    expect(nearestAuthorizationFolderRule({ folderId: 'sandbox', rules, byId: folders })?.folderId).toBe('sandbox');
    expect(allows({ folderId: 'sandbox', capability: 'edit', rules })).toBe(false);
  });

  it('requires a matching exact or subtree rule for non-global scopes', () => {
    const subtree = [rule('reference', {}, 'subtree')];
    expect(allows({ folderId: 'reference-child', capability: 'read', accessMode: 'top_level', rules: subtree })).toBe(
      true
    );
    expect(allows({ folderId: 'inbox', capability: 'read', accessMode: 'top_level', rules: subtree })).toBe(false);

    const exact = [rule('reference', {}, 'exact')];
    expect(allows({ folderId: 'reference', capability: 'read', accessMode: 'specific', rules: exact })).toBe(true);
    expect(allows({ folderId: 'reference-child', capability: 'read', accessMode: 'specific', rules: exact })).toBe(
      false
    );
  });

  it('never lets folder rules exceed the global ceiling or expose private folders', () => {
    const rules = [rule('reference', { canEdit: true })];
    expect(
      allows({
        folderId: 'reference',
        capability: 'edit',
        rules,
        capabilities: { ...full, canEdit: false },
      })
    ).toBe(false);
    expect(allows({ folderId: 'reference', capability: 'read', rules, privateFolderIds: new Set(['reference']) })).toBe(
      false
    );
  });

  it('preserves the existing explicit-specific exception to agent read-only inheritance', () => {
    const rules = [rule('reference', {}, 'exact')];
    expect(
      allows({
        folderId: 'reference',
        capability: 'edit',
        accessMode: 'specific',
        rules,
        agentReadOnlyFolderIds: new Set(['reference']),
      })
    ).toBe(true);
    expect(
      allows({
        folderId: 'reference',
        capability: 'edit',
        accessMode: 'all',
        rules,
        agentReadOnlyFolderIds: new Set(['reference']),
      })
    ).toBe(false);
  });
});
