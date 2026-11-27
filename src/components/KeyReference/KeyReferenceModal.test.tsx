import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { KeyReferenceModal } from './KeyReferenceModal';
import { KEY_REFERENCE_ENTRIES, keyNameFromEvent } from './keyReferenceCatalog';
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
  it('has one entry per key', () => {
    const keys = KEY_REFERENCE_ENTRIES.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
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
});
