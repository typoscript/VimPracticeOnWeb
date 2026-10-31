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

describe('Vim Engine - NORMAL Mode Motions', () => {
  describe('h key (Move Left)', () => {
    it('moves cursor left by 1 column', () => {
      const state = createState(['hello'], 0, 3);
      const next = handleKey(state, 'h');
      expect(next.cursor).toEqual({ line: 0, col: 2 });
    });

    it('clamps at column 0 and does not go below 0', () => {
      const state = createState(['hello'], 0, 0);
      const next = handleKey(state, 'h');
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });

    it('handles empty line safely', () => {
      const state = createState([''], 0, 0);
      const next = handleKey(state, 'h');
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });
  });

  describe('l key (Move Right)', () => {
    it('moves cursor right by 1 column', () => {
      const state = createState(['hello'], 0, 1);
      const next = handleKey(state, 'l');
      expect(next.cursor).toEqual({ line: 0, col: 2 });
    });

    it('clamps at line end and does not exceed last character', () => {
      const state = createState(['hello'], 0, 4);
      const next = handleKey(state, 'l');
      expect(next.cursor).toEqual({ line: 0, col: 4 });
    });

    it('handles empty line safely', () => {
      const state = createState([''], 0, 0);
      const next = handleKey(state, 'l');
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });
  });

  describe('j key (Move Down)', () => {
    it('moves down 1 line', () => {
      const state = createState(['hello', 'world'], 0, 2);
      const next = handleKey(state, 'j');
      expect(next.cursor).toEqual({ line: 1, col: 2 });
    });

    it('clamps column when target line is shorter', () => {
      const state = createState(['longer line here', 'hi'], 0, 10);
      const next = handleKey(state, 'j');
      // 'hi' length is 2, maxCol is 1
      expect(next.cursor).toEqual({ line: 1, col: 1 });
    });

    it('clamps to col 0 when target line is empty', () => {
      const state = createState(['hello', '', 'world'], 0, 3);
      const next = handleKey(state, 'j');
      expect(next.cursor).toEqual({ line: 1, col: 0 });
    });

    it('clamps at end of file (last line)', () => {
      const state = createState(['line 1', 'line 2'], 1, 2);
      const next = handleKey(state, 'j');
      expect(next.cursor).toEqual({ line: 1, col: 2 });
    });
  });

  describe('k key (Move Up)', () => {
    it('moves up 1 line', () => {
      const state = createState(['first', 'second'], 1, 3);
      const next = handleKey(state, 'k');
      expect(next.cursor).toEqual({ line: 0, col: 3 });
    });

    it('clamps column when target line is shorter', () => {
      const state = createState(['hi', 'longer line'], 1, 8);
      const next = handleKey(state, 'k');
      expect(next.cursor).toEqual({ line: 0, col: 1 });
    });

    it('clamps to col 0 when moving up into empty line', () => {
      const state = createState(['', 'line 2'], 1, 4);
      const next = handleKey(state, 'k');
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });

    it('clamps at beginning of file (first line)', () => {
      const state = createState(['line 1', 'line 2'], 0, 2);
      const next = handleKey(state, 'k');
      expect(next.cursor).toEqual({ line: 0, col: 2 });
    });
  });

  describe('0 key (Line Start)', () => {
    it('moves to column 0 of current line', () => {
      const state = createState(['  hello world'], 0, 8);
      const next = handleKey(state, '0');
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });

    it('handles empty line safely', () => {
      const state = createState([''], 0, 0);
      const next = handleKey(state, '0');
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });
  });

  describe('$ key (Line End)', () => {
    it('moves to the last character column of current line', () => {
      const state = createState(['hello'], 0, 1);
      const next = handleKey(state, '$');
      expect(next.cursor).toEqual({ line: 0, col: 4 });
    });

    it('stays at 0 for an empty line', () => {
      const state = createState([''], 0, 0);
      const next = handleKey(state, '$');
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });
  });

  describe('^ key (First Non-Blank Character)', () => {
    it('moves to the first non-whitespace character in indented line', () => {
      const state = createState(['    const x = 10;'], 0, 0);
      const next = handleKey(state, '^');
      expect(next.cursor).toEqual({ line: 0, col: 4 });
    });

    it('moves to column 0 if line has no leading whitespace', () => {
      const state = createState(['hello'], 0, 3);
      const next = handleKey(state, '^');
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });

    it('returns 0 for whitespace-only line and empty line', () => {
      const state1 = createState(['     '], 0, 2);
      expect(handleKey(state1, '^').cursor).toEqual({ line: 0, col: 0 });

      const state2 = createState([''], 0, 0);
      expect(handleKey(state2, '^').cursor).toEqual({ line: 0, col: 0 });
    });
  });

  describe('gg and G keys (File Boundaries)', () => {
    it('sets pendingKeys when first g is pressed', () => {
      const state = createState(['line 1', 'line 2', 'line 3'], 2, 2);
      const next = handleKey(state, 'g');
      expect(next.pendingKeys).toBe('g');
      expect(next.cursor).toEqual({ line: 2, col: 2 });
    });

    it('moves to line 0 on second g (gg)', () => {
      let state = createState(['first line', 'second line', 'third line'], 2, 3);
      state = handleKey(state, 'g');
      const next = handleKey(state, 'g');
      expect(next.cursor.line).toBe(0);
      expect(next.cursor.col).toBe(3);
      expect(next.pendingKeys).toBeUndefined();
    });

    it('clamps column when gg moves to a shorter first line', () => {
      let state = createState(['hi', 'a very long third line'], 1, 15);
      state = handleKey(state, 'g');
      const next = handleKey(state, 'g');
      expect(next.cursor).toEqual({ line: 0, col: 1 });
    });

    it('cancels pending g when a non-g key is pressed and handles that key', () => {
      let state = createState(['hello', 'world'], 0, 0);
      state = handleKey(state, 'g');
      const next = handleKey(state, 'l');
      expect(next.pendingKeys).toBeUndefined();
      expect(next.cursor).toEqual({ line: 0, col: 1 });
    });

    it('moves to the last line on G', () => {
      const state = createState(['line 1', 'line 2', 'line 3'], 0, 2);
      const next = handleKey(state, 'G');
      expect(next.cursor.line).toBe(2);
      expect(next.cursor.col).toBe(2);
    });

    it('handles G when last line is empty', () => {
      const state = createState(['line 1', ''], 0, 3);
      const next = handleKey(state, 'G');
      expect(next.cursor).toEqual({ line: 1, col: 0 });
    });
  });

  describe('w key (Next Word Start)', () => {
    it('moves to the start of the next word within the same line', () => {
      const state = createState(['foo bar baz'], 0, 0);
      const next = handleKey(state, 'w');
      expect(next.cursor).toEqual({ line: 0, col: 4 }); // 'b' in bar
    });

    it('recognizes punctuation groups as separate words', () => {
      const state = createState(['foo.bar'], 0, 0);
      const next = handleKey(state, 'w');
      expect(next.cursor).toEqual({ line: 0, col: 3 }); // '.'
    });

    it('wraps to the next line when no more words in current line', () => {
      const state = createState(['hello', 'world'], 0, 2);
      const next = handleKey(state, 'w');
      expect(next.cursor).toEqual({ line: 1, col: 0 }); // 'w' in world
    });

    it('stops at empty line during downward traversal', () => {
      const state = createState(['hello', '', 'world'], 0, 2);
      const next = handleKey(state, 'w');
      expect(next.cursor).toEqual({ line: 1, col: 0 }); // empty line
    });

    it('stops at end of file when no words left', () => {
      const state = createState(['hello world'], 0, 6);
      const next = handleKey(state, 'w');
      expect(next.cursor).toEqual({ line: 0, col: 10 }); // 'd' in world
    });
  });

  describe('b key (Previous Word Start)', () => {
    it('moves to the start of the current word if inside a word', () => {
      const state = createState(['foo bar baz'], 0, 6); // 'r' in bar
      const next = handleKey(state, 'b');
      expect(next.cursor).toEqual({ line: 0, col: 4 }); // 'b' in bar
    });

    it('moves to the previous word if already at word start', () => {
      const state = createState(['foo bar baz'], 0, 4); // 'b' in bar
      const next = handleKey(state, 'b');
      expect(next.cursor).toEqual({ line: 0, col: 0 }); // 'f' in foo
    });

    it('moves to the previous line when at beginning of line', () => {
      const state = createState(['first line', 'second'], 1, 0);
      const next = handleKey(state, 'b');
      expect(next.cursor).toEqual({ line: 0, col: 6 }); // 'l' in line
    });

    it('stops at empty line during upward traversal', () => {
      const state = createState(['first', '', 'third'], 2, 0);
      const next = handleKey(state, 'b');
      expect(next.cursor).toEqual({ line: 1, col: 0 }); // empty line
    });

    it('stops at (0, 0) at beginning of file', () => {
      const state = createState(['hello'], 0, 0);
      const next = handleKey(state, 'b');
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });
  });

  describe('e key (Word End)', () => {
    it('moves to the end of the current word', () => {
      const state = createState(['hello world'], 0, 0); // 'h'
      const next = handleKey(state, 'e');
      expect(next.cursor).toEqual({ line: 0, col: 4 }); // 'o' in hello
    });

    it('moves to the end of the next word if already at word end', () => {
      const state = createState(['hello world'], 0, 4); // 'o'
      const next = handleKey(state, 'e');
      expect(next.cursor).toEqual({ line: 0, col: 10 }); // 'd' in world
    });

    it('wraps to next line to find the end of the next word', () => {
      const state = createState(['first', 'second'], 0, 4);
      const next = handleKey(state, 'e');
      expect(next.cursor).toEqual({ line: 1, col: 5 }); // 'd' in second
    });

    it('handles punctuation correctly', () => {
      const state = createState(['alpha...beta'], 0, 0);
      const next = handleKey(state, 'e');
      expect(next.cursor).toEqual({ line: 0, col: 4 }); // 'a' in alpha
      const nextPunct = handleKey(next, 'e');
      expect(nextPunct.cursor).toEqual({ line: 0, col: 7 }); // last '.'
    });

    it('stops at last char at end of file', () => {
      const state = createState(['hello'], 0, 4);
      const next = handleKey(state, 'e');
      expect(next.cursor).toEqual({ line: 0, col: 4 });
    });
  });
});

