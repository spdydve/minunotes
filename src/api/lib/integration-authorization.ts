export type AuthorizationCapability = 'read' | 'create' | 'edit' | 'comment';
export type AuthorizationAccessMode = 'all' | 'top_level' | 'specific';

export type AuthorizationCapabilities = {
  canRead: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canComment: boolean;
};

export type AuthorizationFolderRule = AuthorizationCapabilities & {
  folderId: string;
  appliesTo: 'exact' | 'subtree';
};

type FolderNode = {
  id: string;
  parentFolderId: string | null;
};

export function capabilitiesAllow(capabilities: AuthorizationCapabilities, capability: AuthorizationCapability) {
  if (capability === 'read') return capabilities.canRead;
  if (capability === 'create') return capabilities.canCreate;
  if (capability === 'edit') return capabilities.canEdit;
  return capabilities.canRead && capabilities.canComment;
}

export function isWriteCapability(capability: AuthorizationCapability) {
  return capability === 'create' || capability === 'edit' || capability === 'comment';
}

function isDescendantOrSelf(folderId: string, rootFolderId: string, byId: Map<string, FolderNode>) {
  let current = byId.get(folderId);
  const seen = new Set<string>();
  while (current) {
    if (current.id === rootFolderId) return true;
    if (!current.parentFolderId || seen.has(current.id)) return false;
    seen.add(current.id);
    current = byId.get(current.parentFolderId);
  }
  return false;
}

function folderDepth(folderId: string, byId: Map<string, FolderNode>) {
  let depth = 0;
  let current = byId.get(folderId);
  const seen = new Set<string>();
  while (current?.parentFolderId) {
    if (seen.has(current.id)) return Number.NEGATIVE_INFINITY;
    seen.add(current.id);
    depth += 1;
    current = byId.get(current.parentFolderId);
  }
  return current ? depth : Number.NEGATIVE_INFINITY;
}

export function nearestAuthorizationFolderRule(input: {
  folderId: string;
  rules: AuthorizationFolderRule[];
  byId: Map<string, FolderNode>;
}) {
  let selected: AuthorizationFolderRule | null = null;
  let selectedDepth = Number.NEGATIVE_INFINITY;

  for (const rule of input.rules) {
    const applies =
      rule.appliesTo === 'exact'
        ? rule.folderId === input.folderId
        : isDescendantOrSelf(input.folderId, rule.folderId, input.byId);
    if (!applies) continue;
    const depth = folderDepth(rule.folderId, input.byId);
    if (depth > selectedDepth || (depth === selectedDepth && rule.appliesTo === 'exact')) {
      selected = rule;
      selectedDepth = depth;
    }
  }

  return selected;
}

export function authorizationAllowsFolderCapability(input: {
  capabilities: AuthorizationCapabilities;
  accessMode: AuthorizationAccessMode;
  rules: AuthorizationFolderRule[];
  folderId: string;
  byId: Map<string, FolderNode>;
  privateFolderIds: Set<string>;
  agentReadOnlyFolderIds: Set<string>;
  capability: AuthorizationCapability;
}) {
  if (!capabilitiesAllow(input.capabilities, input.capability)) return false;
  if (!input.byId.has(input.folderId) || input.privateFolderIds.has(input.folderId)) return false;

  const rule = nearestAuthorizationFolderRule({ folderId: input.folderId, rules: input.rules, byId: input.byId });
  if (input.accessMode !== 'all' && !rule) return false;
  if (rule && !capabilitiesAllow(rule, input.capability)) return false;

  if (isWriteCapability(input.capability) && input.agentReadOnlyFolderIds.has(input.folderId)) {
    const isExactSpecificException = input.accessMode === 'specific' && rule?.appliesTo === 'exact';
    if (!isExactSpecificException) return false;
  }

  return true;
}
