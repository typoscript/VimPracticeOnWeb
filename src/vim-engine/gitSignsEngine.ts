import { GitHunk, VimEditorState } from './types';
import { computeDiffHunks } from './diffEngine';
import { clampCursor, getFirstNonBlankCol } from './cursor';
import { pushUndoSnapshot } from './operators';
import { getOptions } from './setEngine';
import { msg } from './messages';

type GitBaseState = Pick<
  VimEditorState,
  | 'gitBaseLines'
  | 'gitBaseFilename'
  | 'buffers'
  | 'currentBufferId'
  | 'primaryFilename'
  | 'oilSession'
  | 'helpSession'
>;

/** 기준선 소유 파일 비교에 쓰는 현재 파일 키 (`ensureBuffers` 기본 이름과 동일) */
function currentGitFileKey(state: Pick<VimEditorState, 'primaryFilename'>): string {
  return state.primaryFilename || 'source.ts';
}

/** Oil·도움말·터미널처럼 Git 추적 대상이 아닌 특수 버퍼가 활성인지 여부 */
function isNonGitBuffer(state: GitBaseState): boolean {
  if (state.oilSession?.isOpen || state.helpSession?.isOpen) return true;
  const name = state.primaryFilename ?? '';
  return /^[a-z]+:\/\//i.test(name);
}

/**
 * 현재 버퍼의 Git 기준선(HEAD 스냅샷) 줄 배열을 반환합니다.
 * 명시적 gitBaseLines 가 현재 파일 소유이면 그것을, 아니면 활성 버퍼의 gitBaseLines / savedLines 를 사용합니다.
 * Oil·도움말·터미널 같은 특수 버퍼에는 기준선이 없습니다.
 */
export function getEffectiveGitBaseLines(state: GitBaseState): string[] | null {
  if (isNonGitBuffer(state)) return null;
  const fileKey = currentGitFileKey(state);
  if (
    state.gitBaseLines &&
    (state.gitBaseFilename === undefined || state.gitBaseFilename === fileKey)
  ) {
    return state.gitBaseLines;
  }
  const curId = state.currentBufferId ?? 1;
  const activeBuf = state.buffers?.find((b) => b.id === curId);
  if (!activeBuf || (state.primaryFilename && activeBuf.name !== state.primaryFilename)) return null;
  return activeBuf.gitBaseLines ?? activeBuf.savedLines ?? null;
}

/**
 * 키 처리 후 현재 파일이 바뀌었으면 최상위 gitBaseLines 를 원래 파일의 버퍼에 보관하고,
 * 새 파일 버퍼에 보관된 기준선을 최상위로 불러옵니다 (`prev` 는 키 처리 전 상태).
 */
export function syncGitBaseOwnership(prev: VimEditorState, next: VimEditorState): VimEditorState {
  const fileKey = currentGitFileKey(next);
  if (!next.gitBaseLines && !next.gitBaseFilename) {
    if (currentGitFileKey(prev) === fileKey) return next;
    const curBuf = next.buffers?.find(
      (b) => b.id === (next.currentBufferId ?? 1) && b.name === fileKey
    );
    return curBuf?.gitBaseLines
      ? { ...next, gitBaseLines: [...curBuf.gitBaseLines], gitBaseFilename: fileKey }
      : next;
  }
  const owner = next.gitBaseFilename ?? currentGitFileKey(prev);
  if (owner === fileKey) {
    return next.gitBaseFilename === owner ? next : { ...next, gitBaseFilename: owner };
  }

  let buffers = next.buffers;
  if (next.gitBaseLines && buffers?.some((b) => b.name === owner)) {
    const stashed = next.gitBaseLines;
    buffers = buffers.map((b) => (b.name === owner ? { ...b, gitBaseLines: [...stashed] } : b));
  }
  const curId = next.currentBufferId ?? 1;
  const target = buffers?.find((b) => b.id === curId && b.name === fileKey);
  const loaded = target?.gitBaseLines;
  return {
    ...next,
    buffers,
    gitBaseLines: loaded ? [...loaded] : undefined,
    gitBaseFilename: loaded ? fileKey : undefined,
  };
}

/**
 * 원본(HEAD) 줄 배열과 현재 줄 배열 간의 Git Hunk 목록을 계산합니다.
 */
