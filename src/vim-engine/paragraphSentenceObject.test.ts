import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { getParagraphObjectRange, getSentenceObjectRange } from './textObjects';
import type { VimEditorState } from './types';

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

const DOC = [
  'alpha one',   // 0
  'alpha two',   // 1
  '',            // 2
  '   ',         // 3  (공백만 있는 줄도 빈 줄로 취급)
  'beta one',    // 4
  '',            // 5
  'gamma one',   // 6
  'gamma two',   // 7
];

describe('문단 텍스트 객체 범위 (getParagraphObjectRange)', () => {
  it('ip: 문단 / 빈 줄 묶음 (공백만 있는 줄 포함)', () => {
    expect(getParagraphObjectRange(DOC, 1, 'ip')).toEqual({ startLine: 0, endLine: 1 });
    expect(getParagraphObjectRange(DOC, 2, 'ip')).toEqual({ startLine: 2, endLine: 3 });
    expect(getParagraphObjectRange(DOC, 4, 'ip')).toEqual({ startLine: 4, endLine: 4 });
  });

  it('ap: 문단 + 뒤 빈 줄, 뒤에 빈 줄이 없으면 앞 빈 줄', () => {
    expect(getParagraphObjectRange(DOC, 0, 'ap')).toEqual({ startLine: 0, endLine: 3 });
    // 마지막 문단은 뒤 빈 줄이 없으므로 앞 빈 줄을 포함
    expect(getParagraphObjectRange(DOC, 7, 'ap')).toEqual({ startLine: 5, endLine: 7 });
    // 빈 줄 위의 ap 는 빈 줄 + 다음 문단
    expect(getParagraphObjectRange(DOC, 2, 'ap')).toEqual({ startLine: 2, endLine: 4 });
  });

  it('[count]: ip 는 문단과 빈 줄 묶음을 각각 세고, ap 는 (문단+빈 줄) 단위로 센다', () => {
    expect(getParagraphObjectRange(DOC, 0, 'ip', 2)).toEqual({ startLine: 0, endLine: 3 });
    expect(getParagraphObjectRange(DOC, 0, 'ip', 3)).toEqual({ startLine: 0, endLine: 4 });
    expect(getParagraphObjectRange(DOC, 0, 'ap', 2)).toEqual({ startLine: 0, endLine: 5 });
    // 버퍼 끝을 넘으면 실패
    expect(getParagraphObjectRange(DOC, 6, 'ap', 2)).toBeNull();
  });
});

describe('문단 텍스트 객체 연산자 (dap, yip, cip, vap)', () => {
  it('dap 는 문단과 뒤 빈 줄을 줄 단위로 지우고 . 으로 반복된다', () => {
    let state = press(createState([...DOC]), ['d', 'a', 'p']);
    expect(state.lines).toEqual(['beta one', '', 'gamma one', 'gamma two']);
    expect(state.registers?.['"']?.type).toBe('line');
    state = press(state, ['.']);
    expect(state.lines).toEqual(['gamma one', 'gamma two']);
    state = press(state, ['u', 'u']);
    expect(state.lines).toEqual(DOC);
  });

  it('yap → p 로 문단을 통째로 옮길 수 있다', () => {
    let state = press(createState(['A1', 'A2', '', 'B1']), ['y', 'a', 'p']);
    expect(state.registers?.['0']?.content).toBe('A1\nA2\n');
    state = press(state, ['G', 'p']);
    expect(state.lines).toEqual(['A1', 'A2', '', 'B1', 'A1', 'A2', '']);
  });

  it('cip 는 문단을 한 줄로 바꾸고 INSERT, vip 는 VISUAL LINE 선택', () => {
    const c = press(createState([...DOC], { line: 6, col: 3 }), ['c', 'i', 'p']);
    expect(c.mode).toBe('INSERT');
    expect(c.lines).toEqual([...DOC.slice(0, 6), '']);

    const v = press(createState([...DOC], { line: 1, col: 0 }), ['v', 'i', 'p']);
    expect(v.mode).toBe('VISUAL_LINE');
    expect(v.visualAnchor?.line).toBe(0);
    expect(v.cursor.line).toBe(1);
  });

  it('gUip 는 문단 전체를 대문자로, 실패하는 d2ap 는 bell 을 울린다', () => {
    const up = press(createState([...DOC], { line: 4, col: 0 }), ['g', 'U', 'i', 'p']);
    expect(up.lines[4]).toBe('BETA ONE');

    const fail = press(createState([...DOC], { line: 6, col: 0 }), ['d', '2', 'a', 'p']);
    expect(fail.lines).toEqual(DOC);
    expect(fail.bell).toBe(true);
    expect(fail.commandMessage).toBeUndefined(); // 빈 레지스터 붙여넣기(E353)가 아닌 텍스트 객체 실패
  });

  it('카운트는 연산자 앞(2dap)과 뒤(d2ap) 모두 동작하며 다른 텍스트 객체에도 적용된다 (d2aw)', () => {
    const after = press(createState([...DOC]), ['d', '2', 'a', 'p']);
    const before = press(createState([...DOC]), ['2', 'd', 'a', 'p']);
    expect(after.lines).toEqual(['gamma one', 'gamma two']);
    expect(before.lines).toEqual(after.lines);
    expect(press(createState(['one two three']), ['d', '2', 'a', 'w']).lines).toEqual(['three']);
  });
});

