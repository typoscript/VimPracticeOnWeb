import { GitBlameInfo, GitCommitEntry, GitPanelState, VimEditorState } from './types';
import {
  getGitHunks,
  resetGitBuffer,
  resetGitHunk,
  stageGitHunk,
  undoStageGitHunk,
} from './gitSignsEngine';
import { clampCursor } from './cursor';
import { msg } from './messages';

function makeCommitHash(seed: string, seq: number): string {
  let h = 0x811c9dc5 ^ seq;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0).toString(16).padStart(7, '0')).slice(0, 7);
}

export function getEffectiveCommitLog(state: VimEditorState): GitCommitEntry[] {
  if (state.gitCommitLog && state.gitCommitLog.length > 0) {
    return state.gitCommitLog;
  }
  return [
    {
      hash: 'a1b2c3d',
      author: 'vim-dev',
      message: 'Initial commit',
      filename: state.primaryFilename || 'practice.ts',
      added: state.lines.length,
      removed: 0,
    },
  ];
}

/**
 * 현재 버퍼의 각 줄에 대한 Git Blame 정보를 계산합니다 (`:Git blame` / `:Gblame`).
 */
export function computeGitBlameLines(state: VimEditorState): GitBlameInfo[] {
  const hunks = getGitHunks(state);
  const log = getEffectiveCommitLog(state);
  const head = log[0];
  const changedLines = new Set<number>();

  for (const h of hunks) {
    if (h.type !== 'delete') {
      for (let l = h.startLine; l <= h.endLine; l++) {
        changedLines.add(l);
      }
    }
  }

  return state.lines.map((_, lineIdx) => {
    if (changedLines.has(lineIdx)) {
      return {
        hash: '0000000',
        author: 'Not Committed Yet',
        message: state.gitStaged ? 'staged changes' : 'working tree',
        uncommitted: true,
      };
    }
    return {
      hash: head.hash,
      author: head.author,
      message: head.message,
      uncommitted: false,
    };
  });
}

/**
 * `:Git [status|add|commit -m "..."|log|blame|diff|reset]` / `:G [...]` — vim-fugitive 스타일 미니 Git 워크플로
 */
