import {
  GitConflictBlock,
  GitConflictChoice,
  GitConflictLineKind,
  QuickfixItem,
  VimEditorState,
} from './types';
import { pushUndoSnapshot } from './operators';
import { clampCursor } from './cursor';
import { recordJump } from './marks';
import { msg } from './messages';
import { ringBell } from './engineHelpers';

const OURS_MARKER_RE = /^<{7}(?:\s+(.*))?$/;
const BASE_MARKER_RE = /^\|{7}(?:\s+(.*))?$/;
const SEP_MARKER_RE = /^={7}$/;
const THEIRS_MARKER_RE = /^>{7}(?:\s+(.*))?$/;

/**
 * 버퍼 내 Git 2-Way / 3-Way(diff3) 머지 충돌 블록(`<<<<<<<`, `|||||||`, `=======`, `>>>>>>>`)을 파싱합니다.
 */
export function parseGitConflicts(lines: string[]): GitConflictBlock[] {
  const blocks: GitConflictBlock[] = [];
  let i = 0;
  let nextId = 1;

  while (i < lines.length) {
    const startMatch = (lines[i] ?? '').match(OURS_MARKER_RE);
    if (!startMatch) {
      i++;
      continue;
    }

    const startLine = i;
    const oursLabel = (startMatch[1] ?? '').trim() || 'HEAD';
    let baseMarkerLine: number | undefined;
    let baseLabel: string | undefined;
    let separatorLine = -1;
    let endLine = -1;
    let theirsLabel = 'incoming';

    let j = i + 1;
    while (j < lines.length) {
      const line = lines[j] ?? '';
      if (OURS_MARKER_RE.test(line)) {
        // 중첩/깨진 마커: 이전 시작을 포기하고 새로 시작
        break;
      }
      if (separatorLine === -1 && baseMarkerLine === undefined) {
        const baseMatch = line.match(BASE_MARKER_RE);
        if (baseMatch) {
          baseMarkerLine = j;
          baseLabel = (baseMatch[1] ?? '').trim() || 'base';
          j++;
          continue;
        }
      }
      if (separatorLine === -1 && SEP_MARKER_RE.test(line)) {
        separatorLine = j;
        j++;
        continue;
      }
      if (separatorLine !== -1) {
        const endMatch = line.match(THEIRS_MARKER_RE);
        if (endMatch) {
          endLine = j;
          theirsLabel = (endMatch[1] ?? '').trim() || 'incoming';
          break;
        }
      }
      j++;
    }

    if (separatorLine !== -1 && endLine !== -1) {
      const oursEnd = baseMarkerLine !== undefined ? baseMarkerLine : separatorLine;
      const oursLines = lines.slice(startLine + 1, oursEnd);
      const baseLines =
        baseMarkerLine !== undefined
          ? lines.slice(baseMarkerLine + 1, separatorLine)
          : undefined;
      const theirsLines = lines.slice(separatorLine + 1, endLine);

      blocks.push({
        id: nextId++,
        startLine,
        baseMarkerLine,
        separatorLine,
        endLine,
        oursLabel,
        baseLabel,
        theirsLabel,
        oursLines,
        baseLines,
        theirsLines,
      });
      i = endLine + 1;
    } else {
      i++;
    }
  }

  return blocks;
}

/**
 * 지정된 0-based 줄을 포함하는 충돌 블록을 찾습니다.
 */
export function findGitConflictAtLine(
  lines: string[],
  line: number
): GitConflictBlock | null {
  const blocks = parseGitConflicts(lines);
  for (const block of blocks) {
    if (line >= block.startLine && line <= block.endLine) {
      return block;
    }
  }
  return null;
}

/**
 * Editor 행별 머지 충돌 컬러 하이라이트 맵을 계산합니다.
 */
export function getGitConflictLineKinds(
  lines: string[]
): Map<number, GitConflictLineKind> {
  const map = new Map<number, GitConflictLineKind>();
  const blocks = parseGitConflicts(lines);
  for (const b of blocks) {
    map.set(b.startLine, 'marker-ours');
    const oursEnd = b.baseMarkerLine !== undefined ? b.baseMarkerLine : b.separatorLine;
    for (let r = b.startLine + 1; r < oursEnd; r++) {
      map.set(r, 'ours');
    }
    if (b.baseMarkerLine !== undefined) {
      map.set(b.baseMarkerLine, 'marker-base');
      for (let r = b.baseMarkerLine + 1; r < b.separatorLine; r++) {
        map.set(r, 'base');
      }
    }
    map.set(b.separatorLine, 'separator');
    for (let r = b.separatorLine + 1; r < b.endLine; r++) {
      map.set(r, 'theirs');
    }
    map.set(b.endLine, 'marker-theirs');
  }
  return map;
}

