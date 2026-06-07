export type NumberedLine = { line: number; text: string };
export type LineMatch = {
  line: number;
  column: number;
  text: string;
  before: NumberedLine[];
  after: NumberedLine[];
};

export function splitNumberedLines(markdown: string): NumberedLine[] {
  return markdown.split(/\r?\n/).map((text, index) => ({ line: index + 1, text }));
}

export function getLineRange(markdown: string, from: number, to: number) {
  const lines = splitNumberedLines(markdown);
  const requestedFrom = Number.isFinite(from) ? from : 1;
  const requestedTo = Number.isFinite(to) ? to : requestedFrom + 79;
  const start = Math.max(1, Math.min(requestedFrom, lines.length || 1));
  const end = Math.max(start, Math.min(requestedTo, lines.length || start));
  return { from: start, to: end, lineCount: lines.length, lines: lines.slice(start - 1, end) };
}

export function searchLines(markdown: string, input: { query: string; context?: number; limit?: number; caseSensitive?: boolean }) {
  const query = input.query;
  if (!query) return { lineCount: splitNumberedLines(markdown).length, matches: [] as LineMatch[] };

  const requestedContext = Number.isFinite(input.context) ? input.context! : 0;
  const requestedLimit = Number.isFinite(input.limit) ? input.limit! : 25;
  const context = Math.max(0, Math.min(requestedContext, 5));
  const limit = Math.max(1, Math.min(requestedLimit, 100));
  const lines = splitNumberedLines(markdown);
  const needle = input.caseSensitive ? query : query.toLocaleLowerCase();
  const matches: LineMatch[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const haystack = input.caseSensitive ? line.text : line.text.toLocaleLowerCase();
    const columnIndex = haystack.indexOf(needle);
    if (columnIndex < 0) continue;

    matches.push({
      line: line.line,
      column: columnIndex + 1,
      text: line.text,
      before: lines.slice(Math.max(0, index - context), index),
      after: lines.slice(index + 1, Math.min(lines.length, index + 1 + context)),
    });

    if (matches.length >= limit) break;
  }

  return { lineCount: lines.length, matches };
}
