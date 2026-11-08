import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';

function createInitialState(overrides: Partial<VimEditorState> = {}): VimEditorState {
  return {
    lines: ['hello world', 'second line'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
    registers: {},
    primaryFilename: 'test.ts',
    ...overrides,
  };
}

function runKeys(initial: VimEditorState, keys: string[]): VimEditorState {
  let state = initial;
  for (const k of keys) {
    state = handleKey(state, k);
  }
  return state;
}

describe('Ctrl+r {reg} and Expression Register Ctrl+r =', () => {
  describe('INSERT mode Ctrl+r {reg}', () => {
    it('sets insertRegisterPending on Ctrl-r in INSERT mode', () => {
      let state = createInitialState();
      state = handleKey(state, 'i');
      expect(state.mode).toBe('INSERT');
      expect(state.insertRegisterPending).toBeFalsy();

      state = handleKey(state, 'Ctrl-r');
      expect(state.mode).toBe('INSERT');
      expect(state.insertRegisterPending).toBe(true);
    });

    it('pastes register "0 (yanked word) seamlessly in INSERT mode', () => {
      let state = createInitialState({
        lines: ['apple banana', 'const target = '],
        cursor: { line: 0, col: 0 },
      });

      // yiw to yank 'apple'
      state = runKeys(state, ['y', 'i', 'w']);
      expect(state.registers?.['0']?.content).toBe('apple');

      // Move to line 1, enter INSERT mode at end of line, Ctrl-r 0
      state = runKeys(state, ['j', 'A', 'Ctrl-r', '0', ';', 'Escape']);
      expect(state.mode).toBe('NORMAL');
      expect(state.insertRegisterPending).toBeFalsy();
      expect(state.lines[1]).toBe('const target = apple;');
    });

    it('pastes named register "a in INSERT mode', () => {
      let state = createInitialState({
        lines: ['foo bar baz'],
        registers: {
          a: { content: 'QUX ', type: 'char' },
        },
      });

      // Enter INSERT mode at col 4 and insert register a
      state = runKeys(state, ['w', 'i', 'Ctrl-r', 'a']);
      expect(state.lines[0]).toBe('foo QUX bar baz');
      expect(state.cursor).toEqual({ line: 0, col: 8 });
    });

    it('inserts filename with % register and last search with / register', () => {
      let state = createInitialState({
        lines: ['test line'],
        primaryFilename: 'main.component.ts',
        lastSearchQuery: 'findMe',
      });

      // Insert filename
      state = runKeys(state, ['A', ' ', 'Ctrl-r', '%']);
      expect(state.lines[0]).toBe('test line main.component.ts');

      // Insert search query
      state = runKeys(state, [' ', 'Ctrl-r', '/']);
      expect(state.lines[0]).toBe('test line main.component.ts findMe');
    });

    it('cancels insertRegisterPending when Escape is pressed', () => {
      let state = createInitialState();
      state = runKeys(state, ['i', 'a', 'b', 'Ctrl-r', 'Escape']);
      expect(state.insertRegisterPending).toBeFalsy();
      expect(state.lines[0]).toBe('abhello world');
      expect(state.mode).toBe('INSERT');
    });
  });

  describe('INSERT mode Ctrl+r = (Expression Calculator)', () => {
    it('opens expression prompt on Ctrl-r = and evaluates arithmetic expression', () => {
      let state = createInitialState({
        lines: ['const BUFFER_SIZE = '],
        cursor: { line: 0, col: 0 },
      });

      // In INSERT mode at line end, press Ctrl-r then =
      state = runKeys(state, ['A', 'Ctrl-r', '=']);
      expect(state.mode).toBe('COMMAND');
      expect(state.commandType).toBe('=');
      expect(state.commandBuffer).toBe('');
      expect(state.expressionReturnContext).toBeDefined();
      expect(state.expressionReturnContext?.mode).toBe('INSERT');

      // Type 1024 * 64 and press Enter
      state = runKeys(state, ['1', '0', '2', '4', ' ', '*', ' ', '6', '4', 'Enter', ';']);
      expect(state.mode).toBe('INSERT');
      expect(state.lines[0]).toBe('const BUFFER_SIZE = 65536;');
      expect(state.registers?.['=']?.content).toBe('65536');
    });

    it('evaluates chained arithmetic: 24 * 60 * 60', () => {
      let state = createInitialState({
        lines: ['seconds_in_day: '],
        cursor: { line: 0, col: 0 },
      });

      state = runKeys(state, [
        'A',
        'Ctrl-r', '=', '2', '4', '*', '6', '0', '*', '6', '0', 'Enter',
        ';', 'Escape'
      ]);
      expect(state.lines[0]).toBe('seconds_in_day: 86400;');
    });

    it('evaluates hex literals and len() function', () => {
      let state = createInitialState({
        lines: ['val1 = , val2 = '],
        cursor: { line: 0, col: 0 },
      });

      // 0xff -> 255
      state = runKeys(state, [
        'f', '=', 'l', 'a', 'Ctrl-r', '=', '0', 'x', 'f', 'f', 'Enter', 'Escape'
      ]);
      expect(state.lines[0]).toContain('val1 = 255');

      // len("hello") -> 5
      state = runKeys(state, [
        '$', 'a', 'Ctrl-r', '=', 'l', 'e', 'n', '(', '"', 'h', 'e', 'l', 'l', 'o', '"', ')', 'Enter'
      ]);
      expect(state.lines[0]).toBe('val1 = 255, val2 = 5');
    });

    it('cancels expression prompt on Escape and returns to INSERT mode without changes', () => {
      let state = createInitialState({
        lines: ['editing text here'],
      });

      state = runKeys(state, ['A', 'Ctrl-r', '=', '1', '2', '3', 'Escape']);
      expect(state.mode).toBe('INSERT');
      expect(state.lines[0]).toBe('editing text here');
    });

    it('handles malformed expressions gracefully without crashing', () => {
      let state = createInitialState({
        lines: ['calc = '],
      });

      state = runKeys(state, ['A', 'Ctrl-r', '=', '1', '0', '+', '*', '2', 'Enter']);
      expect(state.mode).toBe('INSERT');
      expect(state.lines[0]).toBe('calc = ');
      expect(state.commandMessage).toContain('E15: 올바르지 않은');
    });
  });

  describe('COMMAND mode (:) Ctrl+r {reg} and Ctrl+r =', () => {
    it('pastes register into command buffer with Ctrl-r {reg}', () => {
      let state = createInitialState({
        lines: ['function searchTarget() {}'],
        registers: {
          '0': { content: 'searchTarget', type: 'char' },
        },
      });

      // Open command line and construct :%s/<Ctrl-r>0/newFunc/g
      state = runKeys(state, [
        ':', '%', 's', '/', 'Ctrl-r', '0', '/', 'n', 'e', 'w', 'F', 'u', 'n', 'c', '/', 'g'
      ]);
      expect(state.commandBuffer).toBe('%s/searchTarget/newFunc/g');

      // Execute command
      state = handleKey(state, 'Enter');
      expect(state.lines[0]).toBe('function newFunc() {}');
    });

    it('evaluates expression into command buffer with Ctrl-r =', () => {
      let state = createInitialState({
        lines: ['line 1', 'line 2'],
      });

      // Enter command mode: :echo <Ctrl-r>= 10 + 20 <Enter>
      state = runKeys(state, [
        ':', 'e', 'c', 'h', 'o', ' ', 'Ctrl-r', '=', '1', '0', '+', '2', '0', 'Enter'
      ]);
      expect(state.mode).toBe('COMMAND');
      expect(state.commandType).toBe(':');
      expect(state.commandBuffer).toBe('echo 30');
    });
  });

  describe('Dot Repeat with Ctrl+r {reg}', () => {
    it('replays insertion with Ctrl+r on dot repeat', () => {
      let state = createInitialState({
        lines: ['foo', 'bar', 'baz'],
        registers: {
          '0': { content: 'ITEM_', type: 'char' },
        },
      });

      // Insert ITEM_ at beginning of line 0
      state = runKeys(state, ['I', 'Ctrl-r', '0', 'Escape']);
      expect(state.lines[0]).toBe('ITEM_foo');

      // Move to line 1 and repeat with '.'
      state = runKeys(state, ['j', '^', '.']);
      expect(state.lines[1]).toBe('ITEM_bar');

      // Move to line 2 and repeat with '.'
      state = runKeys(state, ['j', '^', '.']);
      expect(state.lines[2]).toBe('ITEM_baz');
    });
  });
});
