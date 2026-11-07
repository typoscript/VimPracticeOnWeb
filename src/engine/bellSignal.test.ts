import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import type { VimEditorState } from '../types/vim';

function createState(lines: string[], cursor = { line: 0, col: 0 }): VimEditorState {
  return {
    lines,
    cursor,
    mode: 'NORMAL',
  };
}

function press(state: VimEditorState, keys: string[]): VimEditorState {
  return keys.reduce((s, k) => handleKey(s, k), state);
}

describe('Bell Signal: 키 실패 시 매크로 중단 (실제 Vim 동작)', () => {
  it('마지막 줄에서 j가 실패하면 남은 반복 횟수를 버린다 (10@a)', () => {
    let state = press(createState(['abcdef', 'abcdef', 'abcdef']), ['q', 'a', 'x', 'j', 'q']);
    state = press(state, ['1', '0', '@', 'a']);
    expect(state.lines).toEqual(['bcdef', 'bcdef', 'bcdef']);
    expect(state.cursor.line).toBe(2);
  });

  it('재귀 매크로(qb x j @b q)는 파일 끝에서 멈춘다', () => {
    // qbq 로 레지스터 b를 비운 뒤 재귀 매크로 녹화
    let state = press(createState(['abcdef', 'abcdef', 'abcdef']), ['q', 'b', 'q', 'q', 'b', 'x', 'j', '@', 'b', 'q']);
    expect(state.lines).toEqual(['bcdef', 'abcdef', 'abcdef']);

    state = press(state, ['@', 'b']);
    expect(state.lines).toEqual(['bcdef', 'bcdef', 'bcdef']);
    // 실패로 중단된 매크로는 bell을 남기고, bell은 다음 키 입력에서 사라진다
    expect(state.bell).toBe(true);
    expect(handleKey(state, '0').bell).toBeUndefined();
  });

  it('f{char} 대상 문자를 찾지 못하면 이후 키를 실행하지 않는다', () => {
    let state = press(createState(['a,b,c,d']), ['q', 'c', 'f', ',', 'r', ';', 'q']);
    expect(state.lines[0]).toBe('a;b,c,d');

    // 쉼표가 2개 남았으므로 5번 반복해도 2번만 치환되고, 실패 후 r; 은 실행되지 않는다
    state = press(state, ['5', '@', 'c']);
    expect(state.lines[0]).toBe('a;b;c;d');
  });

  it('검색 실패(E486) 시 매크로를 중단한다', () => {
    const withMacro = (content: string[]): VimEditorState => ({
      ...createState(['abc', 'def']),
      registers: { e: { type: 'macro', content } },
    });

    // 대조군: 검색 성공 시 이후 x 가 실행된다
    const found = press(withMacro(['/', 'd', 'Enter', 'x']), ['@', 'e']);
    expect(found.lines).toEqual(['abc', 'ef']);

    // 검색 실패 시 x 는 실행되지 않는다
    const missing = press(withMacro(['/', 'z', 'z', 'Enter', 'x']), ['@', 'e']);
    expect(missing.lines).toEqual(['abc', 'def']);
  });

  it('실패한 키만 bell을 울리고, bell은 다음 키 입력에서 사라진다', () => {
    const base = createState(['abc', 'def']);
    expect(handleKey(base, 'j').bell).toBeUndefined();
    expect(handleKey(base, 'x').bell).toBeUndefined();
    expect(handleKey(base, '0').bell).toBeUndefined();
    // 첫 줄의 k, 줄 시작의 h, 없는 문자 f 는 실패
    expect(handleKey(base, 'k').bell).toBe(true);
    expect(handleKey(base, 'h').bell).toBe(true);
    expect(press(base, ['f', 'z']).bell).toBe(true);
    expect(press(base, ['/', 'z', 'Enter']).bell).toBe(true);

    const afterBell = press(base, ['k', 'l']);
    expect(afterBell.bell).toBeUndefined();
    expect(afterBell.cursor.col).toBe(1);
  });

  it('매크로 밖에서 실패한 모션은 다음 매크로 실행에 영향을 주지 않는다', () => {
    let state = press(createState(['abc', 'abc']), ['q', 'a', 'x', 'q']);
    state = press(state, ['k', 'k']); // 매크로 밖의 실패 모션
    state = press(state, ['@', 'a']);
    expect(state.lines[0]).toBe('c');
  });

  it('. 반복은 실패한 키에서 중단된다', () => {
    let state = press(createState(['a', 'b', 'c']), ['d', 'j']);
    expect(state.lines).toEqual(['c']);
    state = press(state, ['.']);
    expect(state.lines).toEqual(['c']);
    expect(state.bell).toBe(true);
  });

  it(':normal 은 줄마다 실패한 키 이후를 버린다 (:%norm jx)', () => {
    const state = press(createState(['a1', 'b2', 'c3']), [':', '%', 'n', 'o', 'r', 'm', ' ', 'j', 'x', 'Enter']);
    // 마지막 줄에서는 j가 실패하므로 x가 실행되지 않는다
    expect(state.lines).toEqual(['a1', '2', '3']);
  });

  it('키매핑 확장도 실패한 키에서 중단된다', () => {
    let state = press(createState(['abc', 'def']), [':', 'n', 'n', 'o', 'r', 'e', 'm', 'a', 'p', ' ', 'Q', ' ', 'k', 'x', 'Enter']);
    // 대조군: 두 번째 줄에서는 k 성공 후 x 실행
    const control = press({ ...state, cursor: { line: 1, col: 0 } }, ['Q']);
    expect(control.lines).toEqual(['bc', 'def']);

    state = press(state, ['Q']);
    // 첫 줄에서 k가 실패하므로 x는 실행되지 않는다
    expect(state.lines).toEqual(['abc', 'def']);
  });

  it('매크로 안의 dj 실패(마지막 줄)도 매크로를 중단시킨다', () => {
    let state = press(createState(['1', '2', '3', '4', '5']), ['q', 'a', 'd', 'j', 'q']);
    expect(state.lines).toEqual(['3', '4', '5']);
    state = press(state, ['9', '@', 'a']);
    // 3,4 삭제 → 5 한 줄 남은 상태에서 dj 실패로 중단
    expect(state.lines).toEqual(['5']);
  });
});
