import { MarkdownEditor } from "@dpklabs/minueditor";
import type React from "react";
import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "../lib/api";
import { editorCodeHighlighter } from "../lib/code-highlighter";
import { editorCodeLanguages } from "../lib/editor-languages";
import { EmptyState } from "../components/ui/empty-state";
import { rootRoute } from "./__root";

function SharedNoteView() {
  const { token } = shareRoute.useParams();
  const { data, error, isLoading } = useQuery({
    queryKey: ["shared-note", token],
    queryFn: () => api.sharedNote(token),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  });

  if (isLoading) return <div className="grid min-h-screen place-items-center bg-[var(--notes-bg)] text-sm text-[var(--notes-muted)]">Loading shared note...</div>;
  if (error instanceof ApiError && error.status === 404) return <SharedShell><EmptyState title="Shared note unavailable"><p>This link was revoked, expired, or does not exist.</p></EmptyState></SharedShell>;
  if (!data?.note) return <SharedShell><EmptyState title="Unable to load note"><p>Try opening the link again.</p></EmptyState></SharedShell>;

  return <SharedShell>
    <article className="mx-auto w-full max-w-6xl">
      <div className="border-b border-[var(--notes-border)] bg-[var(--notes-bg)] pb-4 md:sticky md:top-0 md:z-20 md:pt-2">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="notes-muted text-xs">Shared note · Read-only</p>
        </div>
        <h1 className="text-2xl font-semibold outline-none sm:text-3xl">{data.note.title}</h1>
        <div className="notes-muted mt-2 text-xs">Updated {new Date(data.note.updatedAt).toLocaleString()}</div>
      </div>
      <div className="overflow-x-hidden bg-[var(--notes-bg)] pb-20 sm:pb-24">
        <MarkdownEditor
          value={data.note.content}
          onChange={() => undefined}
          readOnly
          minHeight={520}
          codeLanguages={editorCodeLanguages}
          codeHighlighter={editorCodeHighlighter}
          className="notes-minu-editor"
        />
      </div>
    </article>
  </SharedShell>;
}

function SharedShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-[var(--notes-bg)] px-4 py-4 text-[var(--notes-text)] sm:px-6 sm:py-6">
    {children}
  </main>;
}

export const shareRoute = createRoute({ getParentRoute: () => rootRoute, path: "/share/$token", component: SharedNoteView });
