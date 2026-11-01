import { describe, it, expect } from 'vitest';
import { formatLinesRange, formatIndentVisual } from './lineOperators';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';

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
    expect(next.lines).toEqual([
      'const root = {',
      '  childA: 1,',
      '  childB: 2,',
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
