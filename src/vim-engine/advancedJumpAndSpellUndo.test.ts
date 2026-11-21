import { describe, it, expect } from 'vitest';
import { createVimState, handleKey, runExCommand, sendKeys } from './index';

describe('[count]% percentage jump', () => {
  const lines = Array.from({ length: 10 }, (_, i) => `  line ${i + 1}`);

  it('jumps to N% of file preserving column (nostartofline) and records jump', () => {
    let state = createVimState(lines, { line: 0, col: 2 });
    // 50% of 10 lines -> floor((50*10 + 99)/100) = 5 -> 0-based line 4, col 2
    state = sendKeys(state, '50%');
    expect(state.cursor).toEqual({ line: 4, col: 2 });
    expect(state.jumpList?.length).toBeGreaterThan(0);

    // 100% -> last line (index 9)
    state = sendKeys(state, '100%');
    expect(state.cursor).toEqual({ line: 9, col: 2 });

    // > 100% rings bell and stays put
    state = sendKeys(state, '150%');
    expect(state.bell).toBe(true);
    expect(state.cursor).toEqual({ line: 9, col: 2 });
  });

  it('preserves bracket matching for % without count', () => {
    let state = createVimState(['foo(bar)'], { line: 0, col: 3 });
    state = handleKey(state, '%');
    expect(state.cursor).toEqual({ line: 0, col: 7 });
  });

  it('supports d[count]% linewise deletion and Visual [count]%', () => {
    let state = createVimState(lines, { line: 0, col: 0 });
    // d50% deletes lines 0..4 (5 lines), leaving lines 5..9
    state = sendKeys(state, 'd50%');
    expect(state.lines.length).toBe(5);
    expect(state.lines[0]).toBe('  line 6');

    // Visual 100% extends selection to last line (preserving col 2 from d50%)
    state = sendKeys(state, 'v100%');
    expect(state.mode).toBe('VISUAL');
    expect(state.cursor).toEqual({ line: 4, col: 2 });
  });
});

describe('[count]go byte offset jump', () => {
  it('jumps to 1-based UTF-8 byte offset across lines (including newlines)', () => {
    // Line 0: "abc" (bytes 1,2,3, '\n' is byte 4)
    // Line 1: "def" (bytes 5,6,7, '\n' is byte 8)
    let state = createVimState(['abc', 'def', 'ghi'], { line: 2, col: 2 });

    // go (no count) -> byte 1 -> { line: 0, col: 0 }
    state = sendKeys(state, 'go');
    expect(state.cursor).toEqual({ line: 0, col: 0 });

    // 5go -> 'd' on line 1 col 0
    state = sendKeys(state, '5go');
    expect(state.cursor).toEqual({ line: 1, col: 0 });

    // 6go -> 'e' on line 1 col 1
    state = sendKeys(state, '6go');
    expect(state.cursor).toEqual({ line: 1, col: 1 });
  });

  it('handles multi-byte UTF-8 characters and operator d[count]go', () => {
    // "한글" -> '한' = 3 bytes (1..3), '글' = 3 bytes (4..6)
    let state = createVimState(['한글abc'], { line: 0, col: 0 });
    state = sendKeys(state, '4go');
    expect(state.cursor).toEqual({ line: 0, col: 1 });

    // 7go -> 'a' (col 2)
    state = sendKeys(state, '7go');
    expect(state.cursor).toEqual({ line: 0, col: 2 });

    // d1go from col 2 deletes "한글" (exclusive)
    state = sendKeys(state, 'd1go');
    expect(state.lines[0]).toBe('abc');
  });
});

