import { parser } from '@lezer/markdown';
import { Fragment, memo, type ReactNode, useMemo } from 'react';
import { parseWikilinks } from '../../shared/wikilinks';

type PreviewNode = {
  name: string;
  from: number;
  to: number;
  firstChild: PreviewNode | null;
  nextSibling: PreviewNode | null;
};

const hiddenNodes = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'LinkMark', 'URL', 'CodeInfo']);

function replaceWikilinksWithLabels(markdown: string) {
  let preview = markdown;
  for (const link of parseWikilinks(markdown).reverse()) {
    preview = `${preview.slice(0, link.from)}${link.label ?? link.target}${preview.slice(link.to)}`;
  }
  return preview;
}

function renderChildren(node: PreviewNode, source: string, key: string): ReactNode[] {
  const output: ReactNode[] = [];
  let position = node.from;
  let child = node.firstChild;
  let index = 0;

  while (child) {
    if (child.from > position) output.push(source.slice(position, child.from));
    output.push(<Fragment key={`${key}-${index}`}>{renderNode(child, source, `${key}-${index}`)}</Fragment>);
    position = child.to;
    child = child.nextSibling;
    index += 1;
  }

  if (position < node.to) output.push(source.slice(position, node.to));
  return output;
}

function renderNode(node: PreviewNode, source: string, key: string): ReactNode {
  if (hiddenNodes.has(node.name)) return null;

  if (node.name === 'ListMark') return '•';
  if (node.name === 'QuoteMark') return '›';
  if (node.name === 'HorizontalRule') return '—';
  if (node.name === 'HTMLTag') return null;
  if (node.name === 'HTMLBlock') return source.slice(node.from, node.to).replace(/<[^>]*>/g, '');

  const children = () => renderChildren(node, source, key);
  if (node.name === 'StrongEmphasis') return <strong>{children()}</strong>;
  if (node.name === 'Emphasis') return <em>{children()}</em>;
  if (node.name === 'InlineCode')
    return <code className="rounded bg-[var(--notes-panel-muted)] px-0.5 font-mono text-[0.95em]">{children()}</code>;
  if (node.name === 'Link')
    return (
      <span className="text-[var(--notes-blue)] underline decoration-current/40 underline-offset-2">{children()}</span>
    );
  if (node.name === 'Image') return <span>{children()}</span>;

  return children();
}

export const CommentMarkdownPreview = memo(function CommentMarkdownPreview({ value }: { value: string }) {
  return useMemo(() => {
    const source = replaceWikilinksWithLabels(value);
    const tree = parser.parse(source);
    return <>{renderNode(tree.topNode as PreviewNode, source, 'preview')}</>;
  }, [value]);
});
