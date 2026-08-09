import { MoreHorizontal, Pencil, SmilePlus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { COMMENT_REACTIONS, type CommentMessage, type CommentReactionEmoji, type CommentThread } from '../lib/api';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from './ui/popover';

export function formatCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - Date.now()) / 1_000);
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' });
  if (Math.abs(seconds) < 60) return relative.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return relative.format(days, 'day');
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function isEdited(message: CommentMessage) {
  return new Date(message.updatedAt).getTime() > new Date(message.createdAt).getTime();
}

function canEditMessage(message: CommentMessage) {
  return message.author.type === 'user' && message.author.id === 'owner';
}

function initials(name: string) {
  const value = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return value || '?';
}

export function NoteCommentDiscussion({
  thread,
  busy,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
}: {
  thread: CommentThread;
  busy: boolean;
  onEditMessage: (threadId: string, messageId: string, body: string) => Promise<void>;
  onDeleteMessage: (threadId: string, messageId: string) => Promise<void>;
  onToggleReaction: (threadId: string, messageId: string, emoji: CommentReactionEmoji) => Promise<void>;
}) {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');

  useEffect(() => {
    if (editingMessageId && !thread.messages.some((message) => message.id === editingMessageId)) {
      setEditingMessageId(null);
      setEditingBody('');
    }
  }, [editingMessageId, thread.messages]);

  const submitEdit = async (message: CommentMessage) => {
    if (!editingBody.trim()) return;
    await onEditMessage(thread.id, message.id, editingBody);
    setEditingMessageId(null);
    setEditingBody('');
  };

  return (
    <div className="space-y-0">
      {thread.messages.map((message, index) => {
        const editable = canEditMessage(message);
        const editing = editingMessageId === message.id;
        const isRoot = index === 0;
        return (
          <article key={message.id} className="group/message relative flex gap-2.5 pb-3 last:pb-0">
            {index < thread.messages.length - 1 ? (
              <span className="absolute top-7 bottom-0 left-3 w-px bg-[var(--notes-border)]" aria-hidden="true" />
            ) : null}
            <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--notes-panel-muted)] font-medium text-[10px] text-[var(--notes-muted)]">
              {initials(message.author.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-h-6 items-start justify-between gap-2">
                <p className="min-w-0 text-xs">
                  <span className="font-semibold text-[var(--notes-text)]">{message.author.name}</span>{' '}
                  <span className="text-[var(--notes-muted)]">
                    {formatCommentTime(message.updatedAt)}
                    {isEdited(message) ? ' (edited)' : ''}
                  </span>
                </p>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="rounded p-1 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
                        aria-label="Add reaction"
                      >
                        <SmilePlus className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="flex min-w-0 gap-0.5 p-1.5">
                      {COMMENT_REACTIONS.map((emoji) => (
                        <PopoverClose asChild key={emoji}>
                          <button
                            type="button"
                            className="rounded p-1.5 text-base hover:bg-[var(--notes-hover)]"
                            onClick={() => void onToggleReaction(thread.id, message.id, emoji).catch(() => undefined)}
                            aria-label={`React with ${emoji}`}
                          >
                            {emoji}
                          </button>
                        </PopoverClose>
                      ))}
                    </PopoverContent>
                  </Popover>
                  {editable ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="rounded p-1 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
                          aria-label="More comment actions"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-40">
                        <PopoverClose asChild>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--notes-hover)]"
                            onClick={() => {
                              setEditingMessageId(message.id);
                              setEditingBody(message.body);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        </PopoverClose>
                        {!isRoot ? (
                          <PopoverClose asChild>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[var(--notes-button-destructive-text)] text-sm hover:bg-[var(--notes-button-destructive-soft-hover)]"
                              onClick={() => void onDeleteMessage(thread.id, message.id).catch(() => undefined)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </PopoverClose>
                        ) : null}
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>
              </div>

              {editing ? (
                <form
                  className="mt-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitEdit(message).catch(() => undefined);
                  }}
                >
                  <textarea
                    className="min-h-20 w-full resize-y rounded-md border border-[var(--notes-border)] bg-[var(--notes-bg)] p-2 text-sm outline-none focus:border-[var(--notes-blue)]"
                    value={editingBody}
                    onChange={(event) => setEditingBody(event.target.value)}
                    aria-label="Edit comment"
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
                      type="submit"
                      className="rounded bg-[var(--notes-button-secondary-bg)] px-2 py-1 text-[var(--notes-button-secondary-text)] text-xs disabled:opacity-50"
                      disabled={busy || !editingBody.trim()}
                    >
                      Save
                    </button>
                  </div>
                </form>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
              )}

              {message.reactions.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {message.reactions.map((reaction) => (
                    <button
                      type="button"
                      key={reaction.emoji}
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        reaction.reactedByCurrentActor
                          ? 'border-[var(--notes-blue)] bg-[var(--notes-selected)] text-[var(--notes-text)]'
                          : 'border-[var(--notes-border)] bg-[var(--notes-panel-muted)] text-[var(--notes-muted)] hover:bg-[var(--notes-hover)]'
                      }`}
                      onClick={() =>
                        void onToggleReaction(thread.id, message.id, reaction.emoji).catch(() => undefined)
                      }
                      aria-pressed={reaction.reactedByCurrentActor}
                      aria-label={`${reaction.emoji} reaction, ${reaction.count}`}
                    >
                      {reaction.emoji} {reaction.count}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
