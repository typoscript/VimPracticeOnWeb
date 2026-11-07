import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import type { VimEditorState } from '../types/vim';

/**
 * 자주 쓰는 명령의 버그 수정 회귀 테스트.
 * 기대값은 nvim --headless -u NONE 으로 실행한 결과와 대조했습니다.
 */

function createState(lines: string[], cursor = { line: 0, col: 0 }): VimEditorState {
  return { lines, cursor, mode: 'NORMAL' };
}

function press(state: VimEditorState, keys: string[]): VimEditorState {
  return keys.reduce((s, k) => handleKey(s, k), state);
}

const ex = (cmd: string) => [':', ...cmd.split(''), 'Enter'];

describe('> / < 와 모션·텍스트 객체 (이전: INSERT 모드로 들어가 버퍼를 망가뜨림)', () => {
  it('>ip / >} / >2j / >gg / <ip 는 줄 범위를 들여쓰기·내어쓰기 한다', () => {
    expect(press(createState(['a', 'b', '', 'c']), ['>', 'i', 'p']).lines).toEqual(['  a', '  b', '', 'c']);
    // } 는 빈 줄의 첫 칸에서 끝나는 exclusive 모션이므로 빈 줄은 범위에서 빠짐
    expect(press(createState(['a', 'b', '', 'c']), ['>', '}']).lines).toEqual(['  a', '  b', '', 'c']);
    expect(press(createState(['a', 'b', 'c', 'd']), ['>', '2', 'j']).lines).toEqual(['  a', '  b', '  c', 'd']);
    expect(press(createState(['a', 'b', 'c'], { line: 2, col: 0 }), ['>', 'g', 'g']).lines).toEqual(['  a', '  b', '  c']);
    expect(press(createState(['  a', '  b', '', '  c']), ['<', 'i', 'p']).lines).toEqual(['a', 'b', '', '  c']);
    expect(press(createState(['a']), ['>', 'i', 'p']).mode).toBe('NORMAL');
  });

  it('빈 줄은 들여쓰지 않고, . 으로 반복되며, 실패하면 bell', () => {
    expect(press(createState(['a', '', 'b']), ['>', 'G']).lines).toEqual(['  a', '', '  b']);
    expect(press(createState(['a', '', 'b']), ['>', 'i', 'p', 'j', 'j', '.']).lines).toEqual(['  a', '', '  b']);
    expect(press(createState(['a']), ['>', 'k']).bell).toBe(true);
  });

  it('>i{ 는 { 줄과 } 줄을 제외한 안쪽 줄만 들여쓴다', () => {
    expect(press(createState(['f {', 'x', 'y', '}'], { line: 1, col: 0 }), ['>', 'i', '{']).lines).toEqual(['f {', '  x', '  y', '}']);
  });
});

describe('여러 줄 i{ / i( 는 줄 단위 (Vim current_block 규칙)', () => {
  const BLOCK = ['function foo() {', '  const x = 1;', '  return x;', '}'];

  it('di{ 는 { 줄과 } 줄을 남기고 안쪽 줄만 지운다', () => {
    const state = press(createState([...BLOCK], { line: 1, col: 2 }), ['d', 'i', '{']);
    expect(state.lines).toEqual(['function foo() {', '}']);
    expect(state.registers?.['"']).toEqual({ type: 'line', content: '  const x = 1;\n  return x;' });
  });

  it('yi{ 는 줄 단위로 복사하고 커서를 안쪽 첫 줄 첫 칸으로, ci{ 는 들여쓰기만 남긴 줄에서 입력', () => {
    const y = press(createState([...BLOCK], { line: 2, col: 4 }), ['y', 'i', '{']);
    expect(y.cursor).toEqual({ line: 1, col: 0 });
    expect(y.registers?.['0']?.type).toBe('line');

    const c = press(createState([...BLOCK], { line: 1, col: 2 }), ['c', 'i', '{', 'X', 'Escape']);
    expect(c.lines).toEqual(['function foo() {', '  X', '}']);
  });

  it('{ 가 줄 끝이 아니면 문자 단위: { 뒤부터 } 앞 줄 끝까지', () => {
    expect(press(createState(['f { a', '  b', '}'], { line: 1, col: 2 }), ['d', 'i', '{']).lines).toEqual(['f {', '}']);
  });

  it('vi{ 는 안쪽 줄을 VISUAL 로 선택한다', () => {
    const v = press(createState([...BLOCK], { line: 1, col: 2 }), ['v', 'i', '{']);
    expect(v.visualAnchor).toEqual({ line: 1, col: 0 });
    expect(v.cursor.line).toBe(2);
  });
});

describe('[count]p / [count]P', () => {
  it('3p 는 세 번 붙여넣고 u 한 번으로 되돌린다', () => {
    const state = press(createState(['x']), ['y', 'l', '3', 'p']);
    expect(state.lines).toEqual(['xxxx']);
    expect(state.cursor).toEqual({ line: 0, col: 3 });
    expect(press(state, ['u']).lines).toEqual(['x']);
  });

  it('줄 단위 2p 는 a b a b 순서로 붙여넣고, . 으로 카운트까지 반복한다', () => {
    expect(press(createState(['a', 'b']), ['y', 'j', '2', 'p']).lines).toEqual(['a', 'a', 'b', 'a', 'b', 'b']);
    expect(press(createState(['x']), ['y', 'l', '2', 'p', '.']).lines).toEqual(['xxxxx']);
  });
});

