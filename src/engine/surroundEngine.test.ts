import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';

describe('surroundEngine: vim-surround (cs, ds, ys, yss, Visual S)', () => {
  describe('Delete Surround (ds{char})', () => {
    it('ds" 로 큰따옴표를 제거한다', () => {
      let state: VimEditorState = {
        lines: ['const msg = "hello world";'],
        cursor: { line: 0, col: 14 }, // 'h' 위치
        mode: 'NORMAL',
      };

      state = handleKey(state, 'd');
      expect(state.pendingKeys).toBe('d');
      state = handleKey(state, 's');
      expect(state.pendingKeys).toBe('ds');
      state = handleKey(state, '"');

      expect(state.lines[0]).toBe('const msg = hello world;');
      expect(state.cursor.col).toBe(12);
      expect(state.pendingKeys).toBeUndefined();
    });

    it("ds' 로 작은따옴표를 제거한다", () => {
      let state: VimEditorState = {
        lines: ["const msg = 'hello world';"],
        cursor: { line: 0, col: 14 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'd');
      state = handleKey(state, 's');
      state = handleKey(state, "'");

      expect(state.lines[0]).toBe('const msg = hello world;');
    });

    it('ds) 및 dsb 로 괄호를 제거한다', () => {
      let state: VimEditorState = {
        lines: ['const res = (a + b);'],
        cursor: { line: 0, col: 14 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'd');
      state = handleKey(state, 's');
      state = handleKey(state, ')');

      expect(state.lines[0]).toBe('const res = a + b;');

      // dsb alias
      let stateB: VimEditorState = {
        lines: ['const res = (a + b);'],
        cursor: { line: 0, col: 14 },
        mode: 'NORMAL',
      };
      stateB = handleKey(stateB, 'd');
      stateB = handleKey(stateB, 's');
      stateB = handleKey(stateB, 'b');
      expect(stateB.lines[0]).toBe('const res = a + b;');
    });

    it('ds( 로 내부 공백이 포함된 괄호 제거 시 공백도 함께 제거한다', () => {
      let state: VimEditorState = {
        lines: ['const res = ( a + b );'],
        cursor: { line: 0, col: 15 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'd');
      state = handleKey(state, 's');
      state = handleKey(state, '(');

      expect(state.lines[0]).toBe('const res = a + b;');
    });

    it('ds] 로 대괄호를 제거한다', () => {
      let state: VimEditorState = {
        lines: ['const list = [1, 2, 3];'],
        cursor: { line: 0, col: 15 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'd');
      state = handleKey(state, 's');
      state = handleKey(state, ']');

      expect(state.lines[0]).toBe('const list = 1, 2, 3;');
    });

    it('ds} 로 중괄호를 제거한다', () => {
      let state: VimEditorState = {
        lines: ['const obj = {key: 1};'],
        cursor: { line: 0, col: 14 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'd');
      state = handleKey(state, 's');
      state = handleKey(state, '}');

      expect(state.lines[0]).toBe('const obj = key: 1;');
    });

    it('dst 로 HTML 태그를 제거한다', () => {
      let state: VimEditorState = {
        lines: ['const elem = <b>important</b>;'],
        cursor: { line: 0, col: 17 }, // 'i' 위치
        mode: 'NORMAL',
      };

      state = handleKey(state, 'd');
      state = handleKey(state, 's');
      state = handleKey(state, 't');

      expect(state.lines[0]).toBe('const elem = important;');
    });
  });

  describe('Change Surround (cs{old}{new})', () => {
    it("cs\"' 로 큰따옴표를 작은따옴표로 교체한다", () => {
      let state: VimEditorState = {
        lines: ['const str = "hello";'],
        cursor: { line: 0, col: 14 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'c');
      expect(state.pendingKeys).toBe('c');
      state = handleKey(state, 's');
      expect(state.pendingKeys).toBe('cs');
      state = handleKey(state, '"');
      expect(state.pendingKeys).toBe('cs"');
      state = handleKey(state, "'");

      expect(state.lines[0]).toBe("const str = 'hello';");
      expect(state.pendingKeys).toBeUndefined();
    });

    it("cs'\" 로 작은따옴표를 큰따옴표로 교체한다", () => {
      let state: VimEditorState = {
        lines: ["const str = 'hello';"],
        cursor: { line: 0, col: 14 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'c');
      state = handleKey(state, 's');
      state = handleKey(state, "'");
      state = handleKey(state, '"');

      expect(state.lines[0]).toBe('const str = "hello";');
    });

    it('cs)] 로 소괄호를 대괄호로 교체한다 (공백 없음)', () => {
      let state: VimEditorState = {
        lines: ['fn(arg);'],
        cursor: { line: 0, col: 4 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'c');
      state = handleKey(state, 's');
      state = handleKey(state, ')');
      state = handleKey(state, ']');

      expect(state.lines[0]).toBe('fn[arg];');
    });

    it('cs)[ 로 소괄호를 대괄호로 교체 시 여는 대괄호는 내부 공백을 추가한다', () => {
      let state: VimEditorState = {
        lines: ['fn(arg);'],
        cursor: { line: 0, col: 4 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'c');
      state = handleKey(state, 's');
      state = handleKey(state, ')');
      state = handleKey(state, '[');

      expect(state.lines[0]).toBe('fn[ arg ];');
    });

    it('cs"( 로 따옴표를 소괄호+공백으로 교체하고 cs") 로 공백 없이 교체한다', () => {
      let state: VimEditorState = {
        lines: ['"test"'],
        cursor: { line: 0, col: 2 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'c');
      state = handleKey(state, 's');
      state = handleKey(state, '"');
      state = handleKey(state, '(');
      expect(state.lines[0]).toBe('( test )');

      state = handleKey(state, 'c');
      state = handleKey(state, 's');
      state = handleKey(state, ')');
      state = handleKey(state, ']');
      expect(state.lines[0]).toBe('[test]');
    });

    it('cst<q> 로 HTML 태그를 교체한다', () => {
      let state: VimEditorState = {
        lines: ['<b>hello</b>'],
        cursor: { line: 0, col: 4 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'c');
      state = handleKey(state, 's');
      state = handleKey(state, 't');
      state = handleKey(state, '<q>');

      expect(state.lines[0]).toBe('<q>hello</q>');
    });
  });

  describe('You Surround (ys{motion}{char})', () => {
    it('ysiw" 로 단어를 큰따옴표로 감싼다', () => {
      let state: VimEditorState = {
        lines: ['hello world'],
        cursor: { line: 0, col: 7 }, // 'world' 위
        mode: 'NORMAL',
      };

      state = handleKey(state, 'y');
      expect(state.pendingKeys).toBe('y');
      state = handleKey(state, 's');
      expect(state.pendingKeys).toBe('ys');
      state = handleKey(state, 'i');
      expect(state.pendingKeys).toBe('ysi');
      state = handleKey(state, 'w');
      expect(state.pendingKeys).toBe('ysiw');
      state = handleKey(state, '"');

      expect(state.lines[0]).toBe('hello "world"');
      expect(state.cursor.col).toBe(6);
    });

    it('ysiw) 및 ysiw( 로 단어를 괄호(공백 유/무)로 감싼다', () => {
      let state: VimEditorState = {
        lines: ['foo bar'],
        cursor: { line: 0, col: 4 }, // 'bar'
        mode: 'NORMAL',
      };

      state = handleKey(state, 'y');
      state = handleKey(state, 's');
      state = handleKey(state, 'i');
      state = handleKey(state, 'w');
      state = handleKey(state, ')');
      expect(state.lines[0]).toBe('foo (bar)');

      // ysiw(
      let state2: VimEditorState = {
        lines: ['foo bar'],
        cursor: { line: 0, col: 4 },
        mode: 'NORMAL',
      };
      state2 = handleKey(state2, 'y');
      state2 = handleKey(state2, 's');
      state2 = handleKey(state2, 'i');
      state2 = handleKey(state2, 'w');
      state2 = handleKey(state2, '(');
      expect(state2.lines[0]).toBe('foo ( bar )');
    });

    it('ys$" 로 커서 위치부터 줄 끝까지 큰따옴표로 감싼다', () => {
      let state: VimEditorState = {
        lines: ['return hello world;'],
        cursor: { line: 0, col: 7 }, // 'h'
        mode: 'NORMAL',
      };

      state = handleKey(state, 'y');
      state = handleKey(state, 's');
      state = handleKey(state, '$');
      state = handleKey(state, '"');

      expect(state.lines[0]).toBe('return "hello world;"');
    });

    it('yss" 로 들여쓰기를 유지하며 줄 전체를 감싼다', () => {
      let state: VimEditorState = {
        lines: ['  const code = 100;'],
        cursor: { line: 0, col: 4 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'y');
      state = handleKey(state, 's');
      state = handleKey(state, 's');
      state = handleKey(state, '"');

      expect(state.lines[0]).toBe('  "const code = 100;"');
    });

    it('yss) 로 줄 전체를 괄호로 감싼다', () => {
      let state: VimEditorState = {
        lines: ['alert("hi");'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'y');
      state = handleKey(state, 's');
      state = handleKey(state, 's');
      state = handleKey(state, ')');

      expect(state.lines[0]).toBe('(alert("hi");)');
    });
  });

  describe('Visual Mode Surround (S{char})', () => {
    it('비주얼 모드에서 영역 선택 후 S" 입력 시 큰따옴표로 감싸진다', () => {
      let state: VimEditorState = {
        lines: ['const text = hello world;'],
        cursor: { line: 0, col: 13 }, // 'hello'의 'h'
        mode: 'NORMAL',
      };

      // v4l 로 'hello' 선택
      state = handleKey(state, 'v');
      expect(state.mode).toBe('VISUAL');
      state = handleKey(state, '4');
      state = handleKey(state, 'l');
      expect(state.cursor.col).toBe(17);

      // S"
      state = handleKey(state, 'S');
      expect(state.pendingKeys).toBe('S');
      state = handleKey(state, '"');

      expect(state.lines[0]).toBe('const text = "hello" world;');
      expect(state.mode).toBe('NORMAL');
    });

    it('비주얼 모드에서 S( 입력 시 여는 괄호와 공백으로 감싸진다', () => {
      let state: VimEditorState = {
        lines: ['const num = 10 + 20;'],
        cursor: { line: 0, col: 12 },
        mode: 'NORMAL',
      };

      state = handleKey(state, 'v');
      state = handleKey(state, '6');
      state = handleKey(state, 'l'); // '10 + 20'
      state = handleKey(state, 'S');
      state = handleKey(state, '(');

      expect(state.lines[0]).toBe('const num = ( 10 + 20 );');
      expect(state.mode).toBe('NORMAL');
    });
  });

  describe('Dot repeat and Undo', () => {
    it('점(.) 명령어로 ysiw" 감싸기 동작을 다른 단어에 반복 적용할 수 있다', () => {
      let state: VimEditorState = {
        lines: ['apple banana cherry'],
        cursor: { line: 0, col: 0 }, // 'apple'
        mode: 'NORMAL',
      };

      // ysiw" 실행
      state = handleKey(state, 'y');
      state = handleKey(state, 's');
      state = handleKey(state, 'i');
      state = handleKey(state, 'w');
      state = handleKey(state, '"');
      expect(state.lines[0]).toBe('"apple" banana cherry');

      // 'W' 로 banana 이동 후 '.' 반복
      state = handleKey(state, 'W');
      state = handleKey(state, '.');
      expect(state.lines[0]).toBe('"apple" "banana" cherry');
    });

    it('u (undo) 키로 surround 조작을 이전 상태로 되돌린다', () => {
      let state: VimEditorState = {
        lines: ['const foo = "bar";'],
        cursor: { line: 0, col: 14 },
        mode: 'NORMAL',
      };

      // ds"
      state = handleKey(state, 'd');
      state = handleKey(state, 's');
      state = handleKey(state, '"');
      expect(state.lines[0]).toBe('const foo = bar;');

      // u 로 복원
      state = handleKey(state, 'u');
      expect(state.lines[0]).toBe('const foo = "bar";');
    });
  });
});
