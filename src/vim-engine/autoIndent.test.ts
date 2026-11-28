import { describe, it, expect } from 'vitest';
import { formatLinesRange, formatIndentVisual } from './lineOperators';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';

describe('자동 들여쓰기 정렬 연산자 (=, ==, =G, gg=G, Visual =)', () => {
  it('formatLinesRange: 중첩 중괄호 블록 깊이에 따라 2 spaces 단위로 정렬한다', () => {
    const brokenLines = [
      'function test() {',
      'const a = 1;',
      'if (a > 0) {',
      'return true;',
      '}',
      '}',
    ];

    const formatted = formatLinesRange(brokenLines, 0, brokenLines.length - 1);
    expect(formatted).toEqual([
      'function test() {',
      '  const a = 1;',
      '  if (a > 0) {',
      '    return true;',
      '  }',
      '}',
    ]);
  });

  it('formatLinesRange: 문자열 리터럴 내부의 괄호는 들여쓰기 깊이 계산에서 제외한다', () => {
    const lines = [
      'function greet() {',
      'const msg = "{not a block}";',
      'return msg;',
      '}',
    ];

    const formatted = formatLinesRange(lines, 0, lines.length - 1);
    expect(formatted[1]).toBe('  const msg = "{not a block}";');
    expect(formatted[2]).toBe('  return msg;');
  });

  it('==: 현재 줄의 들여쓰기를 앞뒤 문맥의 {} 중첩 깊이에 맞게 자동 보정한다', () => {
    const state: VimEditorState = {
      lines: [
        'function test() {',
        'const x = 100;', // 엉망인 들여쓰기
        '}',
      ],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
    };

    let next = handleKey(state, '=');
    next = handleKey(next, '=');
    expect(next.lines[1]).toBe('  const x = 100;');
    expect(next.mode).toBe('NORMAL');
  });

  it('=G: 현재 줄부터 파일 끝까지의 모든 들여쓰기를 일괄 정렬한다', () => {
    const state: VimEditorState = {
      lines: [
        'const root = {',
        'childA: 1,',
        'childB: 2,',
        '};',
      ],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
    };

    let next = handleKey(state, '=');
    next = handleKey(next, 'G');
    // nvim -u NONE 의 C 들여쓰기는 '{' 바로 다음의 "childA:" 를 점프 레이블로 보고 0열에 두며,
    // 다음 줄은 레이블 뒤 값의 열에 맞춥니다 (실제 Neovim 결과).
    expect(next.lines).toEqual([
      'const root = {',
      'childA: 1,',
      '        childB: 2,',
      '};',
    ]);
  });

  it('gg=G: 파일 전체를 처음부터 끝까지 자동 정렬한다', () => {
    const state: VimEditorState = {
      lines: [
        'function run() {',
        'console.log("start");',
        'if (true) {',
        'doSomething();',
        '}',
        '}',
      ],
      cursor: { line: 3, col: 0 },
      mode: 'NORMAL',
    };

    let next = handleKey(state, 'g');
    next = handleKey(next, 'g');
    next = handleKey(next, '=');
    next = handleKey(next, 'G');

    expect(next.lines).toEqual([
      'function run() {',
      '  console.log("start");',
      '  if (true) {',
      '    doSomething();',
      '  }',
      '}',
    ]);
  });

  it('=i{: 중괄호 내부 전체의 들여쓰기를 한 번에 정렬한다', () => {
    const state: VimEditorState = {
      lines: [
        'function demo() {',
        'const a = 1;',
        'const b = 2;',
        '}',
      ],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
    };

    let next = handleKey(state, '=');
    next = handleKey(next, 'i');
    next = handleKey(next, '{');

    expect(next.lines[1]).toBe('  const a = 1;');
    expect(next.lines[2]).toBe('  const b = 2;');
  });

  it('Visual 모드 =: 선택된 영역의 들여쓰기를 자동 정렬한다', () => {
    const state: VimEditorState = {
      lines: [
        'function main() {',
        'line1();',
        'line2();',
        '}',
      ],
      cursor: { line: 2, col: 0 },
      visualAnchor: { line: 1, col: 0 },
      mode: 'VISUAL_LINE',
    };

    const next = formatIndentVisual(state);
    expect(next.lines[1]).toBe('  line1();');
    expect(next.lines[2]).toBe('  line2();');
    expect(next.mode).toBe('NORMAL');
  });
});

// 아래 기대값은 nvim --headless -u NONE (ts=2 sw=2 et nosol) 에서 같은 키를 실행한 결과입니다.
describe('= 연산자: 모션·커서·반복·실행 취소 (Neovim 대조)', () => {
  const TEXT = ['function f(a) {', 'if (a) {', 'x = 1 +', '2;', '} else {', 'y();', '}', 'foo(a,', 'b);', '}', 'tail();'];
  const run = (keys: string[], cursor = { line: 0, col: 0 }) =>
    keys.reduce((s, k) => handleKey(s, k), { lines: [...TEXT], cursor, mode: 'NORMAL' } as VimEditorState);

  it('C 들여쓰기 규칙: 이어지는 줄은 shiftwidth, 열린 괄호 안은 2*shiftwidth 더 들여쓴다', () => {
    const next = run(['g', 'g', '=', 'G']);
    expect(next.lines).toEqual([
      'function f(a) {',
      '  if (a) {',
      '    x = 1 +',
      '      2;',
      '  } else {',
      '    y();',
      '  }',
      '  foo(a,',
      '      b);',
      '}',
      'tail();',
    ]);
    expect(next.cursor).toEqual({ line: 0, col: 0 });
  });

  it('={motion}: } 처럼 아무 모션이나 받아 그 줄 범위를 들여쓴다', () => {
    const next = run(['j', '=', '}']);
    expect(next.lines.slice(1, 4)).toEqual(['  if (a) {', '    x = 1 +', '      2;']);
    expect(next.cursor).toEqual({ line: 1, col: 0 });
  });

  it('nostartofline: 커서는 범위 첫 줄의 기억한 열(curswant)로 간다 ($ 뒤면 줄 끝)', () => {
    const next = run(['j', 'j', '$', '=', 'k']);
    expect(next.lines.slice(1, 3)).toEqual(['  if (a) {', '    x = 1 +']);
    expect(next.cursor).toEqual({ line: 1, col: 9 });
  });

  it('. 반복은 같은 줄 수를 다시 들여쓰고, 바뀐 것이 없으면 실행 취소 단위를 만들지 않는다', () => {
    const repeated = run(['j', 'j', '=', '=', 'j', '.']);
    expect(repeated.lines.slice(2, 4)).toEqual(['  x = 1 +', '    2;']);
    expect(repeated.cursor).toEqual({ line: 3, col: 0 });

    const noop = run(['=', '=', 'u']);
    expect(noop.lines).toEqual(TEXT);
  });
});
