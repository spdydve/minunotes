export const NOTE_ID_PATTERN = /^note_[a-zA-Z0-9]+$/;

const WIKILINK_PATTERN = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g;

export type ParsedWikilink = {
  target: string;
  label: string | null;
  raw: string;
  from: number;
  to: number;
};

export function canonicalizeWikilinkTarget(target: string): string {
  return target.trim();
}

export function normalizeWikilinkTitle(title: string): string {
  return canonicalizeWikilinkTarget(title).replace(/\s+/g, ' ').toLowerCase();
}

type MarkdownRange = { from: number; to: number };

function fencedCodeRanges(markdown: string): MarkdownRange[] {
  const ranges: MarkdownRange[] = [];
  const lines = markdown.matchAll(/.*(?:\n|$)/g);
  let open: { from: number; marker: string } | null = null;
  for (const match of lines) {
    const line = match[0];
    if (!line) continue;
    const lineStart = match.index ?? 0;
    if (!open) {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
      if (marker) open = { from: lineStart, marker };
      continue;
    }
    const closePattern = new RegExp(`^ {0,3}${open.marker[0]}{${open.marker.length},}[ \\t]*(?:\\n|$)`);
    if (closePattern.test(line)) {
      ranges.push({ from: open.from, to: lineStart + line.length });
      open = null;
    }
  }
  if (open) ranges.push({ from: open.from, to: markdown.length });
  return ranges;
}

function inlineCodeRanges(markdown: string, fenced: MarkdownRange[]): MarkdownRange[] {
  const ranges: MarkdownRange[] = [];
  const runs = [...markdown.matchAll(/`+/g)].map((match) => ({
    from: match.index ?? 0,
    to: (match.index ?? 0) + match[0].length,
    length: match[0].length,
  }));

  for (let openerIndex = 0; openerIndex < runs.length; openerIndex += 1) {
    const opener = runs[openerIndex];
    if (isInRanges(opener.from, opener.to, fenced)) continue;
    const closeIndex = runs.findIndex(
      (run, index) => index > openerIndex && run.length === opener.length && !isInRanges(run.from, run.to, fenced)
    );
    if (closeIndex === -1) continue;
    ranges.push({ from: opener.from, to: runs[closeIndex].to });
    openerIndex = closeIndex;
  }
  return ranges;
}

function isInRanges(from: number, to: number, ranges: MarkdownRange[]): boolean {
  return ranges.some((range) => from < range.to && to > range.from);
}

export function parseWikilinks(markdown: string): ParsedWikilink[] {
  const fenced = fencedCodeRanges(markdown);
  const skipped = [...fenced, ...inlineCodeRanges(markdown, fenced)];
  const links: ParsedWikilink[] = [];
  for (const match of markdown.matchAll(WIKILINK_PATTERN)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (isInRanges(from, to, skipped)) continue;
    const target = canonicalizeWikilinkTarget(match[1] ?? '');
    if (!target) continue;
    const label = canonicalizeWikilinkTarget(match[2] ?? '') || null;
    links.push({
      target,
      label,
      raw: match[0],
      from,
      to,
    });
  }
  return links;
}