describe('Ctrl-w gf / gF / g] / ] window-tab file & tag jumps', () => {
  it('opens file under cursor in a new tab with Ctrl-w gf and jumps to line with Ctrl-w gF', () => {
    let state = createVimState(['see utils.ts:3 for details'], { line: 0, col: 5 }, {
      primaryFilename: 'main.ts',
      buffers: [
        { id: 1, name: 'main.ts', lines: ['see utils.ts:3 for details'], cursor: { line: 0, col: 5 } },
        { id: 2, name: 'utils.ts', lines: ['line 1', 'line 2', 'line 3 target', 'line 4'], cursor: { line: 0, col: 0 } },
      ],
    });

    // Ctrl-w gf opens utils.ts in a new tab at line 0
    const tabbed = sendKeys(state, ['Ctrl-w', 'g', 'f']);
    expect(tabbed.tabPages?.length).toBe(2);
    expect(tabbed.primaryFilename).toBe('utils.ts');
    expect(tabbed.cursor).toEqual({ line: 0, col: 0 });

    // Ctrl-w gF opens utils.ts in a new tab at line 3 (0-based 2)
    const tabbedLine = sendKeys(state, ['Ctrl-w', 'g', 'F']);
    expect(tabbedLine.tabPages?.length).toBe(2);
    expect(tabbedLine.primaryFilename).toBe('utils.ts');
    expect(tabbedLine.cursor).toEqual({ line: 2, col: 0 });
  });

  it('splits window and jumps to tag under cursor with Ctrl-w ] and Ctrl-w g]', () => {
    const baseState = createVimState(['call helperFn()'], { line: 0, col: 6 }, {
      primaryFilename: 'main.ts',
      buffers: [
        { id: 1, name: 'main.ts', lines: ['call helperFn()'], cursor: { line: 0, col: 6 } },
        { id: 2, name: 'lib.ts', lines: ['// lib', 'export function helperFn() {}'], cursor: { line: 0, col: 0 } },
      ],
    });

    const splitTag = sendKeys(baseState, ['Ctrl-w', ']']);
    expect(splitTag.splitDirection).toBe('horizontal');
    expect(splitTag.splitPanes?.length).toBe(2);
    expect(splitTag.primaryFilename).toBe('lib.ts');
    expect(splitTag.cursor.line).toBe(1);

    const splitTjump = sendKeys(baseState, ['Ctrl-w', 'g', ']']);
    expect(splitTjump.splitDirection).toBe('horizontal');
    expect(splitTjump.splitPanes?.length).toBe(2);
    expect(splitTjump.primaryFilename).toBe('lib.ts');
    expect(splitTjump.cursor.line).toBe(1);
  });
});

describe('zug / zuw and :spellundo', () => {
  it('undoes zg with zug and zw with zuw', () => {
    let state = createVimState(['customword hello'], { line: 0, col: 2 });
    state = runExCommand(state, 'set spell');

    // Add 'customword' as good with zg
    state = sendKeys(state, 'zg');
    expect(state.spellGoodWords).toContain('customword');

    // Undo good word with zug
    state = sendKeys(state, 'zug');
    expect(state.spellGoodWords).not.toContain('customword');

    // Move to 'hello' and mark wrong with zw
    state = { ...state, cursor: { line: 0, col: 12 } };
    state = sendKeys(state, 'zw');
    expect(state.spellWrongWords).toContain('hello');

    // Undo wrong word with zuw
    state = sendKeys(state, 'zuw');
    expect(state.spellWrongWords).not.toContain('hello');
  });

  it('supports :spellgood, :spellwrong, and :spellundo Ex commands', () => {
    let state = createVimState(['alpha beta'], { line: 0, col: 0 });
    state = runExCommand(state, 'spellgood foobar');
    expect(state.spellGoodWords).toContain('foobar');

    state = runExCommand(state, 'spellundo foobar');
    expect(state.spellGoodWords).not.toContain('foobar');

    state = runExCommand(state, 'spellwrong bazqux');
    expect(state.spellWrongWords).toContain('bazqux');

    state = runExCommand(state, 'speu bazqux');
    expect(state.spellWrongWords).not.toContain('bazqux');
  });
});
