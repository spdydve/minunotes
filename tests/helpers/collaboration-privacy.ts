import { expect } from 'vitest';

const FORBIDDEN_ID_FIELDS = new Set([
  'userId',
  'ownerUserId',
  'granteeUserId',
  'createdByUserId',
  'resourceOwnerUserId',
  'actorUserId',
  'authorizationId',
  'credentialId',
]);

export function expectPrivacySafeCollaborationDto(
  value: unknown,
  options: { forbiddenValues?: string[]; allowNonNullFields?: string[] } = {}
) {
  const forbiddenValues = options.forbiddenValues?.filter(Boolean) ?? [];
  const allowedFields = new Set(options.allowNonNullFields ?? []);

  function visit(current: unknown, path: string): void {
    if (typeof current === 'string') {
      for (const forbiddenValue of forbiddenValues) {
        expect(current, `${path} must not expose ${forbiddenValue}`).not.toContain(forbiddenValue);
      }
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => {
        visit(item, `${path}[${index}]`);
      });
      return;
    }
    if (!current || typeof current !== 'object') return;

    for (const [key, child] of Object.entries(current)) {
      const childPath = path ? `${path}.${key}` : key;
      if (FORBIDDEN_ID_FIELDS.has(key) && !allowedFields.has(key)) {
        expect(child, `${childPath} must be omitted or null`).toBeNull();
      }
      visit(child, childPath);
    }
  }

  visit(value, 'response');
}
