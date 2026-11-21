import { describe, it, expect } from 'vitest';
import { createVimState, handleKey, runExCommand, sendKeys } from './index';

const NESTED_CODE = [
  'function outer() {',
  '  if (true) {',
  '    const x = 1;',
  '  }',
  '  return 0;',
  '}',
];

describe('Advanced Folding (zm, zr, zv, zx, zX, zO, zC, zA, zi, foldenable)', () => {
  it('adjusts foldlevel stepwise with zR, zm, zr, and zM', () => {
    let state = createVimState(NESTED_CODE, { line: 0, col: 0 });
    state = runExCommand(state, 'set fdm=indent sw=2');

    // zR opens all folds and sets foldlevel to max nesting depth (2)
    state = sendKeys(state, 'zR');
    expect(state.options?.foldlevel).toBeGreaterThanOrEqual(2);

    // zm lowers foldlevel by 1 -> closes inner fold, keeps outer open
    state = sendKeys(state, 'zm');
    const levelAfterFirstZm = state.options?.foldlevel ?? 0;
    const innerClosed = state.folds?.some((f) => f.startRow === 2 && f.closed);
    const outerClosed = state.folds?.some((f) => f.startRow === 1 && f.closed);
    expect(innerClosed).toBe(true);
    expect(outerClosed).toBe(false);

    // Another zm lowers foldlevel to 0 -> closes outer fold too
    state = sendKeys(state, 'zm');
    expect(state.options?.foldlevel).toBe(Math.max(0, levelAfterFirstZm - 1));
    expect(state.folds?.every((f) => f.closed)).toBe(true);

    // zr increases foldlevel by 1 -> opens outer fold while inner stays closed
    state = sendKeys(state, 'zr');
    expect(state.folds?.some((f) => f.startRow === 1 && !f.closed)).toBe(true);
    expect(state.folds?.some((f) => f.startRow === 2 && f.closed)).toBe(true);
  });

  it('zv opens folds containing cursor line and zx/zX reapplies foldlevel', () => {
    let state = createVimState(NESTED_CODE, { line: 2, col: 0 }, {
      folds: [
        { startRow: 1, endRow: 4, closed: true },
        { startRow: 2, endRow: 2, closed: true },
      ],
    });
    state = runExCommand(state, 'set fdm=indent fdl=0');

    // zv opens all folds containing cursor line 2
    state = sendKeys(state, 'zv');
    expect(state.folds?.every((f) => !f.closed)).toBe(true);

    // zX reapplies fdl=0 closing all folds (moves cursor to outer startRow)
    state = sendKeys(state, 'zX');
    expect(state.folds?.every((f) => f.closed)).toBe(true);

    // Move to line 2 and run zx: reapplies fdl=0 but keeps cursor line folds open
    state = { ...state, cursor: { line: 2, col: 0 } };
    state = sendKeys(state, 'zx');
    expect(state.folds?.filter((f) => f.startRow <= 2 && f.endRow >= 2).every((f) => !f.closed)).toBe(true);
  });

  it('zC / zO / zA recursively close, open, and toggle nested folds', () => {
    let state = createVimState(NESTED_CODE, { line: 2, col: 0 });
    state = runExCommand(state, 'set fdm=indent sw=2');

    // zC closes both inner and outer folds containing line 2
    state = sendKeys(state, 'zC');
    expect(state.folds?.some((f) => f.startRow === 1 && f.closed)).toBe(true);
    expect(state.folds?.some((f) => f.startRow === 2 && f.closed)).toBe(true);
    expect(state.cursor.line).toBe(1);

    // zO recursively opens all folds inside outermost
    state = sendKeys(state, 'zO');
    expect(state.folds?.every((f) => !f.closed)).toBe(true);

    // zA toggles all closed again
    state = sendKeys(state, 'zA');
    expect(state.folds?.every((f) => f.closed)).toBe(true);
  });

  it('zi toggles foldenable (fen/nofen) so j/k stops skipping closed folds when disabled', () => {
    let state = createVimState(NESTED_CODE, { line: 0, col: 0 }, {
      folds: [{ startRow: 1, endRow: 4, closed: true }],
    });

    // With foldenable=true (default), j from line 1 skips lines 2..4 to line 5
    state = handleKey(state, 'j');
    expect(state.cursor.line).toBe(1);
    state = handleKey(state, 'j');
    expect(state.cursor.line).toBe(5);

    // Toggle foldenable off with zi
    state = sendKeys(state, 'zi');
    expect(state.options?.foldenable).toBe(false);
    expect(state.commandMessage).toBe('nofoldenable');

    // Now moving to line 1 and pressing j visits line 2 instead of skipping!
    state = { ...state, cursor: { line: 1, col: 0 } };
    state = handleKey(state, 'j');
    expect(state.cursor.line).toBe(2);

    // Toggle back on with zi
    state = sendKeys(state, 'zi');
    expect(state.options?.foldenable).toBe(true);
    expect(state.commandMessage).toBe('foldenable');
  });
});
