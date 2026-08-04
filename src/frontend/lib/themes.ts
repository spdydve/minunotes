import { useSyncExternalStore } from 'react';

export const noteThemes = [
  { id: 'catppuccin-latte', label: 'Catppuccin Latte' },
  { id: 'catppuccin-frappe', label: 'Catppuccin Frappé' },
  { id: 'catppuccin-macchiato', label: 'Catppuccin Macchiato' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha' },
  { id: 'tokyo-night', label: 'Tokyo Night' },
  { id: 'everforest', label: 'Everforest' },
] as const;

export type NoteThemeId = (typeof noteThemes)[number]['id'];

const themeClassPrefix = 'theme-';
const storageKey = 'notes-theme';
const themeListeners = new Set<() => void>();

export function getStoredTheme(): NoteThemeId {
  if (typeof window === 'undefined') return 'catppuccin-mocha';
  const stored = window.localStorage.getItem(storageKey);
  return noteThemes.some((theme) => theme.id === stored) ? (stored as NoteThemeId) : 'catppuccin-mocha';
}

export function applyNoteTheme(themeId: NoteThemeId) {
  const root = document.documentElement;
  for (const theme of noteThemes) root.classList.remove(`${themeClassPrefix}${theme.id}`);
  root.classList.add(`${themeClassPrefix}${themeId}`);
  root.style.colorScheme = themeId === 'catppuccin-latte' ? 'light' : 'dark';
  window.localStorage.setItem(storageKey, themeId);
  for (const listener of themeListeners) listener();
}

function subscribeToNoteTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

export function useNoteTheme(): NoteThemeId {
  return useSyncExternalStore(subscribeToNoteTheme, getStoredTheme, () => 'catppuccin-mocha');
}

export function getMermaidTheme(themeId: NoteThemeId): 'default' | 'dark' {
  return themeId === 'catppuccin-latte' ? 'default' : 'dark';
}
