import { GitBlameInfo, GitCommitEntry, VimEditorState } from './types';
import { getGitHunks, resetGitBuffer, stageGitHunk } from './gitSignsEngine';
import { msg } from './messages';

function makeCommitHash(seed: string, seq: number): string {
  let h = 0x811c9dc5 ^ seq;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0).toString(16).padStart(7, '0')).slice(0, 7);
}

function getEffectiveCommitLog(state: VimEditorState): GitCommitEntry[] {
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

  if (!trimmed || sub === 'status' || sub === 'st') {
    const added = hunks.reduce((acc, h) => acc + h.addedLines.length, 0);
    const removed = hunks.reduce((acc, h) => acc + h.removedLines.length, 0);
    const log = getEffectiveCommitLog(state);
    if (hunks.length === 0 && !state.gitStaged) {
      return {
        ...state,
        commandMessage: msg('[Git] clean (HEAD {hash} "{msg}")', {
          hash: log[0].hash,
          msg: log[0].message,
        }),
      };
    }
    const stageTag = state.gitStaged ? 'staged' : 'unstaged';
    return {
      ...state,
      commandMessage: msg('[Git status] {file}: {stage} ({hunks} Hunk · +{added} -{removed})', {
        file: filename,
        stage: stageTag,
        hunks: hunks.length,
        added,
        removed,
      }),
    };
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