describe('Vim Engine - INSERT Mode & Basic Editing (i, a, Esc, x, typing, Backspace, Enter)', () => {
  describe('i key (Insert before cursor)', () => {
    it('switches mode to INSERT and preserves cursor position', () => {
      const state = createState(['hello world'], 0, 2);
      const next = handleKey(state, 'i');
      expect(next.mode).toBe('INSERT');
      expect(next.cursor).toEqual({ line: 0, col: 2 });
    });

    it('clears pendingKeys when entering INSERT mode', () => {
      const state = { ...createState(['hello'], 0, 1), pendingKeys: 'g' };
      const next = handleKey(state, 'i');
      expect(next.mode).toBe('INSERT');
      expect(next.pendingKeys).toBeUndefined();
    });
  });

  describe('a key (Append after cursor)', () => {
    it('switches mode to INSERT and advances col by 1', () => {
      const state = createState(['hello'], 0, 1);
      const next = handleKey(state, 'a');
      expect(next.mode).toBe('INSERT');
      expect(next.cursor).toEqual({ line: 0, col: 2 });
    });

    it('allows advancing to the end of the line (col = line.length)', () => {
      const state = createState(['hello'], 0, 4); // 'o'
      const next = handleKey(state, 'a');
      expect(next.mode).toBe('INSERT');
      expect(next.cursor).toEqual({ line: 0, col: 5 });
    });

    it('keeps col at 0 on an empty line', () => {
      const state = createState([''], 0, 0);
      const next = handleKey(state, 'a');
      expect(next.mode).toBe('INSERT');
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });
  });

  describe('x key (Delete char under cursor in NORMAL mode)', () => {
    it('deletes character at cursor position', () => {
      const state = createState(['abcdef'], 0, 2); // 'c'
      const next = handleKey(state, 'x');
      expect(next.lines).toEqual(['abdef']);
      expect(next.cursor).toEqual({ line: 0, col: 2 }); // now on 'd'
    });

    it('clamps cursor to new line end when deleting last character', () => {
      const state = createState(['abc'], 0, 2); // 'c'
      const next = handleKey(state, 'x');
      expect(next.lines).toEqual(['ab']);
      expect(next.cursor).toEqual({ line: 0, col: 1 }); // 'b'
    });

    it('safely handles line becoming completely empty', () => {
      const state = createState(['a'], 0, 0);
      const next = handleKey(state, 'x');
      expect(next.lines).toEqual(['']);
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });

    it('does nothing when x is pressed on an empty line', () => {
      const state = createState([''], 0, 0);
      const next = handleKey(state, 'x');
      expect(next.lines).toEqual(['']);
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });
  });

  describe('Escape key in INSERT mode', () => {
    it('switches back to NORMAL mode and steps cursor 1 col left', () => {
      const insertState: VimEditorState = {
        lines: ['hello'],
        cursor: { line: 0, col: 3 },
        mode: 'INSERT',
      };
      const next = handleKey(insertState, 'Escape');
      expect(next.mode).toBe('NORMAL');
      expect(next.cursor).toEqual({ line: 0, col: 2 });
    });

    it('clamps to col 0 if cursor was at col 0', () => {
      const insertState: VimEditorState = {
        lines: ['hello'],
        cursor: { line: 0, col: 0 },
        mode: 'INSERT',
      };
      const next = handleKey(insertState, 'Escape');
      expect(next.mode).toBe('NORMAL');
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });

    it('clamps from line.length back into maxCol (length - 1)', () => {
      const insertState: VimEditorState = {
        lines: ['hello'],
        cursor: { line: 0, col: 5 },
        mode: 'INSERT',
      };
      const next = handleKey(insertState, 'Escape');
      expect(next.mode).toBe('NORMAL');
      expect(next.cursor).toEqual({ line: 0, col: 4 }); // 'o'
    });
  });

  describe('Character typing in INSERT mode', () => {
    it('inserts characters at cursor and advances cursor', () => {
      let state: VimEditorState = {
        lines: ['hd'],
        cursor: { line: 0, col: 1 },
        mode: 'INSERT',
      };
      state = handleKey(state, 'e');
      state = handleKey(state, 'l');
      state = handleKey(state, 'l');
      state = handleKey(state, 'o');
      expect(state.lines).toEqual(['hellod']);
      expect(state.cursor).toEqual({ line: 0, col: 5 });
    });

    it('inserts spaces correctly', () => {
      const insertState: VimEditorState = {
        lines: ['helloworld'],
        cursor: { line: 0, col: 5 },
        mode: 'INSERT',
      };
      const next = handleKey(insertState, ' ');
      expect(next.lines).toEqual(['hello world']);
      expect(next.cursor).toEqual({ line: 0, col: 6 });
    });

    it('inserts into an empty line', () => {
      const insertState: VimEditorState = {
        lines: [''],
        cursor: { line: 0, col: 0 },
        mode: 'INSERT',
      };
      const next = handleKey(insertState, 'A');
      expect(next.lines).toEqual(['A']);
      expect(next.cursor).toEqual({ line: 0, col: 1 });
    });

    it('inserts 2 spaces on Tab', () => {
      const insertState: VimEditorState = {
        lines: ['func()'],
        cursor: { line: 0, col: 0 },
        mode: 'INSERT',
      };
      const next = handleKey(insertState, 'Tab');
      expect(next.lines).toEqual(['  func()']);
      expect(next.cursor).toEqual({ line: 0, col: 2 });
    });
  });

  describe('Backspace in INSERT mode', () => {
    it('deletes character to the left when col > 0', () => {
      const insertState: VimEditorState = {
        lines: ['hello'],
        cursor: { line: 0, col: 3 }, // after 'l'
        mode: 'INSERT',
      };
      const next = handleKey(insertState, 'Backspace');
      expect(next.lines).toEqual(['helo']);
      expect(next.cursor).toEqual({ line: 0, col: 2 });
    });

    it('merges with previous line when col === 0 and line > 0', () => {
      const insertState: VimEditorState = {
        lines: ['line 1', 'line 2'],
        cursor: { line: 1, col: 0 },
        mode: 'INSERT',
      };
      const next = handleKey(insertState, 'Backspace');
      expect(next.lines).toEqual(['line 1line 2']);
      expect(next.cursor).toEqual({ line: 0, col: 6 }); // length of 'line 1'
    });

    it('does nothing when col === 0 and line === 0', () => {
      const insertState: VimEditorState = {
        lines: ['hello'],
        cursor: { line: 0, col: 0 },
        mode: 'INSERT',
      };
      const next = handleKey(insertState, 'Backspace');
      expect(next.lines).toEqual(['hello']);
      expect(next.cursor).toEqual({ line: 0, col: 0 });
    });
  });

  describe('Enter key in INSERT mode', () => {
    it('splits line in the middle', () => {
      const insertState: VimEditorState = {
        lines: ['firstsecond'],
        cursor: { line: 0, col: 5 }, // between 'first' and 'second'
        mode: 'INSERT',
      };
      const next = handleKey(insertState, 'Enter');
      expect(next.lines).toEqual(['first', 'second']);
      expect(next.cursor).toEqual({ line: 1, col: 0 });
    });

    it('creates an empty line when pressed at beginning of line', () => {
      const insertState: VimEditorState = {
        lines: ['hello'],
        cursor: { line: 0, col: 0 },
        mode: 'INSERT',
      };
      const next = handleKey(insertState, 'Enter');
      expect(next.lines).toEqual(['', 'hello']);
      expect(next.cursor).toEqual({ line: 1, col: 0 });
    });

    it('creates a new line below when pressed at end of line', () => {
      const insertState: VimEditorState = {
        lines: ['hello'],
        cursor: { line: 0, col: 5 },
        mode: 'INSERT',
      };
      const next = handleKey(insertState, 'Enter');
      expect(next.lines).toEqual(['hello', '']);
      expect(next.cursor).toEqual({ line: 1, col: 0 });
    });
  });

  describe('Arrow keys in INSERT mode', () => {
    it('moves cursor within line boundaries up to line.length', () => {
      const insertState: VimEditorState = {
        lines: ['abc'],
        cursor: { line: 0, col: 1 },
        mode: 'INSERT',
      };
      const right = handleKey(insertState, 'ArrowRight');
      expect(right.cursor).toEqual({ line: 0, col: 2 });
      const rightAgain = handleKey(right, 'ArrowRight');
      expect(rightAgain.cursor).toEqual({ line: 0, col: 3 }); // at end
      const rightMax = handleKey(rightAgain, 'ArrowRight');
      expect(rightMax.cursor).toEqual({ line: 0, col: 3 }); // clamped at 3

      const left = handleKey(rightMax, 'ArrowLeft');
      expect(left.cursor).toEqual({ line: 0, col: 2 });
    });

    it('moves up and down preserving or clamping col to target line length', () => {
      const insertState: VimEditorState = {
        lines: ['longer line', 'short'],
        cursor: { line: 0, col: 8 },
        mode: 'INSERT',
      };
      const down = handleKey(insertState, 'ArrowDown');
      expect(down.cursor).toEqual({ line: 1, col: 5 }); // clamped to 'short'.length = 5
      const up = handleKey(down, 'ArrowUp');
      expect(up.cursor).toEqual({ line: 0, col: 5 });
    });
  });
});

