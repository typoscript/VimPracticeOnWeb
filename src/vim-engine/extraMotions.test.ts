import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { evaluateExtraMotion } from './extraMotions';
import type { VimEditorState } from './types';

function createState(lines: string[], cursor = { line: 0, col: 0 }): VimEditorState {
  return { lines, cursor, mode: 'NORMAL' };
}

function press(state: VimEditorState, keys: string[]): VimEditorState {
  return keys.reduce((s, k) => handleKey(s, k), state);
}

const CODE = ['  foo(bar, {baz}) qux.  Next one.', 'line two  ', '  third'];
const at = (line: number, col: number) => createState([...CODE], { line, col });

describe('문장 모션 ( )', () => {
  it(') 는 다음 문장 시작, ( 는 현재/이전 문장 시작으로 이동한다', () => {
    expect(press(at(0, 2), [')']).cursor).toEqual({ line: 0, col: 24 });
    expect(press(at(0, 26), ['(']).cursor).toEqual({ line: 0, col: 24 });
    // 버퍼 첫 문장은 들여쓰기를 건너뛰지 않고 0열에서 시작합니다 (nvim 확인).
    expect(press(at(0, 24), ['(']).cursor).toEqual({ line: 0, col: 0 });
  });

  it('빈 줄은 문장 경계이고, [count] 로 여러 문장을 건너뛴다', () => {
    const lines = ['A one. A two.', '', 'B one.'];
    expect(press(createState(lines), ['2', ')']).cursor).toEqual({ line: 1, col: 0 });
    expect(press(createState(lines), ['3', ')']).cursor).toEqual({ line: 2, col: 0 });
  });

  it('더 갈 곳이 없으면 bell', () => {
    expect(press(at(2, 6), [')']).bell).toBe(true);
    expect(press(at(0, 0), ['(']).bell).toBe(true);
  });
});

describe('ge / gE (이전 단어 끝, 뒤로)', () => {
  it('ge 는 이전 단어(구두점 포함)의 끝, gE 는 이전 WORD 의 끝', () => {
    expect(press(at(0, 10), ['g', 'e']).cursor).toEqual({ line: 0, col: 9 });
    expect(press(at(0, 13), ['g', 'e']).cursor).toEqual({ line: 0, col: 11 });
    expect(press(at(0, 13), ['g', 'E']).cursor).toEqual({ line: 0, col: 9 });
  });

  it('줄을 넘어 이전 줄의 마지막 단어 끝으로 가며, 빈 줄은 하나의 단어로 본다', () => {
    expect(press(createState(['ab cd', 'ef'], { line: 1, col: 0 }), ['g', 'e']).cursor).toEqual({ line: 0, col: 4 });
    expect(press(createState(['ab', '', 'cd'], { line: 2, col: 0 }), ['g', 'e']).cursor).toEqual({ line: 1, col: 0 });
  });

  it('버퍼 맨 앞에서는 bell, 이전처럼 앞으로 이동하지 않는다', () => {
    const state = press(createState(['abc def']), ['g', 'e']);
    expect(state.cursor).toEqual({ line: 0, col: 0 });
    expect(state.bell).toBe(true);
  });
});

describe('줄·칸 모션 g_ + - Enter |', () => {
  it('g_ 는 마지막 공백 아닌 문자, [count]g_ 는 아래 줄', () => {
    expect(press(at(1, 0), ['g', '_']).cursor).toEqual({ line: 1, col: 7 });
    expect(press(at(0, 0), ['2', 'g', '_']).cursor).toEqual({ line: 1, col: 7 });
  });

  it('+ / Enter / - 는 다음·이전 줄의 첫 공백 아닌 문자, 끝에서는 bell', () => {
    expect(press(at(1, 3), ['+']).cursor).toEqual({ line: 2, col: 2 });
    expect(press(at(0, 5), ['Enter']).cursor).toEqual({ line: 1, col: 0 });
    expect(press(at(2, 4), ['2', '-']).cursor).toEqual({ line: 0, col: 2 });
    expect(press(at(2, 0), ['+']).bell).toBe(true);
    expect(press(at(0, 0), ['-']).bell).toBe(true);
  });

  it('[count]| 는 해당 칸으로, 줄보다 길면 마지막 문자', () => {
    expect(press(at(0, 0), ['5', '|']).cursor).toEqual({ line: 0, col: 4 });
    expect(press(at(0, 9), ['|']).cursor).toEqual({ line: 0, col: 0 });
    expect(press(at(2, 0), ['9', '9', '|']).cursor).toEqual({ line: 2, col: 6 });
  });
});