/**
 * 다음(`]x`) 또는 이전(`[x`) 머지 충돌 블록으로 점프합니다.
 */
export function jumpGitConflict(
  state: VimEditorState,
  direction: 'next' | 'prev',
  count = 1
): VimEditorState {
  const blocks = parseGitConflicts(state.lines);
  if (blocks.length === 0) {
    return {
      ...ringBell(state),
      pendingKeys: undefined,
      commandMessage: msg('[Git Conflict] 해결할 머지 충돌이 없습니다'),
    };
  }

  const wrapscan = state.options?.wrapscan ?? true;
  const steps = Math.max(1, count);
  let curLine = state.cursor.line;
  let chosenIdx = -1;

  for (let s = 0; s < steps; s++) {
    if (direction === 'next') {
      const idx = blocks.findIndex((b) => b.startLine > curLine);
      if (idx !== -1) {
        chosenIdx = idx;
        curLine = blocks[idx].startLine;
      } else if (wrapscan) {
        chosenIdx = 0;
        curLine = blocks[0].startLine;
      } else {
        return {
          ...ringBell(state),
          pendingKeys: undefined,
          commandMessage: msg('[Git Conflict] 마지막 충돌입니다'),
        };
      }
    } else {
      let idx = -1;
      for (let k = blocks.length - 1; k >= 0; k--) {
        if (blocks[k].startLine < curLine) {
          idx = k;
          break;
        }
      }
      if (idx !== -1) {
        chosenIdx = idx;
        curLine = blocks[idx].startLine;
      } else if (wrapscan) {
        chosenIdx = blocks.length - 1;
        curLine = blocks[chosenIdx].startLine;
      } else {
        return {
          ...ringBell(state),
          pendingKeys: undefined,
          commandMessage: msg('[Git Conflict] 첫 번째 충돌입니다'),
        };
      }
    }
  }

  const target = blocks[chosenIdx];
  const withJump = recordJump(state);
  return {
    ...withJump,
    cursor: clampCursor(withJump.lines, { line: target.startLine, col: 0 }, 'NORMAL'),
    pendingKeys: undefined,
    commandMessage: msg(
      '[Git Conflict] 충돌 {idx}/{total} (L{line}: {ours} ↔ {theirs})',
      {
        idx: chosenIdx + 1,
        total: blocks.length,
        line: target.startLine + 1,
        ours: target.oursLabel,
        theirs: target.theirsLabel,
      }
    ),
  };
}

const CHOICE_KEYS: Record<GitConflictChoice, string[] | null> = {
  ours: ['c', 'o'],
  theirs: ['c', 't'],
  both: ['c', 'b'],
  none: ['c', '0'],
  base: null,
};

/**
 * 커서가 위치한(또는 지정 줄의) 머지 충돌 블록을 선택한 쪽으로 해결합니다.
 * (`co`: ours, `ct`: theirs, `cb`: both, `c0`: none, `:diffget //1`: base)
 */