describe('문장 텍스트 객체 (is, as)', () => {
  const LINE = ['Hello there. This is Vim!  Last one?'];

  it('is / as 범위: 문장, 문장 + 뒤 공백, 공백 위의 is / as', () => {
    expect(getSentenceObjectRange(LINE, { line: 0, col: 15 }, 'is')).toEqual({ startLine: 0, startCol: 13, endLine: 0, endCol: 24 });
    expect(getSentenceObjectRange(LINE, { line: 0, col: 15 }, 'as')).toEqual({ startLine: 0, startCol: 13, endLine: 0, endCol: 26 });
    // 마지막 문장은 뒤 공백이 없으므로 앞 공백을 포함
    expect(getSentenceObjectRange(LINE, { line: 0, col: 30 }, 'as')).toEqual({ startLine: 0, startCol: 25, endLine: 0, endCol: 35 });
    // 공백 위: is 는 공백만, as 는 공백 + 다음 문장
    expect(getSentenceObjectRange(LINE, { line: 0, col: 25 }, 'is')).toEqual({ startLine: 0, startCol: 25, endLine: 0, endCol: 26 });
    expect(getSentenceObjectRange(LINE, { line: 0, col: 25 }, 'as')).toEqual({ startLine: 0, startCol: 25, endLine: 0, endCol: 35 });
  });

  it('das / dis / cis 로 문장을 지우고 바꾼다', () => {
    expect(press(createState([...LINE], { line: 0, col: 15 }), ['d', 'a', 's']).lines).toEqual(['Hello there. Last one?']);
    expect(press(createState([...LINE], { line: 0, col: 2 }), ['d', 'i', 's']).lines).toEqual([' This is Vim!  Last one?']);

    let state = press(createState([...LINE], { line: 0, col: 15 }), ['c', 'i', 's']);
    expect(state.mode).toBe('INSERT');
    state = press(state, [...'Hi.'.split(''), 'Escape']);
    expect(state.lines).toEqual(['Hello there. Hi.  Last one?']);
  });

  it('[count]as 는 여러 문장을, d2is 는 문장과 뒤 공백을 지운다', () => {
    expect(press(createState([...LINE], { line: 0, col: 0 }), ['d', '2', 'a', 's']).lines).toEqual(['Last one?']);
    expect(press(createState([...LINE], { line: 0, col: 0 }), ['d', '2', 'i', 's']).lines).toEqual(['This is Vim!  Last one?']);
  });

  it('문장은 여러 줄에 걸칠 수 있고, 닫는 따옴표·괄호가 붙어도 끝을 인식한다', () => {
    const multi = ['First line', 'continues here. "Quoted end." Tail'];
    expect(getSentenceObjectRange(multi, { line: 0, col: 3 }, 'is')).toEqual({ startLine: 0, startCol: 0, endLine: 1, endCol: 14 });
    expect(press(createState([...multi], { line: 0, col: 3 }), ['d', 'a', 's']).lines).toEqual(['"Quoted end." Tail']);
    expect(getSentenceObjectRange(multi, { line: 1, col: 18 }, 'is')).toEqual({ startLine: 1, startCol: 16, endLine: 1, endCol: 28 });
  });

  it('빈 줄은 문장 경계이며, vis 는 문자 단위 VISUAL 선택', () => {
    expect(getSentenceObjectRange(['a.', '', 'b.'], { line: 1, col: 0 }, 'is')).toBeNull();
    const v = press(createState([...LINE], { line: 0, col: 15 }), ['v', 'i', 's']);
    expect(v.mode).toBe('VISUAL');
    expect(v.visualAnchor).toEqual({ line: 0, col: 13 });
    expect(v.cursor).toEqual({ line: 0, col: 24 });
  });
});
