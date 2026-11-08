import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';

function createInsertState(lines: string[], line = 0, col = 0): VimEditorState {
  return {
    lines,
    cursor: { line, col },
    mode: 'INSERT',
  };
}

describe('Insert Mode Control Keys (Ctrl+h, Ctrl+w, Ctrl+u, Ctrl+o, Ctrl+n/p)', () => {
  describe('Ctrl+h (Home-row Backspace)', () => {
    it('deletes the character before cursor just like Backspace', () => {
      let state = createInsertState(['const val = 123;'], 0, 9); // after 'val'
      state = handleKey(state, 'Ctrl-h');
      expect(state.lines[0]).toBe('const va = 123;');
      expect(state.cursor).toEqual({ line: 0, col: 8 });

      // Alt-h works identically
      state = handleKey(state, 'Alt-h');
      expect(state.lines[0]).toBe('const v = 123;');
      expect(state.cursor).toEqual({ line: 0, col: 7 });
    });

    it('merges with previous line when col is 0', () => {
      let state = createInsertState(['line 1', 'line 2'], 1, 0);
      state = handleKey(state, 'Ctrl-h');
      expect(state.lines).toEqual(['line 1line 2']);
      expect(state.cursor).toEqual({ line: 0, col: 6 });
    });
  });

  describe('Ctrl+w (Word Delete Backwards)', () => {
    it('deletes the word before the cursor', () => {
      let state = createInsertState(['const totalCount = 10;'], 0, 16); // after 'totalCount'
      state = handleKey(state, 'Ctrl-w');
      expect(state.lines[0]).toBe('const  = 10;');
      expect(state.cursor).toEqual({ line: 0, col: 6 });
    });

    it('deletes trailing whitespace and the word before it', () => {
      let state = createInsertState(['foo bar   baz'], 0, 10); // after 'bar   '
      state = handleKey(state, 'Ctrl-w');
      expect(state.lines[0]).toBe('foo baz');
      expect(state.cursor).toEqual({ line: 0, col: 4 });
    });

    it('merges with previous line when at col 0', () => {
      let state = createInsertState(['first', 'second'], 1, 0);
      state = handleKey(state, 'Ctrl-w');
      expect(state.lines).toEqual(['firstsecond']);
      expect(state.cursor).toEqual({ line: 0, col: 5 });
    });
  });

  describe('Ctrl+u (Delete to Beginning of Line)', () => {
    it('deletes everything on current line before the cursor', () => {
      let state = createInsertState(['function testFunction(a, b) {'], 0, 21); // after 'testFunction'
      state = handleKey(state, 'Ctrl-u');
      expect(state.lines[0]).toBe('(a, b) {');
      expect(state.cursor).toEqual({ line: 0, col: 0 });
    });

    it('clears whole line when cursor is at the end', () => {
      let state = createInsertState(['remove all of this line'], 0, 23);
      state = handleKey(state, 'Ctrl-u');
      expect(state.lines[0]).toBe('');
      expect(state.cursor).toEqual({ line: 0, col: 0 });
    });
  });

  describe('Ctrl+o (One-shot Normal Command)', () => {
    it('transitions to NORMAL mode with insertNormalSession and executes single command', () => {
      let state = createInsertState(['hello world'], 0, 0);
      // 1. Ctrl-o enters temporary normal mode
      state = handleKey(state, 'Ctrl-o');
      expect(state.mode).toBe('NORMAL');
      expect(state.insertNormalSession).toBe(true);

      // 2. Execute normal motion '$' (move to line end)
      state = handleKey(state, '$');
      // Automatically returns to INSERT mode at line end!
      expect(state.mode).toBe('INSERT');
      expect(state.insertNormalSession).toBeUndefined();
      expect(state.cursor).toEqual({ line: 0, col: 11 });

      // 3. Continue typing text in INSERT mode
      state = handleKey(state, '!');
      expect(state.lines[0]).toBe('hello world!');
    });

    it('supports multi-key normal commands like zz or 2w before returning to INSERT mode', () => {
      let state = createInsertState(['apple banana cherry date'], 0, 0);
      state = handleKey(state, 'Ctrl-o');
      expect(state.insertNormalSession).toBe(true);

      // Type '2' (count pending)
      state = handleKey(state, '2');
      expect(state.insertNormalSession).toBe(true);
      expect(state.pendingKeys).toBe('2');

      // Type 'w' (completes 2w)
      state = handleKey(state, 'w');
      expect(state.mode).toBe('INSERT');
      expect(state.insertNormalSession).toBeUndefined();
      expect(state.cursor).toEqual({ line: 0, col: 13 }); // 'cherry'
    });

    it('cancels insertNormalSession when Escape is pressed and stays in NORMAL mode', () => {
      let state = createInsertState(['text'], 0, 0);
      state = handleKey(state, 'Ctrl-o');
      expect(state.insertNormalSession).toBe(true);

      state = handleKey(state, 'Escape');
      expect(state.mode).toBe('NORMAL');
      expect(state.insertNormalSession).toBeUndefined();
    });
  });

  describe('Ctrl+n and Ctrl+p (Buffer Autocompletion)', () => {
    it('scans buffer and completes word with Ctrl+n and Ctrl+p', () => {
      let state: VimEditorState = {
        lines: [
          'const calculateTotalHospitalPrescriptionPrice = 12000;',
          'const calcTax = 100;',
          'const currentTotal = calc',
        ],
        cursor: { line: 2, col: 25 }, // end of 'calc'
        mode: 'INSERT',
      };

      // 1. Ctrl-n completes first candidate
      state = handleKey(state, 'Ctrl-n');
      expect(state.lines[2]).toBe(
        'const currentTotal = calculateTotalHospitalPrescriptionPrice'
      );
      expect(state.completionSession).toBeDefined();
      expect(state.completionSession?.selectedIndex).toBe(0);

      // 2. Next Ctrl-n cycles to 'calcTax'
      state = handleKey(state, 'Ctrl-n');
      expect(state.lines[2]).toBe('const currentTotal = calcTax');
      expect(state.completionSession?.selectedIndex).toBe(1);

      // 3. Ctrl-p cycles backwards to 'calculateTotalHospitalPrescriptionPrice'
      state = handleKey(state, 'Ctrl-p');
      expect(state.lines[2]).toBe(
        'const currentTotal = calculateTotalHospitalPrescriptionPrice'
      );
      expect(state.completionSession?.selectedIndex).toBe(0);

      // 4. Typing semicolon accepts and appends
      state = handleKey(state, ';');
      expect(state.lines[2]).toBe(
        'const currentTotal = calculateTotalHospitalPrescriptionPrice;'
      );
      expect(state.completionSession).toBeNull();
    });
  });
});
