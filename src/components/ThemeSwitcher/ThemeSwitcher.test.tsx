import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeSwitcher } from './ThemeSwitcher';
import {
  THEME_OPTIONS,
  loadThemeSetting,
  saveThemeSetting,
  applyTheme,
  DEFAULT_THEME,
} from '../../utils/theme';

describe('ThemeSwitcher component and theme utils', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders theme selector with all 4 theme options', () => {
    render(<ThemeSwitcher currentTheme="tokyo-night" onThemeChange={() => {}} />);
    const select = screen.getByRole('combobox', { name: /에디터 컬러 테마 선택/i });
    expect(select).toBeDefined();

    THEME_OPTIONS.forEach((opt) => {
      expect(screen.getByText(new RegExp(opt.name, 'i'))).toBeDefined();
    });
  });

  it('triggers onThemeChange when a different theme is selected', () => {
    const handleThemeChange = vi.fn();
    render(<ThemeSwitcher currentTheme="tokyo-night" onThemeChange={handleThemeChange} />);

    const select = screen.getByRole('combobox', { name: /에디터 컬러 테마 선택/i });
    fireEvent.change(select, { target: { value: 'gruvbox-dark' } });

    expect(handleThemeChange).toHaveBeenCalledWith('gruvbox-dark');
  });

  it('correctly loads, saves, and applies themes', () => {
    expect(loadThemeSetting()).toBe(DEFAULT_THEME);

    saveThemeSetting('catppuccin-mocha');
    expect(loadThemeSetting()).toBe('catppuccin-mocha');

    applyTheme('gruvbox-dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('gruvbox-dark');
  });
});
