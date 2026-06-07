import { createShikiHighlighter } from "@dpklabs/minueditor/shiki";
import type { CodeHighlighter } from "@dpklabs/minueditor";

const languageAliases: Record<string, string> = {
  js: "javascript",
  md: "markdown",
  py: "python",
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  ts: "typescript",
  yml: "yaml",
  zsh: "bash",
};

const highlightedLanguages = new Set([
  "bash",
  "css",
  "html",
  "javascript",
  "json",
  "jsx",
  "markdown",
  "python",
  "sql",
  "tsx",
  "typescript",
  "yaml",
]);

const shikiHighlighter = createShikiHighlighter({
  themes: {
    light: "github-light",
    dark: "github-dark",
  },
});

export const editorCodeHighlighter: CodeHighlighter = (code, lang) => {
  const rawLanguage = lang.trim().toLowerCase();
  const normalized = languageAliases[rawLanguage] ?? rawLanguage;
  if (!normalized || !highlightedLanguages.has(normalized)) return null;
  return shikiHighlighter(code, normalized);
};
