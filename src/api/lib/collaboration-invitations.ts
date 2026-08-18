import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { collaborationGrants, collaborationInvitations, folders, notes, user } from '../db/schema';
import { activeFolderWhere, activeNoteWhere } from '../trash/policy';
import type { CollaborationRole } from './collaboration-access';
import { isValidEmailAddress } from './email';
import { getApiRuntimeConfig } from './env';
import { createId } from './id';

const INVITATION_TOKEN_BYTES = 32;
export const COLLABORATION_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CollaborationTarget = { noteId: string } | { folderId: string };

export type CollaborationManagementResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404; error: string };

export function normalizeCollaborationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isCollaborationRole(value: unknown): value is CollaborationRole {
  return value === 'viewer' || value === 'commenter' || value === 'editor';
}

export function generateCollaborationInvitationToken() {
  return randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
}

export function hashCollaborationInvitationToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function buildCollaborationInvitationUrl(token: string) {
  const { frontendUrl } = getApiRuntimeConfig();
  return `${frontendUrl}/invite/${encodeURIComponent(token)}`;
}

function targetValues(target: CollaborationTarget) {
  return 'noteId' in target ? { noteId: target.noteId, folderId: null } : { noteId: null, folderId: target.folderId };
}

async function loadOwnedTarget(ownerUserId: string, target: CollaborationTarget) {
  if ('noteId' in target) {
    const [note] = await db
      .select({ id: notes.id, title: notes.title })
      .from(notes)
      .where(activeNoteWhere(ownerUserId, eq(notes.id, target.noteId)))
      .limit(1);
    return note ? { type: 'note' as const, ...note } : null;
  }

  const [folder] = await db
    .select({ id: folders.id, title: folders.title })
    .from(folders)
    .where(activeFolderWhere(ownerUserId, eq(folders.id, target.folderId)))
    .limit(1);
  return folder ? { type: 'folder' as const, ...folder } : null;
}

function grantTargetWhere(target: CollaborationTarget) {
  return 'noteId' in target
    ? eq(collaborationGrants.noteId, target.noteId)
    : eq(collaborationGrants.folderId, target.folderId);
}

function invitationTargetWhere(target: CollaborationTarget) {
  return 'noteId' in target
    ? eq(collaborationInvitations.noteId, target.noteId)
    : eq(collaborationInvitations.folderId, target.folderId);
}

export async function listResourceCollaborators(input: { ownerUserId: string; target: CollaborationTarget }) {
  const resource = await loadOwnedTarget(input.ownerUserId, input.target);
  if (!resource)
    return { ok: false, status: 404, error: `${'noteId' in input.target ? 'Note' : 'Folder'} not found` } as const;

  const [owner] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, input.ownerUserId))
    .limit(1);
  const grants = await db
    .select({
      id: collaborationGrants.id,
      role: collaborationGrants.role,
      createdAt: collaborationGrants.createdAt,
      updatedAt: collaborationGrants.updatedAt,
      user: { id: user.id, name: user.name, email: user.email },
    })
    .from(collaborationGrants)
    .innerJoin(user, eq(collaborationGrants.granteeUserId, user.id))
    .where(and(eq(collaborationGrants.ownerUserId, input.ownerUserId), grantTargetWhere(input.target)))
    .orderBy(user.name, user.email);
  const invitations = await db
    .select({
      id: collaborationInvitations.id,
      email: collaborationInvitations.invitedEmailKey,
      role: collaborationInvitations.role,
      expiresAt: collaborationInvitations.expiresAt,
      createdAt: collaborationInvitations.createdAt,
      updatedAt: collaborationInvitations.updatedAt,
    })
    .from(collaborationInvitations)
    .where(
      and(
        eq(collaborationInvitations.ownerUserId, input.ownerUserId),
        invitationTargetWhere(input.target),
        isNull(collaborationInvitations.acceptedAt),
        isNull(collaborationInvitations.revokedAt)
      )
    )
    .orderBy(collaborationInvitations.invitedEmailKey);

  return { ok: true, value: { resource, owner: owner ?? null, grants, invitations } } as const;
}

