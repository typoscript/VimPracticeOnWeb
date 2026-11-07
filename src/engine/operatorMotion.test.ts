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

const LINES = ['one two', 'three four', 'five six'];

describe('Operator + Motion: 줄 단위 모션 (j, k, G, gg)', () => {
  it('dj / dk / [count]dj 는 줄 단위로 삭제하고 줄 단위 레지스터에 저장한다', () => {
    const dj = press(createState([...LINES]), ['d', 'j']);
    expect(dj.lines).toEqual(['five six']);
    expect(dj.registers?.['"']?.type).toBe('line');
    expect(dj.registers?.['"']?.content).toBe('one two\nthree four');

    expect(press(createState([...LINES], { line: 2, col: 0 }), ['d', 'k']).lines).toEqual(['one two']);
    expect(press(createState([...LINES]), ['2', 'd', 'j']).lines).toEqual(['']);
  });

  it('dG / dgg / d{n}G 는 대상 줄까지 삭제한다', () => {
    expect(press(createState([...LINES], { line: 1, col: 0 }), ['d', 'G']).lines).toEqual(['one two']);
    expect(press(createState([...LINES], { line: 1, col: 0 }), ['d', 'g', 'g']).lines).toEqual(['five six']);
    expect(press(createState([...LINES]), ['d', '2', 'G']).lines).toEqual(['five six']);
    expect(press(createState([...LINES], { line: 2, col: 0 }), ['2', 'd', 'g', 'g']).lines).toEqual(['one two']);
  });

  it('cj 는 두 줄을 들여쓰기만 남긴 한 줄로 바꾸고 INSERT 모드로 진입한다', () => {
    let state = press(createState(['  a', '  b', 'c'], { line: 0, col: 2 }), ['c', 'j']);
    expect(state.mode).toBe('INSERT');
    expect(state.lines).toEqual(['  ', 'c']);
    state = press(state, ['x', 'Escape']);
    expect(state.lines).toEqual(['  x', 'c']);
  });

  it('yj / yk 는 버퍼를 바꾸지 않고 복사하며, yk 는 커서를 위 줄로 옮긴다', () => {
    const yj = press(createState([...LINES]), ['y', 'j']);
    expect(yj.lines).toEqual(LINES);
    expect(yj.registers?.['0']?.content).toBe('one two\nthree four');

    const yk = press(createState([...LINES], { line: 1, col: 3 }), ['y', 'k']);
    expect(yk.cursor).toEqual({ line: 0, col: 3 });
  });

  it('dj 는 . 으로 반복되고 u 로 되돌릴 수 있다', () => {
    let state = press(createState(['1', '2', '3', '4', '5']), ['d', 'j', '.']);
    expect(state.lines).toEqual(['5']);
    state = press(state, ['u', 'u']);
    expect(state.lines).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('Operator + Motion: 배타적 문자 단위 모션 (h, l, b, B, ^)', () => {
  it('dl / dh / 3dl 은 커서 문자 기준으로 삭제한다', () => {
    expect(press(createState([...LINES], { line: 0, col: 2 }), ['d', 'l']).lines[0]).toBe('on two');
    expect(press(createState([...LINES], { line: 0, col: 2 }), ['d', 'h']).lines[0]).toBe('oe two');
    expect(press(createState([...LINES], { line: 0, col: 0 }), ['3', 'd', 'l']).lines[0]).toBe(' two');
    // 마지막 문자에서 dl 은 x 와 같다
    expect(press(createState([...LINES], { line: 0, col: 6 }), ['d', 'l']).lines[0]).toBe('one tw');
  });

  it('db / dB / d^ 는 커서 앞까지 삭제한다 (커서 문자 제외)', () => {
    expect(press(createState([...LINES], { line: 0, col: 4 }), ['d', 'b']).lines[0]).toBe('two');
    expect(press(createState(['a.b c.d'], { line: 0, col: 4 }), ['d', 'B']).lines[0]).toBe('c.d');
    expect(press(createState(['  foo bar'], { line: 0, col: 6 }), ['d', '^']).lines[0]).toBe('  bar');
  });

  it('줄 시작에서 db 는 이전 줄 끝까지만 삭제한다 (exclusive 규칙)', () => {
    const state = press(createState([...LINES], { line: 1, col: 0 }), ['d', 'b']);
    expect(state.lines).toEqual(['one ', 'three four', 'five six']);
  });

  it('cb / yb 는 INSERT 진입 / 복사 후 커서를 시작 위치로 옮긴다', () => {
    const cb = press(createState([...LINES], { line: 0, col: 4 }), ['c', 'b']);
    expect(cb.mode).toBe('INSERT');
    expect(cb.lines[0]).toBe('two');

    const yb = press(createState([...LINES], { line: 0, col: 4 }), ['y', 'b']);
    expect(yb.registers?.['0']?.content).toBe('one ');
    expect(yb.cursor).toEqual({ line: 0, col: 0 });
  });
});

describe('Operator + Motion: 실패 시 bell (버퍼 변경 없음)', () => {
  it('마지막 줄의 dj, 첫 줄의 dk, 줄 시작의 dh, 버퍼 시작의 db 는 실패한다', () => {
    for (const [keys, cursor] of [
      [['d', 'j'], { line: 2, col: 0 }],
      [['d', 'k'], { line: 0, col: 0 }],
      [['d', 'h'], { line: 0, col: 0 }],
      [['d', 'b'], { line: 0, col: 0 }],
      [['c', 'j'], { line: 2, col: 0 }],
    ] as [string[], { line: number; col: number }][]) {
      const state = press(createState([...LINES], cursor), keys);
      expect(state.lines, keys.join('')).toEqual(LINES);
      expect(state.mode).toBe('NORMAL');
      expect(state.bell, keys.join('')).toBe(true);
    }
  });
});
