import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import {
  apiKeys,
  type NoteCommentMessage,
  type NoteCommentThread,
  noteCommentMessages,
  noteCommentThreads,
  user,
} from '../db/schema';
import { readDocument } from '../harness/commands';
import { createId } from '../lib/id';

export const MAX_COMMENT_BODY_LENGTH = 10_000;
export const MAX_COMMENT_QUOTE_LENGTH = 20_000;

export type CommentActor = {
  type: 'user' | 'agent';
  id: string;
};

export type CommentAnchorInput = {
  anchorType: 'range' | 'line';
  from: number;
  to: number;
  quote: string;
  prefix?: string;
  suffix?: string;
  documentHash: string;
  detached?: boolean;
};

export type SafeCommentActor = {
  type: 'user' | 'agent';
  id: string;
  name: string;
};

export type SerializedCommentMessage = {
  id: string;
  threadId: string;
  body: string;
  author: SafeCommentActor;
  createdAt: Date;
  updatedAt: Date;
};

export type SerializedCommentThread = {
  id: string;
  noteId: string;
  status: 'open' | 'resolved';
  anchor: {
    anchorType: 'range' | 'line';
    from: number;
    to: number;
    quote: string;
    prefix?: string;
    suffix?: string;
    documentHash: string;
    detached: boolean;
  };
  createdBy: SafeCommentActor;
  resolvedBy: SafeCommentActor | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  messages: SerializedCommentMessage[];
};

export type CommentOperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 403 | 404; error: string }
  | { ok: false; status: 409; error: string; currentHash: string };

type ActorReference = {
  actorType: 'user' | 'agent';
  actorId: string | null;
};

function normalizeBody(body: string) {
  const value = body.trim();
  if (!value) return { ok: false as const, error: 'Comment body is required' };
  if (value.length > MAX_COMMENT_BODY_LENGTH)
    return {
      ok: false as const,
      error: `Comment body cannot exceed ${MAX_COMMENT_BODY_LENGTH} characters`,
    };
  return { ok: true as const, value };
}

function sameActor(reference: ActorReference, actor: CommentActor) {
  return reference.actorType === actor.type && reference.actorId === actor.id;
}

function isOwnerActor(actor: CommentActor, userId: string) {
  return actor.type === 'user' && actor.id === userId;
}

async function readCommentableNote(input: { noteId: string; userId: string }) {
  const current = await readDocument({ documentId: input.noteId, userId: input.userId });
  if (!current.ok) return current;
  if (current.value.note.type !== 'note')
    return {
      ok: false as const,
      status: 400 as const,
      error: 'Comments are not supported for templates',
    };
  if (current.value.note.documentType !== 'markdown')
    return {
      ok: false as const,
      status: 400 as const,
      error: 'Comments are only supported for markdown notes',
    };
  return current;
}