export function chooseGitConflict(
  state: VimEditorState,
  choice: GitConflictChoice,
  isReplayingDot = false,
  targetLine?: number
): VimEditorState {
  const lineToCheck = targetLine ?? state.cursor.line;
  const block = findGitConflictAtLine(state.lines, lineToCheck);
  if (!block) {
    return {
      ...ringBell(state),
      pendingKeys: undefined,
      commandMessage: msg('[Git Conflict] 커서가 머지 충돌 영역 안에 있지 않습니다'),
    };
  }

  if (choice === 'base' && block.baseLines === undefined) {
    return {
      ...ringBell(state),
      pendingKeys: undefined,
      commandMessage: msg('[Git Conflict] diff3 베이스(|||||||) 섹션이 없는 충돌입니다'),
    };
  }

  let replacement: string[];
  switch (choice) {
    case 'ours':
      replacement = [...block.oursLines];
      break;
    case 'theirs':
      replacement = [...block.theirsLines];
      break;
    case 'both':
      replacement = [...block.oursLines, ...block.theirsLines];
      break;
    case 'base':
      replacement = [...(block.baseLines ?? [])];
      break;
    case 'none':
      replacement = [];
      break;
  }

  const withUndo = pushUndoSnapshot(state);
  const rawNextLines = [
    ...state.lines.slice(0, block.startLine),
    ...replacement,
    ...state.lines.slice(block.endLine + 1),
  ];
  const nextLines = rawNextLines.length > 0 ? rawNextLines : [''];
  const nextCursorLine = Math.min(block.startLine, nextLines.length - 1);
  const nextCursor = clampCursor(nextLines, { line: nextCursorLine, col: 0 }, 'NORMAL');

  // 열린 버퍼/VFS 동기화
  const filename = state.primaryFilename;
  const nextVirtualFiles =
    filename && state.virtualFiles && filename in state.virtualFiles
      ? { ...state.virtualFiles, [filename]: [...nextLines] }
      : state.virtualFiles;

  const remaining = parseGitConflicts(nextLines).length;
  const changeKeys = CHOICE_KEYS[choice];

  return {
    ...withUndo,
    lines: nextLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    pendingKeys: undefined,
    virtualFiles: nextVirtualFiles,
    gitConflictResolvedCount: (state.gitConflictResolvedCount ?? 0) + 1,
    lastChangeKeys:
      !isReplayingDot && changeKeys ? changeKeys : state.lastChangeKeys,
    commandMessage:
      remaining > 0
        ? msg('[Git Conflict] {choice} 선택으로 해결 (남은 충돌 {remaining}건)', {
            choice,
            remaining,
          })
        : msg('[Git Conflict] {choice} 선택으로 모든 머지 충돌 해결 완료!', {
            choice,
          }),
  };
}

/**
 * 현재 버퍼와 VFS 전체에서 머지 충돌 목록을 수집해 퀵픽스(:copen)로 보냅니다 (`:GitConflictListQf`).
 */
export function listGitConflictsToQuickfix(state: VimEditorState): VimEditorState {
  const items: QuickfixItem[] = [];
  const currentFile = state.primaryFilename || 'buffer.ts';
  const scannedFiles = new Set<string>();

  const scan = (filename: string, lines: string[]) => {
    scannedFiles.add(filename);
    const blocks = parseGitConflicts(lines);
    for (const b of blocks) {
      items.push({
        filename,
        line: b.startLine,
        col: 0,
        text: `Git conflict (${b.oursLabel} ↔ ${b.theirsLabel})`,
        type: 'E',
      });
    }
  };

  scan(currentFile, state.lines);
  if (state.virtualFiles) {
    for (const [fname, flines] of Object.entries(state.virtualFiles)) {
      if (scannedFiles.has(fname)) continue;
      scan(fname, flines);
    }
  }

  if (items.length === 0) {
    return {
      ...state,
      pendingKeys: undefined,
      commandMessage: msg('[Git Conflict] 프로젝트에 남은 머지 충돌이 없습니다'),
    };
  }

  return {
    ...state,
    pendingKeys: undefined,
    quickfix: {
      items,
      currentIndex: 0,
      isOpen: true,
    },
    commandMessage: msg('[Git Conflict] {count}개 충돌을 퀵픽스에 등록했습니다 (:copen)', {
      count: items.length,
    }),
  };
}

/**
 * `:GitConflict*` Ex 명령 디스패처
 */
export function executeGitConflictCommand(
  state: VimEditorState,
  commandName: string
): VimEditorState {
  const cmd = commandName.toLowerCase();
  switch (cmd) {
    case 'gitconflictchooseours':
      return chooseGitConflict(state, 'ours');
    case 'gitconflictchoosetheirs':
      return chooseGitConflict(state, 'theirs');
    case 'gitconflictchooseboth':
      return chooseGitConflict(state, 'both');
    case 'gitconflictchoosenone':
      return chooseGitConflict(state, 'none');
    case 'gitconflictchoosebase':
      return chooseGitConflict(state, 'base');
    case 'gitconflictnextconflict':
      return jumpGitConflict(state, 'next', 1);
    case 'gitconflictprevconflict':
      return jumpGitConflict(state, 'prev', 1);
    case 'gitconflictlistqf':
      return listGitConflictsToQuickfix(state);
    case 'gitconflictrefresh': {
      const count = parseGitConflicts(state.lines).length;
      return {
        ...state,
        pendingKeys: undefined,
        commandMessage:
          count > 0
            ? msg('[Git Conflict] 현재 버퍼에 {count}개의 충돌이 감지되었습니다', { count })
            : msg('[Git Conflict] 해결할 머지 충돌이 없습니다'),
      };
    }
    default:
      return state;
  }
}
