import {
  centerViewportForDocument,
  type JsonCanvasDocument,
  MinuCanvas,
  mindMapCanvasProfile,
  standardCanvasProfile,
} from '@dpklabs/minucanvas';
import { MarkdownRenderer } from '@dpklabs/minueditor';
import { useQuery } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { Copy } from 'lucide-react';
import type React from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { EmptyState } from '../components/ui/empty-state';
import { ApiError, api, type DocumentType } from '../lib/api';
import { editorCodeHighlighter } from '../lib/code-highlighter';
import { rootRoute } from './__root';

const EMPTY_CANVAS: JsonCanvasDocument = { nodes: [], edges: [] };

type CanvasViewport = { x: number; y: number; zoom: number };

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

function SharedNoteView() {
  const { token } = shareRoute.useParams();
  const { data, error, isLoading } = useQuery({
    queryKey: ['shared-note', token],
    queryFn: () => api.sharedNote(token),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  });
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  if (isLoading)
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--notes-bg)] text-sm text-[var(--notes-muted)]">
        Loading shared note...
      </div>
    );
  if (error instanceof ApiError && error.status === 404)
    return (
      <SharedShell>
        <EmptyState title="Shared note unavailable">
          <p>This link was revoked, expired, or does not exist.</p>
        </EmptyState>
      </SharedShell>
    );
  if (!data?.note)
    return (
      <SharedShell>
        <EmptyState title="Unable to load note">
          <p>Try opening the link again.</p>
        </EmptyState>
      </SharedShell>
    );

  const isCanvas = data.note.documentType.startsWith('canvas.');
  const copySharedContent = async () => {
    const text = isCanvas ? JSON.stringify(parseCanvasDocument(data.note.content), null, 2) : data.note.content;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('failed');
      window.setTimeout(() => setCopyState('idle'), 1500);
    }
  };

  return (
    <SharedShell full={isCanvas}>
      <article className={isCanvas ? 'flex h-screen w-full flex-col overflow-hidden' : 'mx-auto w-full max-w-6xl'}>
        <div
          className={`${isCanvas ? 'shrink-0 px-4 py-3 sm:px-6' : 'pb-4 md:sticky md:top-0 md:z-20 md:pt-2'} border-b border-[var(--notes-border)] bg-[var(--notes-bg)]`}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="notes-muted text-xs">Shared {isCanvas ? 'canvas' : 'note'} · Read-only</p>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--notes-border)] bg-[var(--notes-panel)] px-2.5 py-1.5 text-xs font-medium text-[var(--notes-text)] transition-colors hover:bg-[var(--notes-hover)]"
              onClick={copySharedContent}
            >
              <Copy className="h-3.5 w-3.5" />
              {copyState === 'copied'
                ? 'Copied'
                : copyState === 'failed'
                  ? 'Copy failed'
                  : `Copy ${isCanvas ? 'JSON' : 'markdown'}`}
            </button>
          </div>
          <h1
            className={
              isCanvas ? 'text-xl font-semibold sm:text-2xl' : 'text-2xl font-semibold outline-none sm:text-3xl'
            }
          >
            {data.note.title}
          </h1>
          <div className="notes-muted mt-2 text-xs">Updated {new Date(data.note.updatedAt).toLocaleString()}</div>
        </div>
        {isCanvas ? (
          <SharedCanvas content={data.note.content} documentType={data.note.documentType} />
        ) : (
          <div className="overflow-x-hidden bg-[var(--notes-bg)] pb-20 sm:pb-24">
            <MarkdownRenderer
              value={data.note.content}
              codeHighlighter={editorCodeHighlighter}
              className="notes-minu-renderer"
            />
          </div>
        )}
      </article>
    </SharedShell>
  );
}

function SharedCanvas({ content, documentType }: { content: string; documentType: DocumentType }) {
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

function SharedShell({ children, full = false }: { children: React.ReactNode; full?: boolean }) {
  return (
    <main
      className={`${full ? 'min-h-screen' : 'min-h-screen px-4 py-4 sm:px-6 sm:py-6'} bg-[var(--notes-bg)] text-[var(--notes-text)]`}
    >
      {children}
    </main>
  );
}

export const shareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share/$token',
  component: SharedNoteView,
});