export async function regenerateCollaborationInvitation(input: { ownerUserId: string; invitationId: string }) {
  const token = generateCollaborationInvitationToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + COLLABORATION_INVITATION_TTL_MS);
  const [invitation] = await db
    .update(collaborationInvitations)
    .set({
      tokenHash: hashCollaborationInvitationToken(token),
      expiresAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(collaborationInvitations.id, input.invitationId),
        eq(collaborationInvitations.ownerUserId, input.ownerUserId),
        isNull(collaborationInvitations.acceptedAt),
        isNull(collaborationInvitations.revokedAt)
      )
    )
    .returning();
  if (!invitation) return { ok: false, status: 404, error: 'Invitation not found' } as const;
  return {
    ok: true,
    value: {
      invitation,
      invitationUrl: buildCollaborationInvitationUrl(token),
    },
  } as const;
}

export async function revokeCollaborationInvitation(input: { ownerUserId: string; invitationId: string }) {
  const [invitation] = await db
    .select({ id: collaborationInvitations.id })
    .from(collaborationInvitations)
    .where(
      and(
        eq(collaborationInvitations.id, input.invitationId),
        eq(collaborationInvitations.ownerUserId, input.ownerUserId),
        isNull(collaborationInvitations.acceptedAt),
        isNull(collaborationInvitations.revokedAt)
      )
    )
    .limit(1);
  if (!invitation) return { ok: false, status: 404, error: 'Invitation not found' } as const;
  await db
    .update(collaborationInvitations)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(collaborationInvitations.id, invitation.id));
  return { ok: true, value: { ok: true as const } } as const;
}

export async function addResourceCollaborator(input: {
  ownerUserId: string;
  target: CollaborationTarget;
  email: string;
  role: CollaborationRole;
}): Promise<
  CollaborationManagementResult<
    | { kind: 'grant'; grant: typeof collaborationGrants.$inferSelect; recipientEmail: string }
    | { kind: 'invitation'; invitation: typeof collaborationInvitations.$inferSelect; invitationUrl: string }
  >
