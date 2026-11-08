import { DiffHunk, SplitPaneState, VimEditorState } from './types';
import { splitWindow } from './splitWindow';
import { msg } from './messages';

export type { DiffHunk };

/**
 * 두 문자열 배열 간의 LCS(Longest Common Subsequence)를 기반으로
 * 순정 Vim 스타일의 Diff Hunk 목록을 계산합니다.
 */
export function computeDiffHunks(lines0: string[], lines1: string[]): DiffHunk[] {
  const n = lines0.length;
  const m = lines1.length;

  // 1. 공통 접두사(Prefix) 최적화
  let start = 0;
  while (start < n && start < m && lines0[start] === lines1[start]) {
    start++;
  }

  // 2. 공통 접미사(Suffix) 최적화
  let end0 = n - 1;
  let end1 = m - 1;
  while (end0 >= start && end1 >= start && lines0[end0] === lines1[end1]) {
    end0--;
    end1--;
  }

  // 양쪽 모두 동일한 경우 차이점 없음
  if (start > end0 && start > end1) {
    return [];
  }

  // 한쪽만 비어있는 경우 (단순 전체 추가 또는 삭제)
  if (start > end0) {
    return [
      {
        id: 0,
        pane0Start: start,
        pane0Count: 0,
        pane1Start: start,
        pane1Count: end1 - start + 1,
        type: 'add',
      },
    ];
  }

  if (start > end1) {
    return [
      {
        id: 0,
        pane0Start: start,
        pane0Count: end0 - start + 1,
        pane1Start: start,
        pane1Count: 0,
        type: 'delete',
      },
    ];
  }

  // 중간 차이 영역 LCS DP 계산
  const sub0 = lines0.slice(start, end0 + 1);
  const sub1 = lines1.slice(start, end1 + 1);
  const len0 = sub0.length;
  const len1 = sub1.length;

  const dp: number[][] = Array.from({ length: len0 + 1 }, () =>
    new Array(len1 + 1).fill(0)
  );

  for (let i = 1; i <= len0; i++) {
    for (let j = 1; j <= len1; j++) {
      if (sub0[i - 1] === sub1[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // LCS 역추적으로 일치/불일치 매핑 구성
  interface MatchOp {
    type: 'match' | 'diff0' | 'diff1';
    i0?: number;
    i1?: number;
  }
  const ops: MatchOp[] = [];
  let curI = len0;
  let curJ = len1;

  while (curI > 0 || curJ > 0) {
    if (curI > 0 && curJ > 0 && sub0[curI - 1] === sub1[curJ - 1]) {
      ops.push({ type: 'match', i0: curI - 1, i1: curJ - 1 });
      curI--;
      curJ--;
    } else if (curJ > 0 && (curI === 0 || dp[curI][curJ - 1] >= dp[curI - 1][curJ])) {
      ops.push({ type: 'diff1', i1: curJ - 1 });
      curJ--;
    } else {
      ops.push({ type: 'diff0', i0: curI - 1 });
      curI--;
    }
  }

  ops.reverse();

  // 불일치(diff0, diff1) 연속 구간을 하나의 Hunk로 그룹화
  const hunks: DiffHunk[] = [];
  let hunkId = 0;
  let idx = 0;

  while (idx < ops.length) {
    if (ops[idx].type === 'match') {
      idx++;
      continue;
    }

    const hunkOpsStart = idx;
    let count0 = 0;
    let count1 = 0;
    let p0StartInSub: number | undefined;
    let p1StartInSub: number | undefined;

    while (idx < ops.length && ops[idx].type !== 'match') {
      if (ops[idx].type === 'diff0') {
        if (p0StartInSub === undefined) p0StartInSub = ops[idx].i0;
        count0++;
      } else if (ops[idx].type === 'diff1') {
        if (p1StartInSub === undefined) p1StartInSub = ops[idx].i1;
        count1++;
      }
      idx++;
    }

    // 시작 지점이 누락된 경우(삽입/삭제), 직전/직후 매치 위치 기준 계산
    if (p0StartInSub === undefined) {
      if (hunkOpsStart > 0 && ops[hunkOpsStart - 1].i0 !== undefined) {
        p0StartInSub = ops[hunkOpsStart - 1].i0! + 1;
      } else if (idx < ops.length && ops[idx].i0 !== undefined) {
        p0StartInSub = ops[idx].i0!;
      } else {
        p0StartInSub = 0;
      }
    }

    if (p1StartInSub === undefined) {
      if (hunkOpsStart > 0 && ops[hunkOpsStart - 1].i1 !== undefined) {
        p1StartInSub = ops[hunkOpsStart - 1].i1! + 1;
      } else if (idx < ops.length && ops[idx].i1 !== undefined) {
        p1StartInSub = ops[idx].i1!;
      } else {
        p1StartInSub = 0;
      }
    }

    const pane0Start = start + p0StartInSub;
    const pane1Start = start + p1StartInSub;

    let type: 'change' | 'add' | 'delete' = 'change';
    if (count0 === 0 && count1 > 0) type = 'add';
    else if (count0 > 0 && count1 === 0) type = 'delete';

    hunks.push({
      id: hunkId++,
      pane0Start,
      pane0Count: count0,
      pane1Start,
      pane1Count: count1,
      type,
    });
  }

  return hunks;
}

/**
 * 분할 창들의 최신 라인 내용을 기준으로 diff 상태 및 hunks를 갱신합니다.
 */
export function updateDiffState(state: VimEditorState): VimEditorState {
  if (
    !state.splitDirection ||
    state.splitDirection === 'none' ||
    !state.splitPanes ||
    state.splitPanes.length < 2
  ) {
    return {
      ...state,
      diffMode: false,
      diffHunks: undefined,
    };
  }

  const isPane0Diff = state.splitPanes[0].diff ?? state.diffMode ?? false;
  const isPane1Diff = state.splitPanes[1].diff ?? state.diffMode ?? false;

  if (!isPane0Diff && !isPane1Diff && !state.diffMode) {
    return {
      ...state,
      diffMode: false,
      diffHunks: undefined,
    };
  }

  const activeIdx = state.activePaneIndex ?? 0;
  const lines0 = activeIdx === 0 ? state.lines : state.splitPanes[0].lines;
  const lines1 = activeIdx === 1 ? state.lines : state.splitPanes[1].lines;

  const hunks = computeDiffHunks(lines0, lines1);

  const updatedPanes: [SplitPaneState, SplitPaneState] = [
    { ...state.splitPanes[0], diff: true },
    { ...state.splitPanes[1], diff: true },
  ];

  return {
    ...state,
    diffMode: true,
    diffHunks: hunks,
    splitPanes: updatedPanes,
  };
}

/**
 * :diffsplit [filename] 명령어로 창을 세로 분할하고 두 버퍼 간 diff 모드를 시작합니다.
 */
export function startDiffSplit(
  state: VimEditorState,
  targetFilename?: string,
  direction: 'vertical' | 'horizontal' = 'vertical'
): VimEditorState {
  const primaryName = state.primaryFilename || 'source.ts';
  const targetName = targetFilename?.trim() || state.secondaryFilename || 'target.ts';

  // 1. 버퍼 목록에서 대상 파일 내용 검색
  let secondaryLines: string[] | undefined;
  if (state.buffers && state.buffers.length > 0) {
    const matchedBuf = state.buffers.find((b) => b.name === targetName);
    if (matchedBuf) {
      secondaryLines = [...matchedBuf.lines];
    }
  }

  if (!secondaryLines) {
    secondaryLines = state.secondaryLines ? [...state.secondaryLines] : [...state.lines];
  }

  // 2. 창 분할 실행
  const splitRes = splitWindow(state, direction, secondaryLines, targetName);

  // 3. diff 모드 활성화 및 차이점 계산
  const withDiff = updateDiffState({
    ...splitRes,
    diffMode: true,
    primaryFilename: primaryName,
    secondaryFilename: targetName,
  });

  const hunkCount = withDiff.diffHunks?.length ?? 0;
  return {
    ...withDiff,
    commandMessage: msg('{targetName} 파일과 diff 모드를 시작했습니다 ({hunkCount}개 변경점 발견)', { targetName, hunkCount }),
  };
}

/**
 * :diffthis 명령어로 현재 창을 diff 비교 대상으로 지정합니다.
 */
export function diffThis(state: VimEditorState): VimEditorState {
  if (
    !state.splitDirection ||
    state.splitDirection === 'none' ||
    !state.splitPanes ||
    state.splitPanes.length < 2
  ) {
    return {
      ...state,
      commandMessage: msg('E97: diff를 비교할 분할 창이 없습니다. :vsp 또는 :sp 후 실행하세요'),
    };
  }

  const curIdx = state.activePaneIndex ?? 0;
  const updatedPanes: [SplitPaneState, SplitPaneState] = [
    { ...state.splitPanes[0] },
    { ...state.splitPanes[1] },
  ];
  updatedPanes[curIdx].diff = true;

  const nextState = {
    ...state,
    splitPanes: updatedPanes,
  };

  const otherIdx = 1 - curIdx;
  if (updatedPanes[otherIdx].diff) {
    const res = updateDiffState({ ...nextState, diffMode: true });
    return {
      ...res,
      commandMessage: msg('두 창의 diff 비교 모드가 활성화되었습니다 ({v}개 차이)', { v: res.diffHunks?.length ?? 0 }),
    };
  }

  return {
    ...nextState,
    commandMessage: msg('현재 창을 diff 대상으로 설정했습니다. 다른 창에서 :diffthis를 실행하세요'),
  };
}

/**
 * :diffoff 명령어로 diff 모드를 해제합니다 (:diffoff, :diffoff!).
 */
export function diffOff(state: VimEditorState, all = false): VimEditorState {
  if (!state.splitPanes) {
    return {
      ...state,
      diffMode: false,
      diffHunks: undefined,
      commandMessage: msg('diff 모드가 해제되었습니다 (:diffoff)'),
    };
  }

  const curIdx = state.activePaneIndex ?? 0;
  const updatedPanes: [SplitPaneState, SplitPaneState] = [
    { ...state.splitPanes[0], diff: all ? false : curIdx === 0 ? false : state.splitPanes[0].diff },
    { ...state.splitPanes[1], diff: all ? false : curIdx === 1 ? false : state.splitPanes[1].diff },
  ];

  return {
    ...state,
    diffMode: false,
    diffHunks: undefined,
    splitPanes: updatedPanes,
    commandMessage: all
      ? msg('모든 창의 diff 모드를 해제했습니다 (:diffoff!)')
      : msg('현재 창의 diff 모드를 해제했습니다 (:diffoff)'),
  };
}

/**
 * :diffupdate 명령어로 두 창의 diff를 재계산합니다.
 */
export function diffUpdate(state: VimEditorState): VimEditorState {
  if (!state.diffMode || !state.splitPanes) {
    return {
      ...state,
      commandMessage: msg('E97: 현재 diff 모드가 활성화되어 있지 않습니다'),
    };
  }

  const updated = updateDiffState(state);
  return {
    ...updated,
    commandMessage: msg('diff 차이점을 재계산했습니다 ({v}개 발견)', { v: updated.diffHunks?.length ?? 0 }),
  };
}

/**
 * ]c 및 [c 단축키로 이전/다음 diff hunk로 커서를 순간이동합니다.
 */
export function jumpDiffHunk(
  state: VimEditorState,
  direction: 'next' | 'prev',
  count = 1
): VimEditorState {
  const hunks = state.diffHunks;
  if (!state.diffMode || !hunks || hunks.length === 0) {
    return {
      ...state,
      commandMessage: msg('차이점(Diff)이 없습니다'),
    };
  }

  const curIdx = state.activePaneIndex ?? 0;
  const curLine = state.cursor.line;

  // 현재 창에서의 각 Hunk 시작 라인 목록
  const hunkLines = hunks.map((h) => (curIdx === 0 ? h.pane0Start : h.pane1Start));

  let targetLine: number | undefined;

  if (direction === 'next') {
    const forwardHunks = hunkLines.filter((l) => l > curLine);
    if (forwardHunks.length === 0) {
      return {
        ...state,
        commandMessage: msg('마지막 변경점입니다'),
      };
    }
    const pickIdx = Math.min(count - 1, forwardHunks.length - 1);
    targetLine = forwardHunks[pickIdx];
  } else {
    const backwardHunks = hunkLines.filter((l) => l < curLine);
    if (backwardHunks.length === 0) {
      return {
        ...state,
        commandMessage: msg('첫 번째 변경점입니다'),
      };
    }
    const pickIdx = Math.max(0, backwardHunks.length - count);
    targetLine = backwardHunks[pickIdx];
  }

  const maxLine = state.lines.length - 1;
  const safeLine = Math.max(0, Math.min(maxLine, targetLine));

  return {
    ...state,
    cursor: { line: safeLine, col: 0 },
    commandMessage: undefined,
  };
}

/**
 * 현재 커서 위치에 해당하는 (또는 가장 가까운) Hunk를 반환합니다.
 */
export function findHunkAtCursor(state: VimEditorState): DiffHunk | undefined {
  const hunks = state.diffHunks;
  if (!hunks || hunks.length === 0) return undefined;

  const curIdx = state.activePaneIndex ?? 0;
  const curLine = state.cursor.line;

  // 1. 정확히 현재 라인이 포함되는 Hunk 탐색
  const exact = hunks.find((h) => {
    const start = curIdx === 0 ? h.pane0Start : h.pane1Start;
    const count = curIdx === 0 ? h.pane0Count : h.pane1Count;
    if (count === 0) return curLine === start;
    return curLine >= start && curLine < start + count;
  });
  if (exact) return exact;

  // 2. 정확 일치하지 않으면 가장 가까운 Hunk 탐색
  let closest: DiffHunk | undefined;
  let minDistance = Infinity;

  for (const h of hunks) {
    const start = curIdx === 0 ? h.pane0Start : h.pane1Start;
    const dist = Math.abs(curLine - start);
    if (dist < minDistance) {
      minDistance = dist;
      closest = h;
    }
  }

  return closest;
}

/**
 * do (diffobtain / :diffget): 상대 창의 변경사항을 현재 창으로 가져옵니다.
 */
export function diffObtain(state: VimEditorState): VimEditorState {
  if (!state.diffMode || !state.splitPanes || state.splitPanes.length < 2) {
    return {
      ...state,
      commandMessage: msg('E97: diff 모드가 아닙니다 (:diffget / do)'),
    };
  }

  const hunk = findHunkAtCursor(state);
  if (!hunk) {
    return {
      ...state,
      commandMessage: msg('가져올 변경점(Diff Hunk)이 없습니다'),
    };
  }

  const curIdx = state.activePaneIndex ?? 0;
  const otherIdx = 1 - curIdx;

  const otherLines = state.splitPanes[otherIdx].lines;
  const curLines = [...state.lines];

  const curStart = curIdx === 0 ? hunk.pane0Start : hunk.pane1Start;
  const curCount = curIdx === 0 ? hunk.pane0Count : hunk.pane1Count;

  const otherStart = otherIdx === 0 ? hunk.pane0Start : hunk.pane1Start;
  const otherCount = otherIdx === 0 ? hunk.pane0Count : hunk.pane1Count;

  // 상대 창의 해당 Hunk 라인들 추출
  const replacementLines = otherLines.slice(otherStart, otherStart + otherCount);

  // 현재 창 버퍼 내용 교체
  const newLines = [
    ...curLines.slice(0, curStart),
    ...replacementLines,
    ...curLines.slice(curStart + curCount),
  ];

  // 되돌리기(u)를 위한 스냅샷 저장
  const undoStack = state.undoStack ? [...state.undoStack] : [];
  undoStack.push({
    lines: [...state.lines],
    cursor: { ...state.cursor },
  });

  const updatedPanes: [SplitPaneState, SplitPaneState] = [
    { ...state.splitPanes[0] },
    { ...state.splitPanes[1] },
  ];
  updatedPanes[curIdx] = {
    ...updatedPanes[curIdx],
    lines: newLines,
    undoStack,
  };

  const nextState: VimEditorState = {
    ...state,
    lines: newLines,
    undoStack,
    splitPanes: updatedPanes,
    commandMessage: msg('1개의 변경점을 가져왔습니다 (do / :diffget)'),
  };

  return updateDiffState(nextState);
}

/**
 * dp (diffput / :diffput): 현재 창의 변경사항을 상대 창으로 밀어넣습니다.
 */
export function diffPut(state: VimEditorState): VimEditorState {
  if (!state.diffMode || !state.splitPanes || state.splitPanes.length < 2) {
    return {
      ...state,
      commandMessage: msg('E97: diff 모드가 아닙니다 (:diffput / dp)'),
    };
  }

  const hunk = findHunkAtCursor(state);
  if (!hunk) {
    return {
      ...state,
      commandMessage: msg('밀어넣을 변경점(Diff Hunk)이 없습니다'),
    };
  }

  const curIdx = state.activePaneIndex ?? 0;
  const otherIdx = 1 - curIdx;

  const curLines = state.lines;
  const otherLines = [...state.splitPanes[otherIdx].lines];

  const curStart = curIdx === 0 ? hunk.pane0Start : hunk.pane1Start;
  const curCount = curIdx === 0 ? hunk.pane0Count : hunk.pane1Count;

  const otherStart = otherIdx === 0 ? hunk.pane0Start : hunk.pane1Start;
  const otherCount = otherIdx === 0 ? hunk.pane0Count : hunk.pane1Count;

  // 현재 창의 해당 Hunk 라인들 추출
  const replacementLines = curLines.slice(curStart, curStart + curCount);

  // 상대 창 버퍼 내용 교체
  const newOtherLines = [
    ...otherLines.slice(0, otherStart),
    ...replacementLines,
    ...otherLines.slice(otherStart + otherCount),
  ];

  const otherUndo = state.splitPanes[otherIdx].undoStack
    ? [...state.splitPanes[otherIdx].undoStack!]
    : [];
  otherUndo.push({
    lines: [...otherLines],
    cursor: { ...state.splitPanes[otherIdx].cursor },
  });

  const updatedPanes: [SplitPaneState, SplitPaneState] = [
    { ...state.splitPanes[0] },
    { ...state.splitPanes[1] },
  ];
  updatedPanes[otherIdx] = {
    ...updatedPanes[otherIdx],
    lines: newOtherLines,
    undoStack: otherUndo,
  };

  const nextState: VimEditorState = {
    ...state,
    splitPanes: updatedPanes,
    commandMessage: msg('1개의 변경점을 상대 창에 밀어넣었습니다 (dp / :diffput)'),
  };

  return updateDiffState(nextState);
}
