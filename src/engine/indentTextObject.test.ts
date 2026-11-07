import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { getIndentObjectRange } from './textObjects';
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

const PYTHON = [
  'class Cart:',            // 0
  '    def total(self):',   // 1
  '        s = 0',          // 2
  '',                       // 3
  '        for i in self:', // 4
  '            s += i',     // 5
  '        return s',       // 6
  '',                       // 7
  '    def size(self):',    // 8
  '        return 1',       // 9
];

describe('Indent Text Object: 범위 계산 (getIndentObjectRange)', () => {
  it('ii는 같거나 더 깊은 들여쓰기의 연속 줄을 선택하고 중간 빈 줄은 포함, 끝 빈 줄은 제외한다', () => {
    expect(getIndentObjectRange(PYTHON, 2, 'ii')).toEqual({ startLine: 2, endLine: 6 });
    expect(getIndentObjectRange(PYTHON, 5, 'ii')).toEqual({ startLine: 5, endLine: 5 });
  });

  it('ai는 위의 헤더 줄을, aI는 아래 경계 줄까지 포함한다', () => {
    expect(getIndentObjectRange(PYTHON, 2, 'ai')).toEqual({ startLine: 1, endLine: 6 });
    expect(getIndentObjectRange(PYTHON, 2, 'aI')).toEqual({ startLine: 1, endLine: 8 });
    expect(getIndentObjectRange(PYTHON, 2, 'iI')).toEqual({ startLine: 2, endLine: 6 });
  });

  it('[count]는 한 단계씩 바깥 블록으로 확장한다', () => {
    expect(getIndentObjectRange(PYTHON, 5, 'ii', 2)).toEqual({ startLine: 2, endLine: 6 });
    expect(getIndentObjectRange(PYTHON, 5, 'ii', 3)).toEqual({ startLine: 1, endLine: 9 });
  });

  it('빈 줄에서는 아래쪽 가장 가까운 줄을 기준으로 하고, 탭은 tabstop 너비로 계산한다', () => {
    expect(getIndentObjectRange(PYTHON, 3, 'ii')).toEqual({ startLine: 2, endLine: 6 });
    const tabbed = ['if x:', '\ty = 1', '        z = 2', 'w = 3'];
    expect(getIndentObjectRange(tabbed, 1, 'ii', 1, 8)).toEqual({ startLine: 1, endLine: 2 });
    expect(getIndentObjectRange(['', '  '], 0, 'ii')).toBeNull();
  });
});

describe('Indent Text Object: 연산자 조합', () => {
  it('dii는 함수 본문을 줄 단위로 삭제하고 p로 붙여넣을 수 있다', () => {
    let state = press(createState([...PYTHON], { line: 5, col: 12 }), ['k', 'k', 'd', 'i', 'i']);
    // 커서는 line 3(빈 줄)에서 시작 → 아래 기준 줄 4의 들여쓰기(8)로 블록 2~6 삭제
    expect(state.lines).toEqual(['class Cart:', '    def total(self):', '', '    def size(self):', '        return 1']);
    expect(state.clipboard?.type).toBe('line');
    expect(state.registers?.['"']?.type).toBe('line');

    state = press(state, ['u']);
    expect(state.lines).toEqual(PYTHON);
  });

  it('dai는 헤더 줄까지 삭제하고 . 으로 반복된다', () => {
    let state = press(createState([...PYTHON], { line: 9, col: 8 }), ['d', 'a', 'i']);
    expect(state.lines).toEqual(PYTHON.slice(0, 8));

    state = press(state, ['k', '.']);
    expect(state.lines).toEqual(['class Cart:', '']);
  });

  it('cii는 블록을 들여쓰기만 남긴 한 줄로 바꾸고 INSERT 모드로 진입한다', () => {
    let state = press(createState([...PYTHON], { line: 9, col: 8 }), ['c', 'i', 'i']);
    expect(state.mode).toBe('INSERT');
    expect(state.lines[9]).toBe('        ');
    expect(state.cursor).toEqual({ line: 9, col: 8 });

    state = press(state, ['p', 'a', 's', 's', 'Escape']);
    expect(state.lines[9]).toBe('        pass');
  });

  it('yii는 줄 단위로 복사하고 커서를 블록 첫 줄로 옮긴다', () => {
    const state = press(createState([...PYTHON], { line: 6, col: 8 }), ['y', 'i', 'i']);
    expect(state.lines).toEqual(PYTHON);
    expect(state.cursor.line).toBe(2);
    expect(state.registers?.['0']?.content).toBe(PYTHON.slice(2, 7).join('\n'));
  });

  it('vii는 VISUAL LINE 모드로 블록을 선택한다', () => {
    const state = press(createState([...PYTHON], { line: 4, col: 8 }), ['v', 'i', 'i']);
    expect(state.mode).toBe('VISUAL_LINE');
    expect(state.visualAnchor?.line).toBe(2);
    expect(state.cursor.line).toBe(6);

    const deleted = press(state, ['d']);
    expect(deleted.lines).toEqual([...PYTHON.slice(0, 2), ...PYTHON.slice(7)]);
  });

  it('gUii는 블록 전체를 대문자로 바꾼다', () => {
    const state = press(createState(['a:', '  bc', '  de', 'f'], { line: 1, col: 2 }), ['g', 'U', 'i', 'i']);
    expect(state.lines).toEqual(['a:', '  BC', '  DE', 'f']);
  });
});
