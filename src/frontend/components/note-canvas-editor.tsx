import {
  type CanvasHandle,
  type CanvasNode,
  type CanvasSelection,
  CanvasStyleToolbar,
  type CanvasTool,
  CanvasToolbar,
  centerViewportForDocument,
  type JsonCanvasDocument,
  MinuCanvas,
  mindMapCanvasProfile,
  standardCanvasProfile,
  toolsForCanvasProfile,
} from '@dpklabs/minucanvas';
import { useQuery } from '@tanstack/react-query';
import { FileText, Link2, Unlink, X } from 'lucide-react';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getMinuNotesNodeLink, type MinuNotesNodeExtra } from '../../shared/canvas-links';
import { api, type SearchNote } from '../lib/api';

const EMPTY_CANVAS: JsonCanvasDocument<MinuNotesNodeExtra> = { nodes: [], edges: [] };

type CanvasViewport = { x: number; y: number; zoom: number };
type MinuNotesCanvasDocument = JsonCanvasDocument<MinuNotesNodeExtra>;
type MinuNotesCanvasNode = CanvasNode<MinuNotesNodeExtra>;

function parseCanvasDocument(content: string): MinuNotesCanvasDocument {
  if (!content.trim()) return EMPTY_CANVAS;
  try {
    const parsed = JSON.parse(content) as Partial<MinuNotesCanvasDocument>;
    return {
      nodes: Array.isArray(parsed.nodes) ? (parsed.nodes as MinuNotesCanvasDocument['nodes']) : [],
      edges: Array.isArray(parsed.edges) ? (parsed.edges as MinuNotesCanvasDocument['edges']) : [],
    };
  } catch {
    return EMPTY_CANVAS;
  }
}

function linkedNodeTitle(node: MinuNotesCanvasNode) {
  return node.text?.trim() || node.label?.trim() || 'Linked note';
}

