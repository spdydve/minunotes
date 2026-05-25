import { describe, expect, it } from "vitest";
import { hashMarkdown } from "../src/api/harness/hash";
import { findSection, parseSections } from "../src/api/harness/sections";

describe("hashMarkdown", () => {
  it("returns a stable sha256 hash for markdown content", () => {
    expect(hashMarkdown("# Hello")).toBe(hashMarkdown("# Hello"));
    expect(hashMarkdown("# Hello")).not.toBe(hashMarkdown("# Goodbye"));
    expect(hashMarkdown("# Hello")).toHaveLength(64);
  });
});

describe("parseSections", () => {
  it("parses headings into sections with ranges", () => {
    const markdown = "# Title\nIntro\n\n## Alpha\nAlpha body\n\n## Beta\nBeta body\n";
    const sections = parseSections(markdown);

    expect(sections.map((section) => ({ id: section.id, heading: section.heading, level: section.level }))).toEqual([
      { id: "title", heading: "Title", level: 1 },
      { id: "alpha", heading: "Alpha", level: 2 },
      { id: "beta", heading: "Beta", level: 2 },
    ]);

    const alpha = sections[1];
    expect(markdown.slice(alpha.from, alpha.to)).toBe("## Alpha\nAlpha body\n\n");
    expect(markdown.slice(alpha.contentFrom, alpha.contentTo)).toBe("Alpha body\n\n");
  });

  it("keeps child headings inside parent section ranges", () => {
    const markdown = "# Parent\nParent body\n\n## Child\nChild body\n\n# Next\nNext body\n";
    const [parent, child, next] = parseSections(markdown);

    expect(markdown.slice(parent.from, parent.to)).toBe("# Parent\nParent body\n\n## Child\nChild body\n\n");
    expect(markdown.slice(child.from, child.to)).toBe("## Child\nChild body\n\n");
    expect(markdown.slice(next.from, next.to)).toBe("# Next\nNext body\n");
  });

  it("generates unique ids for duplicate headings", () => {
    const sections = parseSections("## Notes\nA\n\n## Notes\nB\n\n## Notes\nC\n");

    expect(sections.map((section) => section.id)).toEqual(["notes", "notes-2", "notes-3"]);
  });

  it("finds sections by generated id", () => {
    const markdown = "# Title\nIntro\n\n## Alpha\nAlpha body\n";
    const section = findSection(markdown, "alpha");

    expect(section?.heading).toBe("Alpha");
    expect(section ? markdown.slice(section.contentFrom, section.contentTo) : undefined).toBe("Alpha body\n");
  });

  it("returns no sections for markdown without headings", () => {
    expect(parseSections("Just some text\nwithout headings.")).toEqual([]);
  });
});
