import { and, desc, eq, isNull } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { db } from '../db/client';
import { type ApiKey, apiKeys, authorizationFolderRules, integrationAuthorizations } from '../db/schema';
import { generateApiKey, hashApiKey } from '../lib/api-keys';
import type { auth } from '../lib/auth';
import { filterSelectablePermissionRows } from '../lib/folder-access';
import { createId } from '../lib/id';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  apiKey: ApiKey | null;
};

type PermissionInput = {
  folderId?: string;
  canRead?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canComment?: boolean;
  appliesTo?: 'exact' | 'subtree';
};
type AccessMode = 'all' | 'top_level' | 'specific';

export const apiKeyRoutes = new Hono<{ Variables: Variables }>();

function getUser(c: Context<{ Variables: Variables }>) {
  return c.get('user');
}

function parseAccessMode(value: unknown): AccessMode | undefined {
  if (value === 'selected') return 'specific';
  return value === 'specific' || value === 'top_level' || value === 'all' ? value : undefined;
}

function permissionValue(
  body: { canRead?: boolean; canCreate?: boolean; canEdit?: boolean; canComment?: boolean } | null | undefined
) {
  return {
    canRead: body?.canRead ?? true,
    canCreate: body?.canCreate ?? false,
    canEdit: body?.canEdit ?? false,
    canComment: body?.canComment ?? false,
  };
}

function ruleRowsFromFolders(input: {
  authorizationId: string;
  userId: string;
  permissions: PermissionInput[];
  canRead: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canComment: boolean;
  canCreateFolders: boolean;
  accessMode: AccessMode;
}) {
  return input.permissions.flatMap((permission) =>
    permission.folderId
      ? [
          {
            id: createId('auth_rule'),
            authorizationId: input.authorizationId,
            userId: input.userId,
            folderId: permission.folderId,
            canRead: input.canRead && (permission.canRead ?? input.canRead),
            canCreate: input.canCreate && (permission.canCreate ?? input.canCreate),
            canEdit: input.canEdit && (permission.canEdit ?? input.canEdit),
            canComment: input.canComment && (permission.canComment ?? input.canComment),
            canCreateFolders: input.canCreateFolders,
            appliesTo:
              input.accessMode === 'top_level'
                ? 'subtree'
                : input.accessMode === 'specific'
                  ? 'exact'
                  : (permission.appliesTo ?? 'exact'),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]
      : []
  );
}

function apiPermission(rule: typeof authorizationFolderRules.$inferSelect) {
  return { ...rule, apiKeyId: rule.authorizationId };
}

apiKeyRoutes.get('/', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const keys = await db
    .select({ credential: apiKeys, authorization: integrationAuthorizations })
    .from(apiKeys)
    .innerJoin(integrationAuthorizations, eq(apiKeys.authorizationId, integrationAuthorizations.id))
    .where(eq(integrationAuthorizations.userId, user.id))
    .orderBy(desc(integrationAuthorizations.createdAt));
  const permissions = await db
    .select()
    .from(authorizationFolderRules)
    .where(eq(authorizationFolderRules.userId, user.id));

  return c.json({
    keys: keys.map(({ credential, authorization }) => ({
      ...credential,
      ...authorization,
      permissions: permissions.filter((rule) => rule.authorizationId === authorization.id).map(apiPermission),
    })),
  });
});

apiKeyRoutes.post('/', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    accessMode?: AccessMode | 'selected';
    canCreateFolders?: boolean;
    canRead?: boolean;
    canCreate?: boolean;
    canEdit?: boolean;
    canComment?: boolean;
    permissions?: PermissionInput[];
  } | null;
  const name = body?.name?.trim();
  if (!name) return c.json({ error: 'API key name is required' }, 400);

  const accessMode = parseAccessMode(body?.accessMode) ?? 'all';
  const capabilities = permissionValue(body);
  if (capabilities.canComment && !capabilities.canRead)
    return c.json({ error: 'Review comments permission requires read permission' }, 400);

  const { key, uid } = generateApiKey();
  const { hash, salt } = hashApiKey(key);
  const id = createId('agent_key');
  const now = new Date();
  const authorization = {
    id,
    userId: user.id,
    accessMode,
    canCreateFolders: body?.canCreateFolders ?? false,
    ...capabilities,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    revokedAt: null,
  };
  const credential = {
    id,
    userId: user.id,
    authorizationId: id,
    name,
    uid,
    hash,
    salt,
    createdAt: now,
    updatedAt: now,
  };
  const requestedPermissions = await filterSelectablePermissionRows({
    userId: user.id,
    accessMode,
    permissions: body?.permissions ?? [],
  });
  const rules = ruleRowsFromFolders({
    authorizationId: id,
    userId: user.id,
    permissions: requestedPermissions,
    ...capabilities,
    canCreateFolders: authorization.canCreateFolders,
    accessMode,
  });

  await db.transaction(async (tx) => {
    await tx.insert(integrationAuthorizations).values(authorization);
    await tx.insert(apiKeys).values(credential);
    if (rules.length > 0)
      await tx
        .insert(authorizationFolderRules)
        .values(rules)
        .onConflictDoNothing({
          target: [authorizationFolderRules.authorizationId, authorizationFolderRules.folderId],
        });
  });

  return c.json(
    {
      key,
      apiKey: {
        ...credential,
        ...authorization,
        permissions: rules.map(apiPermission),
      },
    },
    201
  );
});