describe('괄호 모션 [( [{ ]) ]}', () => {
  it('감싸고 있는 짝 없는 괄호로 이동하고, 안쪽의 짝 있는 괄호는 건너뛴다', () => {
    expect(press(at(0, 9), ['[', '(']).cursor).toEqual({ line: 0, col: 5 });
    expect(press(at(0, 7), [']', ')']).cursor).toEqual({ line: 0, col: 16 });
    expect(press(at(0, 13), ['[', '{']).cursor).toEqual({ line: 0, col: 11 });
    expect(press(at(0, 13), [']', '}']).cursor).toEqual({ line: 0, col: 15 });
  });

  it('여러 줄에 걸친 블록과 [count] 로 바깥 괄호까지 이동한다', () => {
    const js = ['function f() {', '  if (x) {', '    run();', '  }', '}'];
    expect(press(createState([...js], { line: 2, col: 4 }), ['[', '{']).cursor).toEqual({ line: 1, col: 9 });
    expect(press(createState([...js], { line: 2, col: 4 }), ['2', '[', '{']).cursor).toEqual({ line: 0, col: 13 });
    expect(press(createState([...js], { line: 2, col: 4 }), [']', '}']).cursor).toEqual({ line: 3, col: 2 });
  });

  it('감싸는 괄호가 없으면 bell', () => {
    expect(press(at(0, 20), ['[', '(']).bell).toBe(true);
  });
});

describe('연산자·VISUAL 과 함께 쓰기', () => {
  it('dge 는 inclusive, d) / d[( 는 exclusive, d+ 는 줄 단위', () => {
    expect(press(at(0, 10), ['d', 'g', 'e']).lines[0]).toBe('  foo(bar{baz}) qux.  Next one.');
    expect(press(at(0, 2), ['d', ')']).lines[0]).toBe('  Next one.');
    expect(press(at(0, 9), ['d', '[', '(']).lines[0]).toBe('  foo, {baz}) qux.  Next one.');
    expect(press(at(0, 3), ['d', '+']).lines).toEqual(['  third']);
    expect(press(at(1, 2), ['d', 'g', '_']).lines[1]).toBe('li  ');
  });

  it('c]) 로 괄호 안 나머지를 바꾸고, . 으로 반복한다', () => {
    let state = press(createState(['call(a, b)', 'call(c, d)'], { line: 0, col: 5 }), ['c', ']', ')', 'x', 'Escape']);
    expect(state.lines[0]).toBe('call(x)');
    state = press({ ...state, cursor: { line: 1, col: 5 } }, ['.']);
    expect(state.lines[1]).toBe('call(x)');
  });

  it('VISUAL 모드에서 ge / ) / + 로 선택을 확장한다', () => {
    expect(press(at(0, 10), ['v', 'g', 'e']).cursor).toEqual({ line: 0, col: 9 });
    expect(press(at(0, 2), ['v', ')', 'd']).lines[0]).toBe('  ext one.');
    expect(press(at(0, 0), ['V', '+', 'd']).lines).toEqual(['  third']);
  });

  it('evaluateExtraMotion 은 모션 종류(inclusive / exclusive / linewise)를 알려준다', () => {
    expect(evaluateExtraMotion(CODE, { line: 0, col: 10 }, 'ge')?.kind).toBe('inclusive');
    expect(evaluateExtraMotion(CODE, { line: 0, col: 2 }, ')')?.kind).toBe('exclusive');
    expect(evaluateExtraMotion(CODE, { line: 0, col: 0 }, '+')?.kind).toBe('linewise');
  });
});

