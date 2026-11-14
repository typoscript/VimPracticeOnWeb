import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';

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

  it('Ctrl-f / Ctrl-b: 한 페이지(visibleRows - 2)씩 아래/위로 스크롤하고 count 를 지원한다', () => {
    let state: VimEditorState = {
      lines: makeSampleLines(100),
      cursor: { line: 0, col: 4 },
      mode: 'NORMAL',
      viewport: { topRow: 0, visibleRows: 22 },
    };

    // page = 22 - 2 = 20
    state = handleKey(state, 'Ctrl-f');
    expect(state.viewport?.topRow).toBe(20);
    expect(state.cursor.line).toBe(20);
    expect(state.cursor.col).toBe(4);

    // 2 Ctrl-f: 20 + 40 = 60
    state = handleKey(state, '2');
    state = handleKey(state, 'Ctrl-f');
    expect(state.viewport?.topRow).toBe(60);
    expect(state.cursor.line).toBe(60);

    // Ctrl-b: 60 - 20 = 40, 커서는 페이지 하단(40 + 21 = 61)
    state = handleKey(state, 'Ctrl-b');
    expect(state.viewport?.topRow).toBe(40);
    expect(state.cursor.line).toBe(61);
  });

  it('Ctrl-e / Ctrl-y: 커서를 유지한 채 화면만 한 줄씩 스크롤하고 화면 경계에서만 커서를 민다', () => {
    let state: VimEditorState = {
      lines: makeSampleLines(100),
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      viewport: { topRow: 0, visibleRows: 22 },
    };

    // top=0, cur=0 에서 5 Ctrl-e -> top=5, cur=5
    state = handleKey(state, '5');
    state = handleKey(state, 'Ctrl-e');
    expect(state.viewport?.topRow).toBe(5);
    expect(state.cursor.line).toBe(5);

    // 1 Ctrl-y -> top=4, cur 는 5 그대로
    state = handleKey(state, 'Ctrl-y');
    expect(state.viewport?.topRow).toBe(4);
    expect(state.cursor.line).toBe(5);

    // 30j(line 35 -> top=14, bot=35) 후 10 Ctrl-y -> top=4, bot=25, cur=25
    state = handleKey(state, '3');
    state = handleKey(state, '0');
    state = handleKey(state, 'j');
    expect(state.cursor.line).toBe(35);
    state = handleKey(state, '1');
    state = handleKey(state, '0');
    state = handleKey(state, 'Ctrl-y');
    expect(state.viewport?.topRow).toBe(4);
    expect(state.cursor.line).toBe(25);
  });

  it(':set scrolloff=N 은 커서 위아래 여유 줄을 유지한다', () => {
    let state: VimEditorState = {
      lines: makeSampleLines(100),
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      viewport: { topRow: 0, visibleRows: 22 },
    };

    for (const ch of ':set so=5') state = handleKey(state, ch);
    state = handleKey(state, 'Enter');
    expect(state.options?.scrolloff).toBe(5);

    // 20j -> cur=20, topRow=4 (bot=25, 25 - 20 = 5)
    state = handleKey(state, '2');
    state = handleKey(state, '0');
    state = handleKey(state, 'j');
    expect(state.cursor.line).toBe(20);
    expect(state.viewport?.topRow).toBe(4);

    // G -> cur=99, topRow=78 (100 - 22 = 78)
    state = handleKey(state, 'G');
    expect(state.cursor.line).toBe(99);
    expect(state.viewport?.topRow).toBe(78);

    // Ctrl-b -> top=58, cur=79 - 5 = 74
    state = handleKey(state, 'Ctrl-b');
    expect(state.viewport?.topRow).toBe(58);
    expect(state.cursor.line).toBe(74);
  });
});
