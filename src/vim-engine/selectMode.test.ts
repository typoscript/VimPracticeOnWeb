import { describe, it, expect } from 'vitest';
import { createVimState, handleKey, isPositionSelected, sendKeys } from './index';

describe('Select Mode (gh / gH / g<C-h> / Visual Ctrl-g)', () => {
  it('enters SELECT, SELECT_LINE, and SELECT_BLOCK from Normal mode', () => {
    const base = createVimState(['hello world', 'second line'], { line: 0, col: 2 });

    const sel = sendKeys(base, 'gh');
    expect(sel.mode).toBe('SELECT');
    expect(sel.visualAnchor).toEqual({ line: 0, col: 2 });
    expect(isPositionSelected(0, 2, sel.visualAnchor, sel.cursor, sel.mode)).toBe(true);

    const selLine = sendKeys(base, 'gH');
    expect(selLine.mode).toBe('SELECT_LINE');
    expect(isPositionSelected(0, 0, selLine.visualAnchor, selLine.cursor, selLine.mode)).toBe(true);
    expect(isPositionSelected(0, 9, selLine.visualAnchor, selLine.cursor, selLine.mode)).toBe(true);

    const selBlock = sendKeys(base, ['g', 'Ctrl-h']);
    expect(selBlock.mode).toBe('SELECT_BLOCK');
    expect(selBlock.visualAnchor).toEqual({ line: 0, col: 2 });

    const selBlockCombo = handleKey(base, 'g<C-h>');
    expect(selBlockCombo.mode).toBe('SELECT_BLOCK');
  });

  it('toggles between VISUAL* and SELECT* with Ctrl-g preserving anchor and cursor', () => {
    let state = createVimState(['hello world', 'second line'], { line: 0, col: 0 });
    state = sendKeys(state, 've');
    expect(state.mode).toBe('VISUAL');
    expect(state.visualAnchor).toEqual({ line: 0, col: 0 });
    expect(state.cursor).toEqual({ line: 0, col: 4 });

    // Visual -> Select
    state = handleKey(state, 'Ctrl-g');
    expect(state.mode).toBe('SELECT');
    expect(state.visualAnchor).toEqual({ line: 0, col: 0 });
    expect(state.cursor).toEqual({ line: 0, col: 4 });

    // Select -> Visual
    state = handleKey(state, 'Ctrl-g');
    expect(state.mode).toBe('VISUAL');
    expect(state.visualAnchor).toEqual({ line: 0, col: 0 });
    expect(state.cursor).toEqual({ line: 0, col: 4 });

    // VISUAL_LINE <-> SELECT_LINE
    state = handleKey(state, 'V');
    state = handleKey(state, 'Ctrl-g');
    expect(state.mode).toBe('SELECT_LINE');
    state = handleKey(state, 'Ctrl-g');
    expect(state.mode).toBe('VISUAL_LINE');

    // VISUAL_BLOCK <-> SELECT_BLOCK
    state = handleKey(state, 'Ctrl-v');
    state = handleKey(state, 'Ctrl-g');
    expect(state.mode).toBe('SELECT_BLOCK');
    state = handleKey(state, 'Ctrl-g');
    expect(state.mode).toBe('VISUAL_BLOCK');
  });

  it('replaces selected text and enters INSERT mode when typing a printable character', () => {
    let state = createVimState(['hello world'], { line: 0, col: 6 });
    // Select 'world' via gh + ArrowRight x 4, then type 'Vim'
    state = sendKeys(state, [
      'g', 'h',
      'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight',
      'V', 'i', 'm', 'Escape',
    ]);
    expect(state.mode).toBe('NORMAL');
    expect(state.lines[0]).toBe('hello Vim');
  });

  it('deletes selection and enters INSERT mode on Backspace/Delete', () => {
    let state = createVimState(['hello world'], { line: 0, col: 0 });
    state = sendKeys(state, ['v', 'e', 'Ctrl-g', 'Backspace']);
    expect(state.mode).toBe('INSERT');
    expect(state.lines[0]).toBe(' world');
    expect(state.cursor).toEqual({ line: 0, col: 0 });
  });

  it('supports SELECT_LINE replacement and undo', () => {
    let state = createVimState(['line 1', 'line 2', 'line 3'], { line: 0, col: 0 });
    state = sendKeys(state, ['g', 'H', 'ArrowDown', 'n', 'e', 'w', 'Escape']);
    expect(state.lines).toEqual(['new', 'line 3']);

    // Undo restores original lines
    state = handleKey(state, 'u');
    expect(state.lines).toEqual(['line 1', 'line 2', 'line 3']);
  });

  it('supports SELECT_BLOCK multi-line replacement', () => {
    let state = createVimState(['foo = 1', 'bar = 2'], { line: 0, col: 0 });
    state = sendKeys(state, [
      'g', 'Ctrl-h',
      'ArrowRight', 'ArrowRight', 'ArrowDown',
      'x', 'y', 'z', 'Escape',
    ]);
    expect(state.lines).toEqual(['xyz = 1', 'xyz = 2']);
  });

  it('supports Ctrl-o one-shot Visual command inside Select mode and Escape back to Normal', () => {
    let state = createVimState(['hello world'], { line: 0, col: 0 });
    // Enter SELECT, press Ctrl-o then 'e' (extends to end of 'hello' and returns to SELECT)
    state = sendKeys(state, ['g', 'h', 'Ctrl-o', 'e']);
    expect(state.mode).toBe('SELECT');
    expect(state.cursor).toEqual({ line: 0, col: 4 });

    // Escape returns to NORMAL and saves lastVisualSelection
    state = handleKey(state, 'Escape');
    expect(state.mode).toBe('NORMAL');
    // (curswant 는 gv 가 되살릴 b_visual.vi_curswant 입니다)
    expect(state.lastVisualSelection).toMatchObject({
      mode: 'VISUAL',
      anchor: { line: 0, col: 0 },
      cursor: { line: 0, col: 4 },
    });
  });
});
