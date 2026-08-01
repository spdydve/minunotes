import { type CodeHighlighter, MarkdownRenderer } from '@dpklabs/minueditor';
import { useEffect, useRef } from 'react';
import { api } from '../lib/api';

const WIKILINK_PATTERN = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g;
const SKIP_TAGS = new Set(['PRE', 'CODE', 'A', 'SCRIPT', 'STYLE', 'KBD', 'SAMP']);

function isInsideSkipped(node: Text, root: HTMLElement): boolean {
  let parent = node.parentElement;
  while (parent && parent !== root) {
    if (SKIP_TAGS.has(parent.tagName)) return true;
    parent = parent.parentElement;
  }
  return false;
}

function findWikilinkTextNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent;
      if (!text?.includes('[[')) return NodeFilter.FILTER_REJECT;
      return isInsideSkipped(node as Text, root) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const result: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    result.push(current as Text);
    current = walker.nextNode();
  }
  return result;
}

function decorateWikilinks(root: HTMLElement): string[] {
  const targets = findWikilinkTextNodes(root);
  const uniqueTargets = new Set<string>();
  for (const textNode of targets) {
    const text = textNode.textContent ?? '';
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    WIKILINK_PATTERN.lastIndex = 0;
    let match = WIKILINK_PATTERN.exec(text);
    let replaced = false;
    while (match !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const target = match[1].trim();
      const label = (match[2] ?? target).trim();
      const link = document.createElement('a');
      link.className = 'me-wikilink me-wikilink--unknown';
      link.dataset.wikilinkTarget = target;
      link.textContent = label;
      fragment.appendChild(link);
      uniqueTargets.add(target);
      lastIndex = WIKILINK_PATTERN.lastIndex;
      replaced = true;
      match = WIKILINK_PATTERN.exec(text);
    }
    if (replaced) {
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  }
  return [...uniqueTargets];
}

function applyResolutions(root: HTMLElement, resolutions: Map<string, string>): void {
  const links = root.querySelectorAll<HTMLAnchorElement>('a.me-wikilink[data-wikilink-target]');
  for (const link of links) {
    const target = link.dataset.wikilinkTarget;
    if (!target) continue;
    const shareToken = resolutions.get(target);
    if (shareToken) {
      link.href = `/share/${encodeURIComponent(shareToken)}`;
      link.classList.remove('me-wikilink--unknown');
      link.classList.add('me-wikilink--resolved');
    }
  }
}

export function SharedMarkdownRenderer({
  value,
  codeHighlighter,
  className,
  shareToken,
}: {
  value: string;
  codeHighlighter?: CodeHighlighter;
  className?: string;
  shareToken?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rendered = wrapper.firstElementChild as HTMLElement | null;
    if (!rendered) return;
    const targets = decorateWikilinks(rendered);
    if (targets.length === 0 || !shareToken) return;
    let cancelled = false;
    api
      .resolveSharedWikilinks(shareToken, targets)
      .then((response) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const resolution of response.resolutions) {
          if (resolution.shareToken) map.set(resolution.target, resolution.shareToken);
        }
        applyResolutions(rendered, map);
      })
      .catch(() => {
        // Leave wikilinks in their unresolved state.
      });
    return () => {
      cancelled = true;
    };
  }, [value, codeHighlighter, shareToken]);

  return (
    <div ref={wrapperRef}>
      <MarkdownRenderer value={value} codeHighlighter={codeHighlighter} className={className} />
    </div>
  );
}
