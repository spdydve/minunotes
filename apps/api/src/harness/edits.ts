export type DocumentEdit =
  | { type: "append"; text: string }
  | { type: "replace_text"; oldText: string; newText: string }
  | { type: "replace_range"; from: number; to: number; text: string };

export type EditResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string };

type RangeReplacement = { from: number; to: number; text: string };

export function applyDocumentEdits(markdown: string, edits: DocumentEdit[]): EditResult {
  const replacements: RangeReplacement[] = [];
  let appendText = "";

  for (const edit of edits) {
    if (edit.type === "append") {
      appendText += edit.text;
      continue;
    }

    if (edit.type === "replace_text") {
      if (!edit.oldText) return { ok: false, error: "replace_text oldText is required" };
      const first = markdown.indexOf(edit.oldText);
      if (first === -1) return { ok: false, error: "replace_text oldText was not found" };
      const second = markdown.indexOf(edit.oldText, first + edit.oldText.length);
      if (second !== -1) return { ok: false, error: "replace_text oldText must match exactly once" };
      replacements.push({ from: first, to: first + edit.oldText.length, text: edit.newText });
      continue;
    }

    if (!Number.isInteger(edit.from) || !Number.isInteger(edit.to)) return { ok: false, error: "replace_range bounds must be integers" };
    if (edit.from < 0 || edit.to < edit.from || edit.to > markdown.length) return { ok: false, error: "replace_range bounds are invalid" };
    replacements.push({ from: edit.from, to: edit.to, text: edit.text });
  }

  const sorted = [...replacements].sort((a, b) => a.from - b.from || a.to - b.to);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].from < sorted[index - 1].to) return { ok: false, error: "edits must not overlap" };
  }

  let next = markdown;
  for (const replacement of [...sorted].reverse()) {
    next = `${next.slice(0, replacement.from)}${replacement.text}${next.slice(replacement.to)}`;
  }

  return { ok: true, markdown: next + appendText };
}
