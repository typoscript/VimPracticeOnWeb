import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';

describe('Viewport and Screen Navigation (zz, zt, zb, H, M, L, Ctrl-d, Ctrl-u)', () => {
  const makeSampleLines = (count = 30) =>
    Array.from({ length: count }, (_, i) => `Line ${i + 1}: code content`);

  it('zz: 현재 커서 행을 화면 정중앙으로 스크롤한다', () => {
    let state: VimEditorState = {
      lines: makeSampleLines(30),
      cursor: { line: 15, col: 0 },
      mode: 'NORMAL',
      viewport: { topRow: 0, visibleRows: 10 },
    };

    state = handleKey(state, 'z');
    expect(state.pendingKeys).toBe('z');
    state = handleKey(state, 'z');

    // line 15 - Math.floor(10 / 2) = 15 - 5 = 10
    expect(state.viewport?.topRow).toBe(10);
    expect(state.cursor.line).toBe(15);
  });

  it('zt: 현재 커서 행을 화면 최상단으로 스크롤한다', () => {
    let state: VimEditorState = {
      lines: makeSampleLines(30),
      cursor: { line: 12, col: 0 },
      mode: 'NORMAL',
      viewport: { topRow: 5, visibleRows: 10 },
    };

    state = handleKey(state, 'z');
    state = handleKey(state, 't');

    expect(state.viewport?.topRow).toBe(12);
  });

  it('zb: 현재 커서 행을 화면 최하단으로 스크롤한다', () => {
    let state: VimEditorState = {
      lines: makeSampleLines(30),
      cursor: { line: 18, col: 0 },
      mode: 'NORMAL',
      viewport: { topRow: 5, visibleRows: 10 },
    };

    state = handleKey(state, 'z');
    state = handleKey(state, 'b');

    // 18 - 10 + 1 = 9
    expect(state.viewport?.topRow).toBe(9);
  });

  it('H, M, L: 화면 최상단, 중앙, 최하단 행으로 점프한다', () => {
    let state: VimEditorState = {
      lines: makeSampleLines(30),
      cursor: { line: 12, col: 0 },
      mode: 'NORMAL',
      viewport: { topRow: 10, visibleRows: 10 },
    };

    // H: 최상단 line 10
    state = handleKey(state, 'H');
    expect(state.cursor.line).toBe(10);

    // M: 중앙 line 10 + 5 = 15
    state = handleKey(state, 'M');
    expect(state.cursor.line).toBe(15);

    // L: 최하단 line 10 + 10 - 1 = 19
    state = handleKey(state, 'L');
    expect(state.cursor.line).toBe(19);
  });

  it('Ctrl-d 및 Ctrl-u: 화면과 커서를 반 페이지씩 아래/위로 스크롤한다', () => {
    let state: VimEditorState = {
      lines: makeSampleLines(30),
      cursor: { line: 5, col: 0 },
      mode: 'NORMAL',
      viewport: { topRow: 5, visibleRows: 10 },
    };

    // 반 페이지 = 5줄
    // Ctrl-d: 아래로 5줄 이동
    state = handleKey(state, 'Ctrl-d');
    expect(state.cursor.line).toBe(10);
    expect(state.viewport?.topRow).toBe(10);

    // Ctrl-u: 위로 5줄 이동
    state = handleKey(state, 'Ctrl-u');
    expect(state.cursor.line).toBe(5);
    expect(state.viewport?.topRow).toBe(5);
  });

  it('커서가 뷰포트 영역을 벗어나 이동할 때 뷰포트가 자동으로 동기화된다', () => {
    let state: VimEditorState = {
      lines: makeSampleLines(30),
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      viewport: { topRow: 0, visibleRows: 10 },
    };

    // G: 30번째 줄(인덱스 29)로 이동
    state = handleKey(state, 'G');
    expect(state.cursor.line).toBe(29);
    // 뷰포트가 29행을 포함하도록 자동 스크롤: 29 - 10 + 1 = 20
    expect(state.viewport?.topRow).toBe(20);

    // gg: 1번째 줄(인덱스 0)로 복귀
    state = handleKey(state, 'g');
    state = handleKey(state, 'g');
    expect(state.cursor.line).toBe(0);
    expect(state.viewport?.topRow).toBe(0);
  });
});
