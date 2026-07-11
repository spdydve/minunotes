import { useEffect, useState } from 'react';
import { applyNoteTheme, getStoredTheme, type NoteThemeId, noteThemes } from '../lib/themes';

export function ThemeSelect() {
  const [theme, setTheme] = useState<NoteThemeId>(() => getStoredTheme());

  useEffect(() => {
    applyNoteTheme(theme);
  }, [theme]);

  return (
    <label className="block px-3 py-2 text-xs text-[var(--notes-muted)]">
      <span className="mb-1 block">Theme</span>
      <select
        className="w-full rounded-md border border-[var(--notes-border)] bg-[var(--notes-panel)] px-2 py-1 text-sm text-[var(--notes-text)] outline-none"
        value={theme}
        onChange={(event) => setTheme(event.target.value as NoteThemeId)}
      >
        {noteThemes.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
