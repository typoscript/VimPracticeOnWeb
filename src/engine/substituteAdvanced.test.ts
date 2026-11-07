import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';
import type { VimEditorState, VimOptions } from '../types/vim';

function createState(lines: string[], cursor = { line: 0, col: 0 }): VimEditorState {
  return { lines, cursor, mode: 'NORMAL' };
}

function press(state: VimEditorState, keys: string[]): VimEditorState {
  return keys.reduce((s, k) => handleKey(s, k), state);
}

const ex = (state: VimEditorState, cmd: string) => executeCommandLine(state, cmd, handleKey);

describe(':s 의 \\= 치환식과 submatch()', () => {
  it('일치한 숫자를 계산식으로 바꾼다', () => {
    const state = ex(createState(['a=3 b=10']), '%s/\\d\\+/\\=submatch(0) * 2/g');
    expect(state.lines).toEqual(['a=6 b=20']);
  });

  it('submatch(n) 으로 그룹을 읽고 문자열 함수를 조합한다', () => {
    const state = ex(createState(['user_name', 'order_id']), '%s/\\(\\w\\+\\)_\\(\\w\\+\\)/\\=submatch(1) . toupper(submatch(2)[0]) . submatch(2)[1:]/');
    expect(state.lines).toEqual(['userName', 'orderId']);
  });

  it('line(".") 로 줄 번호를 붙이고, 리스트 결과는 여러 줄이 된다', () => {
    expect(ex(createState(['a', 'b']), "%s/^/\\=line('.') . '. '/").lines).toEqual(['1. a', '2. b']);
    expect(ex(createState(['x']), "s/x/\\=['one', 'two']/").lines).toEqual(['one', 'two']);
  });

  it('사용자 함수를 호출할 수 있고, 식 에러는 버퍼를 바꾸지 않고 bell', () => {
    let state = createState(['3 4']);
    state = [':', ...'function! Sq(n)'.split(''), 'Enter', ...'return a:n * a:n'.split(''), 'Enter', ...'endf'.split(''), 'Enter']
      .reduce((s, k) => handleKey(s, k), state);
    expect(ex(state, '%s/\\d/\\=Sq(submatch(0))/g').lines).toEqual(['9 16']);

    const bad = ex(createState(['1']), 's/1/\\=nope/');
    expect(bad.lines).toEqual(['1']);
    expect(bad.commandMessage).toMatch(/E121/);
    expect(bad.bell).toBe(true);
  });

  it('gc 확인 모드에서도 \\= 결과를 보여주고 적용한다', () => {
    let state = ex(createState(['1 2']), 's/\\d/\\=submatch(0) + 10/gc');
    expect(state.confirmSubstitute?.currentMatch.replacement).toBe('11');
    state = press(state, ['y', 'y']);
    expect(state.lines).toEqual(['11 12']);
  });
});

describe(':s 의 줄 나누기 (\\r)', () => {
  it(':s/, /\\r/g 는 줄을 실제로 나눈다', () => {
    const state = ex(createState(['a, b, c', 'z']), 's/, /\\r/g');
    expect(state.lines).toEqual(['a', 'b', 'c', 'z']);
    expect(press(state, ['u']).lines).toEqual(['a, b, c', 'z']);
  });
});

describe('직전 치환 반복과 ~ (:&, :&&, &, g&, :s//new/)', () => {
  it(':& 는 같은 치환을 플래그 없이, :&& 는 플래그를 유지해 반복한다', () => {
    let state = ex(createState(['a a', 'a a']), 's/a/b/g');
    expect(state.lines).toEqual(['b b', 'a a']);
    state = { ...state, cursor: { line: 1, col: 0 } };
    expect(ex(state, '&').lines).toEqual(['b b', 'b a']);
    expect(ex(state, '&&').lines).toEqual(['b b', 'b b']);
  });

  it('노멀 모드 & 는 현재 줄, g& 는 모든 줄에 직전 치환을 반복한다', () => {
    let state = ex(createState(['x1 x2', 'x3 x4', 'x5']), 's/x/y/g');
    state = press({ ...state, cursor: { line: 1, col: 0 } }, ['&']);
    expect(state.lines).toEqual(['y1 y2', 'y3 x4', 'x5']);
    state = press(state, ['g', '&']);
    expect(state.lines).toEqual(['y1 y2', 'y3 y4', 'y5']);
  });

  it('직전 치환이 없으면 E35 와 bell', () => {
    const state = press(createState(['a']), ['&']);
    expect(state.commandMessage).toMatch(/^E35/);
    expect(state.bell).toBe(true);
  });

  it('빈 패턴 :s//new/ 는 직전 패턴을, 치환 문자열의 ~ 는 직전 치환 문자열을 쓴다', () => {
    let state = ex(createState(['cat dog', 'cat cat']), 's/cat/lion/');
    state = ex({ ...state, cursor: { line: 1, col: 0 } }, 's//~s/g');
    expect(state.lines).toEqual(['lion dog', 'lions lions']);
    // \~ 는 리터럴 ~
    expect(ex(createState(['a']), 's/a/\\~/').lines).toEqual(['~']);
  });

  it(':s 의 패턴은 마지막 검색 패턴이 되어 n 으로 이어서 찾는다', () => {
    let state = ex(createState(['foo', 'bar foo', 'foo']), 's/bar/baz/');
    state = ex(state, 's/o\\+/0/');
    expect(state.lastSearchQuery).toBe('o\\+');
    state = press({ ...state, cursor: { line: 0, col: 0 } }, ['n']);
    expect(state.cursor).toEqual({ line: 1, col: 5 });
  });
});

describe(':s 의 대소문자: ignorecase / smartcase / i / I 플래그', () => {
  const opts = (o: Partial<VimOptions>) => ({ options: o as VimOptions });

  it('ignorecase 를 따르고, smartcase 는 패턴에 대문자가 있으면 구분한다', () => {
    const ic = { ...createState(['Foo foo']), ...opts({ ignorecase: true }) };
    expect(ex(ic, 's/foo/x/g').lines).toEqual(['x x']);

    const sc = { ...createState(['Foo foo']), ...opts({ ignorecase: true, smartcase: true }) };
    expect(ex(sc, 's/Foo/x/g').lines).toEqual(['x foo']);
    expect(ex(sc, 's/foo/x/g').lines).toEqual(['x x']);
  });

  it('I 플래그는 ignorecase 여도 구분하고, i 플래그는 항상 무시한다', () => {
    const ic = { ...createState(['Foo foo']), ...opts({ ignorecase: true }) };
    expect(ex(ic, 's/foo/x/gI').lines).toEqual(['Foo x']);
    expect(ex(createState(['Foo foo']), 's/foo/x/gi').lines).toEqual(['x x']);
  });

  it('gc 확인 모드도 같은 대소문자 규칙을 쓴다', () => {
    const ic = { ...createState(['Foo foo']), ...opts({ ignorecase: true }) };
    let state = ex(ic, 's/foo/x/gc');
    expect(state.confirmSubstitute?.currentMatch.col).toBe(0);
    state = press(state, ['a']);
    expect(state.lines).toEqual(['x x']);
  });
});