function validateAnchor(
  anchor: CommentAnchorInput,
  content: string,
  currentHash: string
): CommentOperationResult<{
  anchorType: 'range' | 'line';
  anchorFrom: number;
  anchorTo: number;
  quote: string;
  prefix: string;
  suffix: string;
  documentHash: string;
  detached: boolean;
}> {
  if (anchor.documentHash !== currentHash)
    return {
      ok: false,
      status: 409,
      error: 'Document has changed since the comment anchor was created',
      currentHash,
    };
  if (anchor.anchorType !== 'range' && anchor.anchorType !== 'line')
    return { ok: false, status: 400, error: 'Comment anchor type must be range or line' };
  if (!Number.isInteger(anchor.from) || !Number.isInteger(anchor.to))
    return { ok: false, status: 400, error: 'Comment anchor offsets must be integers' };
  if (anchor.quote.length > MAX_COMMENT_QUOTE_LENGTH)
    return {
      ok: false,
      status: 400,
      error: `Comment quote cannot exceed ${MAX_COMMENT_QUOTE_LENGTH} characters`,
    };

  const detached = anchor.detached === true;
  if (detached) {
    if (anchor.from < 0 || anchor.from > content.length || anchor.to < 0 || anchor.to > content.length)
      return { ok: false, status: 400, error: 'Detached comment anchor is outside the document' };
  } else {
    if (anchor.from < 0 || anchor.to <= anchor.from || anchor.to > content.length)
      return { ok: false, status: 400, error: 'Comment anchor is outside the document' };
    if (content.slice(anchor.from, anchor.to) !== anchor.quote)
      return { ok: false, status: 400, error: 'Comment quote does not match the anchored document text' };
    if (
      anchor.anchorType === 'line' &&
      ((anchor.from > 0 && content[anchor.from - 1] !== '\n') ||
        (anchor.to < content.length && content[anchor.to] !== '\n'))
    )
      return { ok: false, status: 400, error: 'Line comment anchors must cover complete source lines' };
  }

  return {
    ok: true,
    value: {
      anchorType: anchor.anchorType,
      anchorFrom: anchor.from,
      anchorTo: anchor.to,
      quote: anchor.quote,
      prefix: content.slice(Math.max(0, anchor.from - 32), anchor.from),
      suffix: content.slice(anchor.to, Math.min(content.length, anchor.to + 32)),
      documentHash: currentHash,
      detached,
    },
  };
}

async function createActorSerializer(userId: string, references: ActorReference[]) {
  const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  const agentIds = [
    ...new Set(
      references
        .filter((reference) => reference.actorType === 'agent' && reference.actorId)
        .map((reference) => reference.actorId as string)
    ),
  ];
  const keys = agentIds.length
    ? await db
        .select({ id: apiKeys.id, uid: apiKeys.uid, name: apiKeys.name })
        .from(apiKeys)
        .where(and(eq(apiKeys.userId, userId), inArray(apiKeys.id, agentIds)))
    : [];
  const keysById = new Map(keys.map((key) => [key.id, key]));

  return (reference: ActorReference): SafeCommentActor => {
    if (reference.actorType === 'user') return { type: 'user', id: 'owner', name: owner?.name ?? 'Owner' };
    const key = reference.actorId ? keysById.get(reference.actorId) : null;
    if (key) return { type: 'agent', id: key.uid, name: key.name };
    return { type: 'agent', id: 'integration', name: 'Integration' };
  };
}

async function serializeThreads(
  userId: string,
  threads: NoteCommentThread[],
  messages: NoteCommentMessage[]
): Promise<SerializedCommentThread[]> {
  const references: ActorReference[] = [
    ...threads.map((thread) => ({
      actorType: thread.createdByActorType,
      actorId: thread.createdByActorId,
    })),
    ...threads
      .filter((thread) => thread.resolvedByActorType)
      .map((thread) => ({
        actorType: thread.resolvedByActorType as 'user' | 'agent',
        actorId: thread.resolvedByActorId,
      })),
    ...messages.map((message) => ({ actorType: message.actorType, actorId: message.actorId })),
  ];
  const serializeActor = await createActorSerializer(userId, references);
  const messagesByThread = new Map<string, NoteCommentMessage[]>();
  for (const message of messages) {
    const list = messagesByThread.get(message.threadId) ?? [];
    list.push(message);
    messagesByThread.set(message.threadId, list);
  }

  return threads.map((thread) => ({
    id: thread.id,
    noteId: thread.noteId,
    status: thread.status,
    anchor: {
      anchorType: thread.anchorType,
      from: thread.anchorFrom,
      to: thread.anchorTo,
      quote: thread.quote,
      ...(thread.prefix !== null ? { prefix: thread.prefix } : {}),
      ...(thread.suffix !== null ? { suffix: thread.suffix } : {}),
      documentHash: thread.documentHash,
      detached: thread.detached,
    },
    createdBy: serializeActor({
      actorType: thread.createdByActorType,
      actorId: thread.createdByActorId,
    }),
    resolvedBy: thread.resolvedByActorType
      ? serializeActor({
          actorType: thread.resolvedByActorType,
          actorId: thread.resolvedByActorId,
        })
      : null,
    resolvedAt: thread.resolvedAt,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messages: (messagesByThread.get(thread.id) ?? []).map((message) => ({
      id: message.id,
      threadId: message.threadId,
      body: message.body,
      author: serializeActor({ actorType: message.actorType, actorId: message.actorId }),
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    })),
  }));
}

