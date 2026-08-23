import { describe, expect, it } from 'vitest';
import {
  getAdjacentResourceDocs,
  getResourceDocsForSection,
  resourceDocs,
  resourceSections,
} from '../src/frontend/docs/resources';
import { isPublicResourcePath } from '../src/frontend/lib/public-routes';

describe('public MinuNotes resources', () => {
  it('recognizes only resource library paths as public resources', () => {
    expect(isPublicResourcePath('/resources')).toBe(true);
    expect(isPublicResourcePath('/resources/getting-started')).toBe(true);
    expect(isPublicResourcePath('/resources/')).toBe(true);
    expect(isPublicResourcePath('/resource')).toBe(false);
    expect(isPublicResourcePath('/resources-other')).toBe(false);
  });

  it('has unique slugs and valid related guide links', () => {
    const slugs = resourceDocs.map((doc) => doc.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(resourceDocs.filter((doc) => doc.featured).map((doc) => doc.slug)).toEqual(['getting-started']);

    for (const doc of resourceDocs) {
      for (const relatedSlug of doc.relatedSlugs ?? []) {
        expect(slugs, `${doc.slug} links to missing resource ${relatedSlug}`).toContain(relatedSlug);
        expect(relatedSlug).not.toBe(doc.slug);
      }
    }
  });

  it('orders every registered guide within a valid section', () => {
    const sectionIds = resourceSections.map((section) => section.id);
    for (const doc of resourceDocs) expect(sectionIds).toContain(doc.section);
    for (const section of resourceSections) {
      const orders = getResourceDocsForSection(section.id).map((doc) => doc.order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
      expect(new Set(orders).size).toBe(orders.length);
    }
  });

  it('provides previous and next guide navigation', () => {
    expect(getAdjacentResourceDocs('getting-started').previous).toBeUndefined();
    expect(getAdjacentResourceDocs('getting-started').next?.slug).toBe('markdown-editor');
    expect(getAdjacentResourceDocs('missing')).toEqual({ previous: undefined, next: undefined });
  });
});