export function computeGitHunks(baseLines: string[], currentLines: string[]): GitHunk[] {
  const diffHunks = computeDiffHunks(baseLines, currentLines);
  const maxCurLine = Math.max(0, currentLines.length - 1);

  return diffHunks.map((h, idx) => {
    const removedLines = baseLines.slice(h.pane0Start, h.pane0Start + h.pane0Count);
    const addedLines = currentLines.slice(h.pane1Start, h.pane1Start + h.pane1Count);
    let startLine: number;
    let endLine: number;
    if (h.type === 'delete') {
      const anchor = h.pane1Start > 0 ? Math.min(h.pane1Start - 1, maxCurLine) : 0;
      startLine = anchor;
      endLine = anchor;
    } else {
      startLine = Math.min(h.pane1Start, maxCurLine);
      endLine = Math.min(h.pane1Start + Math.max(0, h.pane1Count - 1), maxCurLine);
    }

    return {
      id: idx + 1,
      type: h.type,
      startLine,
      endLine,
      baseStart: h.pane0Start,
      baseCount: h.pane0Count,
      currentStart: h.pane1Start,
      currentCount: h.pane1Count,
      removedLines,
      addedLines,
    };
  });
}

/**
 * 현재 에디터 상태의 Git Hunk 목록을 반환합니다.
 */
export function getGitHunks(state: GitBaseState & Pick<VimEditorState, 'lines'>): GitHunk[] {
  const baseLines = getEffectiveGitBaseLines(state);
  if (!baseLines) return [];
  return computeGitHunks(baseLines, state.lines);
}

/**
 * 에디터 거터 렌더링용 줄별 Git Sign 맵(lineIndex -> 'add' | 'change' | 'delete')을 생성합니다.
 */
export function getGitLineSigns(state: GitBaseState & Pick<VimEditorState, 'lines'>): Map<number, 'add' | 'change' | 'delete'> {
  const signs = new Map<number, 'add' | 'change' | 'delete'>();
  const hunks = getGitHunks(state);
  for (const h of hunks) {
    if (h.type === 'delete') {
      if (!signs.has(h.startLine)) {
        signs.set(h.startLine, 'delete');
      }
    } else {
      for (let line = h.startLine; line <= h.endLine; line++) {
        signs.set(line, h.type);
      }
    }
  }
  return signs;
}

/**
 * 특정 줄에 속한 Git Hunk 를 찾습니다.
 */
export function findGitHunkAtLine(hunks: GitHunk[], line: number): GitHunk | null {
  for (const h of hunks) {
    if (line >= h.startLine && line <= h.endLine) {
      return h;
    }
  }
  return null;
}

/**
 * 다음/이전 Git Hunk 로 커서를 이동합니다 (]h / [h, :Gitsigns next_hunk / prev_hunk).
 */
export function jumpGitHunk(
  state: VimEditorState,
  direction: 'next' | 'prev',
  count = 1
): VimEditorState {
  const hunks = getGitHunks(state);
  if (hunks.length === 0) {
    return {
      ...state,
      pendingKeys: undefined,
      bell: true,
      commandMessage: msg('[Gitsigns] 변경된 Git Hunk가 없습니다'),
    };
  }

  const wrap = getOptions(state).wrapscan !== false;
  let curLine = state.cursor.line;
  let target: GitHunk | null = null;
  let targetIdx = -1;
  const steps = Math.max(1, count);

  for (let s = 0; s < steps; s++) {
    let foundIdx = -1;
    if (direction === 'next') {
      foundIdx = hunks.findIndex((h) => h.startLine > curLine);
      if (foundIdx === -1 && wrap) foundIdx = 0;
    } else {
      for (let i = hunks.length - 1; i >= 0; i--) {
        if (hunks[i].startLine < curLine) {
          foundIdx = i;
          break;
        }
      }
      if (foundIdx === -1 && wrap) foundIdx = hunks.length - 1;
    }

    if (foundIdx === -1) break;
    targetIdx = foundIdx;
    target = hunks[foundIdx];
    curLine = target.startLine;
  }

  if (!target) {
    return {
      ...state,
      pendingKeys: undefined,
      bell: true,
      commandMessage: msg('[Gitsigns] 더 이상 이동할 Git Hunk가 없습니다'),
    };
  }

  const targetCol = getFirstNonBlankCol(state.lines[target.startLine] ?? '');
  return {
    ...state,
    cursor: clampCursor(state.lines, { line: target.startLine, col: targetCol }, state.mode),
    pendingKeys: undefined,
    gitHunkPreview: null,
    commandMessage: msg('[Gitsigns] Hunk {current}/{total} ({type})', {
      current: targetIdx + 1,
      total: hunks.length,
      type: target.type,
    }),
  };
}