describe('Vim Engine - Operators & History (dd, dw, p, u, Ctrl-r)', () => {
  describe('dd operator (Delete Line)', () => {
    it('deletes the current line and saves it into clipboard register', () => {
      const state = createState(['line 1', 'line 2', 'line 3'], 1, 0);
      const afterD = handleKey(state, 'd');
      expect(afterD.pendingKeys).toBe('d');

      const afterDD = handleKey(afterD, 'd');
      expect(afterDD.lines).toEqual(['line 1', 'line 3']);
      expect(afterDD.cursor).toEqual({ line: 1, col: 0 });
      expect(afterDD.clipboard).toEqual({
        type: 'line',
        content: 'line 2',
      });
      expect(afterDD.pendingKeys).toBeUndefined();
    });

    it('clamps cursor up when deleting the last line in buffer', () => {
      const state = createState(['line 1', 'line 2'], 1, 2);
      const afterD = handleKey(state, 'd');
      const afterDD = handleKey(afterD, 'd');
      expect(afterDD.lines).toEqual(['line 1']);
      expect(afterDD.cursor).toEqual({ line: 0, col: 2 });
    });

    it('leaves single empty line when only line is deleted', () => {
      const state = createState(['only line'], 0, 3);
      const step1 = handleKey(state, 'd');
      const step2 = handleKey(step1, 'd');
      expect(step2.lines).toEqual(['']);
      expect(step2.cursor).toEqual({ line: 0, col: 0 });
    });
  });

  describe('dw operator (Delete Word)', () => {
    it('deletes from cursor to start of next word including spaces', () => {
      const state = createState(['hello world foo'], 0, 0);
      const afterD = handleKey(state, 'd');
      expect(afterD.pendingKeys).toBe('d');

      const afterDW = handleKey(afterD, 'w');
      expect(afterDW.lines).toEqual(['world foo']);
      expect(afterDW.cursor).toEqual({ line: 0, col: 0 });
      expect(afterDW.clipboard).toEqual({
        type: 'text',
        content: 'hello ',
      });
    });

    it('deletes remaining characters when cursor is in the middle of a word', () => {
      const state = createState(['abcdef ghij'], 0, 2); // on 'c'
      const step1 = handleKey(state, 'd');
      const step2 = handleKey(step1, 'w');
      expect(step2.lines).toEqual(['abghij']);
      expect(step2.clipboard?.content).toBe('cdef ');
    });

    it('cancels pendingKeys if a non-operator key is pressed', () => {
      const state = createState(['hello world'], 0, 0);
      const step1 = handleKey(state, 'd');
      expect(step1.pendingKeys).toBe('d');
      const step2 = handleKey(step1, 'l');
      expect(step2.pendingKeys).toBeUndefined();
      expect(step2.cursor).toEqual({ line: 0, col: 1 });
    });
  });

  describe('p operator (Put / Paste)', () => {
    it('pastes line-type clipboard as new line below current cursor', () => {
      let state = createState(['line 1', 'line 2', 'line 3'], 0, 0);
      // dd on line 1
      state = handleKey(state, 'd');
      state = handleKey(state, 'd');
      expect(state.lines).toEqual(['line 2', 'line 3']);

      // p paste below line 2
      state = handleKey(state, 'p');
      expect(state.lines).toEqual(['line 2', 'line 1', 'line 3']);
      expect(state.cursor).toEqual({ line: 1, col: 0 });
    });

    it('pastes text-type clipboard after cursor column', () => {
      let state = createState(['word1 word2'], 0, 0);
      // dw on word1
      state = handleKey(state, 'd');
      state = handleKey(state, 'w');
      expect(state.lines).toEqual(['word2']);

      // move to end and paste
      state = handleKey(state, '$');
      state = handleKey(state, 'p');
      expect(state.lines).toEqual(['word2word1 ']);
    });

    it('does nothing when clipboard is empty', () => {
      const state = createState(['hello'], 0, 0);
      const next = handleKey(state, 'p');
      expect(next.lines).toEqual(['hello']);
    });
  });

  describe('u (Undo) and Ctrl-r (Redo)', () => {
    it('reverts line deletion made by dd', () => {
      let state = createState(['first', 'second', 'third'], 1, 0);
      state = handleKey(state, 'd');
      state = handleKey(state, 'd');
      expect(state.lines).toEqual(['first', 'third']);

      // u (Undo)
      state = handleKey(state, 'u');
      expect(state.lines).toEqual(['first', 'second', 'third']);
      expect(state.cursor).toEqual({ line: 1, col: 0 });

      // Ctrl-r (Redo)
      state = handleKey(state, 'Ctrl-r');
      expect(state.lines).toEqual(['first', 'third']);
    });

    it('reverts character deletion made by x', () => {
      let state = createState(['hello'], 0, 1); // 'e'
      state = handleKey(state, 'x');
      expect(state.lines).toEqual(['hllo']);

      state = handleKey(state, 'u');
      expect(state.lines).toEqual(['hello']);
      expect(state.cursor).toEqual({ line: 0, col: 1 });
    });

    it('reverts entire INSERT mode typing session on single u', () => {
      let state = createState(['hello'], 0, 5);
      state = handleKey(state, 'a'); // enter insert mode
      state = handleKey(state, ' ');
      state = handleKey(state, 'w');
      state = handleKey(state, 'o');
      state = handleKey(state, 'r');
      state = handleKey(state, 'l');
      state = handleKey(state, 'd');
      state = handleKey(state, 'Escape'); // back to normal

      expect(state.lines).toEqual(['hello world']);

      // single undo reverts whole typing session
      state = handleKey(state, 'u');
      expect(state.lines).toEqual(['hello']);
    });

    it('safely handles empty undo or redo stack', () => {
      const state = createState(['hello'], 0, 0);
      const afterUndo = handleKey(state, 'u');
      expect(afterUndo.lines).toEqual(['hello']);

      const afterRedo = handleKey(state, 'Ctrl-r');
      expect(afterRedo.lines).toEqual(['hello']);
    });
  });
});
