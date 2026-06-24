import { CanvasStyleToolbar, CanvasToolbar, MinuCanvas, type CanvasSelection, type CanvasTool, type JsonCanvasDocument } from "@dpklabs/minucanvas";
import { useState, type ReactNode } from "react";

const EMPTY_CANVAS: JsonCanvasDocument = { nodes: [], edges: [] };

function parseCanvasDocument(content: string): JsonCanvasDocument {
  if (!content.trim()) return EMPTY_CANVAS;
  try {
    const parsed = JSON.parse(content) as Partial<JsonCanvasDocument>;
    return {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes as JsonCanvasDocument["nodes"] : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges as JsonCanvasDocument["edges"] : [],
    };
  } catch {
    return EMPTY_CANVAS;
  }
}

export function NoteCanvasEditor({
  title,
  content,
  saveState,
  onTitleChange,
  onContentChange,
  actions,
  navigation,
  staleNotice,
  updatedMeta,
}: {
  title: string;
  content: string;
  saveState?: "saved" | "saving" | "unsaved" | "error";
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  actions: ReactNode;
  navigation?: ReactNode;
  staleNotice?: ReactNode;
  updatedMeta?: ReactNode;
}) {
  const titleValue = title === "Untitled canvas" ? "" : title;
  const saveLabel = saveState === "saving" ? "Saving..." : saveState === "unsaved" ? "Unsaved changes" : saveState === "error" ? "Save failed" : "Saved";
  const value = parseCanvasDocument(content);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [selection, setSelection] = useState<CanvasSelection>({ nodeIds: [], edgeIds: [] });

  return <section className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--notes-bg)] text-[var(--notes-text)]">
    <div className="shrink-0 border-b border-[var(--notes-border)] bg-[var(--notes-panel-muted)] px-3 py-2 sm:px-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {navigation ? <div className="shrink-0">{navigation}</div> : null}
          <div className="min-w-0 flex-1">
            <input
              className="w-full bg-transparent text-base font-semibold outline-none sm:text-lg"
              value={titleValue}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Untitled canvas"
              spellCheck={true}
            />
            <div className="notes-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span>{saveLabel}</span>
              {updatedMeta ? <><span aria-hidden="true">·</span><span>{updatedMeta}</span></> : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
      {staleNotice ? <div className="mt-2">{staleNotice}</div> : null}
    </div>
    <div className="notes-minu-canvas relative min-h-0 flex-1 overflow-hidden bg-[var(--notes-panel)]">
      <div className="absolute left-4 top-4 z-10">
        <CanvasToolbar tool={tool} onToolChange={setTool} orientation="vertical" />
      </div>
      <div className="absolute bottom-4 left-1/2 z-10 max-w-[calc(100%-2rem)] -translate-x-1/2 overflow-x-auto">
        <CanvasStyleToolbar value={value} selection={selection} onChange={(nextValue) => onContentChange(JSON.stringify(nextValue))} />
      </div>
      <MinuCanvas
        value={value}
        onChange={(nextValue) => onContentChange(JSON.stringify(nextValue))}
        canvasTheme="system"
        shapeTheme="outline"
        tool={tool}
        onToolChange={setTool}
        selectedNodeIds={selection.nodeIds}
        selectedEdgeIds={selection.edgeIds}
        onSelectionChange={setSelection}
        initialViewport={{ x: 0, y: 0, zoom: 1 }}
        grid
        snapToGrid
        minHeight="100%"
      />
    </div>
  </section>;
}
