const INTERNAL_COLLABORATION_FIELDS = [
  'userId',
  'ownerUserId',
  'granteeUserId',
  'createdByUserId',
  'resourceOwnerUserId',
  'actorUserId',
  'authorizationId',
  'credentialId',
  'updatedByActorId',
  'updatedByActorUid',
  'actorId',
  'storageKey',
  'hiddenCanvasLinkCount',
] as const;

type InternalCollaborationField = (typeof INTERNAL_COLLABORATION_FIELDS)[number];

export function omitCollaborationInternalFields<T extends object>(value: T): Omit<T, InternalCollaborationField> {
  const safe = { ...value } as Record<string, unknown>;
  for (const field of INTERNAL_COLLABORATION_FIELDS) delete safe[field];
  return safe as Omit<T, InternalCollaborationField>;
}
