import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { parseSearchQuery } from './search';
import type { VimEditorState } from './types';

function run(lines: string[], keys: string[], cursor = { line: 0, col: 0 }): VimEditorState {
  let state: VimEditorState = { lines, cursor, mode: 'NORMAL' };
  for (const k of keys) state = handleKey(state, k);
  return state;
}

const K = (s: string) => s.split('');
const LINES = ['foo bar baz foo qux', '  second foo line', 'third', 'foo end'];

describe('검색 오프셋 파싱 (? 구분자)', () => {
  it('? 검색은 ? 로 오프셋을 구분하고 \\? 는 리터럴 물음표다', () => {
    expect(parseSearchQuery('bar?e', '?')).toEqual({ pattern: 'bar', offset: { type: 'end', offset: 0 } });
    expect(parseSearchQuery('a\\?b?b+1', '?')).toEqual({ pattern: 'a?b', offset: { type: 'start', offset: 1 } });
    expect(parseSearchQuery('a/b?e', '?').pattern).toBe('a/b');
  });
});

describe('검색 오프셋 + 연산자 (실제 Neovim 으로 확인한 결과)', () => {
  it('d/foo/e : 커서가 매치 시작이어도 매치 끝까지 지운다', () => {
    const s = run([...LINES], [...K('d/foo/e'), 'Enter']);
    expect(s.lines[0]).toBe(' bar baz foo qux');
    expect(s.mode).toBe('NORMAL');
  });

  it('d?bar?e : 위쪽 검색 + e 는 inclusive 라 커서 글자까지 포함', () => {
    const s = run([...LINES], [...K('wwwd?bar?e'), 'Enter']);
    expect(s.lines[0]).toBe('foo baoo qux');
  });

  it('d?foo? : 위쪽 검색 기본은 exclusive', () => {
    const s = run([...LINES], [...K('$d?foo?'), 'Enter']);
    expect(s.lines[0]).toBe('foo bar baz x');
  });

  it('d/foo/+1 : 줄 오프셋은 줄 단위 연산', () => {
    const s = run([...LINES], [...K('jd/foo/+1'), 'Enter']);
    expect(s.lines).toEqual(['foo bar baz foo qux', 'foo end']);
  });

  it('y?bar?b 후 p : 위쪽 검색 yank', () => {
    const s = run([...LINES], [...K('wwwy?bar?b'), 'Enter']);
    expect(s.clipboard?.content).toBe('bar baz ');
  });

  it('. 로 ?-연산자 반복', () => {
    const s = run(['a1 b2 c3 d4'], [...K('$d?b?'), 'Enter', 'u', '$', '.']);
    expect(s.lines[0]).toBe('a1 4');
  });
});

describe('? 검색, n/N 방향, //e', () => {
  it('?foo 로 위로 이동하고 n 은 계속 위, N 은 아래로', () => {
    let s = run([...LINES], [...K('G$?foo'), 'Enter']);
    expect(s.cursor).toEqual({ line: 3, col: 0 });
    s = handleKey(s, 'n');
    expect(s.cursor).toEqual({ line: 1, col: 9 });
    s = handleKey(s, 'N');
    expect(s.cursor).toEqual({ line: 3, col: 0 });
  });

  it('위쪽 검색은 처음 위로 넘어가면 맨 아래로 순환한다', () => {
    const s = run([...LINES], [...K('?foo'), 'Enter']);
    expect(s.cursor).toEqual({ line: 3, col: 0 });
  });

  it('/foo 후 //e : 빈 패턴은 직전 패턴을 재사용하며 오프셋은 새로 적용', () => {
    const s = run([...LINES], ['l', ...K('/foo'), 'Enter', ...K('//e'), 'Enter']);
    expect(s.cursor).toEqual({ line: 0, col: 14 });
    expect(s.lastSearchOffset).toEqual({ type: 'end', offset: 0 });
  });

  it('패턴이 없을 때 //e 는 E35', () => {
    const s = run([...LINES], [...K('//e'), 'Enter']);
    expect(s.commandMessage).toContain('E35');
    expect(s.bell).toBe(true);
  });

  it('/foo/e 후 n 은 매치 끝에 머물지 않고 다음 매치 끝으로 간다', () => {
    let s = run([...LINES], [...K('/foo/e'), 'Enter']);
    expect(s.cursor).toEqual({ line: 0, col: 2 });
    s = handleKey(s, 'n');
    expect(s.cursor).toEqual({ line: 0, col: 14 });
  });

  it('* 는 오프셋과 방향을 초기화한다', () => {
    let s = run([...LINES], [...K('?bar?e'), 'Enter']);
    s = handleKey(s, '*');
    expect(s.lastSearchOffset).toBeNull();
    expect(s.lastSearchDirection).toBe('forward');
  });
});
