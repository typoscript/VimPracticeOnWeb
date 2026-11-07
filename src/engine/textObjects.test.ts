import { describe, it, expect } from 'vitest';
import {
  getTextObjectRange,
  executeTextObjectOperator,
} from './textObjects';
import { VimEditorState } from '../types/vim';

describe('textObjects module (iw, i", i(, i))', () => {
  describe('getTextObjectRange', () => {
    it('iw: 단어 내부의 시작과 끝 인덱스를 정확히 반환한다', () => {
      const lines = ['const welcomeMessage = 100;'];
      // 'welcomeMessage'는 index 6 ~ 19
      const range = getTextObjectRange(lines, { line: 0, col: 10 }, 'iw');
      expect(range).toEqual({ startCol: 6, endCol: 19 });
    });

    it('i": 큰따옴표 내부의 텍스트 범위를 반환한다', () => {
      const lines = ['const title = "Hello Vim World";'];
      // " 는 14번과 30번. 내부 내용은 15 ~ 29
      const range = getTextObjectRange(lines, { line: 0, col: 20 }, 'i"');
      expect(range).toEqual({ startCol: 15, endCol: 29 });
    });

    it('i": 빈 따옴표("")인 경우 isEmpty: true 범위를 반환한다', () => {
      const lines = ['const empty = "";'];
      const range = getTextObjectRange(lines, { line: 0, col: 14 }, 'i"');
      expect(range?.isEmpty).toBe(true);
      expect(range?.startCol).toBe(15);
    });

    it('i(: 소괄호 내부의 텍스트 범위를 반환한다 (중첩 괄호 포함)', () => {
      const lines = ['function calc(a, (b + c), d) {}'];
      // 안쪽 괄호 (b + c) 내부에서 테스트: '(' 는 17, ')' 는 23
      const innerRange = getTextObjectRange(lines, { line: 0, col: 19 }, 'i(');
      expect(innerRange).toEqual({ startCol: 18, endCol: 22 });

      // 바깥쪽 괄호: '(' 는 13, ')' 는 27
      const outerRange = getTextObjectRange(lines, { line: 0, col: 14 }, 'i(');
      expect(outerRange).toEqual({ startCol: 14, endCol: 26 });
    });

    it('짝이 맞지 않거나 없으면 null을 반환한다', () => {
      const lines = ['no quotes or parens here'];
      expect(getTextObjectRange(lines, { line: 0, col: 5 }, 'i"')).toBeNull();
      expect(getTextObjectRange(lines, { line: 0, col: 5 }, 'i(')).toBeNull();
    });
  });

  describe('executeTextObjectOperator', () => {
    it('diw: 단어 전체를 삭제하고 클립보드에 저장한다', () => {
      const state: VimEditorState = {
        lines: ['Hello beautiful World'],
        cursor: { line: 0, col: 8 }, // 'beautiful' 내부
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'd', 'iw');
      expect(next.lines[0]).toBe('Hello  World');
      expect(next.clipboard?.content).toBe('beautiful');
      expect(next.cursor.col).toBe(6);
      expect(next.mode).toBe('NORMAL');
    });

    it('ciw: 단어 전체를 삭제하고 INSERT 모드로 진입한다', () => {
      const state: VimEditorState = {
        lines: ['const oldName = 1;'],
        cursor: { line: 0, col: 7 }, // 'oldName' 내부
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'c', 'iw');
      expect(next.lines[0]).toBe('const  = 1;');
      expect(next.clipboard?.content).toBe('oldName');
      expect(next.mode).toBe('INSERT');
      expect(next.cursor.col).toBe(6);
    });

    it('di": 큰따옴표 안의 내용을 삭제하고 따옴표는 남긴다', () => {
      const state: VimEditorState = {
        lines: ['const greeting = "Hello World";'],
        cursor: { line: 0, col: 20 },
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'd', 'i"');
      expect(next.lines[0]).toBe('const greeting = "";');
      expect(next.clipboard?.content).toBe('Hello World');
      expect(next.cursor.col).toBe(18);
    });

    it('ci": 큰따옴표 안의 내용을 삭제하고 INSERT 모드로 진입한다', () => {
      const state: VimEditorState = {
        lines: ['console.log("replace me");'],
        cursor: { line: 0, col: 15 },
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'c', 'i"');
      expect(next.lines[0]).toBe('console.log("");');
      expect(next.mode).toBe('INSERT');
      expect(next.cursor.col).toBe(13);
    });

    it('yi(: 소괄호 내부를 클립보드로 복사하고 원본 텍스트는 유지한다', () => {
      const state: VimEditorState = {
        lines: ['sum(10, 20, 30);'],
        cursor: { line: 0, col: 6 },
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'y', 'i(');
      expect(next.lines[0]).toBe('sum(10, 20, 30);');
      expect(next.clipboard?.content).toBe('10, 20, 30');
      expect(next.mode).toBe('NORMAL');
    });

    it('viw: 단어 영역을 VISUAL 블록으로 선택한다', () => {
      const state: VimEditorState = {
        lines: ['select this word'],
        cursor: { line: 0, col: 8 }, // 'this'
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'v', 'iw');
      expect(next.mode).toBe('VISUAL');
      expect(next.visualAnchor).toEqual({ line: 0, col: 7 });
      expect(next.cursor).toEqual({ line: 0, col: 10 });
    });

    it('매칭되지 않는 경우 상태가 안전하게 보존된다', () => {
      const state: VimEditorState = {
        lines: ['plain text without quotes'],
        cursor: { line: 0, col: 2 },
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'd', 'i"');
      expect(next.lines[0]).toBe('plain text without quotes');
      expect(next.undoStack).toBeUndefined();
    });

    it('daw: 단어와 뒤따르는 공백을 함께 삭제한다', () => {
      const state: VimEditorState = {
        lines: ['Hello beautiful World'],
        cursor: { line: 0, col: 8 }, // 'beautiful' 내부
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'd', 'aw');
      expect(next.lines[0]).toBe('Hello World');
      expect(next.clipboard?.content).toBe('beautiful ');
      expect(next.cursor.col).toBe(6);
      expect(next.mode).toBe('NORMAL');
    });

    it('da": 큰따옴표 자체를 포함하여 전체를 삭제한다', () => {
      const state: VimEditorState = {
        lines: ['const greeting = "Hello World";'],
        cursor: { line: 0, col: 20 },
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'd', 'a"');
      expect(next.lines[0]).toBe('const greeting = ;');
      expect(next.clipboard?.content).toBe('"Hello World"');
      expect(next.cursor.col).toBe(17);
      expect(next.mode).toBe('NORMAL');
    });

    it('da\': 작은따옴표 및 da`: 백틱 자체를 포함하여 삭제한다', () => {
      const singleQuoteState: VimEditorState = {
        lines: ["const msg = 'single quote';"],
        cursor: { line: 0, col: 15 },
        mode: 'NORMAL',
      };
      const sqResult = executeTextObjectOperator(singleQuoteState, 'd', "a'");
      expect(sqResult.lines[0]).toBe('const msg = ;');
      expect(sqResult.clipboard?.content).toBe("'single quote'");

      const backtickState: VimEditorState = {
        lines: ['const tpl = `template literal`;'],
        cursor: { line: 0, col: 15 },
        mode: 'NORMAL',
      };
      const btResult = executeTextObjectOperator(backtickState, 'd', 'a`');
      expect(btResult.lines[0]).toBe('const tpl = ;');
      expect(btResult.clipboard?.content).toBe('`template literal`');
    });

    it('멀티라인 ci{: { 줄과 } 줄은 남기고 안쪽 줄들을 한 줄로 바꾼 뒤 INSERT 모드로 진입한다 (Neovim 으로 확인)', () => {
      const state: VimEditorState = {
        lines: [
          'function compute() {',
          '  const a = 10;',
          '  const b = 20;',
          '  return a + b;',
          '}',
        ],
        cursor: { line: 2, col: 5 }, // 'const b = 20;' 위치
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'c', 'i{');
      // 실제 Vim/Neovim: { 가 줄 끝, } 가 줄 처음이면 안쪽 줄 전체가 줄 단위로 바뀌고 들여쓰기가 남은 빈 줄에서 입력
      expect(next.lines).toEqual(['function compute() {', '  ', '}']);
      expect(next.cursor).toEqual({ line: 1, col: 2 });
      expect(next.mode).toBe('INSERT');
      expect(next.clipboard?.type).toBe('line');
      expect(next.clipboard?.content).toContain('const a = 10;');
      expect(next.clipboard?.content).toContain('return a + b;');
    });

    it('멀티라인 da{: 여러 줄에 걸친 중괄호 블록 전체를 삭제한다', () => {
      const state: VimEditorState = {
        lines: [
          'const obj = {',
          '  key: "value",',
          '};',
        ],
        cursor: { line: 1, col: 4 },
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'd', 'a{');
      expect(next.lines).toEqual(['const obj = ;']);
      expect(next.cursor).toEqual({ line: 0, col: 12 });
      expect(next.mode).toBe('NORMAL');
    });

    it('2daw: 카운트 2 적용 시 연속으로 2개 단어를 삭제한다', () => {
      const state: VimEditorState = {
        lines: ['one two three four'],
        cursor: { line: 0, col: 0 }, // 'one'
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'd', 'aw', 2);
      expect(next.lines[0]).toBe('three four');
    });

    it('cit: 중첩 태그 구조에서 커서가 위치한 안쪽 태그의 콘텐츠만 삭제하고 INSERT 모드로 진입한다', () => {
      const state: VimEditorState = {
        lines: ['<div className="box"><span>Hello</span></div>'],
        cursor: { line: 0, col: 28 }, // 'Hello' 내부
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'c', 'it');
      expect(next.lines[0]).toBe('<div className="box"><span></span></div>');
      expect(next.cursor).toEqual({ line: 0, col: 27 }); // '<span>' 바로 다음
      expect(next.mode).toBe('INSERT');
      expect(next.clipboard?.content).toBe('Hello');
    });

    it('dat: 여는 태그와 닫는 태그 전체를 포함하여 삭제한다', () => {
      const state: VimEditorState = {
        lines: ['const el = <span>Delete Me</span>;'],
        cursor: { line: 0, col: 18 },
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'd', 'at');
      expect(next.lines[0]).toBe('const el = ;');
      expect(next.clipboard?.content).toBe('<span>Delete Me</span>');
      expect(next.mode).toBe('NORMAL');
    });

    it('멀티라인 cit: 여러 줄에 걸친 태그 내부를 한 줄로 합쳐 INSERT 모드로 진입한다', () => {
      const state: VimEditorState = {
        lines: [
          '<div className="box">',
          '  First line',
          '  Second line',
          '</div>',
        ],
        cursor: { line: 1, col: 4 },
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'c', 'it');
      expect(next.lines).toEqual(['<div className="box"></div>']);
      expect(next.cursor).toEqual({ line: 0, col: 21 });
      expect(next.mode).toBe('INSERT');
    });

    it('Self-closing 태그 at: <input /> 태그 전체를 선택/삭제한다', () => {
      const state: VimEditorState = {
        lines: ['<form><input type="text" /></form>'],
        cursor: { line: 0, col: 12 }, // input 태그 내부
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'd', 'at');
      expect(next.lines[0]).toBe('<form></form>');
      expect(next.clipboard?.content).toBe('<input type="text" />');
    });

    it('vat: 태그 전체를 VISUAL 모드로 영역 선택한다', () => {
      const state: VimEditorState = {
        lines: ['<div><span>Text</span></div>'],
        cursor: { line: 0, col: 13 },
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, 'v', 'at');
      expect(next.mode).toBe('VISUAL');
      expect(next.visualAnchor).toEqual({ line: 0, col: 5 }); // '<' of <span>
      expect(next.cursor).toEqual({ line: 0, col: 21 }); // '>' of </span>
    });

    it('=it: 태그 내부 영역의 들여쓰기를 자동 정렬한다', () => {
      const state: VimEditorState = {
        lines: [
          '<div>',
          '<h1>Title</h1>',
          '</div>',
        ],
        cursor: { line: 1, col: 0 },
        mode: 'NORMAL',
      };

      const next = executeTextObjectOperator(state, '=', 'it');
      expect(next.lines[1]).toBe('  <h1>Title</h1>');
      expect(next.mode).toBe('NORMAL');
    });
  });
});
