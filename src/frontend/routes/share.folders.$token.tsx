import {
  centerViewportForDocument,
  type JsonCanvasDocument,
  MinuCanvas,
  mindMapCanvasProfile,
  standardCanvasProfile,
} from '@dpklabs/minucanvas';
import { MarkdownEditor } from '@dpklabs/minueditor';
import { useQuery } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import type React from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '../components/ui/empty-state';
import { ApiError, api, type DocumentType, type SharedFolderChild, type SharedFolderNote } from '../lib/api';
import { editorCodeHighlighter } from '../lib/code-highlighter';
import { editorCodeLanguages } from '../lib/editor-languages';
import { rootRoute } from './__root';

const EMPTY_CANVAS: JsonCanvasDocument = { nodes: [], edges: [] };

type CanvasViewport = { x: number; y: number; zoom: number };
type SharedFolderTreeNode =
  | (SharedFolderChild & { children: SharedFolderTreeNode[]; notes: SharedFolderNote[] })
  | {
      id: string;
      parentFolderId: null;
      title: string;
      updatedAt: string;
      children: SharedFolderTreeNode[];
      notes: SharedFolderNote[];
    };

function parseCanvasDocument(content: string): JsonCanvasDocument {
  if (!content.trim()) return EMPTY_CANVAS;
  try {
    const parsed = JSON.parse(content) as Partial<JsonCanvasDocument>;
    return {
      nodes: Array.isArray(parsed.nodes) ? (parsed.nodes as JsonCanvasDocument['nodes']) : [],
      edges: Array.isArray(parsed.edges) ? (parsed.edges as JsonCanvasDocument['edges']) : [],
    };
  } catch {
    return EMPTY_CANVAS;
  }
}

function buildSharedFolderTree(input: {
  root: { id: string; title: string; updatedAt: string };
  folders: SharedFolderChild[];
  notes: SharedFolderNote[];
}): SharedFolderTreeNode {
  const root: SharedFolderTreeNode = {
    id: input.root.id,
    parentFolderId: null,
    title: input.root.title,
    updatedAt: input.root.updatedAt,
    children: [],
    notes: [],
  };
  const nodes = new Map<string, SharedFolderTreeNode>([
    [root.id, root],
    ...input.folders.map(
      (folder) => [folder.id, { ...folder, children: [], notes: [] } satisfies SharedFolderTreeNode] as const
    ),
  ]);

  for (const note of input.notes) nodes.get(note.folderId)?.notes.push(note);
  for (const folder of input.folders) {
    const node = nodes.get(folder.id);
    const parent = folder.parentFolderId ? nodes.get(folder.parentFolderId) : null;
    if (node && parent) parent.children.push(node);
  }

  const sortTree = (node: SharedFolderTreeNode) => {
    node.children.sort((a, b) => a.title.localeCompare(b.title));
    node.notes.sort((a, b) => a.title.localeCompare(b.title));
    for (const child of node.children) sortTree(child);
  };
  sortTree(root);
  return root;
}

function SharedFolderView() {
  const { token } = folderShareRoute.useParams();
  const { data, error, isLoading } = useQuery({
    queryKey: ['shared-folder', token],
    queryFn: () => api.sharedFolder(token),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const selectedNote = useMemo(() => {
    if (!data?.notes.length) return null;
    return data.notes.find((note) => note.id === selectedNoteId) ?? data.notes[0];
  }, [data?.notes, selectedNoteId]);
  const folderTree = useMemo(
    () =>
      data?.folder ? buildSharedFolderTree({ root: data.folder, folders: data.folders, notes: data.notes }) : null,
    [data?.folder, data?.folders, data?.notes]
  );

  if (isLoading)
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--notes-bg)] text-sm text-[var(--notes-muted)]">
        Loading shared folder...
      </div>
    );
  if (error instanceof ApiError && error.status === 404)
    return (
      <SharedFolderShell>
        <EmptyState title="Shared folder unavailable">
          <p>This link was revoked, expired, or does not exist.</p>
        </EmptyState>
      </SharedFolderShell>
    );
  if (!data?.folder)
    return (
      <SharedFolderShell>
        <EmptyState title="Unable to load folder">
          <p>Try opening the link again.</p>
        </EmptyState>
      </SharedFolderShell>
    );

  return (
    <SharedFolderShell>
      <div className="grid min-h-screen grid-cols-1 bg-[var(--notes-bg)] text-[var(--notes-text)] md:grid-cols-[18rem_1fr]">
        <aside className="border-b border-[var(--notes-border)] bg-[var(--notes-panel-muted)] p-4 md:border-r md:border-b-0">
          <p className="notes-muted text-xs">Shared folder · Read-only</p>
          <h1 className="mt-1 text-xl font-semibold">{data.folder.title}</h1>
          <p className="notes-muted mt-1 text-xs">Updated {new Date(data.folder.updatedAt).toLocaleString()}</p>
          <nav className="mt-5 space-y-1">
            {data.notes.length === 0 ? <p className="notes-muted text-sm">No shared notes in this folder.</p> : null}
            {folderTree ? (
              <SharedFolderTree
                node={folderTree}
                depth={0}
                selectedNoteId={selectedNote?.id ?? null}
                onSelectNote={setSelectedNoteId}
                showFolderTitle={false}
              />
            ) : null}
          </nav>
        </aside>
        <main className="min-w-0">
          {selectedNote ? (
            <SharedFolderNoteView note={selectedNote} />
          ) : (
            <div className="grid min-h-[60vh] place-items-center p-6">
              <EmptyState title="No notes shared">
                <p>This folder has no notes to display.</p>
              </EmptyState>
            </div>
          )}
        </main>
      </div>
    </SharedFolderShell>
  );
}

