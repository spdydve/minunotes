export interface DocumentSection {
  id: string;
  heading: string;
  level: number;
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  );
}

function uniqueId(base: string, counts: Map<string, number>) {
  const next = (counts.get(base) ?? 0) + 1;
  counts.set(base, next);
  return next === 1 ? base : `${base}-${next}`;
}

export function parseSections(markdown: string): DocumentSection[] {
  const headings: Array<{ heading: string; level: number; from: number; lineEnd: number }> = [];
  const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(markdown))) {
    headings.push({
      heading: match[2],
      level: match[1].length,
      from: match.index,
      lineEnd: headingPattern.lastIndex,
    });
  }

  const counts = new Map<string, number>();
  return headings.map((heading, index) => {
    const nextSameOrHigher = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    const to = nextSameOrHigher?.from ?? markdown.length;
    const contentFrom = markdown[heading.lineEnd] === '\n' ? heading.lineEnd + 1 : heading.lineEnd;

    return {
      id: uniqueId(slugify(heading.heading), counts),
      heading: heading.heading,
      level: heading.level,
      from: heading.from,
      to,
      contentFrom,
      contentTo: to,
    };
  });
}

export function findSection(markdown: string, sectionId: string) {
  return parseSections(markdown).find((section) => section.id === sectionId);
}