/**
 * 현재 커서 줄의 Git Hunk 미리보기 팝업을 엽니다 (:Gitsigns preview_hunk).
 */
export function previewGitHunk(state: VimEditorState): VimEditorState {
  const hunks = getGitHunks(state);
  const hunk = findGitHunkAtLine(hunks, state.cursor.line);
  if (!hunk) {
    return {
      ...state,
      gitHunkPreview: null,
      bell: true,
      commandMessage: msg('[Gitsigns] 현재 줄에 변경된 Hunk가 없습니다'),
    };
  }

  return {
    ...state,
    gitHunkPreview: {
      isOpen: true,
      hunk,
      line: state.cursor.line,
    },
    commandMessage: msg('[Gitsigns] Hunk #{id} 미리보기 (-{removed} +{added})', {
      id: hunk.id,
      removed: hunk.removedLines.length,
      added: hunk.addedLines.length,
    }),
  };
}

/**
 * Git Hunk 미리보기 팝업을 닫습니다.
 */
export function closeGitHunkPreview(state: VimEditorState): VimEditorState {
  if (!state.gitHunkPreview?.isOpen) return state;
  return { ...state, gitHunkPreview: null };
}

/**
 * 현재 커서 위치의 Git Hunk 만 원본(HEAD)으로 되돌립니다 (:Gitsigns reset_hunk).
 * Undo(`u`) 로 복원할 수 있습니다.
 */
export function resetGitHunk(state: VimEditorState): VimEditorState {
  const hunks = getGitHunks(state);
  const hunk = findGitHunkAtLine(hunks, state.cursor.line);
  if (!hunk) {
    return {
      ...state,
      gitHunkPreview: null,
      bell: true,
      commandMessage: msg('[Gitsigns] 현재 줄에 되돌릴 Hunk가 없습니다'),
    };
  }

  const withUndo = pushUndoSnapshot(state);
  let nextLines: string[];
  if (hunk.type === 'delete') {
    nextLines = [
      ...state.lines.slice(0, hunk.currentStart),
      ...hunk.removedLines,
      ...state.lines.slice(hunk.currentStart),
    ];
  } else {
    nextLines = [
      ...state.lines.slice(0, hunk.currentStart),
      ...hunk.removedLines,
      ...state.lines.slice(hunk.currentStart + hunk.currentCount),
    ];
  }
  if (nextLines.length === 0) nextLines = [''];

  const nextCursor = clampCursor(nextLines, { line: hunk.currentStart, col: 0 }, 'NORMAL');
  return {
    ...withUndo,
    lines: nextLines,
    cursor: nextCursor,
    gitHunkPreview: null,
    commandMessage: msg('[Gitsigns] Hunk #{id} 되돌림 완료', { id: hunk.id }),
  };
}

/**
 * 버퍼 전체를 Git 기준선(HEAD)으로 되돌립니다 (:Gitsigns reset_buffer).
 */
export function resetGitBuffer(state: VimEditorState): VimEditorState {
  const baseLines = getEffectiveGitBaseLines(state);
  if (!baseLines || getGitHunks(state).length === 0) {
    return {
      ...state,
      gitHunkPreview: null,
      commandMessage: msg('[Gitsigns] 변경된 Git Hunk가 없습니다'),
    };
  }

  const withUndo = pushUndoSnapshot(state);
  const nextLines = baseLines.length > 0 ? [...baseLines] : [''];
  return {
    ...withUndo,
    lines: nextLines,
    cursor: clampCursor(nextLines, state.cursor, 'NORMAL'),
    gitHunkPreview: null,
    commandMessage: msg('[Gitsigns] 버퍼 전체를 Git 원본으로 되돌렸습니다'),
  };
}