> {
  const resource = await loadOwnedTarget(input.ownerUserId, input.target);
  if (!resource) return { ok: false, status: 404, error: `${'noteId' in input.target ? 'Note' : 'Folder'} not found` };

  const emailKey = normalizeCollaborationEmail(input.email);
  if (!isValidEmailAddress(emailKey)) return { ok: false, status: 400, error: 'Valid email is required' };
  const [owner] = await db.select({ email: user.email }).from(user).where(eq(user.id, input.ownerUserId)).limit(1);
  if (!owner) return { ok: false, status: 404, error: 'Owner not found' };
  if (normalizeCollaborationEmail(owner.email) === emailKey)
    return { ok: false, status: 400, error: 'You already own this resource' };

  const [grantee] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(and(sql`lower(${user.email}) = ${emailKey}`, eq(user.emailVerified, true)))
    .limit(1);
  const now = new Date();
  const target = targetValues(input.target);

  if (grantee) {
    const grant = await db.transaction(async (tx) => {
      const values = {
        id: createId('collaboration_grant'),
        ownerUserId: input.ownerUserId,
        granteeUserId: grantee.id,
        ...target,
        role: input.role,
        createdByUserId: input.ownerUserId,
        createdAt: now,
        updatedAt: now,
      };
      const [row] =
        'noteId' in input.target
          ? await tx
              .insert(collaborationGrants)
              .values(values)
              .onConflictDoUpdate({
                target: [collaborationGrants.noteId, collaborationGrants.granteeUserId],
                set: { role: input.role, updatedAt: now },
              })
              .returning()
          : await tx
              .insert(collaborationGrants)
              .values(values)
              .onConflictDoUpdate({
                target: [collaborationGrants.folderId, collaborationGrants.granteeUserId],
                set: { role: input.role, updatedAt: now },
              })
              .returning();
      await tx
        .delete(collaborationInvitations)
        .where(
          and(
            eq(collaborationInvitations.ownerUserId, input.ownerUserId),
            invitationTargetWhere(input.target),
            eq(collaborationInvitations.invitedEmailKey, emailKey)
          )
        );
      return row;
    });
    if (!grant) return { ok: false, status: 400, error: 'Unable to create collaboration grant' };
    return { ok: true, value: { kind: 'grant', grant, recipientEmail: grantee.email } };
  }

  const token = generateCollaborationInvitationToken();
  const tokenHash = hashCollaborationInvitationToken(token);
  const expiresAt = new Date(now.getTime() + COLLABORATION_INVITATION_TTL_MS);
  const values = {
    id: createId('collaboration_invitation'),
    ownerUserId: input.ownerUserId,
    invitedEmailKey: emailKey,
    ...target,
    role: input.role,
    tokenHash,
    invitedByUserId: input.ownerUserId,
    expiresAt,
    acceptedAt: null,
    acceptedByUserId: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const [invitation] =
    'noteId' in input.target
      ? await db
          .insert(collaborationInvitations)
          .values(values)
          .onConflictDoUpdate({
            target: [collaborationInvitations.noteId, collaborationInvitations.invitedEmailKey],
            set: {
              role: input.role,
              tokenHash,
              expiresAt,
              acceptedAt: null,
              acceptedByUserId: null,
              revokedAt: null,
              updatedAt: now,
            },
          })
          .returning()
      : await db
          .insert(collaborationInvitations)
          .values(values)
          .onConflictDoUpdate({
            target: [collaborationInvitations.folderId, collaborationInvitations.invitedEmailKey],
            set: {
              role: input.role,
              tokenHash,
              expiresAt,
              acceptedAt: null,
              acceptedByUserId: null,
              revokedAt: null,
              updatedAt: now,
            },
          })
          .returning();
  if (!invitation) return { ok: false, status: 400, error: 'Unable to create collaboration invitation' };
  return {
    ok: true,
    value: { kind: 'invitation', invitation, invitationUrl: buildCollaborationInvitationUrl(token) },
  };
}

export async function updateResourceCollaborator(input: {
  ownerUserId: string;
  target: CollaborationTarget;
  granteeUserId: string;
  role: CollaborationRole;
}) {
  const resource = await loadOwnedTarget(input.ownerUserId, input.target);
  if (!resource)
    return { ok: false, status: 404, error: `${'noteId' in input.target ? 'Note' : 'Folder'} not found` } as const;
  const [grant] = await db
    .update(collaborationGrants)
    .set({ role: input.role, updatedAt: new Date() })
    .where(
      and(
        eq(collaborationGrants.ownerUserId, input.ownerUserId),
        eq(collaborationGrants.granteeUserId, input.granteeUserId),
        grantTargetWhere(input.target)
      )
    )
    .returning();
  if (!grant) return { ok: false, status: 404, error: 'Collaborator not found' } as const;
  return { ok: true, value: { grant } } as const;
}

function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1) || '*'}***@${domain}`;
}

function invitationDestination(target: CollaborationTarget) {
  return 'noteId' in target
    ? `/notes/${encodeURIComponent(target.noteId)}`
    : `/folders/${encodeURIComponent(target.folderId)}`;
}

export async function previewCollaborationInvitation(token: string) {
  const tokenHash = hashCollaborationInvitationToken(token);
  const [invitation] = await db
    .select()
    .from(collaborationInvitations)
    .where(and(eq(collaborationInvitations.tokenHash, tokenHash), isNull(collaborationInvitations.revokedAt)))
    .limit(1);
  if (!invitation || invitation.expiresAt.getTime() <= Date.now())
    return { ok: false, status: 404, error: 'Invitation not found' } as const;
  const target: CollaborationTarget = invitation.noteId
    ? { noteId: invitation.noteId }
    : { folderId: invitation.folderId ?? '' };
  const resource = await loadOwnedTarget(invitation.ownerUserId, target);
  if (!resource) return { ok: false, status: 404, error: 'Invitation not found' } as const;
  const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, invitation.ownerUserId)).limit(1);
  if (!owner) return { ok: false, status: 404, error: 'Invitation not found' } as const;

  return {
    ok: true,
    value: {
      resource,
      owner,
      role: invitation.role,
      invitedEmail: maskEmail(invitation.invitedEmailKey),
      expiresAt: invitation.expiresAt,
      status: invitation.acceptedAt ? ('accepted' as const) : ('pending' as const),
    },
  } as const;
}

export async function acceptCollaborationInvitation(input: { token: string; actorUserId: string }) {
  const tokenHash = hashCollaborationInvitationToken(input.token);
  const [invitation] = await db
    .select()
    .from(collaborationInvitations)
    .where(and(eq(collaborationInvitations.tokenHash, tokenHash), isNull(collaborationInvitations.revokedAt)))
    .limit(1);
  if (!invitation || invitation.expiresAt.getTime() <= Date.now())
    return { ok: false, status: 404, error: 'Invitation not found' } as const;
  const [actor] = await db
    .select({ id: user.id, email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, input.actorUserId))
    .limit(1);
  if (!actor?.emailVerified || normalizeCollaborationEmail(actor.email) !== invitation.invitedEmailKey)
    return { ok: false, status: 403, error: 'Sign in with the invited email to accept this invitation' } as const;

  const target: CollaborationTarget = invitation.noteId
    ? { noteId: invitation.noteId }
    : { folderId: invitation.folderId ?? '' };
  const resource = await loadOwnedTarget(invitation.ownerUserId, target);
  if (!resource) return { ok: false, status: 404, error: 'Invitation not found' } as const;
  const destination = invitationDestination(target);
  if (invitation.acceptedAt) {
    if (invitation.acceptedByUserId !== actor.id)
      return { ok: false, status: 404, error: 'Invitation not found' } as const;
    return { ok: true, value: { destination, alreadyAccepted: true } } as const;
  }

  const now = new Date();
  const targetValuesForGrant = targetValues(target);
  const accepted = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(collaborationInvitations)
      .set({ acceptedAt: now, acceptedByUserId: actor.id, updatedAt: now })
      .where(
        and(
          eq(collaborationInvitations.id, invitation.id),
          isNull(collaborationInvitations.acceptedAt),
          isNull(collaborationInvitations.revokedAt),
          gt(collaborationInvitations.expiresAt, now)
        )
      )
      .returning({ id: collaborationInvitations.id });
    if (!claimed) return false;

    const values = {
      id: createId('collaboration_grant'),
      ownerUserId: invitation.ownerUserId,
      granteeUserId: actor.id,
      ...targetValuesForGrant,
      role: invitation.role,
      createdByUserId: invitation.ownerUserId,
      createdAt: now,
      updatedAt: now,
    };
    if ('noteId' in target)
      await tx
        .insert(collaborationGrants)
        .values(values)
        .onConflictDoUpdate({
          target: [collaborationGrants.noteId, collaborationGrants.granteeUserId],
          set: { role: invitation.role, updatedAt: now },
        });
    else
      await tx
        .insert(collaborationGrants)
        .values(values)
        .onConflictDoUpdate({
          target: [collaborationGrants.folderId, collaborationGrants.granteeUserId],
          set: { role: invitation.role, updatedAt: now },
        });
    return true;
  });

  if (!accepted) {
    const [current] = await db
      .select({ acceptedByUserId: collaborationInvitations.acceptedByUserId })
      .from(collaborationInvitations)
      .where(eq(collaborationInvitations.id, invitation.id))
      .limit(1);
    if (current?.acceptedByUserId === actor.id)
      return { ok: true, value: { destination, alreadyAccepted: true } } as const;
    return { ok: false, status: 404, error: 'Invitation not found' } as const;
  }
  return { ok: true, value: { destination, alreadyAccepted: false } } as const;
}

export async function removeResourceCollaborator(input: {
  ownerUserId: string;
  target: CollaborationTarget;
  granteeUserId: string;
}) {
  const resource = await loadOwnedTarget(input.ownerUserId, input.target);
  if (!resource)
    return { ok: false, status: 404, error: `${'noteId' in input.target ? 'Note' : 'Folder'} not found` } as const;
  const deleted = await db
    .delete(collaborationGrants)
    .where(
      and(
        eq(collaborationGrants.ownerUserId, input.ownerUserId),
        eq(collaborationGrants.granteeUserId, input.granteeUserId),
        grantTargetWhere(input.target)
      )
    )
    .returning({ id: collaborationGrants.id });
  if (deleted.length === 0) return { ok: false, status: 404, error: 'Collaborator not found' } as const;
  return { ok: true, value: { ok: true } } as const;
}