export function NoteCanvasEditor({
  noteId,
  title,
  content,
  documentType,
  saveState,
  onTitleChange,
  onContentChange,
  actions,
  navigation,
  staleNotice,
  updatedMeta,
}: {
  noteId: string;
  title: string;
  content: string;
  documentType?: 'canvas.default' | 'canvas.mindmap';
  saveState?: 'saved' | 'saving' | 'unsaved' | 'error';
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  actions: ReactNode;
  navigation?: ReactNode;
  staleNotice?: ReactNode;
  updatedMeta?: ReactNode;
}) {
  const titleValue =
    title === 'Untitled canvas' || title === 'Untitled Canvas' || title === 'Untitled mind map' ? '' : title;
  const isMindMap = documentType === 'canvas.mindmap';
  const canvasProfile = isMindMap ? mindMapCanvasProfile : standardCanvasProfile;
  const saveLabel =
    saveState === 'saving'
      ? 'Saving...'
      : saveState === 'unsaved'
        ? 'Unsaved changes'
        : saveState === 'error'
          ? 'Save failed'
          : 'Saved';
  const value = parseCanvasDocument(content);
  const canvasFrameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<CanvasHandle<MinuNotesNodeExtra> | null>(null);
  const [initialViewport, setInitialViewport] = useState<CanvasViewport | null>(null);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [selection, setSelection] = useState<CanvasSelection>({
    nodeIds: [],
    edgeIds: [],
  });
  const [linkPickerNodeId, setLinkPickerNodeId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const frame = canvasFrameRef.current;
    if (!frame || initialViewport) return;
    const setCentered = () =>
      setInitialViewport(centerViewportForDocument(value, { width: frame.clientWidth, height: frame.clientHeight }));
    setCentered();
  }, [initialViewport, value]);

  const openNote = (targetNoteId: string | undefined) => {
    if (!targetNoteId) return;
    window.open(`/notes/${encodeURIComponent(targetNoteId)}`, '_blank', 'noopener,noreferrer');
  };

  const linkNodeToNote = (nodeId: string, note: SearchNote) => {
    canvasRef.current?.updateNode(nodeId, (node) => ({
      ...node,
      text: node.text?.trim() ? node.text : note.title,
      minunotes: {
        ...(node.minunotes ?? {}),
        link: { type: 'note', id: note.id },
      },
    }));
    setLinkPickerNodeId(null);
  };

  const unlinkNodeFromNote = (nodeId: string) => {
    canvasRef.current?.updateNode(nodeId, (node) => {
      const nextMetadata = { ...(node.minunotes ?? {}) };
      delete nextMetadata.link;
      const nextNode = { ...node };
      if (Object.keys(nextMetadata).length > 0) nextNode.minunotes = nextMetadata;
      else delete nextNode.minunotes;
      return nextNode;
    });
  };

  return (
    <section className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--notes-bg)] text-[var(--notes-text)]">
      <div className="shrink-0 border-[var(--notes-border)] border-b bg-[var(--notes-panel-muted)] px-3 py-2 sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {navigation ? <div className="shrink-0">{navigation}</div> : null}
            <div className="ml-2 min-w-0 flex-1">
              <input
                className="w-full bg-transparent font-semibold text-base outline-none sm:text-lg"
                value={titleValue}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder={isMindMap ? 'Untitled mind map' : 'Untitled canvas'}
                spellCheck={true}
              />
              <div className="notes-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                <span>{saveLabel}</span>
                {updatedMeta ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{updatedMeta}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </div>
        {staleNotice ? <div className="mt-2">{staleNotice}</div> : null}
      </div>
      <div
        ref={canvasFrameRef}
        className="notes-minu-canvas relative min-h-0 flex-1 overflow-hidden bg-[var(--notes-panel)]"
      >
        <div className="absolute top-4 left-4 z-10">
          <CanvasToolbar
            tool={tool}
            onToolChange={setTool}
            orientation="vertical"
            tools={toolsForCanvasProfile(canvasProfile)}
          />
        </div>
        <CanvasStyleToolbar<MinuNotesNodeExtra>
          className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2"
          value={value}
          selection={selection}
          onChange={(nextValue) => onContentChange(JSON.stringify(nextValue))}
        />
        {initialViewport ? (
          <MinuCanvas<MinuNotesNodeExtra>
            ref={canvasRef}
            value={value}
            onChange={(nextValue) => onContentChange(JSON.stringify(nextValue))}
            canvasTheme="system"
            shapeTheme="outline"
            tool={tool}
            onToolChange={setTool}
            selectedNodeIds={selection.nodeIds}
            selectedEdgeIds={selection.edgeIds}
            onSelectionChange={setSelection}
            initialViewport={initialViewport}
            documentProfile={canvasProfile}
            renderNodeAdornment={({ node, editing }) => {
              const link = getMinuNotesNodeLink(node);
              if (!link || editing) return null;
              return (
                <button
                  type="button"
                  className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--notes-border)] bg-[var(--notes-panel)] text-[var(--notes-blue)] shadow-sm hover:bg-[var(--notes-hover)]"
                  title={`Open linked note: ${linkedNodeTitle(node)}`}
                  aria-label={`Open linked note: ${linkedNodeTitle(node)}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    openNote(link.id);
                  }}
                >
                  <FileText className="h-3.5 w-3.5" />
                </button>
              );
            }}
            getNodeContextActions={({ node }) => {
              const link = getMinuNotesNodeLink(node);
              return [
                {
                  id: 'link-note',
                  label: link ? 'Change note link…' : 'Link to note…',
                  separatorBefore: true,
                  onSelect: () => setLinkPickerNodeId(node.id),
                },
                {
                  id: 'open-note',
                  label: 'Open linked note',
                  disabled: !link,
                  onSelect: () => openNote(link?.id),
                },
                {
                  id: 'unlink-note',
                  label: 'Remove note link',
                  disabled: !link,
                  danger: true,
                  onSelect: () => unlinkNodeFromNote(node.id),
                },
              ];
            }}
            grid
            snapToGrid
            minHeight="100%"
          />
        ) : null}
      </div>
      {linkPickerNodeId ? (
        <CanvasNoteLinkPicker
          currentNoteId={noteId}
          onClose={() => setLinkPickerNodeId(null)}
          onSelect={(note) => linkNodeToNote(linkPickerNodeId, note)}
        />
      ) : null}
    </section>
  );
}

function CanvasNoteLinkPicker({
  currentNoteId,
  onClose,
  onSelect,
}: {
  currentNoteId: string;
  onClose: () => void;
  onSelect: (note: SearchNote) => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmed = query.trim();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const { data, isFetching } = useQuery({
    queryKey: ['canvas-note-link-search', trimmed],
    queryFn: () => api.searchNotes(trimmed, 'note', 12),
    enabled: trimmed.length > 0,
  });
  const notes = (data?.notes ?? []).filter((note) => note.id !== currentNoteId);

  return (
    <div className="notes-overlay fixed inset-0 z-[100] grid place-items-center p-4">
      <div
        className="notes-card max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg p-4 shadow-sm sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="canvas-note-link-title"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="canvas-note-link-title" className="font-semibold text-lg">
              Link node to note
            </h2>
            <p className="notes-muted mt-1 text-xs">Search for a note to attach to this canvas node.</p>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-[var(--notes-muted)] hover:bg-[var(--notes-hover)] hover:text-[var(--notes-text)]"
            onClick={onClose}
            aria-label="Close note link dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative mt-4">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--notes-muted)]" />
          <input
            ref={inputRef}
            className="notes-input w-full rounded-md py-2 pr-3 pl-9"
            placeholder="Search notes..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="mt-4 max-h-[min(24rem,calc(100dvh-13rem))] space-y-2 overflow-auto">
          {isFetching ? <p className="notes-muted text-sm">Searching...</p> : null}
          {!isFetching && trimmed && notes.length === 0 ? <p className="notes-muted text-sm">No notes found.</p> : null}
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              className="block w-full rounded-md border border-[var(--notes-border)] p-3 text-left transition-colors hover:bg-[var(--notes-hover)]"
              onClick={() => onSelect(note)}
            >
              <div className="flex items-center gap-2 font-medium">
                <FileText className="h-4 w-4 text-[var(--notes-muted)]" />
                {note.title}
              </div>
              <div className="notes-muted mt-1 text-xs">{note.folderTitle}</div>
            </button>
          ))}
        </div>
        <div className="notes-muted mt-4 flex items-center gap-2 text-xs">
          <Unlink className="h-3.5 w-3.5" />
          Use the node context menu to remove an internal note link. External URLs are preserved.
        </div>
      </div>
    </div>
  );
}
