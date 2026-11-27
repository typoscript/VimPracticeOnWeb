import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { KeyReferenceModal } from './KeyReferenceModal';
import { KEY_REFERENCE_MODES, keyNameFromEvent, keyReferenceModeFor } from './keyReferenceCatalog';
import { lessonsForKey } from './keyReferenceLessons';
import { MISSIONS } from '../../data/missions';
import { isKeyReferenceShortcut } from '../../utils/keyReferenceShortcut';

const ev = (key: string, extra: Partial<KeyboardEvent> = {}) => ({
  key,
  code: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
});

describe('keyReferenceCatalog', () => {
  it('has one entry per key in each mode', () => {
    for (const mode of KEY_REFERENCE_MODES) {
      const keys = mode.entries.map((entry) => entry.key);
      expect(new Set(keys).size, mode.id).toBe(keys.length);
    }
  });

  it('picks the tab for the editor mode', () => {
    expect(keyReferenceModeFor('NORMAL')).toBe('normal');
    expect(keyReferenceModeFor('VISUAL_BLOCK')).toBe('visual');
    expect(keyReferenceModeFor('INSERT')).toBe('insert');
    expect(keyReferenceModeFor('COMMAND')).toBe('normal');
  });

  it('finds lessons that practice a key, title matches first', () => {
    const forJ = lessonsForKey('j', MISSIONS);
    expect(forJ[0].id).toBe(1);
    expect(forJ.length).toBeLessThanOrEqual(4);
    const forCtrlW = lessonsForKey('Ctrl-w', MISSIONS).map((m) => m.id);
    expect(forCtrlW).toContain(24);
    expect(lessonsForKey('Esc', MISSIONS, 'insert').length).toBeGreaterThan(0);
  });

  it('only links lessons that press the key in the chosen mode', () => {
    // 레슨 84 는 제목에 f 가 있지만 :sort f 처럼 명령줄에서만 칩니다.
    expect(lessonsForKey('f', MISSIONS, 'normal').map((m) => m.id)).not.toContain(84);
    // 레슨 26 은 입력 모드에서 Ctrl-w 로 단어를 지우고, 레슨 24 는 노멀 모드 창 명령입니다.
    expect(lessonsForKey('Ctrl-w', MISSIONS, 'insert').map((m) => m.id)).toContain(26);
    expect(lessonsForKey('Ctrl-w', MISSIONS, 'insert').map((m) => m.id)).not.toContain(24);
    expect(lessonsForKey('Ctrl-w', MISSIONS, 'normal').map((m) => m.id)).toContain(24);
    expect(lessonsForKey('Ctrl-u', MISSIONS, 'insert').map((m) => m.id)).not.toContain(102);
    expect(lessonsForKey('o', MISSIONS, 'visual').length).toBeGreaterThan(0);
  });

  it('turns key events into reference key names', () => {
    expect(keyNameFromEvent(ev('w'))).toBe('w');
    expect(keyNameFromEvent(ev('W'))).toBe('W');
    expect(keyNameFromEvent(ev('Escape'))).toBe('Esc');
    expect(keyNameFromEvent(ev(' '))).toBe('Space');
    expect(keyNameFromEvent(ev('w', { ctrlKey: true, code: 'KeyW' }))).toBe('Ctrl-w');
    expect(keyNameFromEvent(ev('6', { ctrlKey: true, code: 'Digit6' }))).toBe('Ctrl-^');
    expect(keyNameFromEvent(ev('Shift'))).toBeNull();
    expect(keyNameFromEvent(ev('j', { altKey: true }))).toBeNull();
  });

  it('recognises Ctrl+/ and Cmd+/ as the open shortcut', () => {
    expect(isKeyReferenceShortcut(ev('/', { ctrlKey: true, code: 'Slash' }))).toBe(true);
    expect(isKeyReferenceShortcut(ev('/', { metaKey: true, code: 'Slash' }))).toBe(true);
    expect(isKeyReferenceShortcut(ev('/', { code: 'Slash' }))).toBe(false);
  });
});

describe('KeyReferenceModal', () => {
  it('shows what a pressed key does, with follow-up keys for prefixes', () => {
    render(<KeyReferenceModal isOpen onClose={() => {}} />);
    const detail = screen.getByTestId('key-reference-detail');

    fireEvent.keyDown(window, { key: 'w', code: 'KeyW' });
    expect(detail.textContent).toContain('다음 단어 시작');

    fireEvent.keyDown(window, { key: 'g', code: 'KeyG' });
    expect(detail.textContent).toContain('이어서 누르는 키');
    expect(detail.textContent).toContain('파일 맨 위');

    fireEvent.keyDown(window, { key: 'w', code: 'KeyW', ctrlKey: true });
    expect(detail.textContent).toContain('세로 분할');
  });

  it('maps Korean IME keys to the Vim key', () => {
    render(<KeyReferenceModal isOpen onClose={() => {}} />);
    fireEvent.keyDown(window, { key: 'ㅓ', code: 'KeyJ' });
    expect(screen.getByTestId('key-reference-detail').textContent).toContain('아래 줄로');
  });

  it('says when a key is not in the reference', () => {
    render(<KeyReferenceModal isOpen onClose={() => {}} />);
    fireEvent.keyDown(window, { key: 'Ö' });
    expect(screen.getByTestId('key-reference-detail').textContent).toContain('Ö 키는 노멀 모드에서 쓰지 않거나');
  });

  it('selects a key by clicking it', () => {
    render(<KeyReferenceModal isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('key-reference-key-d'));
    expect(screen.getByTestId('key-reference-detail').textContent).toContain('삭제');
  });

  it('closes with Esc and with Ctrl+/', () => {
    const onClose = vi.fn();
    render(<KeyReferenceModal isOpen onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: '/', code: 'Slash', ctrlKey: true });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('opens on the tab for the editor mode and looks keys up in that mode', () => {
    render(<KeyReferenceModal isOpen onClose={() => {}} editorMode="INSERT" />);
    expect(screen.getByTestId('key-reference-mode-insert')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(window, { key: 'u', code: 'KeyU', ctrlKey: true });
    expect(screen.getByTestId('key-reference-detail').textContent).toContain('입력 시작점까지 지우기');

    fireEvent.click(screen.getByTestId('key-reference-mode-visual'));
    fireEvent.keyDown(window, { key: 'o', code: 'KeyO' });
    expect(screen.getByTestId('key-reference-detail').textContent).toContain('반대쪽 끝');
  });

  it('links to lessons that practice the key', () => {
    const onSelectLesson = vi.fn();
    const onClose = vi.fn();
    render(<KeyReferenceModal isOpen onClose={onClose} missions={MISSIONS} onSelectLesson={onSelectLesson} />);
    fireEvent.keyDown(window, { key: 'j', code: 'KeyJ' });
    fireEvent.click(screen.getByTestId('key-reference-lesson-1'));
    expect(onSelectLesson).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalled();
  });
});
