import { useEffect, useState } from 'react';
import { applyNoteTheme, getStoredTheme, type NoteThemeId, noteThemes } from '../lib/themes';

export function ThemeSelect() {
  const [theme, setTheme] = useState<NoteThemeId>(() => getStoredTheme());

  useEffect(() => {
    applyNoteTheme(theme);
  }, [theme]);

  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">Theme</span>
      <select
        aria-label="Theme selection"
        className="w-full rounded-md border border-[var(--notes-border)] bg-[var(--notes-bg)] px-3 py-2 text-[var(--notes-text)] outline-none focus:border-[var(--notes-accent)]"
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
