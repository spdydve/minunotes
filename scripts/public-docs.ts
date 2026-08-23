import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import matter from 'gray-matter';

export const PUBLIC_DOCS_ROOT = resolve('docs/public');

export type PublicDoc = {
  path: string;
  relativePath: string;
  title: string;
  description: string;
  order: number;
  body: string;
};

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

export function readPublicDocs(root = PUBLIC_DOCS_ROOT): PublicDoc[] {
  if (!existsSync(root)) return [];
  return listFiles(root)
    .filter((path) => ['.md', '.mdx'].includes(extname(path)) && !path.endsWith(`${sep}README.md`))
    .map((path) => {
      const source = readFileSync(path, 'utf8');
      const parsed = matter(source);
      return {
        path,
        relativePath: relative(root, path).split(sep).join('/'),
        title: typeof parsed.data.title === 'string' ? parsed.data.title.trim() : '',
        description: typeof parsed.data.description === 'string' ? parsed.data.description.trim() : '',
        order:
          typeof parsed.data.sidebar === 'object' &&
          parsed.data.sidebar !== null &&
          typeof parsed.data.sidebar.order === 'number'
            ? parsed.data.sidebar.order
            : Number.NaN,
        body: parsed.content,
      };
    });
}

export function validatePublicDocs(root = PUBLIC_DOCS_ROOT) {
  const docs = readPublicDocs(root);
  const errors: string[] = [];
  const legacySlugs = new Set(
    docs.map((doc) =>
      doc.relativePath
        .split('/')
        .at(-1)
        ?.replace(/\.mdx?$/, '')
    )
  );
  const relativePaths = new Set<string>();

  if (docs.length === 0) errors.push('No public documentation files found.');

  for (const doc of docs) {
    if (relativePaths.has(doc.relativePath)) errors.push(`${doc.relativePath}: duplicate public path.`);
    relativePaths.add(doc.relativePath);
    if (!doc.title) errors.push(`${doc.relativePath}: frontmatter title is required.`);
    if (!doc.description) errors.push(`${doc.relativePath}: frontmatter description is required.`);
    if (!Number.isFinite(doc.order)) errors.push(`${doc.relativePath}: sidebar.order must be a number.`);
    const prose = doc.body.replace(/```[\s\S]*?```/g, '');
    if (/^#\s+/m.test(prose)) {
      errors.push(`${doc.relativePath}: remove level-one headings; Starlight renders the frontmatter title.`);
    }
    if (/(?:^|[(/])docs\/implementation(?:[)/]|$)/i.test(prose)) {
      errors.push(`${doc.relativePath}: public content links to private implementation documentation.`);
    }
    if (/\]\([^)]*\.(?:env|pem|key)(?:[)#?]|$)/i.test(prose)) {
      errors.push(`${doc.relativePath}: public content links to a sensitive file type.`);
    }

    for (const match of prose.matchAll(/\]\(\/resources\/([a-z0-9-]+)(?:[)#?][^)]*)?\)/g)) {
      const slug = match[1];
      if (!legacySlugs.has(slug)) errors.push(`${doc.relativePath}: unresolved resource link /resources/${slug}.`);
    }
  }

  return { docs, errors };
}
