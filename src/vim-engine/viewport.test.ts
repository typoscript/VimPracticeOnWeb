import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { DEFAULT_VIM_OPTIONS } from './setEngine';
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

  describe('수평 뷰포트 스크롤 (zh, zl, zH, zL, ze, zs, :set nowrap, sidescroll/sidescrolloff)', () => {
    const longLine = Array.from({ length: 120 }, (_, i) => String(i % 10)).join('');

    function createWideState(opts?: { wrap?: boolean; sidescroll?: number; sidescrolloff?: number; visibleCols?: number }): VimEditorState {
      return {
        lines: [longLine],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        viewport: { topRow: 0, visibleRows: 10, visibleCols: opts?.visibleCols ?? 20 },
        options: {
          ...DEFAULT_VIM_OPTIONS,
          wrap: opts?.wrap ?? false,
          sidescroll: opts?.sidescroll ?? 0,
          sidescrolloff: opts?.sidescrolloff ?? 0,
        },
      };
    }

    it('wrap=true(기본)에서는 zh/zl/zH/zL/ze/zs 가 leftCol을 바꾸지 않고 cursor도 그대로 둔다', () => {
      let state = createWideState({ wrap: true });
      state = { ...state, cursor: { line: 0, col: 30 } };

      for (const seq of ['zl', 'zh', 'zL', 'zH', 'ze', 'zs']) {
        state = handleKey(state, seq[0]);
        state = handleKey(state, seq[1]);
        expect(state.viewport?.leftCol ?? 0).toBe(0);
        expect(state.cursor.col).toBe(30);
      }
    });

    it('zl / zh 및 count: nowrap 모드에서 수평 스크롤하고 커서를 화면 내에 유지한다', () => {
      let state = createWideState({ wrap: false, visibleCols: 20 });

      // 5zl -> leftCol=5, 커서도 leftCol(5) 이상으로 밀림
      state = handleKey(state, '5');
      state = handleKey(state, 'z');
      state = handleKey(state, 'l');
      expect(state.viewport?.leftCol).toBe(5);
      expect(state.cursor.col).toBe(5);

      // 3zh -> leftCol=2, 커서는 [2, 21] 범위이므로 5 유지
      state = handleKey(state, '3');
      state = handleKey(state, 'z');
      state = handleKey(state, 'h');
      expect(state.viewport?.leftCol).toBe(2);
      expect(state.cursor.col).toBe(5);

      // 끝 쪽(col 100)으로 이동 후 5zh -> leftCol 감소, 커서가 화면 우측(leftCol + 19)으로 밀림
      state = { ...state, cursor: { line: 0, col: 50 }, viewport: { topRow: 0, visibleRows: 10, visibleCols: 20, leftCol: 31 } };
      state = handleKey(state, '5');
      state = handleKey(state, 'z');
      state = handleKey(state, 'h');
      expect(state.viewport?.leftCol).toBe(26);
      expect(state.cursor.col).toBe(45);
    });

    it('zL / zH: visibleCols 의 절반 단위로 수평 스크롤한다', () => {
      let state = createWideState({ wrap: false, visibleCols: 20 });

      // zL -> half=10, leftCol=10, cursor.col=10
      state = handleKey(state, 'z');
      state = handleKey(state, 'L');
      expect(state.viewport?.leftCol).toBe(10);
      expect(state.cursor.col).toBe(10);

      // 2zL -> +20 => leftCol=30
      state = handleKey(state, '2');
      state = handleKey(state, 'z');
      state = handleKey(state, 'L');
      expect(state.viewport?.leftCol).toBe(30);

      // zH -> -10 => leftCol=20
      state = handleKey(state, 'z');
      state = handleKey(state, 'H');
      expect(state.viewport?.leftCol).toBe(20);
    });

    it('zs / ze: 커서 위치를 화면 왼쪽 끝(zs) 또는 오른쪽 끝(ze)에 맞춘다 (sidescrolloff 반영)', () => {
      let state = createWideState({ wrap: false, visibleCols: 20, sidescrolloff: 3 });
      state = { ...state, cursor: { line: 0, col: 50 } };

      // zs: leftCol = col - effSiso = 50 - 3 = 47
      state = handleKey(state, 'z');
      state = handleKey(state, 's');
      expect(state.viewport?.leftCol).toBe(47);
      expect(state.cursor.col).toBe(50);

      // ze: leftCol = col - (visCols - 1 - effSiso) = 50 - (20 - 1 - 3) = 34
      state = handleKey(state, 'z');
      state = handleKey(state, 'e');
      expect(state.viewport?.leftCol).toBe(34);
      expect(state.cursor.col).toBe(50);
    });

    it(':set nowrap, :set ss=N, :set siso=N 으로 커서 이동 시 자동 수평 스크롤된다', () => {
      let state = createWideState({ wrap: true, visibleCols: 20 });

      for (const ch of ':set nowrap ss=5 siso=2') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');

      expect(state.options?.wrap).toBe(false);
      expect(state.options?.sidescroll).toBe(5);
      expect(state.options?.sidescrolloff).toBe(2);

      // $ 로 끝(col=119) 이동 -> leftCol 자동 스크롤되어 커서가 [leftCol+2, leftCol+17] 안에 있음
      state = handleKey(state, '$');
      expect(state.cursor.col).toBe(119);
      const leftAfterDollar = state.viewport?.leftCol ?? 0;
      expect(leftAfterDollar).toBeGreaterThanOrEqual(105);
      expect(state.cursor.col).toBeLessThanOrEqual(leftAfterDollar + 19 - 2);

      // 0 으로 맨 앞(col=0) 이동 -> leftCol=0 으로 복귀
      state = handleKey(state, '0');
      expect(state.cursor.col).toBe(0);
      expect(state.viewport?.leftCol ?? 0).toBe(0);
    });

    it('Visual 모드에서도 zs / ze / zl 수평 스크롤이 동작한다', () => {
      let state = createWideState({ wrap: false, visibleCols: 20 });
      state = { ...state, cursor: { line: 0, col: 40 } };

      state = handleKey(state, 'v');
      state = handleKey(state, 'z');
      state = handleKey(state, 's');
      expect(state.mode).toBe('VISUAL');
      expect(state.viewport?.leftCol).toBe(40);
    });
  });
});