describe('ga 와 :noh (이전: ga 가 INSERT 로 들어감, :noh 는 E492)', () => {
  it('ga 는 커서 문자의 코드 값을 보여준다', () => {
    const state = press(createState(['A가']), ['g', 'a']);
    expect(state.mode).toBe('NORMAL');
    expect(state.lines).toEqual(['A가']);
    expect(state.commandMessage).toBe('<A> 65, 16진수 41, 8진수 101');
    expect(press(createState(['A가'], { line: 0, col: 1 }), ['g', 'a']).commandMessage).toBe('<가> 44032, 16진수 ac00, 8진수 126000');
    expect(press(createState(['']), ['g', 'a']).commandMessage).toBe('NUL');
  });

  it(':noh 는 하이라이트를 끄고, 다음 n / 검색에서 다시 켠다', () => {
    let state = press(createState(['foo foo']), ['/', 'f', 'o', 'Enter', ...ex('noh')]);
    expect(state.hlsearchSuppressed).toBe(true);
    expect(state.lastSearchQuery).toBe('fo');
    expect(press(state, ['j']).hlsearchSuppressed).toBe(true);
    expect(press(state, ['n']).hlsearchSuppressed).toBeUndefined();
    state = press(state, ['/', 'o', 'Enter']);
    expect(state.hlsearchSuppressed).toBeUndefined();
    expect(press(createState(['a']), ex('nohlsearch')).hlsearchSuppressed).toBe(true);
  });
});

describe(':t / :m 를 공백 없이 (:t0, :m0, :t.)', () => {
  it('주소를 바로 붙여 줄을 복사·이동하고, :marks 같은 명령과 혼동하지 않는다', () => {
    expect(press(createState(['a', 'b'], { line: 1, col: 0 }), ex('t0')).lines).toEqual(['b', 'a', 'b']);
    expect(press(createState(['a', 'b'], { line: 1, col: 0 }), ex('m0')).lines).toEqual(['b', 'a']);
    expect(press(createState(['a', 'b']), ex('t.')).lines).toEqual(['a', 'a', 'b']);
    expect(press(createState(['a']), ex('marks')).commandMessage).toContain('mark');
  });
});

describe('꺾쇠 괄호 텍스트 객체 i< a< i> a>', () => {
  it('di< / da> / ci< 로 꺾쇠 괄호 안팎을 다룬다', () => {
    expect(press(createState(['a <b> c'], { line: 0, col: 3 }), ['d', 'i', '<']).lines).toEqual(['a <> c']);
    expect(press(createState(['a <b> c'], { line: 0, col: 3 }), ['d', 'a', '>']).lines).toEqual(['a  c']);
    expect(press(createState(['List<int> x'], { line: 0, col: 6 }), ['c', 'i', '<', 's', 't', 'r', 'Escape']).lines).toEqual(['List<str> x']);
  });
});

describe('g? ROT13 연산자와 gUgU / g?g? 줄 단위 (이전: gUgU 가 동작하지 않음)', () => {
  it('g?w / g?? / g?g? / gUgU', () => {
    expect(press(createState(['hello world']), ['g', '?', 'w']).lines).toEqual(['uryyb world']);
    expect(press(createState(['Hello']), ['g', '?', '?']).lines).toEqual(['Uryyb']);
    expect(press(createState(['Hello']), ['g', '?', 'g', '?']).lines).toEqual(['Uryyb']);
    expect(press(createState(['Hello']), ['g', 'U', 'g', 'U']).lines).toEqual(['HELLO']);
  });

  it('g?ip 는 문단을 변환한다 (이전에는 삭제되어 버퍼가 비었음), VISUAL g? 도 동작한다', () => {
    expect(press(createState(['ab', 'cd', '', 'ef']), ['g', '?', 'i', 'p']).lines).toEqual(['no', 'pq', '', 'ef']);
    expect(press(createState(['abc']), ['v', 'l', 'g', '?']).lines).toEqual(['noc']);
  });
});

describe('VISUAL 모드 괄호 모션 [( [{ ]) ]}', () => {
  it('v[( / v2[{ / v]) 로 선택을 감싸는 괄호까지 넓힌다', () => {
    expect(press(createState(['f(a, b)'], { line: 0, col: 4 }), ['v', '[', '(']).cursor).toEqual({ line: 0, col: 1 });
    expect(press(createState(['{ { x } }'], { line: 0, col: 4 }), ['v', '2', '[', '{']).cursor).toEqual({ line: 0, col: 0 });
    const del = press(createState(['f(a, b)'], { line: 0, col: 2 }), ['v', ']', ')', 'd']);
    expect(del.lines).toEqual(['f(']);
  });
});
