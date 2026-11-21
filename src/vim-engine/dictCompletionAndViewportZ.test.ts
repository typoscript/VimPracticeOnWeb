import { describe, it, expect } from 'vitest';
import { createVimState, handleKey, sendKeys } from './index';

describe('Insert Dictionary Completion (Ctrl-x Ctrl-k)', () => {
  it('completes English dictionary words from built-in spellData and cycles with Ctrl-n/p', () => {
    let state = createVimState(['func'], { line: 0, col: 0 });
    state = sendKeys(state, ['A', 'Ctrl-x', 'Ctrl-k']);

    expect(state.mode).toBe('INSERT');
    expect(state.completionSession?.type).toBe('dictionary');
    expect(state.completionSession?.candidates.length).toBeGreaterThan(0);
    expect(state.completionSession?.candidates).toContain('function');
    expect(state.lines[0].startsWith('func')).toBe(true);
    expect(state.lines[0].length).toBeGreaterThan(4);

    const firstWord = state.lines[0];
    // Cycling with Ctrl-n moves to next dictionary candidate if multiple exist
    if ((state.completionSession?.candidates.length ?? 0) > 1) {
      state = handleKey(state, 'Ctrl-n');
      expect(state.lines[0]).not.toBe(firstWord);
    }

    // Ctrl-e cancels and restores original prefix
    state = handleKey(state, 'Ctrl-e');
    expect(state.lines[0]).toBe('func');
    expect(state.completionSession).toBeNull();
  });

  it('preserves Title Case and includes user spellGoodWords in Ctrl-x Ctrl-k', () => {
    let state = createVimState(['Mycu'], { line: 0, col: 0 }, {
      spellGoodWords: ['mycustomword'],
    });
    state = sendKeys(state, ['A', 'Ctrl-x', 'Ctrl-k']);
    expect(state.lines[0]).toBe('Mycustomword');
  });
});

describe('Viewport Alignment Variants (z<CR>, z., z-) and gV', () => {
  const lines = Array.from({ length: 40 }, (_, i) => `    line ${i + 1}`);

  it('z<CR>, z., and z- scroll viewport and move cursor to first non-blank', () => {
    let state = createVimState(lines, { line: 20, col: 8 }, {
      viewport: { topRow: 0, visibleRows: 10 },
    });

    // z<CR> -> topRow = 20, cursor col = 4 (first non-blank)
    const topState = sendKeys(state, ['z', 'Enter']);
    expect(topState.viewport?.topRow).toBe(20);
    expect(topState.cursor).toEqual({ line: 20, col: 4 });

    // z. -> topRow = 15 (center), cursor col = 4
    const centerState = sendKeys(state, ['z', '.']);
    expect(centerState.viewport?.topRow).toBe(15);
    expect(centerState.cursor).toEqual({ line: 20, col: 4 });

    // z- -> topRow = 11 (bottom), cursor col = 4
    const botState = sendKeys(state, ['z', '-']);
    expect(botState.viewport?.topRow).toBe(11);
    expect(botState.cursor).toEqual({ line: 20, col: 4 });

    // [count]z. -> jumps to line 30 (0-based 29) and centers it
    const countedCenter = sendKeys(state, ['3', '0', 'z', '.']);
    expect(countedCenter.cursor).toEqual({ line: 29, col: 4 });
    expect(countedCenter.viewport?.topRow).toBe(24);
  });

  it('gV completes cleanly without bell and keeps lastVisualSelection intact', () => {
    let state = createVimState(['hello world'], { line: 0, col: 0 });
    state = sendKeys(state, ['v', 'e', 'Escape']);
    const saved = state.lastVisualSelection;
    expect(saved).toBeDefined();

    state = sendKeys(state, 'gV');
    expect(state.bell).toBeFalsy();
    expect(state.mode).toBe('NORMAL');
    expect(state.lastVisualSelection).toEqual(saved);

    // Inside Select mode Ctrl-o one-shot Visual, gV prevents returning to Select mode
    let sel = sendKeys(createVimState(['hello world']), ['g', 'h', 'Ctrl-o', 'g', 'V']);
    expect(sel.mode).toBe('VISUAL');
    expect(sel.selectVisualOneShot).toBeUndefined();
  });
});
