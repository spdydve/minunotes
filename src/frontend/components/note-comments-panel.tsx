import { Check, MessageSquare, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CommentMessage, CommentThread } from '../lib/api';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

export function formatCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function NoteCommentsPanel({
  open,
  threads,
  selectedThreadId,
  busy,
  error,
  onClose,
  onSelect,
  onReply,
  onStatusChange,
  onEditMessage,
  onDeleteMessage,
  onDeleteThread,
}: {
  open: boolean;
  threads: CommentThread[];
  selectedThreadId: string | null;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSelect: (thread: CommentThread) => void;
  onReply: (threadId: string, body: string) => Promise<void>;
  onStatusChange: (thread: CommentThread) => Promise<void>;
  onEditMessage: (threadId: string, messageId: string, body: string) => Promise<void>;
  onDeleteMessage: (threadId: string, messageId: string) => Promise<void>;
  onDeleteThread: (threadId: string) => Promise<void>;
}) {
  const [replyBody, setReplyBody] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');

  useEffect(() => {
    setReplyBody('');
    setEditingMessageId(null);
  }, [selectedThreadId]);

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
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className="inset-x-0 bottom-0 max-h-[82dvh] overflow-hidden rounded-t-2xl md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-96 md:rounded-none md:border-y-0 md:border-r-0"
        aria-label="Review comments"
      >
        <div className="flex items-start justify-between gap-3 border-[var(--notes-border)] border-b px-4 py-4">
          <div>
            <DialogTitle className="flex items-center gap-2 font-semibold text-sm">
              <MessageSquare className="h-4 w-4 text-[var(--notes-muted)]" />
              Review
            </DialogTitle>
            <DialogDescription className="notes-muted mt-1 text-xs">
              {threads.length} comment thread{threads.length === 1 ? '' : 's'}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              className="rounded-md p-1.5 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
              aria-label="Close Review"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogClose>
        </div>

        <div className="max-h-[calc(82dvh-4.5rem)] space-y-3 overflow-y-auto p-3 md:max-h-[calc(100dvh-4.5rem)]">
          {error ? (
            <p className="rounded-md border border-[var(--notes-button-destructive-border)] bg-[var(--notes-button-destructive-bg)] px-2 py-1.5 text-[var(--notes-button-destructive-text)] text-xs">
              {error}
            </p>
          ) : null}

          {threads.length === 0 ? (
            <div className="py-8 text-center text-[var(--notes-muted)] text-sm">
              <MessageSquare className="mx-auto mb-2 h-5 w-5" />
              <p>No comments yet.</p>
              <p className="mt-1 text-xs">Select text or use the line comment icon.</p>
            </div>
          ) : null}

          {threads.map((thread) => {
            const selected = thread.id === selectedThreadId;
            return (
              <section
                key={thread.id}
                className={`rounded-lg border p-3 ${
                  selected
                    ? 'border-[var(--notes-button-secondary-border)] bg-[var(--notes-hover)]'
                    : 'border-[var(--notes-border)] bg-[var(--notes-bg)]'
                } ${thread.status === 'resolved' ? 'opacity-70' : ''}`}
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
                      className="rounded p-1 text-[var(--notes-muted)] hover:bg-[var(--notes-panel)] hover:text-[var(--notes-text)]"
                      onClick={() => void onStatusChange(thread).catch(() => undefined)}
                      aria-label={thread.status === 'resolved' ? 'Reopen comment' : 'Resolve comment'}
                    >
                      {thread.status === 'resolved' ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-[var(--notes-muted)] hover:bg-[var(--notes-button-destructive-soft-hover)] hover:text-[var(--notes-button-destructive-text)]"
                      onClick={() => void onDeleteThread(thread.id).catch(() => undefined)}
                      aria-label="Delete comment thread"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {thread.anchor.detached ? (
                  <p className="mb-2 rounded bg-[var(--notes-panel-muted)] px-2 py-1 text-[var(--notes-muted)] text-xs">
                    The commented text changed and could not be reattached.
                  </p>
                ) : (
                  <blockquote className="mb-3 line-clamp-3 border-[var(--notes-border)] border-l-2 pl-2 text-[var(--notes-muted)] text-xs">
                    {thread.anchor.quote}
                  </blockquote>
                )}

                <div className="space-y-2">
                  {thread.messages.map((message) => {
                    const editable = message.author.type === 'user' && message.author.id === 'owner';
                    const editing = editingMessageId === message.id;
                    return (
                      <article key={message.id} className="rounded-md bg-[var(--notes-panel)] p-2">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[var(--notes-muted)]">
                          <span className="truncate font-medium text-[var(--notes-text)]">{message.author.name}</span>
                          <span>{formatCommentTime(message.updatedAt)}</span>
                        </div>
                        {editing ? (
                          <div>
                            <textarea
                              className="min-h-20 w-full resize-y rounded border border-[var(--notes-border)] bg-[var(--notes-bg)] p-2 text-sm outline-none focus:border-[var(--notes-blue)]"
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
                                className="rounded bg-[var(--notes-button-secondary-bg)] px-2 py-1 text-[var(--notes-button-secondary-text)] text-xs disabled:opacity-50"
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
                                  onClick={() => {
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
                                    className="rounded p-1 text-[var(--notes-muted)] hover:bg-[var(--notes-button-destructive-soft-hover)] hover:text-[var(--notes-button-destructive-text)]"
                                    onClick={() => void onDeleteMessage(thread.id, message.id).catch(() => undefined)}
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
                  <form
                    className="mt-3 border-[var(--notes-border)] border-t pt-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!replyBody.trim()) return;
                      void onReply(thread.id, replyBody)
                        .then(() => setReplyBody(''))
                        .catch(() => undefined);
                    }}
                  >
                    <textarea
                      className="min-h-20 w-full resize-y rounded-md border border-[var(--notes-border)] bg-[var(--notes-bg)] p-2 text-sm outline-none focus:border-[var(--notes-blue)]"
                      value={replyBody}
                      onChange={(event) => setReplyBody(event.target.value)}
                      placeholder="Reply…"
                    />
                    <div className="mt-1 flex justify-end">
                      <button
                        type="submit"
                        className="rounded border border-[var(--notes-button-secondary-border)] bg-[var(--notes-button-secondary-bg)] px-2.5 py-1 font-medium text-[var(--notes-button-secondary-text)] text-xs hover:bg-[var(--notes-button-secondary-hover)] disabled:opacity-50"
                        disabled={busy || !replyBody.trim()}
                      >
                        Reply
                      </button>
                    </div>
                  </form>
                ) : null}
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
