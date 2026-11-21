import { describe, it, expect } from 'vitest';
import { createVimState, handleKey, runExCommand, sendKeys } from './index';

describe('textwidth Insert mode auto-wrap (:set tw=N)', () => {
  it('automatically wraps to a new line at whitespace when typing past textwidth', () => {
    let state = createVimState([''], { line: 0, col: 0 });
    state = runExCommand(state, 'set tw=10');

    // Type "hello world" (11 chars -> wraps "world" to next line!)
    state = sendKeys(state, ['i', ...'hello world'.split(''), 'Escape']);
    expect(state.lines).toEqual(['hello', 'world']);
  });

  it('preserves leading indentation on wrapped line when autoindent is enabled', () => {
    let state = createVimState(['  '], { line: 0, col: 0 });
    state = runExCommand(state, 'set tw=12 ai');

    // "  alpha beta" = 12 chars (fits), then " gamma" wraps!
    state = sendKeys(state, ['A', ...'alpha beta g'.split(''), 'Escape']);
    expect(state.lines).toEqual(['  alpha beta', '  g']);
  });

  it('does not auto-wrap when textwidth is 0 (default)', () => {
    let state = createVimState([''], { line: 0, col: 0 });
    state = sendKeys(state, ['i', ...'hello world long sentence'.split(''), 'Escape']);
    expect(state.lines).toEqual(['hello world long sentence']);
  });
});

describe('startofline (:set sol / nosol)', () => {
  const lines = ['    first line', '  second line', '      third line'];

  it('defaults to nostartofline (false) preserving column on G / gg / [count]%', () => {
    let state = createVimState(lines, { line: 0, col: 1 });
    expect(state.options?.startofline).toBeFalsy();

    state = handleKey(state, 'G');
    expect(state.cursor).toEqual({ line: 2, col: 1 });

    state = sendKeys(state, 'gg');
    expect(state.cursor).toEqual({ line: 0, col: 1 });
  });

  it('moves cursor to first non-blank on G, gg, [count]%, and Ctrl-f/b when :set sol is enabled', () => {
    let state = createVimState(lines, { line: 0, col: 0 });
    state = runExCommand(state, 'set sol');
    expect(state.options?.startofline).toBe(true);

    // G -> line 2, first non-blank col 6
    state = handleKey(state, 'G');
    expect(state.cursor).toEqual({ line: 2, col: 6 });

    // gg -> line 0, first non-blank col 4
    state = sendKeys(state, 'gg');
    expect(state.cursor).toEqual({ line: 0, col: 4 });

    // 50% -> line 1, first non-blank col 2
    state = sendKeys(state, '50%');
    expect(state.cursor).toEqual({ line: 1, col: 2 });
  });
});

describe('smarttab (:set sta / nosta)', () => {
  it('uses shiftwidth for Tab/Backspace in leading indent and tabstop mid-line', () => {
    let state = createVimState([''], { line: 0, col: 0 });
    state = runExCommand(state, 'set et ts=8 sw=4 sts=0 sta');
    expect(state.options?.smarttab).toBe(true);

    // Leading Tab -> inserts 4 spaces (shiftwidth), NOT 8 (tabstop)!
    state = sendKeys(state, ['i', 'Tab']);
    expect(state.lines[0]).toBe('    ');
    expect(state.cursor).toEqual({ line: 0, col: 4 });

    // Leading Backspace -> deletes 4 spaces back to col 0!
    state = handleKey(state, 'Backspace');
    expect(state.lines[0]).toBe('');
    expect(state.cursor).toEqual({ line: 0, col: 0 });

    // Tab -> type 'x' -> mid-line Tab -> uses tabstop (8 spaces)
    state = sendKeys(state, ['Tab', 'x', 'Tab']);
    expect(state.lines[0]).toBe('    x        ');
  });
});
