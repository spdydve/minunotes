import type { EditorComment, EditorCommentAnchor, EditorCommentsConfig } from '@dpklabs/minueditor';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute, useBlocker, useNavigate } from '@tanstack/react-router';
import { MessageSquare } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BacklinksPanel } from '../components/backlinks-panel';
import { NoteActionsPopover } from '../components/note-actions-popover';
import { NoteCanvasEditor } from '../components/note-canvas-editor';
import { type CommentDialogPosition, NoteCommentDialog } from '../components/note-comment-dialog';
import { NoteCommentsPanel } from '../components/note-comments-panel';
import { NoteEditor } from '../components/note-editor';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import {
  ApiError,
  api,
  type CommentAnchorInput,
  type CommentMessage,
  type CommentReactionEmoji,
  type CommentThread,
  type NoteCommentsResponse,
} from '../lib/api';
import { internalNoteLinkTarget } from '../lib/link-policy';
import { createConfiguredInternalNoteUrlPasteResolver } from '../lib/note-urls';
import { rootRoute } from './__root';

function NoteView() {
  const { noteId } = noteRoute.useParams();
  const internalNoteUrlPasteResolver = useMemo(createConfiguredInternalNoteUrlPasteResolver, []);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['note', noteId],
    queryFn: () => api.note(noteId),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  });
  const { data: backlinksData, isLoading: backlinksLoading } = useQuery({
    queryKey: ['backlinks', noteId],
    queryFn: () => api.backlinks(noteId),
    enabled: Boolean(data?.note && data.note.documentType === 'markdown'),
  });
  const { data: commentsData } = useQuery({
    queryKey: ['note-comments', noteId],
    queryFn: () => api.noteComments(noteId),
    enabled: Boolean(data?.note && data.note.documentType === 'markdown' && data.note.type === 'note'),
  });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [editorMode, setEditorMode] = useState<'live' | 'source'>('live');
  const [saveError, setSaveError] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [commentDialogPosition, setCommentDialogPosition] = useState<CommentDialogPosition | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [draftCommentAnchor, setDraftCommentAnchor] = useState<EditorCommentAnchor | null>(null);
  const [reviewFocus, setReviewFocus] = useState<{
    from: number;
    to: number;
    detached?: boolean;
    requestId: number;
  } | null>(null);
  const [mappedAnchors, setMappedAnchors] = useState<Record<string, EditorCommentAnchor>>({});
  const [commentError, setCommentError] = useState<string | null>(null);
  const hydratedNoteId = useRef<string | null>(null);
  const lastSaved = useRef({ title: '', content: '' });
  const lastKnownHash = useRef<string | null>(null);
  const reviewFocusRequest = useRef(0);

  useEffect(() => {
    if (!data?.note) return;
    document.title = `${data.note.title} - MinuNotes`;
  }, [data?.note]);

  useEffect(() => {
    if (hydratedNoteId.current !== noteId) return;
    document.title = `${title.trim() || 'Untitled note'} - MinuNotes`;
  }, [noteId, title]);

  useEffect(() => {
    if (!data?.note || hydratedNoteId.current === noteId) return;
    hydratedNoteId.current = noteId;
    setTitle(data.note.title);
    setContent(data.note.content);
    setEditorMode('live');
    lastSaved.current = { title: data.note.title, content: data.note.content };
    lastKnownHash.current = data.contentHash;
    setSaveError(false);
    setImageUploadError(null);
    setIsStale(false);
    setReviewOpen(false);
    setCommentDialogOpen(false);
    setCommentDialogPosition(null);
    setSelectedThreadId(null);
    setDraftCommentAnchor(null);
  }, [data, noteId]);

  const applySavedNote = ({ note, contentHash }: { note: NonNullable<typeof data>['note']; contentHash: string }) => {
    lastSaved.current = { title: note.title, content: note.content };
    lastKnownHash.current = contentHash;
    setSaveError(false);
    setIsStale(false);
    qc.setQueryData(['note', noteId], { note, contentHash });
    qc.invalidateQueries({ queryKey: [note.type === 'template' ? 'templates' : 'notes', note.folderId] });
    qc.invalidateQueries({ queryKey: ['notes', 'recent'] });
    if (note.type === 'template') qc.invalidateQueries({ queryKey: ['templates'] });
    qc.invalidateQueries({ queryKey: ['note-events', noteId] });
    qc.invalidateQueries({ queryKey: ['backlinks'] });
  };

  const applyDetailsUpdate = (response: { note: NonNullable<typeof data>['note']; contentHash: string }) => {
    setTitle(response.note.title);
    setContent(response.note.content);
    applySavedNote(response);
  };

  const save = useMutation({
    mutationFn: (next: { title: string; content: string }) =>
      api.saveNote(noteId, { ...next, baseHash: lastKnownHash.current ?? undefined }),
    onSuccess: applySavedNote,
    onError: async (error, attempted) => {
      setSaveError(true);
      if (!(error instanceof ApiError) || error.status !== 409) return;

      const latest = await api.note(noteId).catch(() => null);
      if (!latest) {
        setIsStale(true);
        return;
      }

      lastKnownHash.current = latest.contentHash;
      qc.setQueryData(['note', noteId], latest);

      if (latest.note.title === attempted.title && latest.note.content === attempted.content) {
        applySavedNote(latest);
        return;
      }

      setIsStale(true);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteNote(noteId),
    onSuccess: () => {
      const deletedNote = data?.note;
      qc.removeQueries({ queryKey: ['note', noteId] });
      qc.invalidateQueries({ queryKey: ['notes', 'recent'] });
      if (!deletedNote) return nav({ to: '/' });
      qc.invalidateQueries({ queryKey: ['notes', deletedNote.folderId] });
      if (deletedNote.type === 'template') qc.invalidateQueries({ queryKey: ['templates'] });
      return nav(
        deletedNote.type === 'template'
          ? { to: '/templates' }
          : { to: '/folders/$folderId', params: { folderId: deletedNote.folderId } }
      );
    },
  });
  const toggleApiEditable = useMutation({
    mutationFn: () => {
      if (!data?.note) throw new Error('Note is not loaded');
      return api.saveNote(noteId, { isApiEditable: !data.note.isApiEditable });
    },
    onSuccess: ({ note, contentHash }) => {
      lastKnownHash.current = contentHash;
      qc.setQueryData(['note', noteId], { note, contentHash });
      qc.invalidateQueries({ queryKey: ['note-events', noteId] });
    },
  });

  const isDirty = title !== lastSaved.current.title || content !== lastSaved.current.content;
  const isSaving = save.isPending;
  const commentMutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onError: (error) => setCommentError(error instanceof Error ? error.message : 'Comment action failed'),
  });
  const blocker = useBlocker({
    shouldBlockFn: () => isDirty || isSaving,
    enableBeforeUnload: false,
    withResolver: true,
  });
  const saveState = useMemo<'saved' | 'saving' | 'unsaved' | 'error'>(() => {
    if (saveError) return 'error';
    if (isSaving) return 'saving';
    if (isDirty) return 'unsaved';
    return 'saved';
  }, [isDirty, isSaving, saveError]);

  const saveNow = () => {
    if (!isDirty || save.isPending || isStale) return;
    save.mutate({ title, content });
  };

  const uploadImage = async (file: File) => {
    setImageUploadError(null);
    const result = await api.uploadNoteImage(noteId, file).catch((error) => {
      setImageUploadError(error instanceof Error ? error.message : 'Image upload failed');
      throw error;
    });
    return result.markdownUrl;
  };

  const reloadLatest = async () => {
    const latest = (await refetch()).data;
    if (!latest?.note) return;
    hydratedNoteId.current = noteId;
    setTitle(latest.note.title);
    setContent(latest.note.content);
    applySavedNote(latest);
  };

  useEffect(() => {
    if (!hydratedNoteId.current || !isDirty || save.isPending || isStale) return;
    const timer = window.setTimeout(() => save.mutate({ title, content }), 800);
    return () => window.clearTimeout(timer);
  }, [title, content, isDirty, isStale, save]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [title, content, isDirty, save.isPending]);

  useEffect(() => {
    if (!hydratedNoteId.current || save.isPending || isStale) return;
    const checkStatus = async () => {
      if (document.visibilityState !== 'visible' || save.isPending || isStale) return;
      const status = await api.noteStatus(noteId).catch(() => null);
      if (!status || !lastKnownHash.current) return;
      if (status.contentHash !== lastKnownHash.current && !isDirty) setIsStale(true);
    };
    const timer = window.setInterval(checkStatus, 20_000);
    return () => window.clearInterval(timer);
  }, [noteId, data?.contentHash, save.isPending, isStale, isDirty]);

  useEffect(() => {
    if (blocker.status !== 'blocked') return;
    if (save.isPending) return;
    if (isDirty) {
      saveNow();
      return;
    }
    blocker.proceed?.();
  }, [blocker, isDirty, title, content, save.isPending]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty && !save.isPending) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty, save.isPending]);

  const runCommentAction = async <T,>(operation: () => Promise<T>) => {
    setCommentError(null);
    return (await commentMutation.mutateAsync(operation)) as T;
  };

  const updateCommentCache = (update: (current: NoteCommentsResponse) => NoteCommentsResponse) => {
    qc.setQueryData<NoteCommentsResponse>(['note-comments', noteId], (current) =>
      current ? update(current) : current
    );
  };
  const cacheThread = (thread: CommentThread) => {
    updateCommentCache((current) => {
      const exists = current.threads.some((candidate) => candidate.id === thread.id);
      return {
        ...current,
        threads: exists
          ? current.threads.map((candidate) => (candidate.id === thread.id ? thread : candidate))
          : [thread, ...current.threads],
      };
    });
  };
  const cacheMessage = (message: CommentMessage) => {
    updateCommentCache((current) => ({
      ...current,
      threads: current.threads.map((thread) =>
        thread.id === message.threadId
          ? {
              ...thread,
              updatedAt: message.updatedAt,
              messages: thread.messages.some((candidate) => candidate.id === message.id)
                ? thread.messages.map((candidate) => (candidate.id === message.id ? message : candidate))
                : [...thread.messages, message],
            }
          : thread
      ),
    }));
  };

  const focusCommentThread = (thread: CommentThread) => {
    setSelectedThreadId(thread.id);
    setDraftCommentAnchor(null);
    setReviewFocus({
      from: thread.anchor.from,
      to: thread.anchor.to,
      detached: thread.anchor.detached,
      requestId: ++reviewFocusRequest.current,
    });
  };

  const selectReviewThread = (thread: CommentThread) => {
    focusCommentThread(thread);
    setCommentDialogOpen(false);
  };

  const openCommentThreadDialog = (thread: CommentThread) => {
    focusCommentThread(thread);
    setReviewOpen(false);
    setCommentDialogOpen(true);
  };

  const toCommentAnchorInput = (anchor: EditorCommentAnchor, documentHash: string): CommentAnchorInput => ({
    anchorType: anchor.anchorType,
    from: anchor.from,
    to: anchor.to,
    quote: anchor.quote,
    ...(anchor.prefix !== undefined ? { prefix: anchor.prefix } : {}),
    ...(anchor.suffix !== undefined ? { suffix: anchor.suffix } : {}),
    documentHash,
    ...(anchor.detached ? { detached: true } : {}),
  });

  useEffect(() => {
    if (isDirty || save.isPending || !data?.contentHash) return;
    const pending = Object.entries(mappedAnchors);
    if (pending.length === 0) return;
    const documentHash = data.contentHash;
    const timer = window.setTimeout(() => {
      void Promise.all(
        pending.map(([threadId, anchor]) =>
          api.updateCommentAnchor(noteId, threadId, toCommentAnchorInput(anchor, documentHash))
        )
      )
        .then((responses) => {
          for (const response of responses) cacheThread(response.thread);
          setMappedAnchors((current) => {
            const next = { ...current };
            for (const [threadId, anchor] of pending) if (next[threadId] === anchor) delete next[threadId];
            return next;
          });
        })
        .catch((error) => setCommentError(error instanceof Error ? error.message : 'Could not update comment anchor'));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [data?.contentHash, isDirty, mappedAnchors, noteId, save.isPending]);

  const editorComments = useMemo<EditorComment[]>(
    () =>
      (commentsData?.threads ?? []).map((thread) => {
        const mapped = mappedAnchors[thread.id];
        const anchor = mapped ?? {
          anchorType: thread.anchor.anchorType,
          from: thread.anchor.from,
          to: thread.anchor.to,
          quote: thread.anchor.quote,
          prefix: thread.anchor.prefix,
          suffix: thread.anchor.suffix,
          documentVersion: thread.anchor.documentHash,
          detached: thread.anchor.detached,
        };
        return {
          id: thread.id,
          body: thread.messages[0]?.body ?? 'Comment thread',
          status: thread.status,
          anchor,
          author: thread.createdBy,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
        };
      }),
    [commentsData?.threads, mappedAnchors]
  );

  const commentsConfig = useMemo<EditorCommentsConfig>(
    () => ({
      items: editorComments,
      documentVersion: data?.contentHash,
      showPanel: false,
      onRequest: (anchor) => {
        setDraftCommentAnchor(anchor);
        setSelectedThreadId(null);
        setReviewOpen(false);
        setCommentDialogOpen(true);
        setCommentError(null);
      },
      onSelect: (comment) => {
        if (!comment) return;
        const thread = commentsData?.threads.find((candidate) => candidate.id === comment.id);
        if (thread) openCommentThreadDialog(thread);
      },
      onSelectGroup: (comments) => {
        const first = comments[0];
        if (!first) return;
        const thread = commentsData?.threads.find((candidate) => candidate.id === first.id);
        if (thread) openCommentThreadDialog(thread);
      },
      onAnchorChange: (threadId, anchor) => {
        setMappedAnchors((current) => ({ ...current, [threadId]: anchor }));
      },
    }),
    [commentsData?.threads, data?.contentHash, editorComments]
  );

  const wikiLinks = useMemo(() => {
    const noteIdPattern = /^note_[a-zA-Z0-9]+$/;
    const findNote = async (target: string) => {
      const trimmed = target.trim();
      if (!trimmed) return null;
      if (noteIdPattern.test(trimmed)) {
        const result = await api.note(trimmed).catch(() => null);
        return result?.note?.type === 'note' ? result.note : null;
      }
      const result = await api.searchNotes(trimmed, 'note', 50);
      const matches = result.notes.filter((note) => note.type === 'note' && note.title === trimmed);
      return matches.length === 1 ? matches[0] : null;
    };

    return {
      enabled: true,
      openOnClick: true,
      labelBehavior: 'title' as const,
      resolvePastedUrl: internalNoteUrlPasteResolver,
      suggest: async (query: string, context?: { link?: { target: string; label?: string } }) => {
        const trimmed = query.trim();
        const searchTerm = noteIdPattern.test(trimmed) && context?.link?.label ? context.link.label.trim() : trimmed;
        const result = searchTerm ? await api.searchNotes(searchTerm, 'note', 50) : await api.recentNotes(20);
        return result.notes
          .filter((note) => note.id !== noteId && note.type === 'note')
          .slice(0, 50)
          .map((note) => ({
            id: note.id,
            target: note.id,
            label: note.title,
            detail: 'folderTitle' in note && typeof note.folderTitle === 'string' ? note.folderTitle : 'Note',
          }));
      },
      resolve: async (target: string) => {
        const note = await findNote(target).catch(() => null);
        return note
          ? { status: 'resolved' as const, href: `/notes/${note.id}`, title: note.title }
          : { status: 'unresolved' as const, title: target };
      },
      onOpen: (target: string) => {
        void findNote(target).then((note) => {
          if (note && internalNoteLinkTarget('wikilink') === 'current-tab')
            void nav({ to: '/notes/$noteId', params: { noteId: note.id } });
        });
      },
    };
  }, [nav, noteId]);

  if (isLoading) return <p className="notes-muted text-sm">Loading note...</p>;
  if (error instanceof ApiError && error.status === 404)
    return (
      <section className="grid min-h-[60vh] place-items-center">
        <EmptyState title="Note not found">
          <p>This note does not exist or you do not have access to it.</p>
          <Button className="mt-4" onClick={() => nav({ to: '/' })}>
            Back to notes
          </Button>
        </EmptyState>
      </section>
    );
  if (!data?.note)
    return (
      <section className="grid min-h-[60vh] place-items-center">
        <EmptyState title="Unable to load note">
          <p>Try again or return to your notes.</p>
          <Button className="mt-4" onClick={() => nav({ to: '/' })}>
            Back to notes
          </Button>
        </EmptyState>
      </section>
    );
  if (hydratedNoteId.current !== noteId) return <p className="notes-muted text-sm">Loading note...</p>;

  const updatedMeta =
    data.note.type === 'template'
      ? 'Template'
      : data.note.updatedByActorType === 'agent'
        ? `Last updated via API key${data.note.updatedByActorUid ? ` (${data.note.updatedByActorUid})` : ''}`
        : data.note.updatedByActorType === 'system'
          ? 'Last updated by system'
          : null;

  const staleNotice = (
    <>
      {isStale ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <span>This note was updated elsewhere. Reload to view the latest version.</span>
          <button
            type="button"
            className="rounded border border-amber-400 px-2 py-1 text-xs font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900"
            onClick={reloadLatest}
          >
            Reload
          </button>
        </div>
      ) : null}
      {imageUploadError ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {imageUploadError}
        </div>
      ) : null}
    </>
  );
  const createComment = async (body: string, anchor: EditorCommentAnchor) => {
    await runCommentAction(async () => {
      let documentHash = lastKnownHash.current;
      if (isDirty) {
        const saved = await save.mutateAsync({ title, content });
        documentHash = saved.contentHash;
      }
      if (!documentHash) throw new Error('The note must finish loading before adding a comment');
      const created = await api.createCommentThread(noteId, {
        body,
        anchor: toCommentAnchorInput(anchor, documentHash),
      });
      cacheThread(created.thread);
      setDraftCommentAnchor(null);
      focusCommentThread(created.thread);
    });
  };
  const replyToComment = async (threadId: string, body: string) => {
    const response = await runCommentAction(() => api.addCommentReply(noteId, threadId, body));
    cacheMessage(response.message);
  };
  const changeCommentStatus = async (thread: CommentThread) => {
    const response = await runCommentAction(() =>
      thread.status === 'resolved'
        ? api.reopenCommentThread(noteId, thread.id)
        : api.resolveCommentThread(noteId, thread.id)
    );
    cacheThread(response.thread);
  };
  const editCommentMessage = async (threadId: string, messageId: string, body: string) => {
    const response = await runCommentAction(() => api.updateCommentMessage(noteId, threadId, messageId, body));
    cacheMessage(response.message);
  };
  const deleteCommentMessage = async (threadId: string, messageId: string) => {
    const response = await runCommentAction(() => api.deleteCommentMessage(noteId, threadId, messageId));
    updateCommentCache((current) => ({
      ...current,
      threads: response.deletedThread
        ? current.threads.filter((thread) => thread.id !== threadId)
        : current.threads.map((thread) =>
            thread.id === threadId
              ? { ...thread, messages: thread.messages.filter((message) => message.id !== messageId) }
              : thread
          ),
    }));
  };
  const toggleCommentReaction = async (threadId: string, messageId: string, emoji: CommentReactionEmoji) => {
    const previous = qc.getQueryData<NoteCommentsResponse>(['note-comments', noteId]);
    updateCommentCache((current) => ({
      ...current,
      threads: current.threads.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              messages: thread.messages.map((message) => {
                if (message.id !== messageId) return message;
                const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
                const reactions = existing
                  ? existing.reactedByCurrentActor
                    ? existing.count === 1
                      ? message.reactions.filter((reaction) => reaction.emoji !== emoji)
                      : message.reactions.map((reaction) =>
                          reaction.emoji === emoji
                            ? { ...reaction, count: reaction.count - 1, reactedByCurrentActor: false }
                            : reaction
                        )
                    : message.reactions.map((reaction) =>
                        reaction.emoji === emoji
                          ? { ...reaction, count: reaction.count + 1, reactedByCurrentActor: true }
                          : reaction
                      )
                  : [...message.reactions, { emoji, count: 1, reactedByCurrentActor: true }];
                return { ...message, reactions };
              }),
            }
          : thread
      ),
    }));
    try {
      const response = await runCommentAction(() => api.toggleCommentReaction(noteId, threadId, messageId, emoji));
      updateCommentCache((current) => ({
        ...current,
        threads: current.threads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                messages: thread.messages.map((message) =>
                  message.id === messageId ? { ...message, reactions: response.reactions } : message
                ),
              }
            : thread
        ),
      }));
    } catch (error) {
      if (previous) qc.setQueryData(['note-comments', noteId], previous);
      throw error;
    }
  };
  const deleteCommentThread = async (threadId: string) => {
    await runCommentAction(() => api.deleteCommentThread(noteId, threadId));
    updateCommentCache((current) => ({
      ...current,
      threads: current.threads.filter((thread) => thread.id !== threadId),
    }));
    if (selectedThreadId === threadId) {
      setSelectedThreadId(null);
      setCommentDialogOpen(false);
    }
  };
  const selectedThread = commentsData?.threads.find((thread) => thread.id === selectedThreadId) ?? null;
  const reviewPanel = (
    <>
      <NoteCommentsPanel
        open={reviewOpen}
        threads={commentsData?.threads ?? []}
        selectedThreadId={selectedThreadId}
        busy={commentMutation.isPending || save.isPending}
        error={commentError}
        onClose={() => setReviewOpen(false)}
        onSelect={selectReviewThread}
        onReply={replyToComment}
        onStatusChange={changeCommentStatus}
        onEditMessage={editCommentMessage}
        onDeleteMessage={deleteCommentMessage}
        onDeleteThread={deleteCommentThread}
        onToggleReaction={toggleCommentReaction}
      />
      <NoteCommentDialog
        open={commentDialogOpen}
        position={commentDialogPosition}
        thread={selectedThread}
        draftAnchor={draftCommentAnchor}
        busy={commentMutation.isPending || save.isPending}
        error={commentError}
        onClose={() => {
          setCommentDialogOpen(false);
          setDraftCommentAnchor(null);
        }}
        onCreate={createComment}
        onReply={replyToComment}
        onStatusChange={changeCommentStatus}
        onEditMessage={editCommentMessage}
        onDeleteMessage={deleteCommentMessage}
        onDeleteThread={deleteCommentThread}
        onToggleReaction={toggleCommentReaction}
      />
    </>
  );
  const actions = (
    <>
      {data.note.documentType === 'markdown' && data.note.type === 'note' ? (
        <button
          type="button"
          className="rounded-md p-2 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
          onClick={() => {
            setCommentDialogOpen(false);
            setDraftCommentAnchor(null);
            setReviewOpen(true);
          }}
          aria-label="Open Review"
          aria-expanded={reviewOpen}
          title="Review comments"
        >
          <MessageSquare className="h-4 w-4" />
        </button>
      ) : null}
      <NoteActionsPopover
        note={data.note}
        icon="settings"
        onDelete={() => remove.mutateAsync()}
        onToggleApiEditable={() => toggleApiEditable.mutate()}
        onNoteUpdated={applyDetailsUpdate}
        editorMode={data.note.documentType === 'markdown' ? editorMode : undefined}
        onEditorModeChange={data.note.documentType === 'markdown' ? setEditorMode : undefined}
      />
    </>
  );

  if (data.note.documentType.startsWith('canvas.')) {
    return (
      <NoteCanvasEditor
        key={noteId}
        noteId={noteId}
        title={title}
        content={content}
        documentType={data.note.documentType as 'canvas.default' | 'canvas.mindmap'}
        saveState={saveState}
        onTitleChange={setTitle}
        onContentChange={setContent}
        updatedMeta={updatedMeta}
        staleNotice={staleNotice}
        actions={actions}
      />
    );
  }

  return (
    <NoteEditor
      key={noteId}
      title={title}
      content={content}
      saveState={saveState}
      onTitleChange={setTitle}
      onContentChange={setContent}
      initialEditing={!data.note.content.trim()}
      editorMode={editorMode}
      updatedMeta={updatedMeta}
      headerExtra={<BacklinksPanel backlinks={backlinksData?.backlinks} isLoading={backlinksLoading} />}
      staleNotice={staleNotice}
      onImageUpload={uploadImage}
      wikiLinks={wikiLinks}
      comments={data.note.type === 'note' ? commentsConfig : undefined}
      reviewPanel={reviewPanel}
      reviewFocus={reviewFocus}
      onCommentAnchorPosition={setCommentDialogPosition}
      actions={actions}
    />
  );
}

export const noteRoute = createRoute({ getParentRoute: () => rootRoute, path: '/notes/$noteId', component: NoteView });
