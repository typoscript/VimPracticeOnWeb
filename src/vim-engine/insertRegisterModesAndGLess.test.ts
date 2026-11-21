import { describe, it, expect } from 'vitest';
import { createVimState, handleKey, runExCommand, sendKeys } from './index';

describe('Insert Ctrl-r Ctrl-o / Ctrl-r Ctrl-r / Ctrl-r Ctrl-p', () => {
  it('Ctrl-r Ctrl-o inserts register text literally without autoindent compounding', () => {
    let state = createVimState(['  '], { line: 0, col: 0 }, {
      registers: {
        a: { type: 'char', content: 'if (x) {\n  return 1;\n}' },
      },
    });
    state = runExCommand(state, 'set ai');

    // Normal Ctrl-r a with autoindent compounds line indent on subsequent lines
    const normalPaste = sendKeys(state, ['A', 'Ctrl-r', 'a', 'Escape']);
    expect(normalPaste.lines).toEqual(['  if (x) {', '    return 1;', '    }']);

    // Ctrl-r Ctrl-o a inserts literally without autoindent compounding
    const literalPaste = sendKeys(state, ['A', 'Ctrl-r', 'Ctrl-o', 'a', 'Escape']);
    expect(literalPaste.lines).toEqual(['  if (x) {', '  return 1;', '}']);

    // Ctrl-r Ctrl-r a also inserts literally
    const literalCtrlR = sendKeys(state, ['A', 'Ctrl-r', 'Ctrl-r', 'a', 'Escape']);
    expect(literalCtrlR.lines).toEqual(['  if (x) {', '  return 1;', '}']);
  });

  it('Ctrl-r Ctrl-p adjusts pasted lines to current line indentation', () => {
    const state = createVimState(['    '], { line: 0, col: 0 }, {
      registers: {
        a: { type: 'char', content: '  if (ok) {\n    run();\n  }' },
      },
    });

    const pasted = sendKeys(state, ['A', 'Ctrl-r', 'Ctrl-p', 'a', 'Escape']);
    expect(pasted.lines).toEqual([
      '    if (ok) {',
      '      run();',
      '    }',
    ]);
  });

  it('Ctrl-r Ctrl-p strips redundant leading spaces for single-line paste on indented line', () => {
    const state = createVimState(['    '], { line: 0, col: 0 }, {
      registers: {
        b: { type: 'char', content: '  const x = 1;' },
      },
    });

    const pasted = sendKeys(state, ['A', 'Ctrl-r', 'Ctrl-p', 'b', 'Escape']);
    expect(pasted.lines).toEqual(['    const x = 1;']);
  });

  it('cancels Ctrl-r Ctrl-o / Ctrl-p cleanly on Escape', () => {
    const state = createVimState(['hello'], { line: 0, col: 0 });
    const cancelled = sendKeys(state, ['i', 'Ctrl-r', 'Ctrl-p', 'Escape']);
    expect(cancelled.mode).toBe('INSERT');
    expect(cancelled.insertRegisterPending).toBeUndefined();
    expect(cancelled.insertRegisterMode).toBeUndefined();
  });
});

describe('Normal g< last Ex command output', () => {
  it('redisplays the last Ex command output even after commandMessage is cleared', () => {
    let state = createVimState(['hello world'], { line: 0, col: 0 });
    state = runExCommand(state, 'echo "Build succeeded: 42"');
    expect(state.commandMessage).toBe('Build succeeded: 42');
    expect(state.lastCommandOutput).toBe('Build succeeded: 42');

    // Clear commandMessage via another action (e.g. :noh or normal movement)
    state = { ...state, commandMessage: undefined };
    state = handleKey(state, 'l');
    expect(state.commandMessage).toBeUndefined();

    // g< brings back the last Ex command output
    state = sendKeys(state, 'g<');
    expect(state.commandMessage).toBe('Build succeeded: 42');
  });

  it('falls back to messageHistory or empty notice when no Ex command ran', () => {
    const emptyState = createVimState(['hello']);
    const afterEmpty = sendKeys(emptyState, 'g<');
    expect(afterEmpty.commandMessage).toBeTruthy();

    const withHist = createVimState(['hello'], { line: 0, col: 0 }, {
      messageHistory: ['older msg', 'latest msg'],
    });
    const afterHist = sendKeys(withHist, 'g<');
    expect(afterHist.commandMessage).toBe('latest msg');
  });
});