describe('섹션 이동([[ ]] [] ][), 화면 줄 이동(gj/gk/g0/g$/gm/gM/gI), Ctrl-g, ZZ/ZQ 및 [ ] 네비게이션', () => {
  it('[[ / ]] / [] / ][ 는 열 0의 { / } 섹션 경계를 오간다', () => {
    const lines = ['{', '  a', '}', '', '{', '  b', '}'];
    let s = createState(lines, { line: 0, col: 0 });
    s = press(s, [']', ']']);
    expect(s.cursor).toEqual({ line: 4, col: 0 });
    s = press(s, [']', '[']);
    expect(s.cursor).toEqual({ line: 6, col: 0 });
    s = press(s, ['[', '[']);
    expect(s.cursor).toEqual({ line: 4, col: 0 });
    s = press(s, ['[', ']']);
    expect(s.cursor).toEqual({ line: 2, col: 0 });

    // d]] 연산자 결합 (Neovim 과 동일하게 다음 섹션 앞의 빈 줄 보존)
    const deleted = press(createState(lines, { line: 0, col: 0 }), ['d', ']', ']']);
    expect(deleted.lines).toEqual(['', '{', '  b', '}']);
  });

  it('gj / gk / g0 / g$ / gM / gm / gI 가 Normal 및 Visual/연산자에서 동작한다', () => {
    const lines = ['  0123456789', '  second'];
    let s = press(createState(lines, { line: 0, col: 2 }), ['g', 'M']);
    expect(s.cursor).toEqual({ line: 0, col: 6 });
    s = press(s, ['g', '0']);
    expect(s.cursor).toEqual({ line: 0, col: 0 });
    s = press(s, ['g', '$']);
    expect(s.cursor).toEqual({ line: 0, col: 11 });
    s = press(s, ['g', 'j']);
    expect(s.cursor.line).toBe(1);
    s = press(s, ['g', 'k']);
    expect(s.cursor.line).toBe(0);

    // gI 는 들여쓰기 무시하고 열 0에서 INSERT 진입
    const gi = press(createState(lines, { line: 0, col: 5 }), ['g', 'I', '!', 'Escape']);
    expect(gi.lines[0]).toBe('!  0123456789');

    // dg$ 는 줄 끝까지 삭제
    const dgDollar = press(createState(['hello world'], { line: 0, col: 5 }), ['d', 'g', '$']);
    expect(dgDollar.lines[0]).toBe('hello');
  });

  it('Ctrl-g 는 현재 버퍼 파일명·수정 여부·줄 수·위치를 보고한다', () => {
    const s: VimEditorState = {
      lines: ['a', 'b', 'c', 'd'],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'app.ts',
      undoStack: [{ lines: ['a'], cursor: { line: 0, col: 0 } }],
    };
    const next = press(s, ['Ctrl-g']);
    expect(next.commandMessage).toContain('"app.ts"');
    expect(next.commandMessage).toContain('4');
    expect(next.commandMessage).toContain('50%');
  });

  it('ZZ / ZQ 는 분할 창을 저장 후 닫기(:wq) 또는 저장 없이 닫기(:q!) 처리한다', () => {
    const splitBase: VimEditorState = {
      lines: ['edited'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'main.ts',
      virtualFiles: { 'main.ts': ['old'], 'other.ts': ['x'] },
      splitDirection: 'vertical',
      splitPanes: [
        { filename: 'main.ts', lines: ['edited'], cursor: { line: 0, col: 0 }, mode: 'NORMAL' },
        { filename: 'other.ts', lines: ['x'], cursor: { line: 0, col: 0 }, mode: 'NORMAL' },
      ],
      activePaneIndex: 0,
    };
    const zz = press(splitBase, ['Z', 'Z']);
    expect(zz.splitDirection).toBe('none');
    expect(zz.virtualFiles?.['main.ts']).toEqual(['edited']);

    const zq = press(splitBase, ['Z', 'Q']);
    expect(zq.splitDirection).toBe('none');
    expect(zq.virtualFiles?.['main.ts']).toEqual(['old']);
  });

  it('Neovim 0.11 스타일 ]q/[q, ]l/[l, ]b/[b, ]a/[a, ]<Space>/[<Space> 가 동작한다', () => {
    let s: VimEditorState = {
      lines: ['line1', 'line2'],
      cursor: { line: 0, col: 1 },
      mode: 'NORMAL',
      quickfix: {
        items: [
          { filename: 'a.ts', line: 1, col: 1, text: 'e1' },
          { filename: 'a.ts', line: 2, col: 1, text: 'e2' },
        ],
        currentIndex: 0,
        isOpen: false,
      },
      buffers: [
        { id: 1, name: 'a.ts', lines: ['line1', 'line2'], cursor: { line: 0, col: 0 } },
        { id: 2, name: 'b.ts', lines: ['buf2'], cursor: { line: 0, col: 0 } },
      ],
      currentBufferId: 1,
    };

    s = press(s, [']', 'q']);
    expect(s.quickfix?.currentIndex).toBe(1);
    s = press(s, ['[', 'q']);
    expect(s.quickfix?.currentIndex).toBe(0);

    s = press(s, [']', 'b']);
    expect(s.currentBufferId).toBe(2);
    s = press(s, ['[', 'b']);
    expect(s.currentBufferId).toBe(1);

    // ]<Space> / [<Space> + . 반복
    let blank = press(createState(['first', 'second'], { line: 0, col: 2 }), [']', ' ']);
    expect(blank.lines).toEqual(['first', '', 'second']);
    expect(blank.cursor).toEqual({ line: 0, col: 2 });
    blank = press(blank, ['.']);
    expect(blank.lines).toEqual(['first', '', '', 'second']);
    blank = press(createState(['first', 'second'], { line: 1, col: 2 }), ['[', ' ']);
    expect(blank.lines).toEqual(['first', '', 'second']);
    expect(blank.cursor).toEqual({ line: 2, col: 2 });
  });
});
