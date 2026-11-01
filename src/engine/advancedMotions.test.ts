import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';
import {
  moveToNextParagraph,
  moveToPrevParagraph,
} from './advancedMotions';


describe('Advanced Pure Vim Motions & History Restoration', () => {
  // =========================================================================
  // 1. Paragraph Motions: { and }
  // =========================================================================
  describe('Paragraph Motions ({, })', () => {
    const lines = [
      '// Paragraph 1 line 1',
      '// Paragraph 1 line 2',
      '',
      '// Paragraph 2 line 1',
      '// Paragraph 2 line 2',
      '',
      '// Paragraph 3 line 1',
    ];

    it('} moves to next paragraph boundary (empty line)', () => {
      const pos = moveToNextParagraph(lines, { line: 0, col: 0 }, 1);
      expect(pos.line).toBe(2);
      expect(pos.col).toBe(0);
    });

    it('2} jumps across 2 paragraphs', () => {
      const pos = moveToNextParagraph(lines, { line: 0, col: 0 }, 2);
      expect(pos.line).toBe(5);
    });

    it('{ moves backward to previous paragraph boundary', () => {
      const pos = moveToPrevParagraph(lines, { line: 4, col: 0 }, 1);
      expect(pos.line).toBe(2);
    });

    it('{ from middle of file jumps backward to top when no more empty lines', () => {
      const pos = moveToPrevParagraph(lines, { line: 1, col: 0 }, 1);
      expect(pos.line).toBe(0);
    });

    it('} via handleKey updates cursor and records jump', () => {
      let state: VimEditorState = {
        lines: [...lines],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };
      state = handleKey(state, '}');
      expect(state.cursor.line).toBe(2);
      expect(state.jumpList?.length).toBeGreaterThan(0);
    });

    it('d} deletes lines up to paragraph boundary', () => {
      let state: VimEditorState = {
        lines: [
          'const a = 1;',
          'const b = 2;',
          '',
          'const c = 3;',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };
      state = handleKey(state, 'd');
      state = handleKey(state, '}');
      expect(state.lines).toEqual(['', 'const c = 3;']);
      expect(state.cursor.line).toBe(0);
    });

    it('c} deletes to paragraph boundary and enters INSERT mode', () => {
      let state: VimEditorState = {
        lines: [
          'const a = 1;',
          'const b = 2;',
          '',
          'const c = 3;',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };
      state = handleKey(state, 'c');
      state = handleKey(state, '}');
      expect(state.mode).toBe('INSERT');
      expect(state.lines).toEqual(['', '', 'const c = 3;']);
    });
  });

  // =========================================================================
  // 2. Cursor Word Search Backward: #
  // =========================================================================
  describe('Word Search (# and *)', () => {
    it('# searches backward for word under cursor', () => {
      let state: VimEditorState = {
        lines: [
          'const target = "first";',
          'const other = 1;',
          'const target = "second";',
        ],
        cursor: { line: 2, col: 6 }, // on 'target' in 'second'
        mode: 'NORMAL',
      };
      state = handleKey(state, '#');
      expect(state.cursor.line).toBe(0);
      expect(state.cursor.col).toBe(6);
      expect(state.lastSearchQuery).toBe('target');
      expect(state.commandMessage).toContain('역방향 검색');
    });

    it('# wraps around to last match if at the first match', () => {
      let state: VimEditorState = {
        lines: [
          'const target = 1;',
          'const other = 2;',
          'const target = 3;',
        ],
        cursor: { line: 0, col: 6 },
        mode: 'NORMAL',
      };
      state = handleKey(state, '#');
      expect(state.cursor.line).toBe(2);
      expect(state.cursor.col).toBe(6);
    });
  });

  // =========================================================================
  // 3. Go to Local Declaration: gd
  // =========================================================================
  describe('Go to Declaration (gd)', () => {
    it('gd jumps to local declaration inside current function block', () => {
      let state: VimEditorState = {
        lines: [
          'const globalVal = 100;',
          'function compute() {',
          '  const result = 42;',
          '  console.log(result);',
          '}',
        ],
        cursor: { line: 3, col: 14 }, // on 'result' in console.log
        mode: 'NORMAL',
      };
      state = handleKey(state, 'g');
      state = handleKey(state, 'd');
      expect(state.cursor.line).toBe(2);
      expect(state.cursor.col).toBe(8); // 'result' start col
      expect(state.commandMessage).toContain('선언부로 이동');
    });

    it('gd jumps to top-level declaration if not declared locally', () => {
      let state: VimEditorState = {
        lines: [
          'const globalConfig = { debug: true };',
          'function run() {',
          '  if (globalConfig.debug) {',
          '    console.log("running");',
          '  }',
          '}',
        ],
        cursor: { line: 2, col: 8 }, // on 'globalConfig'
        mode: 'NORMAL',
      };
      state = handleKey(state, 'gd');
      expect(state.cursor.line).toBe(0);
      expect(state.cursor.col).toBe(6);
    });
  });

  // =========================================================================
  // 4. Edit Position and Visual Selection: gi, gv
  // =========================================================================
  describe('Restore Edit Position & Visual (gi, gv)', () => {
    it('gi jumps to last insert position and enters INSERT mode', () => {
      let state: VimEditorState = {
        lines: ['hello world, this is a test'],
        cursor: { line: 0, col: 6 },
        mode: 'NORMAL',
      };
      // Enter insert mode, type, press Escape
      state = handleKey(state, 'i');
      state = handleKey(state, '!');
      state = handleKey(state, 'Escape');
      // Cursor moved away
      state = handleKey(state, '0');
      expect(state.cursor.col).toBe(0);
      expect(state.mode).toBe('NORMAL');

      // Press gi
      state = handleKey(state, 'g');
      state = handleKey(state, 'i');
      expect(state.mode).toBe('INSERT');
      expect(state.cursor.line).toBe(0);
      expect(state.cursor.col).toBe(7); // where '!' was typed
    });

    it('gv restores last visual selection and mode', () => {
      let state: VimEditorState = {
        lines: ['line 1', 'line 2', 'line 3'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };
      // Enter Visual Line mode and select lines 0 to 1
      state = handleKey(state, 'V');
      state = handleKey(state, 'j');
      expect(state.mode).toBe('VISUAL_LINE');
      // Cancel with Escape
      state = handleKey(state, 'Escape');
      expect(state.mode).toBe('NORMAL');

      // Move cursor somewhere else
      state = handleKey(state, 'G');
      expect(state.cursor.line).toBe(2);

      // Press gv to restore selection
      state = handleKey(state, 'g');
      state = handleKey(state, 'v');
      expect(state.mode).toBe('VISUAL_LINE');
      expect(state.visualAnchor?.line).toBe(0);
      expect(state.cursor.line).toBe(1);
    });
  });

  // =========================================================================
  // 5. Change List Navigation: g; and g,
  // =========================================================================
  describe('Change List Navigation (g; and g,)', () => {
    it('g; and g, navigate backwards and forwards through modification history', () => {
      let state: VimEditorState = {
        lines: [
          'first line',
          'second line',
          'third line',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // Edit 1: on line 0, append character
      state = handleKey(state, 'A');
      state = handleKey(state, '1');
      state = handleKey(state, 'Escape');

      // Edit 2: on line 2, delete character with x
      state = handleKey(state, '2');
      state = handleKey(state, 'j');
      state = handleKey(state, '$');
      state = handleKey(state, 'x');

      // Move away to line 1
      state = handleKey(state, '1');
      state = handleKey(state, 'k');
      expect(state.cursor.line).toBe(1);

      // g; jumps to most recent change (line 2)
      state = handleKey(state, 'g');
      state = handleKey(state, ';');
      expect(state.cursor.line).toBe(2);

      // g; again jumps to earlier change (line 0)
      state = handleKey(state, 'g');
      state = handleKey(state, ';');
      expect(state.cursor.line).toBe(0);

      // g; at start shows message and clamps
      state = handleKey(state, 'g');
      state = handleKey(state, ';');
      expect(state.commandMessage).toContain('변경 목록의 시작');

      // g, jumps forward to newer change (line 2)
      state = handleKey(state, 'g');
      state = handleKey(state, ',');
      expect(state.cursor.line).toBe(2);

      // g, at end shows message
      state = handleKey(state, 'g');
      state = handleKey(state, ',');
      expect(state.commandMessage).toContain('변경 목록의 끝');
    });
  });
});
