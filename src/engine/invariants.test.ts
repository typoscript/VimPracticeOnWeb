import { describe, it, expect } from 'vitest';
import {
  assertValidVimState,
  withInvariantCheck,
  deepFreeze,
  VimInvariantViolationError,
} from './invariants';
import { VimEditorState } from '../types/vim';

function createMockState(overrides: Partial<VimEditorState> = {}): VimEditorState {
  return {
    lines: ['hello world', 'second line'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
    ...overrides,
  };
}

describe('Vim State Invariant Guard', () => {
  describe('assertValidVimState', () => {
    it('validates a correct state without errors', () => {
      const prev = createMockState();
      const next = createMockState({ cursor: { line: 1, col: 5 } });
      expect(() => assertValidVimState(prev, next, 'j')).not.toThrow();
    });

    it('throws when cursor row is negative', () => {
      const prev = createMockState();
      const next = createMockState({ cursor: { line: -1, col: 0 } });
      expect(() => assertValidVimState(prev, next, 'k')).toThrowError(
        VimInvariantViolationError
      );
      expect(() => assertValidVimState(prev, next, 'k')).toThrow(
        /ROW_OUT_OF_BOUNDS/
      );
    });

    it('throws when cursor row exceeds lines length', () => {
      const prev = createMockState();
      const next = createMockState({ cursor: { line: 2, col: 0 } });
      expect(() => assertValidVimState(prev, next, 'j')).toThrow(
        /ROW_OUT_OF_BOUNDS/
      );
    });

    it('throws when cursor col is negative', () => {
      const prev = createMockState();
      const next = createMockState({ cursor: { line: 0, col: -1 } });
      expect(() => assertValidVimState(prev, next, 'h')).toThrow(
        /COL_UNDERFLOW/
      );
    });

    it('throws when cursor col exceeds line length - 1 in NORMAL mode', () => {
      const prev = createMockState();
      // 'hello world' has length 11, max col is 10
      const next = createMockState({ cursor: { line: 0, col: 11 } });
      expect(() => assertValidVimState(prev, next, 'l')).toThrow(
        /COL_OVERFLOW/
      );
    });

    it('allows cursor col to equal line length in INSERT mode', () => {
      const prev = createMockState({ mode: 'INSERT' });
      const next = createMockState({ mode: 'INSERT', cursor: { line: 0, col: 11 } });
      expect(() => assertValidVimState(prev, next, 'a')).not.toThrow();
    });

    it('throws when cursor col exceeds line length in INSERT mode', () => {
      const prev = createMockState({ mode: 'INSERT' });
      const next = createMockState({ mode: 'INSERT', cursor: { line: 0, col: 12 } });
      expect(() => assertValidVimState(prev, next, 'a')).toThrow(
        /COL_OVERFLOW/
      );
    });

    it('requires col === 0 on empty lines in NORMAL mode', () => {
      const prev = createMockState({ lines: [''] });
      const validNext = createMockState({ lines: [''], cursor: { line: 0, col: 0 } });
      expect(() => assertValidVimState(prev, validNext, 'l')).not.toThrow();

      const invalidNext = createMockState({ lines: [''], cursor: { line: 0, col: 1 } });
      expect(() => assertValidVimState(prev, invalidNext, 'l')).toThrow(
        /COL_OVERFLOW/
      );
    });

    it('throws when lines array is empty', () => {
      const prev = createMockState();
      const next = createMockState({ lines: [] });
      expect(() => assertValidVimState(prev, next)).toThrow(
        /EMPTY_BUFFER_ARRAY/
      );
    });

    it('throws when undo result buffer does not match snapshot', () => {
      const prev = createMockState({
        lines: ['modified text'],
        undoStack: [
          {
            lines: ['original text'],
            cursor: { line: 0, col: 0 },
          },
        ],
      });
      // nextState lines does not match original text
      const next = createMockState({
        lines: ['wrong text'],
        undoStack: [],
      });

      expect(() => assertValidVimState(prev, next, 'u')).toThrow(
        /UNDO_BUFFER_MISMATCH/
      );
    });

    it('passes when undo result matches snapshot exactly', () => {
      const prev = createMockState({
        lines: ['modified text'],
        undoStack: [
          {
            lines: ['original text'],
            cursor: { line: 0, col: 0 },
          },
        ],
      });
      const next = createMockState({
        lines: ['original text'],
        cursor: { line: 0, col: 0 },
        undoStack: [],
      });

      expect(() => assertValidVimState(prev, next, 'u')).not.toThrow();
    });

    it('validates splitPanes when present', () => {
      const prev = createMockState();
      const next = createMockState({
        splitPanes: [
          {
            filename: 'left.ts',
            lines: ['pane 1 line'],
            cursor: { line: 0, col: 0 },
            mode: 'NORMAL',
          },
          {
            filename: 'right.ts',
            lines: ['pane 2 line'],
            cursor: { line: 5, col: 0 }, // Out of bounds row!
            mode: 'NORMAL',
          },
        ],
      });

      expect(() => assertValidVimState(prev, next, 'l')).toThrow(
        /ROW_OUT_OF_BOUNDS.*Split pane \[1\]/
      );
    });
  });

  describe('deepFreeze & Immutability Guard', () => {
    it('freezes objects preventing accidental mutation', () => {
      const state = createMockState();
      deepFreeze(state);

      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(state.cursor)).toBe(true);
      expect(Object.isFrozen(state.lines)).toBe(true);

      expect(() => {
        (state.cursor as any).line = 99;
      }).toThrow();

      expect(() => {
        state.lines.push('mutated');
      }).toThrow();
    });
  });

  describe('withInvariantCheck middleware', () => {
    it('intercepts mutating state transition and enforces purity', () => {
      const badEngine = (state: VimEditorState, _key: string): VimEditorState => {
        // Direct in-place mutation error!
        (state.cursor as any).line = 1;
        return state;
      };

      const guardedEngine = withInvariantCheck(badEngine, { deepFreeze: true });
      const initial = createMockState();

      expect(() => guardedEngine(initial, 'j')).toThrow();
    });

    it('passes through valid pure transitions smoothly', () => {
      const goodEngine = (state: VimEditorState, key: string): VimEditorState => {
        if (key === 'j') {
          return {
            ...state,
            cursor: { line: 1, col: state.cursor.col },
          };
        }
        return state;
      };

      const guarded = withInvariantCheck(goodEngine);
      const initial = createMockState();
      const result = guarded(initial, 'j');

      expect(result.cursor.line).toBe(1);
    });

    it('catches out of bounds produced by buggy engine logic', () => {
      const buggyEngine = (state: VimEditorState, _key: string): VimEditorState => {
        return {
          ...state,
          cursor: { line: 0, col: 999 }, // Col overflow!
        };
      };

      const guarded = withInvariantCheck(buggyEngine);
      const initial = createMockState();

      expect(() => guarded(initial, 'l')).toThrow(VimInvariantViolationError);
    });

    it('validates folds invariant and throws when fold range is invalid', () => {
      const prev = createMockState();
      // Valid fold
      const nextValid = createMockState({
        folds: [{ startRow: 0, endRow: 1, closed: true }],
      });
      expect(() => assertValidVimState(prev, nextValid)).not.toThrow();

      // Invalid fold: endRow >= lines.length
      const nextInvalid = createMockState({
        folds: [{ startRow: 0, endRow: 99, closed: true }],
      });
      expect(() => assertValidVimState(prev, nextInvalid)).toThrow(/INVALID_FOLD_RANGE/);
    });
  });
});
