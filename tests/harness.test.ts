import { describe, expect, it } from 'vitest';
import { applyDocumentEdits } from '../src/api/harness/edits';
import { hashMarkdown } from '../src/api/harness/hash';
import { findSection, parseSections } from '../src/api/harness/sections';

describe('hashMarkdown', () => {
  it('returns a stable sha256 hash for markdown content', () => {
    expect(hashMarkdown('# Hello')).toBe(hashMarkdown('# Hello'));
    expect(hashMarkdown('# Hello')).not.toBe(hashMarkdown('# Goodbye'));
    expect(hashMarkdown('# Hello')).toHaveLength(64);
  });
});

describe('applyDocumentEdits', () => {
  it('appends text to the document', () => {
    expect(applyDocumentEdits('# Log\n', [{ type: 'append', text: '\nEntry' }])).toEqual({
      ok: true,
      markdown: '# Log\n\nEntry',
    });
  });

  it('replaces exact text that appears once', () => {
    expect(applyDocumentEdits('Hello world', [{ type: 'replace_text', oldText: 'world', newText: 'Pi' }])).toEqual({
      ok: true,
      markdown: 'Hello Pi',
    });
  });

  it('rejects exact text that appears more than once', () => {
    expect(applyDocumentEdits('TODO\nTODO', [{ type: 'replace_text', oldText: 'TODO', newText: 'Done' }])).toEqual({
      ok: false,
      error: 'replace_text oldText must match exactly once',
    });
  });

  it('replaces valid character ranges', () => {
    expect(applyDocumentEdits('abcdef', [{ type: 'replace_range', from: 2, to: 4, text: 'XX' }])).toEqual({
      ok: true,
      markdown: 'abXXef',
    });
  });

  it('rejects invalid ranges', () => {
    expect(applyDocumentEdits('abc', [{ type: 'replace_range', from: 2, to: 5, text: 'x' }])).toEqual({
      ok: false,
      error: 'replace_range bounds are invalid',
    });
  });

  it('rejects overlapping range edits', () => {
    expect(
      applyDocumentEdits('abcdef', [
        { type: 'replace_range', from: 1, to: 4, text: 'X' },
        { type: 'replace_range', from: 3, to: 5, text: 'Y' },
      ])
    ).toEqual({ ok: false, error: 'edits must not overlap' });
  });

  it('applies multiple edits from right to left', () => {
    expect(
      applyDocumentEdits('abcdef', [
        { type: 'replace_range', from: 0, to: 1, text: 'A' },
        { type: 'replace_range', from: 5, to: 6, text: 'F' },
      ])
    ).toEqual({ ok: true, markdown: 'AbcdeF' });
  });
});

describe('parseSections', () => {
  it('parses headings into sections with ranges', () => {
    const markdown = '# Title\nIntro\n\n## Alpha\nAlpha body\n\n## Beta\nBeta body\n';
    const sections = parseSections(markdown);

    expect(sections.map((section) => ({ id: section.id, heading: section.heading, level: section.level }))).toEqual([
      { id: 'title', heading: 'Title', level: 1 },
      { id: 'alpha', heading: 'Alpha', level: 2 },
      { id: 'beta', heading: 'Beta', level: 2 },
    ]);

    const alpha = sections[1];
    expect(markdown.slice(alpha.from, alpha.to)).toBe('## Alpha\nAlpha body\n\n');
    expect(markdown.slice(alpha.contentFrom, alpha.contentTo)).toBe('Alpha body\n\n');
  });

  it('keeps child headings inside parent section ranges', () => {
    const markdown = '# Parent\nParent body\n\n## Child\nChild body\n\n# Next\nNext body\n';
    const [parent, child, next] = parseSections(markdown);

    expect(markdown.slice(parent.from, parent.to)).toBe('# Parent\nParent body\n\n## Child\nChild body\n\n');
    expect(markdown.slice(child.from, child.to)).toBe('## Child\nChild body\n\n');
    expect(markdown.slice(next.from, next.to)).toBe('# Next\nNext body\n');
  });

  it('generates unique ids for duplicate headings', () => {
    const sections = parseSections('## Notes\nA\n\n## Notes\nB\n\n## Notes\nC\n');

    expect(sections.map((section) => section.id)).toEqual(['notes', 'notes-2', 'notes-3']);
  });

  it('finds sections by generated id', () => {
    const markdown = '# Title\nIntro\n\n## Alpha\nAlpha body\n';
    const section = findSection(markdown, 'alpha');

    expect(section?.heading).toBe('Alpha');
    expect(section ? markdown.slice(section.contentFrom, section.contentTo) : undefined).toBe('Alpha body\n');
  });

  it('returns no sections for markdown without headings', () => {
    expect(parseSections('Just some text\nwithout headings.')).toEqual([]);
  });
});