function findAnchorPosition(thread: NoteCommentThread, content: string) {
  const positionMatches = (from: number) => {
    const to = from + thread.quote.length;
    if (content.slice(from, to) !== thread.quote) return false;
    if (
      thread.anchorType === 'line' &&
      ((from > 0 && content[from - 1] !== '\n') || (to < content.length && content[to] !== '\n'))
    )
      return false;
    return true;
  };

  if (positionMatches(thread.anchorFrom)) return thread.anchorFrom;
  if (!thread.quote) return null;
  const candidates: number[] = [];
  let from = content.indexOf(thread.quote);
  while (from >= 0) {
    if (positionMatches(from)) candidates.push(from);
    from = content.indexOf(thread.quote, from + 1);
  }
  if (candidates.length === 1) return candidates[0];
  const contextual = candidates.filter((candidate) => {
    const prefixMatches =
      !thread.prefix || content.slice(Math.max(0, candidate - thread.prefix.length), candidate) === thread.prefix;
    const to = candidate + thread.quote.length;
    const suffixMatches = !thread.suffix || content.slice(to, to + thread.suffix.length) === thread.suffix;
    return prefixMatches && suffixMatches;
  });
  return contextual.length === 1 ? contextual[0] : null;
}

async function reconcileThreadAnchors(threads: NoteCommentThread[], content: string, documentHash: string) {
  for (const thread of threads) {
    if (thread.documentHash === documentHash) continue;
    const anchorFrom = findAnchorPosition(thread, content);
    const detached = anchorFrom === null;
    const anchorTo = detached ? Math.min(thread.anchorTo, content.length) : anchorFrom + thread.quote.length;
    const safeFrom = detached ? Math.min(thread.anchorFrom, content.length) : anchorFrom;
    const next = {
      anchorFrom: safeFrom,
      anchorTo,
      prefix: detached ? thread.prefix : content.slice(Math.max(0, safeFrom - 32), safeFrom),
      suffix: detached ? thread.suffix : content.slice(anchorTo, Math.min(content.length, anchorTo + 32)),
      documentHash,
      detached,
      updatedAt: thread.updatedAt,
    };
    await db.update(noteCommentThreads).set(next).where(eq(noteCommentThreads.id, thread.id));
    Object.assign(thread, next);
  }
}

async function loadSerializedThread(input: { noteId: string; threadId: string; userId: string }) {
  const [thread] = await db
    .select()
    .from(noteCommentThreads)
    .where(
      and(
        eq(noteCommentThreads.id, input.threadId),
        eq(noteCommentThreads.noteId, input.noteId),
        eq(noteCommentThreads.userId, input.userId)
      )
    )
    .limit(1);
  if (!thread) return null;
  const messages = await db
    .select()
    .from(noteCommentMessages)
    .where(and(eq(noteCommentMessages.threadId, thread.id), eq(noteCommentMessages.userId, input.userId)))
    .orderBy(asc(noteCommentMessages.createdAt), asc(noteCommentMessages.id));
  return (await serializeThreads(input.userId, [thread], messages))[0] ?? null;
}

