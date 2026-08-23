import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validatePublicDocs } from '../scripts/public-docs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('public documentation', () => {
  it('has valid frontmatter, boundaries, and resource links', () => {
    const result = validatePublicDocs();
    expect(result.docs).toHaveLength(20);
    expect(result.errors).toEqual([]);
  });

  it('rejects private links and missing Starlight metadata', () => {
    const root = mkdtempSync(join(tmpdir(), 'minunotes-public-docs-'));
    temporaryDirectories.push(root);
    mkdirSync(join(root, 'minunotes'));
    writeFileSync(
      join(root, 'minunotes', 'unsafe.mdx'),
      '---\ntitle: Unsafe\n---\n# Duplicate title\n\n[Private](../../docs/implementation/security.md)\n'
    );

    const result = validatePublicDocs(root);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('frontmatter description is required'),
        expect.stringContaining('sidebar.order must be a number'),
        expect.stringContaining('remove level-one headings'),
        expect.stringContaining('private implementation documentation'),
      ])
    );
  });
});
