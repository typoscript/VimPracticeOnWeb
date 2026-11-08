import { describe, it, expect } from 'vitest';
import { executeCommandLine } from './commandLine';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';

describe('Vim Diff Integration - :diffsplit, ]c, [c, do, dp', () => {
  const setupDiffState = (): VimEditorState => {
    const initial: VimEditorState = {
      lines: [
        'function calculateTotal(items: number[]) {',
        '  let total = 0;',
        '  for (const item of items) {',
        '    total += item * 0.9; // old discount',
        '  }',
        '  return total;',
        '}',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'main.ts',
      secondaryFilename: 'patch.ts',
      secondaryLines: [
        'function calculateTotal(items: number[]) {',
        '  let total = 0;',
        '  for (const item of items) {',
        '    total += item * 0.8; // new 20% discount',
        '  }',
        '  return total;',
        '}',
      ],
    };

    // :diffsplit patch.ts 실행
    return executeCommandLine(initial, 'diffsplit patch.ts');
  };

  it(':diffsplit 실행 후 세로 분할 창 및 diff Hunk가 감지된다', () => {
    const state = setupDiffState();
    expect(state.diffMode).toBe(true);
    expect(state.splitDirection).toBe('vertical');
    expect(state.diffHunks?.length).toBe(1);
    expect(state.diffHunks?.[0].pane0Start).toBe(3);
  });

  it(']c 키를 누르면 다음 변경점(라인 3)으로 점프한다', () => {
    let state = setupDiffState();
    expect(state.cursor.line).toBe(0);

    // ] 누른 후 c 누름
    state = handleKey(state, ']');
    expect(state.pendingKeys).toBe(']');
    state = handleKey(state, 'c');

    expect(state.cursor.line).toBe(3);
    expect(state.pendingKeys).toBeUndefined();
  });

  it('do (diffobtain) 키를 누르면 상대 창의 패치 코드를 가져와 버퍼를 일치시킨다', () => {
    let state = setupDiffState();
    // 변경점으로 이동
    state = handleKey(state, ']');
    state = handleKey(state, 'c');
    expect(state.cursor.line).toBe(3);

    // do 입력
    state = handleKey(state, 'd');
    expect(state.pendingKeys).toBe('d');
    state = handleKey(state, 'o');

    expect(state.lines[3]).toBe('    total += item * 0.8; // new 20% discount');
    // 변경점이 해결되어 diffHunks가 0개여야 함
    expect(state.diffHunks?.length).toBe(0);
    expect(state.commandMessage).toContain('가져왔습니다 (do');

    // u (undo) 실행 시 원래 코드로 복구되고 diffHunk가 다시 나타남
    state = handleKey(state, 'u');
    expect(state.lines[3]).toBe('    total += item * 0.9; // old discount');
  });

  it('dp (diffput) 키를 누르면 현재 코드를 상대 창으로 밀어넣는다', () => {
    let state = setupDiffState();
    // 변경점으로 이동
    state = handleKey(state, ']');
    state = handleKey(state, 'c');

    // dp 입력
    state = handleKey(state, 'd');
    state = handleKey(state, 'p');

    expect(state.splitPanes?.[1].lines[3]).toBe('    total += item * 0.9; // old discount');
    expect(state.diffHunks?.length).toBe(0);
    expect(state.commandMessage).toContain('밀어넣었습니다 (dp');
  });

  it(':diffoff 실행 시 diff 모드가 정상 해제된다', () => {
    let state = setupDiffState();
    expect(state.diffMode).toBe(true);

    state = executeCommandLine(state, 'diffoff');
    expect(state.diffMode).toBe(false);
    expect(state.diffHunks).toBeUndefined();
  });
});