export function executeGitCommand(state: VimEditorState, rawArgs: string): VimEditorState {
  const trimmed = rawArgs.trim();
  const [rawSub = 'status', ...restParts] = trimmed.split(/\s+/);
  const sub = rawSub.toLowerCase();
  const rest = restParts.join(' ').trim();
  const filename = state.primaryFilename || 'buffer';
  const hunks = getGitHunks(state);

  if (!trimmed || sub === 'status' || sub === 'st' || sub === 'panel' || sub === 'ui') {
    const added = hunks.reduce((acc, h) => acc + h.addedLines.length, 0);
    const removed = hunks.reduce((acc, h) => acc + h.removedLines.length, 0);
    const log = getEffectiveCommitLog(state);
    const shouldOpenPanel = !trimmed || sub === 'panel' || sub === 'ui';
    const nextPanel: GitPanelState | null | undefined = shouldOpenPanel
      ? {
          isOpen: true,
          selectedIndex: 0,
          expandedHunkIds: hunks.length > 0 ? [hunks[0].id] : [],
          activeTab: 'changes',
        }
      : state.gitPanel;
    if (hunks.length === 0 && !state.gitStaged) {
      return {
        ...state,
        gitPanel: nextPanel,
        commandMessage: msg('[Git] clean (HEAD {hash} "{msg}")', {
          hash: log[0].hash,
          msg: log[0].message,
        }),
      };
    }
    const stageTag = state.gitStaged ? 'staged' : 'unstaged';
    return {
      ...state,
      gitPanel: nextPanel,
      commandMessage: msg('[Git status] {file}: {stage} ({hunks} Hunk · +{added} -{removed})', {
        file: filename,
        stage: stageTag,
        hunks: hunks.length,
        added,
        removed,
      }),
    };
  }

  if (sub === 'close' || sub === 'hide') {
    return closeGitPanel(state);
  }

  if (sub === 'unstage') {
    return unstageGitPanelChanges(state);
  }

  if (sub === 'add' || sub === 'stage') {
    if (hunks.length === 0 && !state.gitStaged) {
      return {
        ...state,
        commandMessage: msg('[Git] 스테이징할 변경사항이 없습니다'),
      };
    }
    const stagedState = hunks.length > 0 ? { ...state, gitStaged: true } : state;
    return {
      ...stagedState,
      commandMessage: msg('[Git add] "{file}" 변경사항({hunks} Hunk)을 스테이징했습니다', {
        file: filename,
        hunks: hunks.length,
      }),
    };
  }

  if (sub === 'stage_hunk') {
    const res = stageGitHunk(state);
    return res.bell ? res : { ...res, gitStaged: true };
  }

  if (sub === 'commit' || sub === 'ci') {
    const msgMatch =
      rest.match(/^(?:-am|-m)\s+"([^"]+)"/) ??
      rest.match(/^(?:-am|-m)\s+'([^']+)'/) ??
      rest.match(/^(?:-am|-m)\s+(.+)$/);
    const commitMsg = msgMatch ? msgMatch[1].trim() : rest.replace(/^["']|["']$/g, '').trim();
    if (!commitMsg) {
      return {
        ...state,
        bell: true,
        commandMessage: msg('[Git commit] 커밋 메시지를 입력하세요 (예: :Git commit -m "fix bug")'),
      };
    }

    const isAutoStage = rest.startsWith('-am');
    if (hunks.length === 0 && !state.gitStaged) {
      return {
        ...state,
        bell: true,
        commandMessage: msg('[Git commit] 커밋할 변경사항이 없습니다 (working tree clean)'),
      };
    }
    if (!state.gitStaged && !isAutoStage && hunks.length > 0) {
      // 편의상 변경이 있으면 자동 스테이징하거나 명시적 커밋 허용
    }

    const prevLog = getEffectiveCommitLog(state);
    const added = hunks.reduce((acc, h) => acc + h.addedLines.length, 0);
    const removed = hunks.reduce((acc, h) => acc + h.removedLines.length, 0);
    const hash = makeCommitHash(`${filename}:${commitMsg}:${prevLog.length}`, prevLog.length + 1);
    const entry: GitCommitEntry = {
      hash,
      author: 'you',
      message: commitMsg,
      filename,
      added,
      removed,
    };

    const nextBuffers = state.buffers?.map((b) =>
      b.id === (state.currentBufferId ?? 1) ? { ...b, gitBaseLines: [...state.lines] } : b
    );

    return {
      ...state,
      gitBaseLines: [...state.lines],
      gitBaseHistory: [...(state.gitBaseHistory ?? []), [...(state.gitBaseLines ?? state.lines)]],
      gitStaged: false,
      gitCommitLog: [entry, ...prevLog],
      buffers: nextBuffers ?? state.buffers,
      gitHunkPreview: null,
      commandMessage: msg('[Git commit {hash}] "{msg}" (+{added} -{removed})', {
        hash,
        msg: commitMsg,
        added,
        removed,
      }),
    };
  }

  if (sub === 'log') {
    const log = getEffectiveCommitLog(state);
    const preview = log
      .slice(0, 4)
      .map((c) => `${c.hash} ${c.message} (${c.author})`)
      .join(' | ');
    return {
      ...state,
      commandMessage: msg('[Git log] {preview}', { preview }),
    };
  }

  if (sub === 'blame') {
    const nextVisible =
      rest.toLowerCase() === 'on'
        ? true
        : rest.toLowerCase() === 'off'
          ? false
          : !Boolean(state.gitBlameVisible);
    return {
      ...state,
      gitBlameVisible: nextVisible,
      commandMessage: nextVisible
        ? msg('[Git blame] 인라인 Blame 표시 켜짐 (:Gblame 로 끄기)')
        : msg('[Git blame] 인라인 Blame 표시 꺼짐'),
    };
  }

  if (sub === 'diff') {
    if (hunks.length === 0) {
      return { ...state, commandMessage: msg('[Git diff] 변경사항이 없습니다') };
    }
    const added = hunks.reduce((acc, h) => acc + h.addedLines.length, 0);
    const removed = hunks.reduce((acc, h) => acc + h.removedLines.length, 0);
    return {
      ...state,
      commandMessage: msg('[Git diff] {file}: {hunks} Hunk (+{added} -{removed})', {
        file: filename,
        hunks: hunks.length,
        added,
        removed,
      }),
    };
  }

  if (sub === 'reset' || sub === 'checkout') {
    const restored = resetGitBuffer(state);
    return {
      ...restored,
      gitStaged: false,
    };
  }

  return {
    ...state,
    bell: true,
    commandMessage: msg('[Git] 알 수 없는 하위 명령입니다: {sub}', { sub }),
  };
}

