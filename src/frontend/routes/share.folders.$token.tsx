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

function findFolderNode(node: SharedFolderTreeNode, folderId: string): SharedFolderTreeNode | null {
  if (node.id === folderId) return node;
  for (const child of node.children) {
    const found = findFolderNode(child, folderId);
    if (found) return found;
  }
  return null;
}

function SharedFolderView() {
  const { token } = folderShareRoute.useParams();
  const { data, error, isLoading } = useQuery({
    queryKey: ['shared-folder', token],
    queryFn: () => api.sharedFolder(token),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  });
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const selectedNote = useMemo(
    () => data?.notes.find((note) => note.id === selectedNoteId) ?? null,
    [data?.notes, selectedNoteId]
  );
  const folderTree = useMemo(
    () =>
      data?.folder ? buildSharedFolderTree({ root: data.folder, folders: data.folders, notes: data.notes }) : null,
    [data?.folder, data?.folders, data?.notes]
  );
  const selectedFolder = useMemo(() => {
    if (!folderTree) return null;
    return findFolderNode(folderTree, selectedFolderId ?? folderTree.id) ?? folderTree;
  }, [folderTree, selectedFolderId]);

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
            {folderTree ? (
              <SharedFolderTree
                node={folderTree}
                depth={0}
                selectedFolderId={selectedFolder?.id ?? null}
                onSelectFolder={(folderId) => {
                  setSelectedFolderId(folderId);
                  setSelectedNoteId(null);
                }}
              />
            ) : null}
          </nav>
        </aside>
        <main className="min-w-0">
          {selectedNote ? (
            <SharedFolderNoteView note={selectedNote} onBack={() => setSelectedNoteId(null)} />
          ) : selectedFolder ? (
            <SharedFolderContents
              folder={selectedFolder}
              onSelectFolder={setSelectedFolderId}
              onSelectNote={setSelectedNoteId}
            />
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
  selectedFolderId,
  onSelectFolder,
}: {
  node: SharedFolderTreeNode;
  depth: number;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string) => void;
}) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
          selectedFolderId === node.id
            ? 'bg-[var(--notes-hover)] text-[var(--notes-text)]'
            : 'text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]'
        }`}
        style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
        onClick={() => onSelectFolder(node.id)}
      >
        <span className="block truncate">{node.title}</span>
        <span className="notes-muted block text-[11px]">Folder</span>
      </button>
      {node.children.map((child) => (
        <SharedFolderTree
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedFolderId={selectedFolderId}
          onSelectFolder={onSelectFolder}
        />
      ))}
    </div>
  );
}

function SharedFolderContents({
  folder,
  onSelectFolder,
  onSelectNote,
}: {
  folder: SharedFolderTreeNode;
  onSelectFolder: (folderId: string) => void;
  onSelectNote: (noteId: string) => void;
}) {
  const hasContents = folder.children.length > 0 || folder.notes.length > 0;
  return (
    <section className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <div className="mb-6">
        <p className="notes-muted text-xs">Shared folder · Read-only</p>
        <h2 className="mt-1 text-2xl font-semibold">{folder.title}</h2>
        <p className="notes-muted mt-1 text-xs">Updated {new Date(folder.updatedAt).toLocaleString()}</p>
      </div>

      {!hasContents ? (
        <div className="grid min-h-[40vh] place-items-center rounded-lg border border-dashed border-[var(--notes-border)] p-6">
          <EmptyState title="No notes shared">
            <p>This folder has no notes or subfolders to display.</p>
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--notes-border)] text-[var(--notes-muted)] text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Type</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {folder.children.map((child) => (
                <tr
                  key={child.id}
                  className="border-b border-[var(--notes-border)] last:border-0 hover:bg-[var(--notes-hover)]"
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="font-medium text-left hover:underline"
                      onClick={() => onSelectFolder(child.id)}
                    >
                      {child.title}
                    </button>
                  </td>
                  <td className="hidden px-4 py-3 text-[var(--notes-muted)] sm:table-cell">Folder</td>
                  <td className="hidden px-4 py-3 text-[var(--notes-muted)] md:table-cell">
                    {new Date(child.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {folder.notes.map((note) => (
                <tr
                  key={note.id}
                  className="border-b border-[var(--notes-border)] last:border-0 hover:bg-[var(--notes-hover)]"
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="font-medium text-left hover:underline"
                      onClick={() => onSelectNote(note.id)}
                    >
                      {note.title}
                    </button>
                  </td>
                  <td className="hidden px-4 py-3 text-[var(--notes-muted)] sm:table-cell">
                    {note.documentType.startsWith('canvas.') ? 'Canvas' : 'Note'}
                  </td>
                  <td className="hidden px-4 py-3 text-[var(--notes-muted)] md:table-cell">
                    {new Date(note.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SharedFolderNoteView({ note, onBack }: { note: SharedFolderNote; onBack: () => void }) {
  const isCanvas = note.documentType.startsWith('canvas.');
  return (
    <article className={isCanvas ? 'flex h-screen w-full flex-col overflow-hidden' : 'mx-auto w-full max-w-6xl p-4'}>
      <div
        className={`${isCanvas ? 'shrink-0 px-4 py-3 sm:px-6' : 'pb-4'} border-b border-[var(--notes-border)] bg-[var(--notes-bg)]`}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="notes-muted text-xs">Shared {isCanvas ? 'canvas' : 'note'} · Read-only</p>
          <button
            type="button"
            className="rounded-md border border-[var(--notes-border)] bg-[var(--notes-panel)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--notes-hover)]"
            onClick={onBack}
          >
            Back to folder
          </button>
        </div>
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
