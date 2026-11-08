import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';
import { findMatches } from './search';
import type { VimEditorState } from './types';

function createState(lines: string[], cursor = { line: 0, col: 0 }): VimEditorState {
  return { lines, cursor, mode: 'NORMAL' };
}

function press(state: VimEditorState, keys: string[]): VimEditorState {
  return keys.reduce((s, k) => handleKey(s, k), state);
}

const search = (state: VimEditorState, pattern: string) => press(state, ['/', ...pattern.split(''), 'Enter']);
const ex = (state: VimEditorState, cmd: string) => executeCommandLine(state, cmd, handleKey);

describe('검색(/ n N)과 하이라이트가 순정 Vim 정규식을 사용한다', () => {
  it('/\\d\\+ 로 숫자를 찾고 n 으로 다음 숫자로 이동한다', () => {
    let state = search(createState(['id: 42, port: 8080']), '\\d\\+');
    expect(state.cursor).toEqual({ line: 0, col: 4 });
    state = press(state, ['n']);
    expect(state.cursor).toEqual({ line: 0, col: 14 });
  });

  it('/a+b 는 리터럴 a+b 를 찾는다 (magic 모드)', () => {
    const state = search(createState(['aaab then a+b']), 'a+b');
    expect(state.cursor).toEqual({ line: 0, col: 10 });
  });

  it('/\\<is\\> 는 단어 is 만, /foo\\zsbar 는 bar 위치로 이동한다', () => {
    expect(search(createState(['this is it']), '\\<is\\>').cursor).toEqual({ line: 0, col: 5 });
    expect(search(createState(['x foobar']), 'foo\\zsbar').cursor).toEqual({ line: 0, col: 5 });
  });

  it('하이라이트용 findMatches 도 같은 패턴 해석과 매치 길이를 쓴다', () => {
    expect(findMatches(['a1 b22 c333'], '\\d\\+')).toEqual([
      { line: 0, col: 1, length: 1 },
      { line: 0, col: 4, length: 2 },
      { line: 0, col: 8, length: 3 },
    ]);
    // 잘못된 패턴은 에러 대신 빈 결과
    expect(findMatches(['abc'], '\\(')).toEqual([]);
  });

  it('cgn 과 . 으로 정규식에 일치하는 곳을 차례로 바꾼다', () => {
    let state = search(createState(['v1 v22 v333']), 'v\\d\\+');
    state = press(state, ['0', 'c', 'g', 'n', 'X', 'Escape', '.']);
    expect(state.lines).toEqual(['X X v333']);
  });
});

describe('Ex 명령이 순정 Vim 정규식을 사용한다', () => {
  it(':g/\\v^\\s*$/d 로 빈 줄과 공백만 있는 줄을 지운다', () => {
    const state = ex(createState(['a', '', '   ', 'b']), 'g/\\v^\\s*$/d');
    expect(state.lines).toEqual(['a', 'b']);
  });

  it(':s 에서 \\zs 로 일치 시작을 옮기고, \\{-} 로 최소 일치를 쓴다', () => {
    expect(ex(createState(['price=10']), 's/price=\\zs\\d\\+/99/').lines).toEqual(['price=99']);
    expect(ex(createState(['<a><b>']), 's/<.\\{-}>/[]/').lines).toEqual(['[]<b>']);
  });

  it(':/pattern/ 범위 주소도 Vim 정규식으로 줄을 찾는다', () => {
    const state = ex(createState(['intro', 'step 1', 'step 2', 'end']), '/\\d$/');
    expect(state.cursor.line).toBe(1);
  });

  it(':vimgrep /\\<TODO\\>/ 은 단어 TODO 만 퀵픽스에 모은다', () => {
    const state = ex(createState(['TODO: a', 'TODOS list', 'x TODO']), 'vimgrep /\\<TODO\\>/ %');
    expect(state.quickfix?.items.map((i) => i.line)).toEqual([1, 3]);
  });

  it('=~ 와 substitute() 도 같은 해석기를 쓴다 (\\v, \\zs)', () => {
    expect(ex(createState(['x']), "echo 'v1.2' =~ '\\v^v\\d+\\.\\d+$'").commandMessage).toBe('1');
    expect(ex(createState(['x']), "echo substitute('key: value', ':\\zs\\s\\+', '', '')").commandMessage).toBe('key:value');
  });
});
