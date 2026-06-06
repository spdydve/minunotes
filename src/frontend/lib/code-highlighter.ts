import { createShikiHighlighter } from "@dpklabs/minueditor/shiki";
import type { CodeHighlighter } from "@dpklabs/minueditor";

const highlightedLanguages = new Set([
  "bash",
  "css",
  "html",
  "javascript",
  "js",
  "json",
  "jsx",
  "markdown",
  "md",
  "shell",
  "sh",
  "sql",
  "tsx",
  "typescript",
  "ts",
  "yaml",
  "yml",
]);

const shikiHighlighter = createShikiHighlighter({
  themes: {
    light: "github-light",
    dark: "github-dark",
  },
});

export const editorCodeHighlighter: CodeHighlighter = (code, lang) => {
  const normalized = lang.trim().toLowerCase();
  if (!normalized || !highlightedLanguages.has(normalized)) return null;
  return shikiHighlighter(code, normalized);
};