/**
 * 인터랙티브 Git 분할 패널을 엽니다 (:Git / :LazyGit / :Fugitive).
 */
export function openGitPanel(
  state: VimEditorState,
  activeTab: 'changes' | 'log' = 'changes'
): VimEditorState {
  const hunks = getGitHunks(state);
  return {
    ...state,
    gitPanel: {
      isOpen: true,
      selectedIndex: 0,
      expandedHunkIds: hunks.length > 0 ? [hunks[0].id] : [],
      activeTab,
    },
    commandMessage: msg('[Git] 인터랙티브 Git 패널 열림 (j/k 이동 · s 스테이징 · u 취소 · = Diff · c 커밋)'),
  };
}

/**
 * 인터랙티브 Git 분할 패널을 닫습니다 (:GitClose / :Git close).
 */
export function closeGitPanel(state: VimEditorState): VimEditorState {
  return {
    ...state,
    gitPanel: null,
    commandMessage: msg('[Git] 인터랙티브 Git 패널을 닫았습니다'),
  };
}

/**
 * 인터랙티브 Git 분할 패널 표시를 토글합니다 (:GitToggle / :LazyGit).
 */
export function toggleGitPanel(state: VimEditorState): VimEditorState {
  return state.gitPanel?.isOpen ? closeGitPanel(state) : openGitPanel(state);
}

/**
 * Git 패널의 활성 탭(changes | log)을 전환합니다.
 */
export function setGitPanelTab(
  state: VimEditorState,
  activeTab: 'changes' | 'log'
): VimEditorState {
  const prev = state.gitPanel;
  if (!prev?.isOpen) return openGitPanel(state, activeTab);
  return {
    ...state,
    gitPanel: {
      ...prev,
      activeTab,
      selectedIndex: 0,
    },
  };
}

/**
 * Git 패널에서 선택된 Hunk/로그 항목 인덱스를 변경합니다.
 */
export function selectGitPanelHunk(state: VimEditorState, index: number): VimEditorState {
  const prev = state.gitPanel;
  if (!prev?.isOpen) return state;
  const maxLen =
    prev.activeTab === 'log' ? getEffectiveCommitLog(state).length : getGitHunks(state).length;
  const clamped = maxLen > 0 ? Math.max(0, Math.min(index, maxLen - 1)) : 0;
  return {
    ...state,
    gitPanel: {
      ...prev,
      selectedIndex: clamped,
    },
  };
}

/**
 * Git 패널에서 특정 Hunk 의 인라인 Diff 펼침 상태를 토글합니다 (=).
 */
export function toggleGitPanelHunkDiff(state: VimEditorState, hunkId: number): VimEditorState {
  const prev = state.gitPanel;
  if (!prev?.isOpen) return state;
  const exists = prev.expandedHunkIds.includes(hunkId);
  const nextExpanded = exists
    ? prev.expandedHunkIds.filter((id) => id !== hunkId)
    : [...prev.expandedHunkIds, hunkId];
  return {
    ...state,
    gitPanel: {
      ...prev,
      expandedHunkIds: nextExpanded,
    },
  };
}

