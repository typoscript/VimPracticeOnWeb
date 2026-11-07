import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { isMacroKeyFailure } from './macroAbort';
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

describe('Macro Abort: 모션 실패 시 매크로 중단 (실제 Vim 동작)', () => {
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
    // 중단 신호는 최상위 상태로 새어 나오지 않는다
    expect(state.macroAborted).toBeUndefined();
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

  it('성공한 모션과 편집 키는 실패로 판정하지 않는다', () => {
    const base = createState(['abc', 'def']);
    expect(isMacroKeyFailure(base, handleKey(base, 'j'), 'j')).toBe(false);
    expect(isMacroKeyFailure(base, handleKey(base, 'x'), 'x')).toBe(false);
    expect(isMacroKeyFailure(base, handleKey(base, '0'), '0')).toBe(false);
    // 첫 줄의 k, 줄 시작의 h 는 실패
    expect(isMacroKeyFailure(base, handleKey(base, 'k'), 'k')).toBe(true);
    expect(isMacroKeyFailure(base, handleKey(base, 'h'), 'h')).toBe(true);
  });

  it('매크로 밖에서 실패한 모션은 다음 매크로 실행에 영향을 주지 않는다', () => {
    let state = press(createState(['abc', 'abc']), ['q', 'a', 'x', 'q']);
    state = press(state, ['k', 'k']); // 매크로 밖의 실패 모션
    state = press(state, ['@', 'a']);
    expect(state.lines[0]).toBe('c');
  });
});
