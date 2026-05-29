import { describe, expect, it } from "vitest";
import { getLineRange, searchLines, splitNumberedLines } from "../src/api/harness/line-search";

describe("splitNumberedLines", () => {
  it("numbers lines starting at one", () => {
    expect(splitNumberedLines("a\nb")).toEqual([{ line: 1, text: "a" }, { line: 2, text: "b" }]);
  });
});

describe("getLineRange", () => {
  it("returns clamped line ranges", () => {
    expect(getLineRange("a\nb\nc", 2, 20)).toEqual({ from: 2, to: 3, lineCount: 3, lines: [{ line: 2, text: "b" }, { line: 3, text: "c" }] });
  });
});

describe("searchLines", () => {
  it("returns line, column, and context for matches", () => {
    expect(searchLines("alpha\nTODO item\nomega", { query: "todo", context: 1 })).toEqual({
      lineCount: 3,
      matches: [{ line: 2, column: 1, text: "TODO item", before: [{ line: 1, text: "alpha" }], after: [{ line: 3, text: "omega" }] }],
    });
  });

  it("supports case-sensitive matching", () => {
    expect(searchLines("TODO\ntodo", { query: "todo", caseSensitive: true }).matches.map((match) => match.line)).toEqual([2]);
  });
});
