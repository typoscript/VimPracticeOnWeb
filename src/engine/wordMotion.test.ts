import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';

function createState(lines: string[], line = 0, col = 0): VimEditorState {
  return {
    lines,
    cursor: { line, col },
    mode: 'NORMAL',
  };
}

describe('WORD Motions (W, B, E)', () => {
  it('W moves to the start of the next whitespace-delimited WORD', () => {
    let state = createState(['const user.name = "John";'], 0, 0);
    // At 'c' in 'const'
    state = handleKey(state, 'W');
    // Moves to 'u' in 'user.name' (col 6)
    expect(state.cursor).toEqual({ line: 0, col: 6 });

    // In 'w', it would stop at '.', but 'W' moves to '=' (col 16)
    state = handleKey(state, 'W');
    expect(state.cursor).toEqual({ line: 0, col: 16 });

    // Next W moves to '"John";' (col 18)
    state = handleKey(state, 'W');
    expect(state.cursor).toEqual({ line: 0, col: 18 });
  });

  it('B moves to the previous whitespace-delimited WORD', () => {
    let state = createState(['const user.name = "John";'], 0, 18);
    // At '"' in '"John";'
    state = handleKey(state, 'B');
    expect(state.cursor).toEqual({ line: 0, col: 16 }); // '='

    state = handleKey(state, 'B');
    expect(state.cursor).toEqual({ line: 0, col: 6 }); // 'user.name'

    state = handleKey(state, 'B');
    expect(state.cursor).toEqual({ line: 0, col: 0 }); // 'const'
  });

  it('E moves to the end of the current or next whitespace-delimited WORD', () => {
    let state = createState(['const user.name = "John";'], 0, 0);
    // From col 0, E moves to end of 'const' (col 4)
    state = handleKey(state, 'E');
    expect(state.cursor).toEqual({ line: 0, col: 4 });

    // Next E moves to end of 'user.name' (col 14)
    state = handleKey(state, 'E');
    expect(state.cursor).toEqual({ line: 0, col: 14 });
  });

  it('supports count prefixes like 2W', () => {
    let state = createState(['apple foo.bar.baz orange grape'], 0, 0);
    state = handleKey(state, '2');
    state = handleKey(state, 'W');
    // 1W -> foo.bar.baz (col 6), 2W -> orange (col 18)
    expect(state.cursor).toEqual({ line: 0, col: 18 });
  });

  it('dW deletes up to the next WORD', () => {
    let state = createState(['user.profile.getName(id) nextWord'], 0, 0);
    state = handleKey(state, 'd');
    state = handleKey(state, 'W');
    expect(state.lines[0]).toBe('nextWord');
  });

  it('cW deletes up to next WORD and enters INSERT mode', () => {
    let state = createState(['config.api.url = "localhost"'], 0, 0);
    state = handleKey(state, 'c');
    state = handleKey(state, 'W');
    expect(state.lines[0]).toBe(' = "localhost"');
    expect(state.mode).toBe('INSERT');
  });

  it('yW yanks up to next WORD', () => {
    let state = createState(['target.fn(arg) after'], 0, 0);
    state = handleKey(state, 'y');
    state = handleKey(state, 'W');
    expect(state.clipboard?.content).toBe('target.fn(arg) ');
  });
});
