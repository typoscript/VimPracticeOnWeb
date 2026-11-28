import { describe, it, expect } from 'vitest';
import { createVimState, handleKey, type VimEditorState } from './index';

function runKeys(state: VimEditorState, keys: string[]): VimEditorState {
  return keys.reduce((s, k) => handleKey(s, k), state);
}

function runEx(state: VimEditorState, cmd: string): VimEditorState {
  let s = handleKey(state, ':');
  for (const ch of cmd) s = handleKey(s, ch);
  return handleKey(s, 'Enter');
}

function runSearch(state: VimEditorState, dir: '/' | '?', query: string): VimEditorState {
  let s = handleKey(state, dir);
  for (const ch of query) s = handleKey(s, ch);
  return handleKey(s, 'Enter');
}

describe('wrapscan (:set ws / nows)', () => {
  it('defaults to wrapscan=true and wraps around on / and n', () => {
    let state = createVimState(['foo one', 'bar two', 'foo three'], { line: 2, col: 4 });
    state = runSearch(state, '/', 'foo');
    expect(state.cursor).toEqual({ line: 0, col: 0 });
    expect(state.bell).toBeFalsy();
  });

  it('stops at bottom with E385 and bell on forward search/n/* when nowrapscan is set', () => {
    let state = createVimState(['foo one', 'bar two', 'foo three'], { line: 2, col: 0 });
    state = runEx(state, 'set nowrapscan');
    expect(state.options?.wrapscan).toBe(false);

    // Search forward from line 2 col 4 where no later 'foo' exists
    state = { ...state, cursor: { line: 2, col: 4 } };
    state = runSearch(state, '/', 'foo');
    expect(state.bell).toBe(true);
    expect(state.cursor).toEqual({ line: 2, col: 4 });
    expect(state.commandMessage).toContain('E385');

    // n from the last match should not wrap
    state = { ...state, cursor: { line: 2, col: 0 } };
    state = handleKey(state, 'n');
    expect(state.bell).toBe(true);
    expect(state.cursor).toEqual({ line: 2, col: 0 });
    expect(state.commandMessage).toContain('E385');

    // * from the last occurrence should not wrap
    state = handleKey(state, '*');
    expect(state.bell).toBe(true);
    expect(state.cursor).toEqual({ line: 2, col: 0 });
    expect(state.commandMessage).toContain('E385');
  });

  it('stops at top with E384 and bell on backward search/N/# when nowrapscan is set', () => {
    let state = createVimState(['foo one', 'bar two', 'foo three'], { line: 0, col: 0 });
    state = runEx(state, 'set nows');

    // Backward search from line 0 col 0 has no earlier 'foo'
    state = runSearch(state, '?', 'foo');
    expect(state.bell).toBe(true);
    expect(state.cursor).toEqual({ line: 0, col: 0 });
    expect(state.commandMessage).toContain('E384');

    // # from first occurrence should not wrap
    state = handleKey(state, '#');
    expect(state.bell).toBe(true);
    expect(state.cursor).toEqual({ line: 0, col: 0 });
    expect(state.commandMessage).toContain('E384');

    // Moving to line 2 and searching backward succeeds without wrapping
    state = { ...state, cursor: { line: 2, col: 0 } };
    state = handleKey(state, '#');
    expect(state.bell).toBeFalsy();
    expect(state.cursor).toEqual({ line: 0, col: 0 });
  });

  it('supports :set ws?, :set ws!, and :set ws&', () => {
    let state = createVimState(['hello']);
    state = runEx(state, 'set ws?');
    expect(state.commandMessage).toBe('wrapscan');
    state = runEx(state, 'set ws!');
    expect(state.options?.wrapscan).toBe(false);
    state = runEx(state, 'set ws&');
    expect(state.options?.wrapscan).toBe(true);
  });
});

