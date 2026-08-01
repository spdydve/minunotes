import { type CodeHighlighter, MarkdownRenderer } from '@dpklabs/minueditor';
import { memo, useEffect, useRef } from 'react';
import { canonicalizeWikilinkTarget } from '../../shared/wikilinks';
import type { SharedWikilinkResolution } from '../lib/api';

const WIKILINK_PATTERN = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g;
const SKIP_TAGS = new Set(['PRE', 'CODE', 'A', 'SCRIPT', 'STYLE', 'KBD', 'SAMP']);
const EMPTY_RESOLUTIONS: SharedWikilinkResolution[] = [];
const StableMarkdownRenderer = memo(MarkdownRenderer);

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

function decorateWikilinks(root: HTMLElement): void {
  const targets = findWikilinkTextNodes(root);
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
      const target = canonicalizeWikilinkTarget(match[1]);
      const label = canonicalizeWikilinkTarget(match[2] ?? target);
      const link = document.createElement('a');
      link.className = 'me-wikilink me-wikilink--unknown';
      link.dataset.wikilinkTarget = target;
      link.textContent = label;
      fragment.appendChild(link);
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
}

function applyResolutions(root: HTMLElement, resolutions: SharedWikilinkResolution[]): void {
  const hrefs = new Map(resolutions.map((resolution) => [resolution.target, resolution.href]));
  const links = root.querySelectorAll<HTMLAnchorElement>('a.me-wikilink[data-wikilink-target]');
  for (const link of links) {
    link.removeAttribute('href');
    link.classList.remove('me-wikilink--resolved');
    link.classList.add('me-wikilink--unknown');

    const target = link.dataset.wikilinkTarget;
    const href = target ? hrefs.get(target) : null;
    if (!href?.startsWith('/share/')) continue;
    link.setAttribute('href', href);
    link.classList.remove('me-wikilink--unknown');
    link.classList.add('me-wikilink--resolved');
  }
}

export function SharedMarkdownRenderer({
  value,
  codeHighlighter,
  className,
  resolutions = EMPTY_RESOLUTIONS,
}: {
  value: string;
  codeHighlighter?: CodeHighlighter;
  className?: string;
  resolutions?: SharedWikilinkResolution[];
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rendered = wrapper.firstElementChild;
    if (!rendered) return;
    decorateWikilinks(rendered as HTMLElement);
    applyResolutions(rendered as HTMLElement, resolutions);
  }, [value, codeHighlighter, resolutions]);

  return (
    <div ref={wrapperRef}>
      <StableMarkdownRenderer value={value} codeHighlighter={codeHighlighter} className={className} />
    </div>
  );
}