/**
 * 현재 커서 위치의 Git Hunk 를 스테이징하여 기준선(HEAD/Index)에 반영합니다 (:Gitsigns stage_hunk).
 */
export function stageGitHunk(state: VimEditorState): VimEditorState {
  const baseLines = getEffectiveGitBaseLines(state);
  const hunks = getGitHunks(state);
  const hunk = findGitHunkAtLine(hunks, state.cursor.line);
  if (!baseLines || !hunk) {
    return {
      ...state,
      gitHunkPreview: null,
      bell: true,
      commandMessage: msg('[Gitsigns] 현재 줄에 스테이징할 Hunk가 없습니다'),
    };
  }

  const nextBaseLines = [
    ...baseLines.slice(0, hunk.baseStart),
    ...hunk.addedLines,
    ...baseLines.slice(hunk.baseStart + hunk.baseCount),
  ];
  const prevHistory = state.gitBaseHistory ?? [];

  return {
    ...state,
    gitBaseLines: nextBaseLines,
    gitBaseFilename: currentGitFileKey(state),
    gitBaseHistory: [...prevHistory, [...baseLines]].slice(-30),
    gitHunkPreview: null,
    commandMessage: msg('[Gitsigns] Hunk #{id} 스테이징 완료', { id: hunk.id }),
  };
}

/**
 * 직전 :Gitsigns stage_hunk 작업을 취소합니다 (:Gitsigns undo_stage_hunk).
 */
export function undoStageGitHunk(state: VimEditorState): VimEditorState {
  const history = state.gitBaseHistory ?? [];
  if (history.length === 0) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[Gitsigns] 취소할 스테이징 기록이 없습니다'),
    };
  }

  const prevBase = history[history.length - 1];
  return {
    ...state,
    gitBaseLines: [...prevBase],
    gitBaseFilename: currentGitFileKey(state),
    gitBaseHistory: history.slice(0, -1),
    gitHunkPreview: null,
    commandMessage: msg('[Gitsigns] 직전 Hunk 스테이징을 취소했습니다'),
  };
}

/**
 * :Gitsigns [subcommand] Ex 명령을 실행합니다.
 */
export function executeGitsignsCommand(
  state: VimEditorState,
  rawArg: string
): VimEditorState {
  const sub = rawArg.trim().toLowerCase();

  if (sub === 'next_hunk' || sub === 'next') {
    return jumpGitHunk(state, 'next', 1);
  }
  if (sub === 'prev_hunk' || sub === 'prev') {
    return jumpGitHunk(state, 'prev', 1);
  }
  if (sub === 'preview_hunk' || sub === 'preview' || sub === 'preview_hunk_inline') {
    return previewGitHunk(state);
  }
  if (sub === 'reset_hunk' || sub === 'reset') {
    return resetGitHunk(state);
  }
  if (sub === 'reset_buffer') {
    return resetGitBuffer(state);
  }
  if (sub === 'stage_hunk' || sub === 'stage') {
    return stageGitHunk(state);
  }
  if (sub === 'undo_stage_hunk' || sub === 'unstage') {
    return undoStageGitHunk(state);
  }
  if (sub === 'status' || sub === '') {
    const hunks = getGitHunks(state);
    if (hunks.length === 0) {
      return {
        ...state,
        gitHunkPreview: null,
        commandMessage: msg('[Gitsigns] 변경된 Git Hunk가 없습니다'),
      };
    }
    let added = 0;
    let changed = 0;
    let deleted = 0;
    for (const h of hunks) {
      if (h.type === 'add') added += h.addedLines.length;
      else if (h.type === 'delete') deleted += h.removedLines.length;
      else changed += h.addedLines.length;
    }
    return {
      ...state,
      commandMessage: msg('[Gitsigns] {hunks}개 Hunk (+{added} ~{changed} -{deleted})', {
        hunks: hunks.length,
        added,
        changed,
        deleted,
      }),
    };
  }

  return {
    ...state,
    bell: true,
    commandMessage: msg('[Gitsigns] 알 수 없는 하위 명령입니다: {sub}', { sub }),
  };
}
