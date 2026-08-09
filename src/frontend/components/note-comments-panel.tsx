import type { EditorCommentAnchor } from '@dpklabs/minueditor';
import { Check, MessageSquare, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CommentMessage, CommentThread } from '../lib/api';

function formatCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function NoteCommentsPanel({
  open,
  threads,
  selectedThreadId,
  draftAnchor,
  busy,
  error,
  onClose,
  onSelect,
  onCancelDraft,
  onCreate,
  onReply,
  onStatusChange,
  onEditMessage,
  onDeleteMessage,
  onDeleteThread,
}: {
  open: boolean;
  threads: CommentThread[];
  selectedThreadId: string | null;
  draftAnchor: EditorCommentAnchor | null;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSelect: (thread: CommentThread) => void;
  onCancelDraft: () => void;
  onCreate: (body: string, anchor: EditorCommentAnchor) => Promise<void>;
  onReply: (threadId: string, body: string) => Promise<void>;
  onStatusChange: (thread: CommentThread) => Promise<void>;
  onEditMessage: (threadId: string, messageId: string, body: string) => Promise<void>;
  onDeleteMessage: (threadId: string, messageId: string) => Promise<void>;
  onDeleteThread: (threadId: string) => Promise<void>;
}) {
  const [newBody, setNewBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');

  useEffect(() => {
    setReplyBody('');
    setEditingMessageId(null);
  }, [selectedThreadId]);

  if (!open) return null;

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;
  const submitNew = async () => {
    if (!draftAnchor || !newBody.trim()) return;
    try {
      await onCreate(newBody, draftAnchor);
      setNewBody('');
    } catch {
      // The route-owned mutation renders the API error and keeps the draft available.
    }
  };
  const submitReply = async () => {
    if (!selectedThread || !replyBody.trim()) return;
    try {
      await onReply(selectedThread.id, replyBody);
      setReplyBody('');
    } catch {
      // Keep the reply available for correction or retry.
    }
  };
  const submitEdit = async (message: CommentMessage) => {
    if (!editingBody.trim()) return;
    try {
      await onEditMessage(message.threadId, message.id, editingBody);
      setEditingMessageId(null);
      setEditingBody('');
    } catch {
      // Keep edit mode open when persistence fails.
    }
  };

  return (
    <aside
      className="fixed inset-x-3 bottom-3 z-50 flex max-h-[min(72vh,44rem)] flex-col overflow-hidden rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] shadow-2xl xl:sticky xl:top-28 xl:z-10 xl:max-h-[calc(100vh-8rem)] xl:w-80 xl:self-start xl:shadow-sm"
      aria-label="Review comments"
    >
      <header className="flex items-center justify-between border-[var(--notes-border)] border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <h2 className="font-semibold text-sm">Review</h2>
          <span className="rounded bg-[var(--notes-hover)] px-1.5 py-0.5 text-[var(--notes-muted)] text-xs">
            {threads.length}
          </span>
        </div>
        <button
          type="button"
          className="rounded p-1 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
          onClick={onClose}
          aria-label="Close Review"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {draftAnchor ? (
          <section className="rounded-md border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-900/70 dark:bg-amber-950/30">
            <p className="mb-2 font-semibold text-amber-900 text-xs dark:text-amber-200">New comment</p>
            <blockquote className="mb-3 border-amber-500 border-l-2 pl-2 text-[var(--notes-muted)] text-xs">
              {draftAnchor.quote}
            </blockquote>
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-[var(--notes-border)] bg-[var(--notes-bg)] p-2 text-sm outline-none focus:border-amber-500"
              value={newBody}
              onChange={(event) => setNewBody(event.target.value)}
              placeholder="Leave a comment…"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                className="rounded px-2 py-1 text-[var(--notes-muted)] text-xs hover:bg-[var(--notes-hover)]"
                onClick={() => {
                  setNewBody('');
                  onCancelDraft();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-amber-600 px-2.5 py-1 font-medium text-white text-xs hover:bg-amber-700 disabled:opacity-50"
                disabled={busy || !newBody.trim()}
                onClick={() => void submitNew()}
              >
                Comment
              </button>
            </div>
          </section>
        ) : null}

        {error ? (
          <p className="rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-red-800 text-xs dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {threads.length === 0 && !draftAnchor ? (
          <div className="py-8 text-center text-[var(--notes-muted)] text-sm">
            <MessageSquare className="mx-auto mb-2 h-5 w-5" />
            <p>No comments yet.</p>
            <p className="mt-1 text-xs">Select text or use a line comment action.</p>
          </div>
        ) : null}

        {threads.map((thread) => {
          const selected = thread.id === selectedThreadId;
          return (
            <section
              key={thread.id}
              className={`rounded-md border p-3 ${
                selected
                  ? 'border-amber-400 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20'
                  : 'border-[var(--notes-border)] bg-[var(--notes-bg)]'
              } ${thread.status === 'resolved' ? 'opacity-75' : ''}`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <button type="button" className="min-w-0 text-left" onClick={() => onSelect(thread)}>
                  <span className="block truncate font-semibold text-xs">{thread.createdBy.name}</span>
                  <span className="block text-[11px] text-[var(--notes-muted)]">
                    {thread.anchor.detached ? 'Detached' : thread.status === 'resolved' ? 'Resolved' : 'Open'} ·{' '}
                    {formatCommentTime(thread.updatedAt)}
                  </span>
                </button>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="rounded p-1 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onStatusChange(thread).catch(() => undefined);
                    }}
                    aria-label={thread.status === 'resolved' ? 'Reopen comment' : 'Resolve comment'}
                    title={thread.status === 'resolved' ? 'Reopen' : 'Resolve'}
                  >
                    {thread.status === 'resolved' ? (
                      <RotateCcw className="h-3.5 w-3.5" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-[var(--notes-muted)] hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onDeleteThread(thread.id).catch(() => undefined);
                    }}
                    aria-label="Delete comment thread"
                    title="Delete thread"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {thread.anchor.detached ? (
                <p className="mb-2 rounded bg-amber-100 px-2 py-1 text-amber-900 text-xs dark:bg-amber-950/50 dark:text-amber-200">
                  The commented text changed and could not be reattached.
                </p>
              ) : (
                <blockquote className="mb-3 line-clamp-3 border-amber-500 border-l-2 pl-2 text-[var(--notes-muted)] text-xs">
                  {thread.anchor.quote}
                </blockquote>
              )}

              <div className="space-y-2">
                {thread.messages.map((message) => {
                  const editable = message.author.type === 'user' && message.author.id === 'owner';
                  const editing = editingMessageId === message.id;
                  return (
                    <article key={message.id} className="rounded bg-[var(--notes-panel)] p-2">
                      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[var(--notes-muted)]">
                        <span className="truncate font-medium text-[var(--notes-text)]">{message.author.name}</span>
                        <span>{formatCommentTime(message.updatedAt)}</span>
                      </div>
                      {editing ? (
                        <div>
                          <textarea
                            className="min-h-20 w-full resize-y rounded border border-[var(--notes-border)] bg-[var(--notes-bg)] p-2 text-sm outline-none focus:border-amber-500"
                            value={editingBody}
                            onChange={(event) => setEditingBody(event.target.value)}
                          />
                          <div className="mt-1 flex justify-end gap-1">
                            <button
                              type="button"
                              className="rounded px-2 py-1 text-[var(--notes-muted)] text-xs hover:bg-[var(--notes-hover)]"
                              onClick={() => setEditingMessageId(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="rounded bg-[var(--notes-text)] px-2 py-1 text-[var(--notes-bg)] text-xs disabled:opacity-50"
                              disabled={busy || !editingBody.trim()}
                              onClick={() => void submitEdit(message)}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap text-sm">{message.body}</p>
                          {editable ? (
                            <div className="mt-1 flex justify-end gap-1">
                              <button
                                type="button"
                                className="rounded p-1 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setEditingMessageId(message.id);
                                  setEditingBody(message.body);
                                }}
                                aria-label="Edit comment message"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              {message.id !== thread.messages[0]?.id ? (
                                <button
                                  type="button"
                                  className="rounded p-1 text-[var(--notes-muted)] hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void onDeleteMessage(thread.id, message.id).catch(() => undefined);
                                  }}
                                  aria-label="Delete comment message"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      )}
                    </article>
                  );
                })}
              </div>

              {selected && thread.status === 'open' ? (
                <div className="mt-3 border-[var(--notes-border)] border-t pt-2">
                  <textarea
                    className="min-h-20 w-full resize-y rounded-md border border-[var(--notes-border)] bg-[var(--notes-panel)] p-2 text-sm outline-none focus:border-amber-500"
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    placeholder="Reply…"
                  />
                  <div className="mt-1 flex justify-end">
                    <button
                      type="button"
                      className="rounded bg-[var(--notes-text)] px-2.5 py-1 font-medium text-[var(--notes-bg)] text-xs disabled:opacity-50"
                      disabled={busy || !replyBody.trim()}
                      onClick={() => void submitReply()}
                    >
                      Reply
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
