import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { apiKeys, oauthAuthorizations, oauthClients, user } from '../db/schema';
import {
  type CollaborationIdentity,
  normalizeCollaborationDisplayName,
  publicIdentityKey,
  serializeCollaborationUserIdentity,
} from './collaboration-identity';

export type CollaborationActorReference = {
  type: 'user' | 'agent' | 'system';
  id: string | null;
};

function agentIdentity(input: {
  id: string;
  name: string | null | undefined;
  isCurrentActor: boolean;
}): CollaborationIdentity {
  const displayName = normalizeCollaborationDisplayName(input.name);
  return {
    key: publicIdentityKey('agent', input.id),
    type: 'agent',
    displayName,
    maskedEmail: null,
    label: displayName ?? 'Integration',
    isCurrentUser: input.isCurrentActor,
  };
}

export async function createCollaborationActorSerializer(input: {
  references: CollaborationActorReference[];
  currentActor?: CollaborationActorReference | null;
}) {
  const userIds = [
    ...new Set(
      input.references
        .filter((reference) => reference.type === 'user' && reference.id)
        .map((reference) => reference.id as string)
    ),
  ];
  const users = userIds.length
    ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, userIds))
    : [];
  const usersById = new Map(users.map((actorUser) => [actorUser.id, actorUser]));

  const agentIds = [
    ...new Set(
      input.references
        .filter((reference) => reference.type === 'agent' && reference.id)
        .map((reference) => reference.id as string)
    ),
  ];
  const keys = agentIds.length
    ? await db.select({ id: apiKeys.id, name: apiKeys.name }).from(apiKeys).where(inArray(apiKeys.id, agentIds))
    : [];
  const keysById = new Map(keys.map((key) => [key.id, key]));
  const oauthAgents = agentIds.length
    ? await db
        .select({ id: oauthAuthorizations.id, name: oauthClients.name })
        .from(oauthAuthorizations)
        .innerJoin(oauthClients, eq(oauthAuthorizations.clientId, oauthClients.id))
        .where(inArray(oauthAuthorizations.id, agentIds))
    : [];
  const oauthAgentsById = new Map(oauthAgents.map((agent) => [agent.id, agent]));

  return (reference: CollaborationActorReference): CollaborationIdentity => {
    if (reference.type === 'system')
      return {
        key: 'system_minunotes',
        type: 'system',
        displayName: 'MinuNotes',
        maskedEmail: null,
        label: 'MinuNotes',
        isCurrentUser: false,
      };

    const isCurrentActor =
      input.currentActor?.type === reference.type &&
      input.currentActor.id !== null &&
      input.currentActor.id === reference.id;
    if (reference.type === 'user') {
      const actorUser = reference.id ? usersById.get(reference.id) : null;
      if (!actorUser)
        return {
          key: reference.id ? publicIdentityKey('user', reference.id) : 'former_collaborator',
          type: 'former',
          displayName: null,
          maskedEmail: null,
          label: 'Former collaborator',
          isCurrentUser: false,
        };
      return serializeCollaborationUserIdentity({
        ...actorUser,
        currentUserId: isCurrentActor ? actorUser.id : null,
      });
    }

    const agent = reference.id ? (keysById.get(reference.id) ?? oauthAgentsById.get(reference.id)) : null;
    return agentIdentity({
      id: reference.id ?? 'integration',
      name: agent?.name,
      isCurrentActor,
    });
  };
}
