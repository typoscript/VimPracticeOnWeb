import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from './App';
import { encodeCustomMission, CustomMissionData } from './utils/customMission';
import { setLocale, LOCALE_STORAGE_KEY } from './i18n';
import { getVimEngineConfig } from './vim-engine';

describe('Gamification & UX Client Features Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
    setLocale('ko', { persist: false });
  });

  it('renders theme switcher and changes theme attribute on document root', () => {
    render(<App />);

    const themeSelect = screen.getByRole('combobox', { name: /에디터 컬러 테마 선택/i });
    expect(themeSelect).toBeDefined();

    fireEvent.change(themeSelect, { target: { value: 'gruvbox-dark' } });
    expect(document.documentElement.getAttribute('data-theme')).toBe('gruvbox-dark');
    expect(localStorage.getItem('vim_selected_theme')).toBe('gruvbox-dark');
  });

  it('toggles sound mute state and updates button label & localStorage', () => {
    render(<App />);

    const soundBtn = screen.getByTestId('toggle-sound-btn');
    expect(soundBtn.textContent).toContain('🔊 소리: ON');

    fireEvent.click(soundBtn);
    expect(soundBtn.textContent).toContain('🔇 소리: OFF');
    expect(localStorage.getItem('vim_sound_muted')).toBe('true');

    fireEvent.click(soundBtn);
    expect(soundBtn.textContent).toContain('🔊 소리: ON');
    expect(localStorage.getItem('vim_sound_muted')).toBe('false');
  });

  it('switches the UI between Korean and English and remembers the choice', () => {
    render(<App />);

    const localeBtn = screen.getByTestId('toggle-locale-btn');
    const soundBtn = screen.getByTestId('toggle-sound-btn');
    expect(localeBtn.textContent).toContain('한국어');
    expect(soundBtn.textContent).toContain('🔊 소리: ON');

    fireEvent.click(localeBtn);
    expect(localeBtn.textContent).toContain('English');
    expect(soundBtn.textContent).toContain('🔊 Sound: ON');
    expect(screen.getByTestId('mission-title').textContent).toContain('Lesson 1: Basic Movement');
    expect(screen.getByRole('combobox', { name: /Choose editor color theme/i })).toBeDefined();
    expect(document.documentElement.lang).toBe('en');
    expect(getVimEngineConfig().locale).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');

    fireEvent.click(localeBtn);
    expect(soundBtn.textContent).toContain('🔊 소리: ON');
    expect(document.documentElement.lang).toBe('ko');
    expect(getVimEngineConfig().locale).toBe('ko');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ko');
  });

  it('opens CustomMissionModal, configures a mission, and launches it into editor', async () => {
    render(<App />);

    const openModalBtn = screen.getByTestId('open-custom-modal-btn');
    fireEvent.click(openModalBtn);

    expect(await screen.findByTestId('custom-mission-modal')).toBeDefined();

    // Customize mission
    const titleInput = screen.getByTestId('custom-input-title');
    fireEvent.change(titleInput, { target: { value: '나만의 화살표 함수 골프' } });

    const playBtn = screen.getByTestId('play-custom-mission-btn');
    fireEvent.click(playBtn);

    // Modal closes and custom mission is loaded
    await waitFor(() => {
      expect(screen.queryByTestId('custom-mission-modal')).toBeNull();
      expect(screen.getByTestId('tab-custom-btn')).toBeDefined();
      expect(screen.getByText('나만의 화살표 함수 골프')).toBeDefined();
    });
  });

  it('automatically decodes and initializes custom mission when ?challenge= is present in URL', () => {
    const customChallenge: CustomMissionData = {
      title: 'URL 공유 미션',
      description: 'URL 파라미터로 자동 로드된 미션입니다.',
      initialText: 'var oldWay = 1;',
      targetText: 'const modernWay = 1;',
      par: 15,
    };

    const encoded = encodeCustomMission(customChallenge);
    window.history.pushState({}, '', `/?challenge=${encoded}`);

    render(<App />);

    // Custom tab should be active and editor initialized
    expect(screen.getByTestId('tab-custom-btn')).toBeDefined();
    expect(screen.getByText('URL 공유 미션')).toBeDefined();
    expect(screen.getByText('var oldWay = 1;')).toBeDefined();
  });
});
