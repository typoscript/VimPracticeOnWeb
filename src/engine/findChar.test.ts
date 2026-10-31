import { describe, it, expect } from 'vitest';
import {
  findCharForward,
  findCharBackward,
  moveFind,
  executeFindOperator,
} from './findChar';
import { VimEditorState } from '../types/vim';

describe('findChar module (f, F, t, T)', () => {
  const sampleLine = 'const message = "Hello, (Vim) World!";';

  describe('findCharForward & findCharBackward', () => {
    it('지정한 문자를 오른쪽 방향으로 정상 탐색한다', () => {
      // 'H' (index 17)
      expect(findCharForward(sampleLine, 0, 'H')).toBe(17);
      // 두 번째 '"' (첫 번째 index 16, 두 번째 index 36)
      expect(findCharForward(sampleLine, 16, '"')).toBe(36);
      // 없는 문자 탐색 시 null
      expect(findCharForward(sampleLine, 0, 'Z')).toBeNull();
    });

    it('카운트가 주어지면 N번째 문자를 탐색한다', () => {
      // 0부터 ' ' (index 5, index 13, index 15, index 24, index 30)
      // 2번째 공백 -> index 13
      expect(findCharForward(sampleLine, 0, ' ', 2)).toBe(13);
    });

    it('지정한 문자를 왼쪽 방향으로 정상 탐색한다', () => {
      // index 36('"')에서 왼쪽으로 첫 번째 '(' (index 24)
      expect(findCharBackward(sampleLine, 36, '(')).toBe(24);
      // index 10에서 왼쪽으로 'c' (index 0)
      expect(findCharBackward(sampleLine, 10, 'c')).toBe(0);
      // 없는 문자 탐색 시 null
      expect(findCharBackward(sampleLine, 10, 'Z')).toBeNull();
    });
  });

  describe('moveFind', () => {
    const lines = [sampleLine];

    it('f: 해당 문자의 위치로 이동한다', () => {
      const next = moveFind(lines, { line: 0, col: 0 }, 'f', '(');
      expect(next).toEqual({ line: 0, col: 24 });
    });

    it('t: 해당 문자 바로 직전 칸으로 이동한다', () => {
      const next = moveFind(lines, { line: 0, col: 0 }, 't', '(');
      expect(next).toEqual({ line: 0, col: 23 });
    });

    it('F: 왼쪽으로 해당 문자의 위치로 이동한다', () => {
      const next = moveFind(lines, { line: 0, col: 30 }, 'F', '(');
      expect(next).toEqual({ line: 0, col: 24 });
    });

    it('T: 왼쪽으로 해당 문자 바로 다음(오른쪽) 칸으로 이동한다', () => {
      const next = moveFind(lines, { line: 0, col: 30 }, 'T', '(');
      expect(next).toEqual({ line: 0, col: 25 });
    });

    it('문자를 찾지 못하면 null을 반환한다', () => {
      const next = moveFind(lines, { line: 0, col: 0 }, 'f', 'Q');
      expect(next).toBeNull();
    });
  });

  describe('executeFindOperator', () => {
    it('df): 커서 위치부터 닫는 괄호까지 포함하여 삭제한다', () => {
      const state: VimEditorState = {
        lines: ['function test(arg1, arg2) { return; }'],
        cursor: { line: 0, col: 13 }, // '(' 에 위치
        mode: 'NORMAL',
      };

      const next = executeFindOperator(state, 'd', 'f', ')');
      expect(next.lines[0]).toBe('function test { return; }');
      expect(next.clipboard?.content).toBe('(arg1, arg2)');
      expect(next.cursor.col).toBe(13);
      expect(next.mode).toBe('NORMAL');
    });

    it('dt): 커서 위치부터 닫는 괄호 직전까지 삭제하고 괄호는 남긴다', () => {
      const state: VimEditorState = {
        lines: ['call(arg1, arg2);'],
        cursor: { line: 0, col: 5 }, // 'a' 에 위치
        mode: 'NORMAL',
      };

      const next = executeFindOperator(state, 'd', 't', ')');
      expect(next.lines[0]).toBe('call();');
      expect(next.clipboard?.content).toBe('arg1, arg2');
      expect(next.cursor.col).toBe(5);
    });

    it('ct": 큰따옴표 직전까지 삭제하고 INSERT 모드로 진입한다', () => {
      const state: VimEditorState = {
        lines: ['const str = "hello world";'],
        cursor: { line: 0, col: 13 }, // 'h' 에 위치
        mode: 'NORMAL',
      };

      const next = executeFindOperator(state, 'c', 't', ';');
      expect(next.lines[0]).toBe('const str = ";');
      expect(next.clipboard?.content).toBe('hello world"');
      expect(next.mode).toBe('INSERT');
      expect(next.cursor.col).toBe(13);
    });

    it('yf,: 커서 위치부터 쉼표까지 복사하고 텍스트는 보존한다', () => {
      const state: VimEditorState = {
        lines: ['apple, banana, cherry'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      const next = executeFindOperator(state, 'y', 'f', ',');
      expect(next.lines[0]).toBe('apple, banana, cherry');
      expect(next.clipboard?.content).toBe('apple,');
      expect(next.mode).toBe('NORMAL');
    });

    it('매칭되는 문자가 없으면 안전하게 아무것도 변경하지 않는다', () => {
      const state: VimEditorState = {
        lines: ['simple text'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      const next = executeFindOperator(state, 'd', 'f', 'Z');
      expect(next.lines[0]).toBe('simple text');
      expect(next.undoStack).toBeUndefined();
    });
  });
});