describe('whichwrap (:set ww=...)', () => {
  it('defaults to b,s allowing Backspace and Space to cross lines in Normal mode', () => {
    let state = createVimState(['ab', 'cd'], { line: 0, col: 1 });
    // Space crosses to next line col 0
    state = handleKey(state, ' ');
    expect(state.cursor).toEqual({ line: 1, col: 0 });
    // Backspace crosses back to previous line end
    state = handleKey(state, 'Backspace');
    expect(state.cursor).toEqual({ line: 0, col: 1 });

    // h and l do NOT wrap by default
    state = handleKey(state, 'l');
    expect(state.cursor).toEqual({ line: 0, col: 1 });
    expect(state.bell).toBe(true);
  });

  it('wraps h/l and ArrowLeft/ArrowRight in Normal/Visual when added to whichwrap', () => {
    let state = createVimState(['ab', 'cd'], { line: 0, col: 1 });
    state = runEx(state, 'set ww+=h,l,<,>');
    expect(state.options?.whichwrap).toBe('b,s,h,l,<,>');

    state = handleKey(state, 'l');
    expect(state.cursor).toEqual({ line: 1, col: 0 });
    expect(state.bell).toBeFalsy();

    state = handleKey(state, 'h');
    expect(state.cursor).toEqual({ line: 0, col: 1 });

    state = handleKey(state, 'ArrowRight');
    expect(state.cursor).toEqual({ line: 1, col: 0 });
    state = handleKey(state, 'ArrowLeft');
    expect(state.cursor).toEqual({ line: 0, col: 1 });

    // Visual mode also respects whichwrap. Neovim: 비주얼의 l 은 먼저 줄 끝 다음 칸(NUL)에 서고, 한 번 더 누르면 다음 줄로 넘어갑니다.
    state = runKeys(state, ['v', 'l']);
    expect(state.cursor).toEqual({ line: 0, col: 2 });
    state = handleKey(state, 'l');
    expect(state.cursor).toEqual({ line: 1, col: 0 });
    state = handleKey(state, 'h');
    expect(state.cursor).toEqual({ line: 0, col: 2 });
  });

  it('wraps ArrowLeft/ArrowRight in Insert/Replace when [,] are in whichwrap', () => {
    let state = createVimState(['ab', 'cd'], { line: 0, col: 1 });
    state = runEx(state, 'set ww+=[,]');

    // Insert mode at end of line 0 -> ArrowRight wraps to line 1 col 0
    state = runKeys(state, ['A', 'ArrowRight']);
    expect(state.mode).toBe('INSERT');
    expect(state.cursor).toEqual({ line: 1, col: 0 });

    // ArrowLeft wraps back to line 0 col 2 (end of 'ab')
    state = handleKey(state, 'ArrowLeft');
    expect(state.cursor).toEqual({ line: 0, col: 2 });
  });

  it('wraps ~ to next line when ~ is in whichwrap and validates invalid flags with E474', () => {
    let state = createVimState(['ab', 'cd'], { line: 0, col: 1 });
    state = runEx(state, 'set ww+=~');
    state = handleKey(state, '~');
    expect(state.lines[0]).toBe('aB');
    expect(state.cursor).toEqual({ line: 1, col: 0 });

    const invalid = runEx(state, 'set ww=invalid');
    expect(invalid.bell).toBe(true);
    expect(invalid.commandMessage).toContain('E474');
  });
});

describe('softtabstop (:set sts=...)', () => {
  it('advances Tab to the next softtabstop column and deletes back on Backspace with expandtab', () => {
    let state = createVimState(['a'], { line: 0, col: 0 });
    state = runEx(state, 'set et sts=4 ts=8');
    expect(state.options?.softtabstop).toBe(4);

    // Insert after 'a' (col 1): Tab advances to col 4 (inserts 3 spaces)
    state = runKeys(state, ['A', 'Tab']);
    expect(state.lines[0]).toBe('a   ');
    expect(state.cursor).toEqual({ line: 0, col: 4 });

    // Another Tab advances to col 8 (inserts 4 spaces)
    state = handleKey(state, 'Tab');
    expect(state.lines[0]).toBe('a       ');
    expect(state.cursor).toEqual({ line: 0, col: 8 });

    // Backspace deletes 4 spaces back to col 4
    state = handleKey(state, 'Backspace');
    expect(state.lines[0]).toBe('a   ');
    expect(state.cursor).toEqual({ line: 0, col: 4 });

    // Another Backspace deletes 3 spaces back to col 1
    state = handleKey(state, 'Backspace');
    expect(state.lines[0]).toBe('a');
    expect(state.cursor).toEqual({ line: 0, col: 1 });
  });

  it('combines spaces into tabs when noexpandtab and softtabstop < tabstop', () => {
    let state = createVimState([''], { line: 0, col: 0 });
    state = runEx(state, 'set noet ts=8 sts=4');

    // First Tab -> 4 spaces (col 4)
    state = runKeys(state, ['i', 'Tab']);
    expect(state.lines[0]).toBe('    ');
    expect(state.cursor).toEqual({ line: 0, col: 4 });

    // Second Tab -> reaches vcol 8 = 1 real tab!
    state = handleKey(state, 'Tab');
    expect(state.lines[0]).toBe('\t');
    expect(state.cursor).toEqual({ line: 0, col: 1 });
  });

  it('supports sts=-1 to mirror shiftwidth', () => {
    let state = createVimState([''], { line: 0, col: 0 });
    state = runEx(state, 'set et sw=3 sts=-1');
    expect(state.options?.softtabstop).toBe(-1);

    state = runKeys(state, ['i', 'Tab']);
    expect(state.lines[0]).toBe('   ');
    expect(state.cursor).toEqual({ line: 0, col: 3 });

    state = handleKey(state, 'Backspace');
    expect(state.lines[0]).toBe('');
    expect(state.cursor).toEqual({ line: 0, col: 0 });
  });
});