function SharedFolderTree({
  node,
  depth,
  selectedNoteId,
  onSelectNote,
  showFolderTitle,
}: {
  node: SharedFolderTreeNode;
  depth: number;
  selectedNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  showFolderTitle: boolean;
}) {
  return (
    <div className="space-y-1">
      {showFolderTitle ? (
        <div
          className="notes-muted px-3 pt-3 pb-1 font-medium text-[11px] uppercase tracking-wide"
          style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
        >
          {node.title}
        </div>
      ) : null}
      {node.notes.map((note) => (
        <button
          key={note.id}
          type="button"
          className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
            selectedNoteId === note.id
              ? 'bg-[var(--notes-hover)] text-[var(--notes-text)]'
              : 'text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]'
          }`}
          style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
          onClick={() => onSelectNote(note.id)}
        >
          <span className="block truncate">{note.title}</span>
          <span className="notes-muted block text-[11px]">
            {note.documentType.startsWith('canvas.') ? 'Canvas' : 'Note'}
          </span>
        </button>
      ))}
      {node.children.map((child) => (
        <SharedFolderTree
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedNoteId={selectedNoteId}
          onSelectNote={onSelectNote}
          showFolderTitle
        />
      ))}
    </div>
  );
}

function SharedFolderNoteView({ note }: { note: SharedFolderNote }) {
  const isCanvas = note.documentType.startsWith('canvas.');
  return (
    <article className={isCanvas ? 'flex h-screen w-full flex-col overflow-hidden' : 'mx-auto w-full max-w-6xl p-4'}>
      <div
        className={`${isCanvas ? 'shrink-0 px-4 py-3 sm:px-6' : 'pb-4'} border-b border-[var(--notes-border)] bg-[var(--notes-bg)]`}
      >
        <p className="notes-muted text-xs">Shared {isCanvas ? 'canvas' : 'note'} · Read-only</p>
        <h2 className={isCanvas ? 'mt-1 text-xl font-semibold sm:text-2xl' : 'mt-1 text-2xl font-semibold sm:text-3xl'}>
          {note.title}
        </h2>
        <div className="notes-muted mt-2 text-xs">Updated {new Date(note.updatedAt).toLocaleString()}</div>
      </div>
      {isCanvas ? (
        <SharedFolderCanvas content={note.content} documentType={note.documentType} />
      ) : (
        <div className="overflow-x-hidden bg-[var(--notes-bg)] pb-20 sm:pb-24">
          <MarkdownEditor
            value={note.content}
            onChange={() => undefined}
            readOnly
            minHeight={520}
            codeLanguages={editorCodeLanguages}
            codeHighlighter={editorCodeHighlighter}
            className="notes-minu-editor"
          />
        </div>
      )}
    </article>
  );
}

function SharedFolderCanvas({ content, documentType }: { content: string; documentType: DocumentType }) {
  const value = parseCanvasDocument(content);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [initialViewport, setInitialViewport] = useState<CanvasViewport | null>(null);
  const profile = documentType === 'canvas.mindmap' ? mindMapCanvasProfile : standardCanvasProfile;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || initialViewport) return;
    setInitialViewport(centerViewportForDocument(value, { width: frame.clientWidth, height: frame.clientHeight }));
  }, [initialViewport, value]);

  return (
    <div
      ref={frameRef}
      className="notes-minu-canvas h-[calc(100vh-6.25rem)] min-h-[480px] overflow-hidden bg-[var(--notes-panel)]"
    >
      {initialViewport ? (
        <MinuCanvas
          value={value}
          onChange={() => undefined}
          readOnly
          canvasTheme="system"
          shapeTheme="outline"
          initialViewport={initialViewport}
          documentProfile={profile}
          grid
          minHeight="100%"
        />
      ) : null}
    </div>
  );
}

function SharedFolderShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-[var(--notes-bg)] text-[var(--notes-text)]">{children}</main>;
}

export const folderShareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share/folders/$token',
  component: SharedFolderView,
});
