import { STORAGE_KEYS, readStorageRaw, writeStorageRaw } from './localStorageClient';

export type VimTheme = 'tokyo-night' | 'catppuccin-mocha' | 'gruvbox-dark' | 'one-dark';

export interface ThemeOption {
  id: VimTheme;
  name: string;
  icon: string;
  accentColor: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'tokyo-night', name: 'Tokyo Night', icon: '🌃', accentColor: '#7aa2f7' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', icon: '☕', accentColor: '#cba6f7' },
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', icon: '🍂', accentColor: '#fe8019' },
  { id: 'one-dark', name: 'One Dark', icon: '💻', accentColor: '#61afef' },
];

export const DEFAULT_THEME: VimTheme = 'tokyo-night';

export function loadThemeSetting(): VimTheme {
  const saved = readStorageRaw(STORAGE_KEYS.THEME) as VimTheme | null;
  if (saved && THEME_OPTIONS.some((t) => t.id === saved)) {
    return saved;
  }
  return DEFAULT_THEME;
}

export function saveThemeSetting(theme: VimTheme): void {
  writeStorageRaw(STORAGE_KEYS.THEME, theme);
}

export function applyTheme(theme: VimTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
}