export async function listCommentThreads(input: { noteId: string; userId: string }) {
  const current = await readCommentableNote(input);
  if (!current.ok) return current;
  const threads = await db
    .select()
    .from(noteCommentThreads)
    .where(and(eq(noteCommentThreads.noteId, input.noteId), eq(noteCommentThreads.userId, input.userId)))
    .orderBy(desc(noteCommentThreads.updatedAt), desc(noteCommentThreads.id));
  await reconcileThreadAnchors(threads, current.value.note.content, current.value.contentHash);
  const threadIds = threads.map((thread) => thread.id);
  const messages = threadIds.length
    ? await db
        .select()
        .from(noteCommentMessages)
        .where(and(eq(noteCommentMessages.userId, input.userId), inArray(noteCommentMessages.threadId, threadIds)))
        .orderBy(asc(noteCommentMessages.createdAt), asc(noteCommentMessages.id))
    : [];
  return {
    ok: true,
    value: {
      noteId: input.noteId,
      documentHash: current.value.contentHash,
      threads: await serializeThreads(input.userId, threads, messages),
    },
  } satisfies CommentOperationResult<{
    noteId: string;
    documentHash: string;
    threads: SerializedCommentThread[];
  }>;
}

export async function createCommentThread(input: {
  noteId: string;
  userId: string;
  actor: CommentActor;
  body: string;
  anchor: CommentAnchorInput;
}) {
  const body = normalizeBody(input.body);
  if (!body.ok) return { ok: false, status: 400, error: body.error } satisfies CommentOperationResult<never>;
  const current = await readCommentableNote(input);
  if (!current.ok) return current;
  const anchor = validateAnchor(input.anchor, current.value.note.content, current.value.contentHash);
  if (!anchor.ok) return anchor;

  const now = new Date();
  const threadId = createId('comment_thread');
  await db.transaction(async (tx) => {
    await tx.insert(noteCommentThreads).values({
      id: threadId,
      noteId: input.noteId,
      userId: input.userId,
      status: 'open',
      ...anchor.value,
      createdByActorType: input.actor.type,
      createdByActorId: input.actor.id,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(noteCommentMessages).values({
      id: createId('comment_message'),
      threadId,
      noteId: input.noteId,
      userId: input.userId,
      actorType: input.actor.type,
      actorId: input.actor.id,
      body: body.value,
      isRoot: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  const thread = await loadSerializedThread({ noteId: input.noteId, threadId, userId: input.userId });
  if (!thread)
    return { ok: false, status: 404, error: 'Comment thread not found' } satisfies CommentOperationResult<never>;
  return { ok: true, value: { thread } } satisfies CommentOperationResult<{ thread: SerializedCommentThread }>;
}

export async function addCommentReply(input: {
  noteId: string;
  threadId: string;
  userId: string;
  actor: CommentActor;
  body: string;
}) {
  const body = normalizeBody(input.body);
  if (!body.ok) return { ok: false, status: 400, error: body.error } satisfies CommentOperationResult<never>;
  const current = await readCommentableNote(input);
  if (!current.ok) return current;
  const [thread] = await db
    .select({ id: noteCommentThreads.id })
    .from(noteCommentThreads)
    .where(
      and(
        eq(noteCommentThreads.id, input.threadId),
        eq(noteCommentThreads.noteId, input.noteId),
        eq(noteCommentThreads.userId, input.userId)
      )
    )
    .limit(1);
  if (!thread)
    return { ok: false, status: 404, error: 'Comment thread not found' } satisfies CommentOperationResult<never>;

  const now = new Date();
  const [message] = await db
    .insert(noteCommentMessages)
    .values({
      id: createId('comment_message'),
      threadId: thread.id,
      noteId: input.noteId,
      userId: input.userId,
      actorType: input.actor.type,
      actorId: input.actor.id,
      body: body.value,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await db.update(noteCommentThreads).set({ updatedAt: now }).where(eq(noteCommentThreads.id, thread.id));
  const serializeActor = await createActorSerializer(input.userId, [
    { actorType: message.actorType, actorId: message.actorId },
  ]);
  return {
    ok: true,
    value: {
      message: {
        id: message.id,
        threadId: message.threadId,
        body: message.body,
        author: serializeActor({ actorType: message.actorType, actorId: message.actorId }),
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      },
    },
  } satisfies CommentOperationResult<{ message: SerializedCommentMessage }>;
}

export async function updateCommentAnchor(input: {
  noteId: string;
  threadId: string;
  userId: string;
  anchor: CommentAnchorInput;
}) {
  const current = await readCommentableNote(input);
  if (!current.ok) return current;
  const anchor = validateAnchor(input.anchor, current.value.note.content, current.value.contentHash);
  if (!anchor.ok) return anchor;
  const [thread] = await db
    .update(noteCommentThreads)
    .set({ ...anchor.value, updatedAt: new Date() })
    .where(
      and(
        eq(noteCommentThreads.id, input.threadId),
        eq(noteCommentThreads.noteId, input.noteId),
        eq(noteCommentThreads.userId, input.userId)
      )
    )
    .returning();
  if (!thread)
    return { ok: false, status: 404, error: 'Comment thread not found' } satisfies CommentOperationResult<never>;
  const serialized = await loadSerializedThread(input);
  if (!serialized)
    return { ok: false, status: 404, error: 'Comment thread not found' } satisfies CommentOperationResult<never>;
  return { ok: true, value: { thread: serialized } } satisfies CommentOperationResult<{
    thread: SerializedCommentThread;
  }>;
}

export async function setCommentThreadStatus(input: {
  noteId: string;
  threadId: string;
  userId: string;
  actor: CommentActor;
  status: 'open' | 'resolved';
}) {
  const current = await readCommentableNote(input);
  if (!current.ok) return current;
  const [existing] = await db
    .select()
    .from(noteCommentThreads)
    .where(
      and(
        eq(noteCommentThreads.id, input.threadId),
        eq(noteCommentThreads.noteId, input.noteId),
        eq(noteCommentThreads.userId, input.userId)
      )
    )
    .limit(1);
  if (!existing)
    return { ok: false, status: 404, error: 'Comment thread not found' } satisfies CommentOperationResult<never>;
  if (
    !isOwnerActor(input.actor, input.userId) &&
    !sameActor({ actorType: existing.createdByActorType, actorId: existing.createdByActorId }, input.actor)
  )
    return {
      ok: false,
      status: 403,
      error: 'Only the thread author or note owner can change its status',
    } satisfies CommentOperationResult<never>;

  const now = new Date();
  await db
    .update(noteCommentThreads)
    .set({
      status: input.status,
      resolvedAt: input.status === 'resolved' ? now : null,
      resolvedByActorType: input.status === 'resolved' ? input.actor.type : null,
      resolvedByActorId: input.status === 'resolved' ? input.actor.id : null,
      updatedAt: now,
    })
    .where(eq(noteCommentThreads.id, existing.id));
  const thread = await loadSerializedThread(input);
  if (!thread)
    return { ok: false, status: 404, error: 'Comment thread not found' } satisfies CommentOperationResult<never>;
  return { ok: true, value: { thread } } satisfies CommentOperationResult<{
    thread: SerializedCommentThread;
  }>;
}

export async function updateCommentMessage(input: {
  noteId: string;
  threadId: string;
  messageId: string;
  userId: string;
  actor: CommentActor;
  body: string;
}) {
  const body = normalizeBody(input.body);
  if (!body.ok) return { ok: false, status: 400, error: body.error } satisfies CommentOperationResult<never>;
  const current = await readCommentableNote(input);
  if (!current.ok) return current;
  const [message] = await db
    .select()
    .from(noteCommentMessages)
    .where(
      and(
        eq(noteCommentMessages.id, input.messageId),
        eq(noteCommentMessages.threadId, input.threadId),
        eq(noteCommentMessages.noteId, input.noteId),
        eq(noteCommentMessages.userId, input.userId)
      )
    )
    .limit(1);
  if (!message)
    return { ok: false, status: 404, error: 'Comment message not found' } satisfies CommentOperationResult<never>;
  if (!sameActor({ actorType: message.actorType, actorId: message.actorId }, input.actor))
    return {
      ok: false,
      status: 403,
      error: 'Only the message author can edit it',
    } satisfies CommentOperationResult<never>;

  const now = new Date();
  const [updated] = await db
    .update(noteCommentMessages)
    .set({ body: body.value, updatedAt: now })
    .where(eq(noteCommentMessages.id, message.id))
    .returning();
  await db.update(noteCommentThreads).set({ updatedAt: now }).where(eq(noteCommentThreads.id, input.threadId));
  const serializeActor = await createActorSerializer(input.userId, [
    { actorType: updated.actorType, actorId: updated.actorId },
  ]);
  return {
    ok: true,
    value: {
      message: {
        id: updated.id,
        threadId: updated.threadId,
        body: updated.body,
        author: serializeActor({ actorType: updated.actorType, actorId: updated.actorId }),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    },
  } satisfies CommentOperationResult<{ message: SerializedCommentMessage }>;
}

export async function deleteCommentMessage(input: {
  noteId: string;
  threadId: string;
  messageId: string;
  userId: string;
  actor: CommentActor;
}) {
  const current = await readCommentableNote(input);
  if (!current.ok) return current;
  const messages = await db
    .select()
    .from(noteCommentMessages)
    .where(
      and(
        eq(noteCommentMessages.threadId, input.threadId),
        eq(noteCommentMessages.noteId, input.noteId),
        eq(noteCommentMessages.userId, input.userId)
      )
    )
    .orderBy(asc(noteCommentMessages.createdAt), asc(noteCommentMessages.id));
  const message = messages.find((candidate) => candidate.id === input.messageId);
  if (!message)
    return { ok: false, status: 404, error: 'Comment message not found' } satisfies CommentOperationResult<never>;
  if (!sameActor({ actorType: message.actorType, actorId: message.actorId }, input.actor))
    return {
      ok: false,
      status: 403,
      error: 'Only the message author can delete it',
    } satisfies CommentOperationResult<never>;

  if (message.isRoot) {
    await db
      .delete(noteCommentThreads)
      .where(
        and(
          eq(noteCommentThreads.id, input.threadId),
          eq(noteCommentThreads.noteId, input.noteId),
          eq(noteCommentThreads.userId, input.userId)
        )
      );
    return { ok: true, value: { ok: true, deletedThread: true } } as const;
  }

  await db.delete(noteCommentMessages).where(eq(noteCommentMessages.id, message.id));
  await db.update(noteCommentThreads).set({ updatedAt: new Date() }).where(eq(noteCommentThreads.id, input.threadId));
  return { ok: true, value: { ok: true, deletedThread: false } } as const;
}

export async function deleteCommentThread(input: {
  noteId: string;
  threadId: string;
  userId: string;
  actor: CommentActor;
}) {
  const current = await readCommentableNote(input);
  if (!current.ok) return current;
  const [thread] = await db
    .select()
    .from(noteCommentThreads)
    .where(
      and(
        eq(noteCommentThreads.id, input.threadId),
        eq(noteCommentThreads.noteId, input.noteId),
        eq(noteCommentThreads.userId, input.userId)
      )
    )
    .limit(1);
  if (!thread)
    return { ok: false, status: 404, error: 'Comment thread not found' } satisfies CommentOperationResult<never>;
  if (
    !isOwnerActor(input.actor, input.userId) &&
    !sameActor({ actorType: thread.createdByActorType, actorId: thread.createdByActorId }, input.actor)
  )
    return {
      ok: false,
      status: 403,
      error: 'Only the thread author or note owner can delete it',
    } satisfies CommentOperationResult<never>;
  await db.delete(noteCommentThreads).where(eq(noteCommentThreads.id, thread.id));
  return { ok: true, value: { ok: true } } as const;
}