/**
 * Git 패널에서 선택한 Hunk 위치로 에디터 커서를 이동합니다.
 */
export function jumpToGitPanelHunk(state: VimEditorState, hunkIndex: number): VimEditorState {
  const hunks = getGitHunks(state);
  const target = hunks[hunkIndex];
  if (!target) return state;
  return {
    ...state,
    cursor: clampCursor(state.lines, { line: target.startLine, col: 0 }, 'NORMAL'),
    gitPanel: state.gitPanel
      ? { ...state.gitPanel, selectedIndex: hunkIndex }
      : state.gitPanel,
  };
}

/**
 * Git 패널에서 특정 Hunk 를 개별 스테이징합니다 (s).
 */
export function stageGitPanelHunkByIndex(
  state: VimEditorState,
  hunkIndex: number
): VimEditorState {
  const hunks = getGitHunks(state);
  const target = hunks[hunkIndex];
  if (!target) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[Git] 스테이징할 변경사항이 없습니다'),
    };
  }
  const focused: VimEditorState = {
    ...state,
    cursor: clampCursor(state.lines, { line: target.startLine, col: 0 }, 'NORMAL'),
  };
  const staged = stageGitHunk(focused);
  if (staged.bell) return staged;
  const remaining = getGitHunks(staged);
  return {
    ...staged,
    gitStaged: true,
    gitPanel: staged.gitPanel
      ? {
          ...staged.gitPanel,
          selectedIndex: Math.min(hunkIndex, Math.max(0, remaining.length - 1)),
        }
      : staged.gitPanel,
  };
}

/**
 * Git 패널에서 스테이징된 변경을 취소합니다 (u).
 */
export function unstageGitPanelChanges(state: VimEditorState): VimEditorState {
  if ((state.gitBaseHistory?.length ?? 0) > 0) {
    const undone = undoStageGitHunk(state);
    return {
      ...undone,
      gitStaged: false,
    };
  }
  if (state.gitStaged) {
    return {
      ...state,
      gitStaged: false,
      commandMessage: msg('[Git] 스테이징을 해제했습니다'),
    };
  }
  return {
    ...state,
    bell: true,
    commandMessage: msg('[Git] 취소할 스테이징 변경사항이 없습니다'),
  };
}

/**
 * Git 패널에서 특정 Hunk 를 HEAD 원본으로 되돌립니다 (X).
 */
export function resetGitPanelHunkByIndex(
  state: VimEditorState,
  hunkIndex: number
): VimEditorState {
  const hunks = getGitHunks(state);
  const target = hunks[hunkIndex];
  if (!target) return state;
  const focused: VimEditorState = {
    ...state,
    cursor: clampCursor(state.lines, { line: target.startLine, col: 0 }, 'NORMAL'),
  };
  const reset = resetGitHunk(focused);
  const remaining = getGitHunks(reset);
  return {
    ...reset,
    gitPanel: reset.gitPanel
      ? {
          ...reset.gitPanel,
          selectedIndex: Math.min(hunkIndex, Math.max(0, remaining.length - 1)),
        }
      : reset.gitPanel,
  };
}

/**
 * Git 패널 입력 폼에서 커밋을 실행합니다 (cc).
 */
export function commitFromGitPanel(state: VimEditorState, message: string): VimEditorState {
  const cleanMsg = message.trim();
  if (!cleanMsg) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[Git commit] 커밋 메시지를 입력하세요 (예: :Git commit -m "fix bug")'),
    };
  }
  const escaped = cleanMsg.replace(/"/g, "'");
  const committed = executeGitCommand(state, `commit -m "${escaped}"`);
  if (committed.bell) return committed;
  return {
    ...committed,
    gitPanel: state.gitPanel
      ? {
          ...state.gitPanel,
          isOpen: true,
          selectedIndex: 0,
          expandedHunkIds: [],
          activeTab: 'log',
        }
      : committed.gitPanel,
  };
}
