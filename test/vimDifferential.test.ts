import { describe, it, expect } from 'vitest';
import { runDifferentialCheck } from './oracle/codemirrorOracle';
import { handleKey } from '../src/engine/vimEngine';
import type { VimEditorState } from '../src/types/vim';

/**
 * CodeMirror Vim 오라클이 실제 Vim 과 다르게 동작하는 경우에는 실제 Neovim 으로 확인한 결과와 비교합니다.
 * (예: 여러 줄 di{ — CodeMirror 는 { } 를 한 줄로 합치지만, Vim/Neovim 은 { 줄과 } 줄을 남기고 안쪽 줄만 지웁니다)
 */
function runAgainstNeovim(text: string, keys: string[]): VimEditorState {
  const start: VimEditorState = { lines: text.split('\n'), cursor: { line: 0, col: 0 }, mode: 'NORMAL' };
  return keys.reduce((s, k) => handleKey(s, k), start);
}

describe('Vim Differential Cross-Validation: 50 Edge Cases', () => {
  // =========================================================================
  // Category 1: Empty Buffer & Empty Lines (Cases 1~8)
  // =========================================================================
  describe('Category 1: Empty Buffer & Empty Lines', () => {
    it('[Case 01] empty buffer with w', () => {
      const res = runDifferentialCheck('', ['w']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 02] empty buffer with b', () => {
      const res = runDifferentialCheck('', ['b']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 03] empty buffer with dd', () => {
      const res = runDifferentialCheck('', ['d', 'd']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 04] empty buffer with x', () => {
      const res = runDifferentialCheck('', ['x']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 05] empty middle line w jump', () => {
      const text = 'first\n\nthird';
      const res = runDifferentialCheck(text, ['w', 'w']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 06] empty line with $', () => {
      const res = runDifferentialCheck('', ['$']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 07] empty line with 0', () => {
      const res = runDifferentialCheck('', ['0']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 08] empty buffer with put p', () => {
      const res = runDifferentialCheck('', ['p']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });
  });

  // =========================================================================
  // Category 2: End-of-line & Clamping Operations (Cases 9~16)
  // =========================================================================
  describe('Category 2: End-of-line & Clamping Operations', () => {
    it('[Case 09] $ followed by x clamps cursor to new end of line', () => {
      const text = 'abcde';
      const res = runDifferentialCheck(text, ['$', 'x']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 10] $ on short line then j to longer line', () => {
      const text = 'abc\n12345678';
      const res = runDifferentialCheck(text, ['$', 'j']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 11] $ on long line then j to shorter line', () => {
      const text = '12345678\nabc';
      const res = runDifferentialCheck(text, ['$', 'j']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 12] single character line with x', () => {
      const text = 'a';
      const res = runDifferentialCheck(text, ['x']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 13] single character line with dw', () => {
      const text = 'a';
      const res = runDifferentialCheck(text, ['d', 'w']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 14] last word in line with dw', () => {
      const text = 'hello world';
      const res = runDifferentialCheck(text, ['w', 'd', 'w']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 15] last word in line with de', () => {
      const text = 'hello world';
      const res = runDifferentialCheck(text, ['w', 'd', 'e']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 16] cw on last word then Escape', () => {
      const text = 'hello world';
      const res = runDifferentialCheck(text, ['w', 'c', 'w', 'Escape']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });
  });

  // =========================================================================
  // Category 3: Text Objects Precision (Cases 17~28)
  // =========================================================================
  describe('Category 3: Text Objects Precision', () => {
    it('[Case 17] diw in middle of word', () => {
      const text = 'const variableName = 10;';
      const res = runDifferentialCheck(text, ['w', 'l', 'l', 'd', 'i', 'w']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 18] daw with trailing whitespace', () => {
      const text = 'const target = 10;';
      const res = runDifferentialCheck(text, ['w', 'd', 'a', 'w']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 19] daw on last word without trailing space', () => {
      const text = 'foo bar';
      const res = runDifferentialCheck(text, ['w', 'd', 'a', 'w']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 20] ciw with replacement and Escape', () => {
      const text = 'old new';
      const res = runDifferentialCheck(text, ['c', 'i', 'w', 'Escape']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 21] caw on word and Escape', () => {
      const text = 'first second';
      const res = runDifferentialCheck(text, ['c', 'a', 'w', 'Escape']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 22] di" inside string literal', () => {
      const text = 'const msg = "hello world";';
      const res = runDifferentialCheck(text, ['f', '"', 'l', 'd', 'i', '"']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 23] da" including quotes', () => {
      const text = 'const msg = "hello world";';
      const res = runDifferentialCheck(text, ['f', '"', 'l', 'd', 'a', '"']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 24] ci" inside string literal and Escape', () => {
      const text = 'const msg = "sample";';
      const res = runDifferentialCheck(text, ['f', '"', 'l', 'c', 'i', '"', 'Escape']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 25] di( inside function arguments', () => {
      const text = 'function add(a, b) {}';
      const res = runDifferentialCheck(text, ['f', '(', 'l', 'd', 'i', '(']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 26] da( on function call brackets', () => {
      const text = 'console.log("hi");';
      const res = runDifferentialCheck(text, ['f', '(', 'l', 'd', 'a', '(']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 27] di{ inside single-line object', () => {
      const text = 'const obj = { a: 1, b: 2 };';
      const res = runDifferentialCheck(text, ['f', '{', 'l', 'd', 'i', '{']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 28] da{ on single-line object', () => {
      const text = 'const obj = { a: 1, b: 2 };';
      const res = runDifferentialCheck(text, ['f', '{', 'l', 'd', 'a', '{']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });
  });

  // =========================================================================
  // Category 4: Multiline Block Text Objects & Deletions (Cases 29~34)
  // =========================================================================
  describe('Category 4: Multiline Block Text Objects & Deletions', () => {
    it('[Case 29] multi-line di{ inside block (Neovim 기준: CodeMirror 오라클과 다름)', () => {
      const text = 'function foo() {\n  const x = 1;\n  return x;\n}';
      // nvim --headless -u NONE: f{jdi{ → ["function foo() {", "}"], 커서 (1, 0), 줄 단위 레지스터
      const res = runAgainstNeovim(text, ['f', '{', 'j', 'd', 'i', '{']);
      expect(res.lines).toEqual(['function foo() {', '}']);
      expect(res.cursor).toEqual({ line: 1, col: 0 });
      expect(res.registers?.['"']?.type).toBe('line');
    });

    it('[Case 30] multi-line da{ including outer braces', () => {
      const text = 'class Foo {\n  bar() {}\n}';
      const res = runDifferentialCheck(text, ['f', '{', 'j', 'd', 'a', '{']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 31] multi-line di( across lines (Neovim 기준: CodeMirror 오라클과 다름)', () => {
      const text = 'callFunc(\n  arg1,\n  arg2\n);';
      // nvim --headless -u NONE: f(jdi( → ["callFunc(", ");"], 커서 (1, 0)
      const res = runAgainstNeovim(text, ['f', '(', 'j', 'd', 'i', '(']);
      expect(res.lines).toEqual(['callFunc(', ');']);
      expect(res.cursor).toEqual({ line: 1, col: 0 });
    });

    it('[Case 32] bracket matching jump %', () => {
      const text = 'if (x > 0) {\n  foo();\n}';
      const res = runDifferentialCheck(text, ['f', '(', '%']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 33] bracket matching jump on braces %', () => {
      const text = '{\n  const a = 10;\n}';
      const res = runDifferentialCheck(text, ['%']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 34] bracket match jump back % twice', () => {
      const text = 'function test() {}';
      const res = runDifferentialCheck(text, ['f', '{', '%', '%']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });
  });

  // =========================================================================
  // Category 5: Operator + Motion Combinations (Cases 35~40)
  // =========================================================================
  describe('Category 5: Operator + Motion Combinations', () => {
    it('[Case 35] d$ from middle of line to end', () => {
      const text = 'let user = "admin";';
      const res = runDifferentialCheck(text, ['w', 'w', 'd', '$']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 36] d0 from middle of line to start', () => {
      const text = 'hello world';
      const res = runDifferentialCheck(text, ['w', 'd', '0']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 37] c$ from middle of line and Escape', () => {
      const text = 'const foo = "bar";';
      const res = runDifferentialCheck(text, ['w', 'w', 'c', '$', 'Escape']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 38] c0 from middle of line and Escape', () => {
      const text = 'const foo = "bar";';
      const res = runDifferentialCheck(text, ['w', 'w', 'c', '0', 'Escape']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 39] y$ followed by put p', () => {
      const text = 'prefix suffix';
      const res = runDifferentialCheck(text, ['w', 'y', '$', '$', 'p']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 40] df, delete find comma', () => {
      const text = 'first, second, third';
      const res = runDifferentialCheck(text, ['d', 'f', ',']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });
  });

  // =========================================================================
  // Category 6: Character Find & Navigation (Cases 41~44)
  // =========================================================================
  describe('Category 6: Character Find & Navigation', () => {
    it('[Case 41] f{char} navigation', () => {
      const text = 'const target = true;';
      const res = runDifferentialCheck(text, ['f', 't']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 42] t{char} navigation to before character', () => {
      const text = 'const target = true;';
      const res = runDifferentialCheck(text, ['t', 't']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 43] F{char} backward navigation', () => {
      const text = 'const target = true;';
      const res = runDifferentialCheck(text, ['$', 'F', 't']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 44] ; repeat character search', () => {
      const text = 'a b a b a b';
      const res = runDifferentialCheck(text, ['f', 'b', ';', ';']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });
  });

  // =========================================================================
  // Category 7: History, Dot Repeat & Compound Counts (Cases 45~50)
  // =========================================================================
  describe('Category 7: History, Dot Repeat & Compound Counts', () => {
    it('[Case 45] 2dd on 4-line buffer', () => {
      const text = 'line 1\nline 2\nline 3\nline 4';
      const res = runDifferentialCheck(text, ['2', 'd', 'd']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 46] 2dw on multi-word line', () => {
      const text = 'alpha beta gamma delta';
      const res = runDifferentialCheck(text, ['2', 'd', 'w']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 47] 3x on alphanumeric line', () => {
      const text = 'abcdefgh';
      const res = runDifferentialCheck(text, ['3', 'x']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 48] r{char} replace single character', () => {
      const text = 'hello';
      const res = runDifferentialCheck(text, ['r', 'z']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 49] u undo and Ctrl-r redo after deletion', () => {
      const text = 'initial line';
      const res = runDifferentialCheck(text, ['x', 'u', 'Ctrl-r']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 50] . dot repeat after x across multiple positions', () => {
      const text = 'abcdefg';
      const res = runDifferentialCheck(text, ['x', 'l', '.', 'l', '.']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });
  });

  // =========================================================================
  // Category 8: Advanced Pure Vim Motions ({, }, *, #) (Cases 51~54)
  // =========================================================================
  describe('Category 8: Advanced Pure Vim Motions', () => {
    it('[Case 51] } jumps to next paragraph empty line boundary', () => {
      const text = 'p1 line 1\np1 line 2\n\np2 line 1';
      const res = runDifferentialCheck(text, ['0', '}']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 52] { jumps back to previous paragraph boundary', () => {
      const text = 'p1 line 1\n\np2 line 1\np2 line 2';
      const res = runDifferentialCheck(text, ['G', '{']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 53] * searches forward for word under cursor', () => {
      const text = 'const item = 1;\nconst item = 2;';
      const res = runDifferentialCheck(text, ['0', 'w', '*']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });

    it('[Case 54] # searches backward for word under cursor', () => {
      const text = 'const alpha = 1;\nconst other = 2;\nconst alpha = 3;';
      const res = runDifferentialCheck(text, ['G', 'w', '#']);
      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });
  });
});


