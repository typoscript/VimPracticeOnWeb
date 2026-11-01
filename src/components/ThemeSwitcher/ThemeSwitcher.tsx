import React from 'react';
import { VimTheme, THEME_OPTIONS } from '../../utils/theme';
import './ThemeSwitcher.css';

export interface ThemeSwitcherProps {
  currentTheme: VimTheme;
  onThemeChange: (theme: VimTheme) => void;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  currentTheme,
  onThemeChange,
}) => {
  return (
    <div className="theme-switcher-wrapper" data-testid="theme-switcher">
      <label htmlFor="theme-select" className="theme-switcher-label">
        <span className="theme-icon">🎨</span>
        <span className="theme-label-text">테마:</span>
      </label>
      <select
        id="theme-select"
        className="theme-select"
        value={currentTheme}
        onChange={(e) => onThemeChange(e.target.value as VimTheme)}
        aria-label="에디터 컬러 테마 선택"
      >
        {THEME_OPTIONS.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {theme.icon} {theme.name}
          </option>
        ))}
      </select>
    </div>
  );
};
