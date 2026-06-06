import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { LanguageDescription, LanguageSupport, StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";

export const editorCodeLanguages = [
  LanguageDescription.of({ name: "Bash", alias: ["bash", "sh", "shell", "shellscript", "zsh"], extensions: ["sh", "bash", "zsh"], support: new LanguageSupport(StreamLanguage.define(shell)) }),
  LanguageDescription.of({ name: "CSS", alias: ["css"], extensions: ["css"], support: css() }),
  LanguageDescription.of({ name: "HTML", alias: ["html"], extensions: ["html", "htm"], support: html() }),
  LanguageDescription.of({ name: "JavaScript", alias: ["js", "javascript"], extensions: ["js", "mjs", "cjs"], support: javascript() }),
  LanguageDescription.of({ name: "JSON", alias: ["json"], extensions: ["json"], support: json() }),
  LanguageDescription.of({ name: "Markdown", alias: ["md", "markdown"], extensions: ["md", "markdown"], support: markdown() }),
  LanguageDescription.of({ name: "Python", alias: ["py", "python"], extensions: ["py"], support: python() }),
  LanguageDescription.of({ name: "SQL", alias: ["sql"], extensions: ["sql"], support: sql() }),
  LanguageDescription.of({ name: "TSX", alias: ["tsx"], extensions: ["tsx"], support: javascript({ jsx: true, typescript: true }) }),
  LanguageDescription.of({ name: "TypeScript", alias: ["ts", "typescript"], extensions: ["ts", "mts", "cts"], support: javascript({ typescript: true }) }),
  LanguageDescription.of({ name: "YAML", alias: ["yaml", "yml"], extensions: ["yaml", "yml"], support: yaml() }),
];
