import { describe, it, expect } from 'vitest';
import {
  detectFoldBlocks,
  detectIndentFoldBlocks,
  createFold,
  deleteFoldAtCursor,
  deleteAllFoldsAtCursor,
  eliminateAllFolds,
  generateFoldText,
  foldClose,
  foldOpen,
  foldToggle,
  foldCloseAll,
  foldOpenAll,
  getNextVisibleLine,
  getPrevVisibleLine,
  deleteFoldOrLine,
  yankFoldOrLine,
} from './folding';
import { executeSetCommand } from './setEngine';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';

describe('코드 폴딩 모듈 (Folding Engine)', () => {
  const sampleLines = [
    'function calculate() {',
    '  const a = 10;',
    '  const b = 20;',
    '  return a + b;',
    '}',
    'console.log(calculate());',
  ];

  it('detectFoldBlocks: 중괄호 블록의 본문 범위(3 lines)를 정확히 탐색한다', () => {
    const folds = detectFoldBlocks(sampleLines);
    expect(folds).toHaveLength(1);
    expect(folds[0]).toEqual({
      startRow: 1,
      endRow: 3,
      closed: false,
    });
  });

  it('foldClose (zc): 현재 커서가 속한 블록을 접고 closed: true로 설정한다', () => {
    const state: VimEditorState = {
      lines: [...sampleLines],
      cursor: { line: 2, col: 4 }, // 블록 내부
      mode: 'NORMAL',
    };

    const next = foldClose(state);
    expect(next.folds).toHaveLength(1);
    expect(next.folds![0].closed).toBe(true);
    // 커서가 접힌 블록 시작행으로 이동
    expect(next.cursor.line).toBe(1);
  });

  it('foldOpen (zo): 접힌 블록을 펼친다', () => {
    const state: VimEditorState = {
      lines: [...sampleLines],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
      folds: [{ startRow: 1, endRow: 3, closed: true }],
    };

    const next = foldOpen(state);
    expect(next.folds![0].closed).toBe(false);
  });

  it('foldToggle (za): 접기/펼치기 토글이 정상 동작한다', () => {
    let state: VimEditorState = {
      lines: [...sampleLines],
      cursor: { line: 0, col: 0 }, // 여는 중괄호 줄
      mode: 'NORMAL',
    };

    state = foldToggle(state);
    expect(state.folds?.[0].closed).toBe(true);

    state = foldToggle(state);
    expect(state.folds?.[0].closed).toBe(false);
  });

  it('foldCloseAll (zM) 및 foldOpenAll (zR): 버퍼 내 모든 블록을 일괄 접고 펼친다', () => {
    const multiBlockLines = [
      'function A() {',
      '  const x = 1;',
      '}',
      'function B() {',
      '  const y = 2;',
      '}',
    ];

    let state: VimEditorState = {
      lines: multiBlockLines,
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    // zM: 일괄 접기
    state = foldCloseAll(state);
    expect(state.folds?.every((f) => f.closed)).toBe(true);

    // zR: 일괄 펼치기
    state = foldOpenAll(state);
    expect(state.folds?.every((f) => !f.closed)).toBe(true);
  });

  it('j / k 수직 이동 시: 접힌 블록 전체를 한 줄처럼 건너뛴다', () => {
    const folds = [{ startRow: 1, endRow: 3, closed: true }];

    // 0번 행 -> 1번 행(접힌 헤더) -> 4번 행('}')으로 바로 건너뜀
    const next1 = getNextVisibleLine(folds, 0, sampleLines.length - 1);
    expect(next1).toBe(1);

    const next2 = getNextVisibleLine(folds, 1, sampleLines.length - 1);
    expect(next2).toBe(4); // 2, 3번 행을 건너뛰고 4번 행으로 점프

    // 4번 행에서 위로(k) 이동 시 접힌 헤더(1번 행)로 점프
    const prev1 = getPrevVisibleLine(folds, 4);
    expect(prev1).toBe(1);
  });

  it('deleteFoldOrLine (dd): 접힌 줄 위에서 dd 실행 시 접힌 3개 줄이 한 번에 삭제된다', () => {
    const state: VimEditorState = {
      lines: [...sampleLines],
      cursor: { line: 1, col: 0 }, // 접힌 헤더 줄
      mode: 'NORMAL',
      folds: [{ startRow: 1, endRow: 3, closed: true }],
    };

    const next = deleteFoldOrLine(state, 1);
    // 1~3번 줄이 삭제되어 0번 줄과 4, 5번 줄만 남음
    expect(next.lines).toEqual([
      'function calculate() {',
      '}',
      'console.log(calculate());',
    ]);
  });

  it('yankFoldOrLine (yy): 접힌 줄 위에서 yy 실행 시 접힌 전체 줄이 클립보드에 복사된다', () => {
    const state: VimEditorState = {
      lines: [...sampleLines],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
      folds: [{ startRow: 1, endRow: 3, closed: true }],
    };

    const next = yankFoldOrLine(state, 1);
    expect(next.clipboard?.type).toBe('line');
    expect(next.clipboard?.content).toBe('  const a = 10;\n  const b = 20;\n  return a + b;');
  });

  it('handleKey 키 시퀀스 통합: zc, j, k, za 명령이 유기적으로 연동된다', () => {
    let state: VimEditorState = {
      lines: [...sampleLines],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    // zc 입력 -> 접기
    state = handleKey(state, 'z');
    state = handleKey(state, 'c');
    expect(state.folds?.[0].closed).toBe(true);

    // j 입력 -> 1번 줄 (접힌 헤더)
    state = handleKey(state, 'j');
    expect(state.cursor.line).toBe(1);

    // j 입력 -> 4번 줄 ('}')
    state = handleKey(state, 'j');
    expect(state.cursor.line).toBe(4);

    // k 입력 -> 1번 줄 (접힌 헤더로 복귀)
    state = handleKey(state, 'k');
    expect(state.cursor.line).toBe(1);

    // za 입력 -> 펼치기
    state = handleKey(state, 'z');
    state = handleKey(state, 'a');
    expect(state.folds?.[0].closed).toBe(false);
  });

  describe('순정 확장: 들여쓰기 폴딩 (foldmethod=indent) 및 수동 폴드 (zf, zd, zD, zE)', () => {
    const pythonLikeLines = [
      'def main():',
      '    print("start")',
      '    if True:',
      '        print("inside if")',
      '        x = 10',
      '    print("end")',
    ];

    it('detectIndentFoldBlocks: 들여쓰기 깊이 기반으로 폴드 블록을 탐색한다', () => {
      const folds = detectIndentFoldBlocks(pythonLikeLines, 4);

      // level >= 1: 라인 1 ~ 5 (4칸 들여쓰기 블록)
      // level >= 2: 라인 3 ~ 4 (8칸 들여쓰기 블록)
      expect(folds.length).toBeGreaterThanOrEqual(2);
      expect(folds.some((f) => f.startRow === 1 && f.endRow === 5)).toBe(true);
      expect(folds.some((f) => f.startRow === 3 && f.endRow === 4)).toBe(true);
    });

    it(':set fdm=indent 설정 시 들여쓰기 블록이 zc / za 로 접힌다', () => {
      let state: VimEditorState = {
        lines: [...pythonLikeLines],
        cursor: { line: 3, col: 0 },
        mode: 'NORMAL',
      };

      state = executeSetCommand(state, 'fdm=indent');
      expect(state.options?.foldmethod).toBe('indent');

      // 라인 3에서 zc 입력 -> 안쪽 블록(3~4) 접힘
      state = handleKey(state, 'z');
      state = handleKey(state, 'c');
      expect(state.folds?.some((f) => f.startRow === 3 && f.endRow === 4 && f.closed)).toBe(true);
    });

    it('Normal 모드 zf 모션 (zf2j): 커서 위치부터 2줄 아래까지 수동 폴드를 생성하고 접는다', () => {
      let state: VimEditorState = {
        lines: ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'],
        cursor: { line: 1, col: 0 },
        mode: 'NORMAL',
      };

      // z f 2 j
      state = handleKey(state, 'z');
      state = handleKey(state, 'f');
      state = handleKey(state, '2');
      state = handleKey(state, 'j');

      expect(state.folds).toHaveLength(1);
      expect(state.folds![0]).toEqual({
        startRow: 1,
        endRow: 3,
        closed: true,
        manual: true,
      });
      expect(state.cursor.line).toBe(1);
    });

    it('Visual 모드 zf: 선택한 라인 범위로 수동 폴드를 생성하고 Normal 모드로 복귀한다', () => {
      let state: VimEditorState = {
        lines: ['line 1', 'line 2', 'line 3', 'line 4'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // V (VISUAL_LINE), j (line 1), z, f
      state = handleKey(state, 'V');
      expect(state.mode).toBe('VISUAL_LINE');
      state = handleKey(state, 'j');
      state = handleKey(state, 'z');
      state = handleKey(state, 'f');

      expect(state.mode).toBe('NORMAL');
      expect(state.folds).toHaveLength(1);
      expect(state.folds![0]).toEqual({
        startRow: 0,
        endRow: 1,
        closed: true,
        manual: true,
      });
    });

    it('zd: 현재 커서 위치의 폴드를 삭제한다', () => {
      let state: VimEditorState = {
        lines: ['line 1', 'line 2', 'line 3'],
        cursor: { line: 1, col: 0 },
        mode: 'NORMAL',
        folds: [{ startRow: 1, endRow: 2, closed: true, manual: true }],
      };

      // z d
      state = handleKey(state, 'z');
      state = handleKey(state, 'd');
      expect(state.folds).toHaveLength(0);
    });

    it('zE: 버퍼 내 모든 폴드를 일괄 제거한다', () => {
      let state: VimEditorState = {
        lines: ['line 1', 'line 2', 'line 3'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        folds: [
          { startRow: 0, endRow: 1, closed: true },
          { startRow: 1, endRow: 2, closed: false },
        ],
      };

      // z E
      state = handleKey(state, 'z');
      state = handleKey(state, 'E');
      expect(state.folds).toHaveLength(0);
    });

    it('createFold, deleteFoldAtCursor, deleteAllFoldsAtCursor, eliminateAllFolds 순수 함수 검증', () => {
      let state: VimEditorState = {
        lines: ['1', '2', '3', '4'],
        cursor: { line: 1, col: 0 },
        mode: 'NORMAL',
      };

      state = createFold(state, 1, 2);
      expect(state.folds).toHaveLength(1);
      expect(state.folds![0].manual).toBe(true);

      state = deleteFoldAtCursor(state);
      expect(state.folds).toHaveLength(0);

      state = createFold(state, 0, 3);
      state = deleteAllFoldsAtCursor(state);
      expect(state.folds).toHaveLength(0);

      state = createFold(state, 1, 2);
      state = eliminateAllFolds(state);
      expect(state.folds).toHaveLength(0);
    });

    it('generateFoldText: 순정 Vim 스타일의 요약 배너 텍스트를 반환한다', () => {
      const text = generateFoldText(['function test() {', '  return 42;', '}'], {
        startRow: 0,
        endRow: 2,
        closed: true,
      });

      expect(text).toContain('+--  3 lines: function test() {');
      expect(text.startsWith('+--')).toBe(true);
    });
  });
});
