import { describe, it, expect } from 'vitest';
import {
  computeDiffHunks,
  startDiffSplit,
  diffThis,
  diffOff,
  diffUpdate,
  jumpDiffHunk,
  diffObtain,
  diffPut,
  findHunkAtCursor,
} from './diffEngine';
import { VimEditorState } from './types';

describe('diffEngine - 순정 Vim diffsplit, ]c, [c, do, dp 엔진', () => {
  describe('computeDiffHunks', () => {
    it('동일한 내용의 경우 차이점이 없어야 한다', () => {
      const a = ['const x = 1;', 'console.log(x);'];
      const b = ['const x = 1;', 'console.log(x);'];
      const hunks = computeDiffHunks(a, b);
      expect(hunks).toEqual([]);
    });

    it('단일 줄 수정(change)을 정확히 감지한다', () => {
      const a = ['function foo() {', '  return 1;', '}'];
      const b = ['function foo() {', '  return 2;', '}'];
      const hunks = computeDiffHunks(a, b);
      expect(hunks.length).toBe(1);
      expect(hunks[0]).toMatchObject({
        pane0Start: 1,
        pane0Count: 1,
        pane1Start: 1,
        pane1Count: 1,
        type: 'change',
      });
    });

    it('줄 추가(add)를 정확히 감지한다', () => {
      const a = ['start', 'end'];
      const b = ['start', 'middle 1', 'middle 2', 'end'];
      const hunks = computeDiffHunks(a, b);
      expect(hunks.length).toBe(1);
      expect(hunks[0]).toMatchObject({
        pane0Start: 1,
        pane0Count: 0,
        pane1Start: 1,
        pane1Count: 2,
        type: 'add',
      });
    });

    it('줄 삭제(delete)를 정확히 감지한다', () => {
      const a = ['line 1', 'delete me', 'line 2'];
      const b = ['line 1', 'line 2'];
      const hunks = computeDiffHunks(a, b);
      expect(hunks.length).toBe(1);
      expect(hunks[0]).toMatchObject({
        pane0Start: 1,
        pane0Count: 1,
        pane1Start: 1,
        pane1Count: 0,
        type: 'delete',
      });
    });

    it('여러 개의 흩어진 차이점을 순서대로 분리 감지한다', () => {
      const a = ['head', 'diff1_a', 'common', 'diff2_a', 'tail'];
      const b = ['head', 'diff1_b', 'common', 'diff2_b', 'tail'];
      const hunks = computeDiffHunks(a, b);
      expect(hunks.length).toBe(2);
      expect(hunks[0].pane0Start).toBe(1);
      expect(hunks[1].pane0Start).toBe(3);
    });
  });

  describe('startDiffSplit & diffThis & diffOff', () => {
    const baseState: VimEditorState = {
      lines: ['line 1', 'line 2 (old)', 'line 3'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'main.ts',
      secondaryFilename: 'patch.ts',
      secondaryLines: ['line 1', 'line 2 (fixed)', 'line 3'],
    };

    it(':diffsplit 실행 시 세로 분할 창이 열리고 diffMode 및 hunks가 계산된다', () => {
      const res = startDiffSplit(baseState, 'patch.ts');
      expect(res.splitDirection).toBe('vertical');
      expect(res.diffMode).toBe(true);
      expect(res.diffHunks?.length).toBe(1);
      expect(res.diffHunks?.[0].type).toBe('change');
      expect(res.commandMessage).toContain('patch.ts');
    });

    it('분할되지 않은 상태에서 :diffthis 실행 시 에러 메시지를 표시한다', () => {
      const res = diffThis(baseState);
      expect(res.commandMessage).toContain('E97:');
    });

    it(':diffoff 실행 시 diff 모드가 해제된다', () => {
      const splitState = startDiffSplit(baseState, 'patch.ts');
      expect(splitState.diffMode).toBe(true);

      const offState = diffOff(splitState, true);
      expect(offState.diffMode).toBe(false);
      expect(offState.diffHunks).toBeUndefined();
    });

    it(':diffupdate 실행 시 차이점을 다시 계산한다', () => {
      const splitState = startDiffSplit(baseState, 'patch.ts');
      const updated = diffUpdate(splitState);
      expect(updated.commandMessage).toContain('diff 차이점을 재계산했습니다');
      expect(updated.diffHunks?.length).toBe(1);
    });

    it('findHunkAtCursor 로 현재 커서 위치의 Hunk를 찾을 수 있다', () => {
      const splitState = startDiffSplit(baseState, 'patch.ts');
      const atCursor = findHunkAtCursor({ ...splitState, cursor: { line: 1, col: 0 } });
      expect(atCursor).toBeDefined();
      expect(atCursor?.pane0Start).toBe(1);
    });
  });

  describe('jumpDiffHunk (]c, [c)', () => {
    const splitState: VimEditorState = {
      lines: ['a', 'b (diff1)', 'c', 'd (diff2)', 'e'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      splitDirection: 'vertical',
      activePaneIndex: 0,
      diffMode: true,
      diffHunks: [
        { id: 0, pane0Start: 1, pane0Count: 1, pane1Start: 1, pane1Count: 1, type: 'change' },
        { id: 1, pane0Start: 3, pane0Count: 1, pane1Start: 3, pane1Count: 1, type: 'change' },
      ],
      splitPanes: [
        {
          filename: 'main.ts',
          lines: ['a', 'b (diff1)', 'c', 'd (diff2)', 'e'],
          cursor: { line: 0, col: 0 },
          mode: 'NORMAL',
          diff: true,
        },
        {
          filename: 'patch.ts',
          lines: ['a', 'B', 'c', 'D', 'e'],
          cursor: { line: 0, col: 0 },
          mode: 'NORMAL',
          diff: true,
        },
      ],
    };

    it(']c 입력 시 다음 변경점 라인으로 커서가 이동한다', () => {
      const next1 = jumpDiffHunk(splitState, 'next');
      expect(next1.cursor.line).toBe(1);

      const next2 = jumpDiffHunk(next1, 'next');
      expect(next2.cursor.line).toBe(3);

      const next3 = jumpDiffHunk(next2, 'next');
      expect(next3.commandMessage).toBe('마지막 변경점입니다');
    });

    it('[c 입력 시 이전 변경점 라인으로 커서가 이동한다', () => {
      const atBottom = { ...splitState, cursor: { line: 4, col: 0 } };
      const prev1 = jumpDiffHunk(atBottom, 'prev');
      expect(prev1.cursor.line).toBe(3);

      const prev2 = jumpDiffHunk(prev1, 'prev');
      expect(prev2.cursor.line).toBe(1);

      const prev3 = jumpDiffHunk(prev2, 'prev');
      expect(prev3.commandMessage).toBe('첫 번째 변경점입니다');
    });
  });

  describe('diffObtain (do / :diffget) & diffPut (dp / :diffput)', () => {
    it('do 실행 시 상대 창의 변경 내용을 현재 버퍼로 가져와 일치시킨다', () => {
      const initial: VimEditorState = {
        lines: ['first', 'wrong_implementation', 'last'],
        cursor: { line: 1, col: 0 },
        mode: 'NORMAL',
        splitDirection: 'vertical',
        activePaneIndex: 0,
        diffMode: true,
        diffHunks: [
          { id: 0, pane0Start: 1, pane0Count: 1, pane1Start: 1, pane1Count: 1, type: 'change' },
        ],
        splitPanes: [
          {
            filename: 'main.ts',
            lines: ['first', 'wrong_implementation', 'last'],
            cursor: { line: 1, col: 0 },
            mode: 'NORMAL',
            diff: true,
          },
          {
            filename: 'patch.ts',
            lines: ['first', 'correct_implementation', 'last'],
            cursor: { line: 1, col: 0 },
            mode: 'NORMAL',
            diff: true,
          },
        ],
      };

      const res = diffObtain(initial);
      expect(res.lines[1]).toBe('correct_implementation');
      // 변경점이 해결되었으므로 diffHunks는 비어 있어야 함
      expect(res.diffHunks?.length).toBe(0);
      expect(res.commandMessage).toContain('가져왔습니다 (do');
      // 되돌리기를 위한 undoStack에 저장되었는지 확인
      expect(res.undoStack?.length).toBe(1);
    });

    it('dp 실행 시 현재 창의 변경 내용을 상대 창으로 밀어넣어 일치시킨다', () => {
      const initial: VimEditorState = {
        lines: ['first', 'source_feature', 'last'],
        cursor: { line: 1, col: 0 },
        mode: 'NORMAL',
        splitDirection: 'vertical',
        activePaneIndex: 0,
        diffMode: true,
        diffHunks: [
          { id: 0, pane0Start: 1, pane0Count: 1, pane1Start: 1, pane1Count: 1, type: 'change' },
        ],
        splitPanes: [
          {
            filename: 'main.ts',
            lines: ['first', 'source_feature', 'last'],
            cursor: { line: 1, col: 0 },
            mode: 'NORMAL',
            diff: true,
          },
          {
            filename: 'backup.ts',
            lines: ['first', 'old_feature', 'last'],
            cursor: { line: 1, col: 0 },
            mode: 'NORMAL',
            diff: true,
          },
        ],
      };

      const res = diffPut(initial);
      expect(res.splitPanes?.[1].lines[1]).toBe('source_feature');
      expect(res.diffHunks?.length).toBe(0);
      expect(res.commandMessage).toContain('밀어넣었습니다 (dp');
    });
  });
});
