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

const STORAGE_KEY = 'vim_selected_theme';
export const DEFAULT_THEME: VimTheme = 'tokyo-night';

export function loadThemeSetting(): VimTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as VimTheme | null;
    if (saved && THEME_OPTIONS.some((t) => t.id === saved)) {
      return saved;
    }
  } catch (e) {
    // ignore
  }
  return DEFAULT_THEME;
}

export function saveThemeSetting(theme: VimTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (e) {
    // ignore
  }
}

export function applyTheme(theme: VimTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
}