apiKeyRoutes.patch('/:keyId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    accessMode?: AccessMode | 'selected';
    canCreateFolders?: boolean;
    canRead?: boolean;
    canCreate?: boolean;
    canEdit?: boolean;
    canComment?: boolean;
    permissions?: PermissionInput[];
  } | null;
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);
  const name = body.name?.trim();
  if (body.name !== undefined && !name) return c.json({ error: 'API key name is required' }, 400);

  const keyId = c.req.param('keyId');
  const [existing] = await db
    .select({ credential: apiKeys, authorization: integrationAuthorizations })
    .from(apiKeys)
    .innerJoin(integrationAuthorizations, eq(apiKeys.authorizationId, integrationAuthorizations.id))
    .where(
      and(
        eq(apiKeys.id, keyId),
        eq(integrationAuthorizations.userId, user.id),
        isNull(integrationAuthorizations.revokedAt)
      )
    )
    .limit(1);
  if (!existing) return c.json({ error: 'API key not found' }, 404);

  const accessMode = parseAccessMode(body.accessMode);
  const nextCapabilities = {
    canRead: body.canRead ?? existing.authorization.canRead,
    canCreate: body.canCreate ?? existing.authorization.canCreate,
    canEdit: body.canEdit ?? existing.authorization.canEdit,
    canComment: body.canComment ?? existing.authorization.canComment,
  };
  if (nextCapabilities.canComment && !nextCapabilities.canRead)
    return c.json({ error: 'Review comments permission requires read permission' }, 400);

  const shouldUpdateAuthorization =
    body.canCreateFolders !== undefined ||
    accessMode !== undefined ||
    body.canRead !== undefined ||
    body.canCreate !== undefined ||
    body.canEdit !== undefined ||
    body.canComment !== undefined;
  const shouldReplaceRules =
    body.permissions !== undefined ||
    accessMode === 'all' ||
    body.canRead !== undefined ||
    body.canCreate !== undefined ||
    body.canEdit !== undefined ||
    body.canComment !== undefined;
  const effectiveAccessMode = accessMode ?? existing.authorization.accessMode;
  let rules: Array<typeof authorizationFolderRules.$inferInsert> | undefined;
  if (shouldReplaceRules) {
    const requestedPermissions = await filterSelectablePermissionRows({
      userId: user.id,
      accessMode: effectiveAccessMode,
      permissions:
        body.permissions ??
        (await db
          .select()
          .from(authorizationFolderRules)
          .where(eq(authorizationFolderRules.authorizationId, existing.authorization.id))),
    });
    rules = ruleRowsFromFolders({
      authorizationId: existing.authorization.id,
      userId: user.id,
      permissions: requestedPermissions,
      ...nextCapabilities,
      canCreateFolders: body.canCreateFolders ?? existing.authorization.canCreateFolders,
      accessMode: effectiveAccessMode,
    });
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    if (name !== undefined) await tx.update(apiKeys).set({ name, updatedAt: now }).where(eq(apiKeys.id, keyId));
    if (shouldUpdateAuthorization)
      await tx
        .update(integrationAuthorizations)
        .set({
          ...(body.canCreateFolders !== undefined ? { canCreateFolders: body.canCreateFolders } : {}),
          ...(body.canRead !== undefined ? { canRead: body.canRead } : {}),
          ...(body.canCreate !== undefined ? { canCreate: body.canCreate } : {}),
          ...(body.canEdit !== undefined ? { canEdit: body.canEdit } : {}),
          ...(body.canComment !== undefined ? { canComment: body.canComment } : {}),
          ...(accessMode !== undefined ? { accessMode } : {}),
          updatedAt: now,
        })
        .where(eq(integrationAuthorizations.id, existing.authorization.id));
    if (rules) {
      await tx
        .delete(authorizationFolderRules)
        .where(eq(authorizationFolderRules.authorizationId, existing.authorization.id));
      if (rules.length > 0)
        await tx
          .insert(authorizationFolderRules)
          .values(rules)
          .onConflictDoNothing({
            target: [authorizationFolderRules.authorizationId, authorizationFolderRules.folderId],
          });
    }
  });

  const [updated] = await db
    .select({ credential: apiKeys, authorization: integrationAuthorizations })
    .from(apiKeys)
    .innerJoin(integrationAuthorizations, eq(apiKeys.authorizationId, integrationAuthorizations.id))
    .where(eq(apiKeys.id, keyId))
    .limit(1);
  const permissions = await db
    .select()
    .from(authorizationFolderRules)
    .where(eq(authorizationFolderRules.authorizationId, existing.authorization.id));
  return c.json({
    apiKey: { ...updated.credential, ...updated.authorization, permissions: permissions.map(apiPermission) },
  });
});

apiKeyRoutes.delete('/:keyId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const [key] = await db
    .select({ authorizationId: apiKeys.authorizationId })
    .from(apiKeys)
    .innerJoin(integrationAuthorizations, eq(apiKeys.authorizationId, integrationAuthorizations.id))
    .where(
      and(
        eq(apiKeys.id, c.req.param('keyId')),
        eq(integrationAuthorizations.userId, user.id),
        isNull(integrationAuthorizations.revokedAt)
      )
    )
    .limit(1);
  if (!key) return c.json({ error: 'API key not found' }, 404);
  await db
    .update(integrationAuthorizations)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(integrationAuthorizations.id, key.authorizationId));
  return c.json({ ok: true });
});
