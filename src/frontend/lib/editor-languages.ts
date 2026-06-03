import { LanguageDescription, LanguageSupport, StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";

export const editorCodeLanguages = [
  LanguageDescription.of({ name: "Bash", alias: ["sh", "shell", "shellscript", "zsh"], extensions: ["sh", "bash", "zsh"], support: new LanguageSupport(StreamLanguage.define(shell)) }),
  LanguageDescription.of({ name: "CSS", alias: ["css"], extensions: ["css"], load: () => import("@codemirror/lang-css").then((module) => module.css()) }),
  LanguageDescription.of({ name: "HTML", alias: ["html"], extensions: ["html", "htm"], load: () => import("@codemirror/lang-html").then((module) => module.html()) }),
  LanguageDescription.of({ name: "JavaScript", alias: ["js", "javascript"], extensions: ["js", "mjs", "cjs"], load: () => import("@codemirror/lang-javascript").then((module) => module.javascript()) }),
  LanguageDescription.of({ name: "JSON", alias: ["json"], extensions: ["json"], load: () => import("@codemirror/lang-json").then((module) => module.json()) }),
  LanguageDescription.of({ name: "Markdown", alias: ["md", "markdown"], extensions: ["md", "markdown"], load: () => import("@codemirror/lang-markdown").then((module) => module.markdown()) }),
  LanguageDescription.of({ name: "Python", alias: ["py", "python"], extensions: ["py"], load: () => import("@codemirror/lang-python").then((module) => module.python()) }),
  LanguageDescription.of({ name: "SQL", alias: ["sql"], extensions: ["sql"], load: () => import("@codemirror/lang-sql").then((module) => module.sql()) }),
  LanguageDescription.of({ name: "TSX", alias: ["tsx"], extensions: ["tsx"], load: () => import("@codemirror/lang-javascript").then((module) => module.javascript({ jsx: true, typescript: true })) }),
  LanguageDescription.of({ name: "TypeScript", alias: ["ts", "typescript"], extensions: ["ts", "mts", "cts"], load: () => import("@codemirror/lang-javascript").then((module) => module.javascript({ typescript: true })) }),
  LanguageDescription.of({ name: "YAML", alias: ["yaml", "yml"], extensions: ["yaml", "yml"], load: () => import("@codemirror/lang-yaml").then((module) => module.yaml()) }),
];
