import { type CodeHighlighter, MarkdownRenderer } from '@dpklabs/minueditor';
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { editorCodeHighlighter } from '../lib/code-highlighter';
import { getMermaidTheme, useNoteTheme } from '../lib/themes';

const StableMarkdownRenderer = memo(MarkdownRenderer);

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function staticCodeBlockHtml(code: string, language: string, highlighted: string | null): string {
  const label = language
    ? `<span class="me-lang-label">${escapeHtml(language)}</span>`
    : '<span aria-hidden="true"></span>';
  const body = highlighted ?? `<pre><code>${escapeHtml(code)}</code></pre>`;
  return `<div class="me-codeblock-widget me-static-codeblock"><div class="me-codeblock-header">${label}<button class="me-copy-btn" type="button" aria-label="Copy code">Copy</button></div><div class="me-codeblock-body">${body}</div></div>`;
}

function decorateUnlabelledCodeBlocks(root: HTMLElement): void {
  const blocks = root.querySelectorAll<HTMLPreElement>('pre:not([data-language])');
  for (const block of blocks) {
    if (block.closest('.me-codeblock-body')) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'me-codeblock-widget me-static-codeblock';
    const header = document.createElement('div');
    header.className = 'me-codeblock-header';
    const spacer = document.createElement('span');
    spacer.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('button');
    copy.className = 'me-copy-btn';
    copy.type = 'button';
    copy.setAttribute('aria-label', 'Copy code');
    copy.textContent = 'Copy';
    header.append(spacer, copy);
    const body = document.createElement('div');
    body.className = 'me-codeblock-body';
    block.parentNode?.insertBefore(wrapper, block);
    wrapper.append(header, body);
    body.appendChild(block);
  }
}

export const NotesMarkdownRenderer = forwardRef<
  HTMLDivElement,
  {
    value: string;
    codeHighlighter?: CodeHighlighter;
    className?: string;
  }
>(function NotesMarkdownRenderer({ value, codeHighlighter = editorCodeHighlighter, className }, forwardedRef) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const noteTheme = useNoteTheme();
  const mermaid = useMemo(() => ({ theme: getMermaidTheme(noteTheme) }), [noteTheme]);
  useImperativeHandle(forwardedRef, () => wrapperRef.current as HTMLDivElement, []);

  const staticCodeHighlighter = useMemo<CodeHighlighter>(
    () => async (code, language) => {
      let highlighted: string | null = null;
      try {
        highlighted = (await codeHighlighter(code, language)) ?? null;
      } catch {
        highlighted = null;
      }
      return staticCodeBlockHtml(code, language, highlighted);
    },
    [codeHighlighter]
  );

  useEffect(() => {
    const rendered = wrapperRef.current?.firstElementChild;
    if (!rendered) return;
    decorateUnlabelledCodeBlocks(rendered as HTMLElement);
  }, [value]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const resetTimers = new Set<number>();
    const copyCode = async (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.me-static-codeblock .me-copy-btn');
      if (!button || !wrapper.contains(button)) return;
      const code = button.closest('.me-static-codeblock')?.querySelector('.me-codeblock-body')?.textContent;
      if (code == null) return;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = 'Copied';
        button.classList.add('me-copy-btn--copied');
      } catch {
        button.textContent = 'Failed';
      }
      const timer = window.setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('me-copy-btn--copied');
        resetTimers.delete(timer);
      }, 1500);
      resetTimers.add(timer);
    };
    wrapper.addEventListener('click', copyCode);
    return () => {
      wrapper.removeEventListener('click', copyCode);
      for (const timer of resetTimers) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div ref={wrapperRef}>
      <StableMarkdownRenderer
        value={value}
        codeHighlighter={staticCodeHighlighter}
        className={className}
        mermaid={mermaid}
      />
    </div>
  );
});
