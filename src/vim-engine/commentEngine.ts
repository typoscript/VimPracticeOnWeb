import { VimEditorState } from './types';
import { msg } from './messages';
import { pushUndoSnapshot } from './operators';
import { clampCursor } from './cursor';
import { recordChangePosition } from './advancedMotions';
import { getGlobalOptions, getLocalOptions } from './setEngine';
import { getFiletypeCommentString } from './ftpluginEngine';
import { detectFiletype } from './syntaxEngine';

export interface ParsedCommentString {
  left: string;
  right: string;
  leftTrimmed: string;
  rightTrimmed: string;
  leftPad: string;
  rightPad: string;
}

/**
 * commentstring 값(예: "// %s", "/* %s *\/", "# %s")을 좌우 주석 기호로 분해합니다.
 */
export function parseCommentString(cs: string): ParsedCommentString | null {
  if (!cs) return null;
  const idx = cs.indexOf('%s');
  if (idx === -1) return null;

  const left = cs.slice(0, idx);
  const right = cs.slice(idx + 2);
  const leftTrimmed = left.replace(/\s+$/, '');
  const rightTrimmed = right.replace(/^\s+/, '');
  if (!leftTrimmed && !rightTrimmed) return null;

  const leftPad = left.slice(leftTrimmed.length);
  const rightPad = right.slice(0, right.length - rightTrimmed.length);

  return {
    left,
    right,
    leftTrimmed,
    rightTrimmed,
    leftPad,
    rightPad,
  };
}

/**
 * 파일명 확장자로 파일타입 키를 보조 추출합니다 (syntaxEngine 이 다루지 않는 css, lua, sql, c 등 포함).
 */
function inferFiletypeFromFilename(filename?: string): string {
  const detected = detectFiletype(filename);
  if (detected !== 'text') return detected;
  if (!filename) return 'text';
  const clean = filename.toLowerCase().trim();
  const extMatch = clean.match(/\.([a-z0-9]+)$/);
  return extMatch ? extMatch[1] : 'text';
}

/**
 * 현재 버퍼의 유효한 commentstring 을 결정합니다.
 * 우선순위: 버퍼 로컬(:setl cms) -> 전역(:set cms / :setg cms) -> 파일타입 기본값 -> '// %s'
 */
export function resolveCommentString(state: VimEditorState): string {
  const curId = state.currentBufferId ?? 1;
  const local = getLocalOptions(state, curId);
  if (local.commentstring !== undefined) {
    return local.commentstring;
  }

  const global = getGlobalOptions(state);
  if (global.commentstring !== undefined) {
    return global.commentstring;
  }
  if (state.options?.commentstring !== undefined) {
    return state.options.commentstring;
  }

  const ft = state.options?.filetype || inferFiletypeFromFilename(state.primaryFilename);
  const preset = getFiletypeCommentString(ft);
  if (preset !== undefined) {
    return preset;
  }

  return '// %s';
}

/**
 * 단일 줄이 현재 commentstring 규칙으로 주석 처리되어 있는지 판별합니다.
 */
export function isLineCommented(line: string, parsed: ParsedCommentString): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (parsed.leftTrimmed && !trimmed.startsWith(parsed.leftTrimmed)) {
    return false;
  }
  if (parsed.rightTrimmed) {
    if (!trimmed.endsWith(parsed.rightTrimmed)) return false;
    if (trimmed.length < parsed.leftTrimmed.length + parsed.rightTrimmed.length) return false;
  }
  return true;
}

function uncommentLine(line: string, parsed: ParsedCommentString): string {
  const indentMatch = line.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '';
  const rest = line.slice(indent.length);

  if (parsed.leftTrimmed && !rest.startsWith(parsed.leftTrimmed)) return line;
  if (parsed.rightTrimmed && !rest.endsWith(parsed.rightTrimmed)) return line;

  let inner = rest.slice(parsed.leftTrimmed.length);
  if (parsed.rightTrimmed.length > 0) {
    inner = inner.slice(0, inner.length - parsed.rightTrimmed.length);
  }
  if (parsed.leftPad.length > 0 && inner.startsWith(parsed.leftPad)) {
    inner = inner.slice(parsed.leftPad.length);
  }
  if (parsed.rightPad.length > 0 && inner.endsWith(parsed.rightPad)) {
    inner = inner.slice(0, inner.length - parsed.rightPad.length);
  }

  if (inner === '') return '';
  return indent + inner;
}

/**
 * startLine ~ endLine (0-indexed, 양끝 포함) 범위의 줄들을 주석 토글합니다.
 * Neovim built-in gc/gcc 규칙:
 * - 범위 내 모든 줄이 빈 줄이면 변경하지 않음
 * - 비어 있지 않은 줄들이 모두 주석 상태이면 일괄 주석 해제
 * - 하나라도 비주석 상태이면 비어 있지 않은 줄들의 최소 들여쓰기 기준으로 일괄 주석 처리
 */
export function toggleCommentRange(
  state: VimEditorState,
  rawStartLine: number,
  rawEndLine: number
): VimEditorState {
  const cs = resolveCommentString(state);
  const parsed = parseCommentString(cs);
  if (!parsed) {
    return {
      ...state,
      bell: true,
      mode: 'NORMAL',
      visualAnchor: undefined,
      pendingKeys: undefined,
      commandMessage: msg('E537: \'commentstring\' 옵션이 비어 있거나 %s를 포함해야 합니다'),
    };
  }

  const start = Math.max(0, Math.min(rawStartLine, rawEndLine));
  const end = Math.min(state.lines.length - 1, Math.max(rawStartLine, rawEndLine));
  const slice = state.lines.slice(start, end + 1);
  const nonBlank = slice.filter((l) => l.trim().length > 0);

  if (nonBlank.length === 0) {
    const nextCursor = clampCursor(state.lines, { line: start, col: state.cursor.col }, 'NORMAL');
    return {
      ...state,
      cursor: nextCursor,
      mode: 'NORMAL',
      visualAnchor: undefined,
      pendingKeys: undefined,
    };
  }

  const allCommented = nonBlank.every((l) => isLineCommented(l, parsed));
  const snapshotBase = state.mode.startsWith('VISUAL')
    ? { ...state, cursor: clampCursor(state.lines, { line: start, col: 0 }, 'NORMAL') }
    : state;
  const stateWithUndo = pushUndoSnapshot(snapshotBase);
  const newLines = [...state.lines];

  if (allCommented) {
    for (let i = start; i <= end; i++) {
      if (newLines[i].trim().length > 0) {
        newLines[i] = uncommentLine(newLines[i], parsed);
      }
    }
  } else {
    let minIndentStr = '';
    let minIndentLen = Infinity;
    for (const l of nonBlank) {
      const m = l.match(/^(\s*)/);
      const indent = m ? m[1] : '';
      if (indent.length < minIndentLen) {
        minIndentLen = indent.length;
        minIndentStr = indent;
      }
    }

    for (let i = start; i <= end; i++) {
      if (newLines[i].trim().length === 0) {
        newLines[i] = minIndentStr + parsed.leftTrimmed + parsed.rightTrimmed;
      } else {
        const prefix = newLines[i].slice(0, minIndentLen);
        const body = newLines[i].slice(minIndentLen);
        newLines[i] = prefix + parsed.left + body + parsed.right;
      }
    }
  }

  const nextCursor = clampCursor(newLines, { line: start, col: 0 }, 'NORMAL');
  const changeRecord = recordChangePosition(stateWithUndo.changeList, nextCursor);

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    pendingKeys: undefined,
    changeList: changeRecord.changeList,
    changeIndex: changeRecord.changeIndex,
  };
}

/**
 * gc 텍스트 객체(dgc, ygc, cgc 등): 커서 위치에서 위아래로 연속된 주석 줄 범위를 찾습니다.
 */
export function getCommentTextObjectRange(
  state: VimEditorState
): { startLine: number; endLine: number } | null {
  const parsed = parseCommentString(resolveCommentString(state));
  if (!parsed) return null;

  const curLine = state.cursor.line;
  if (!isLineCommented(state.lines[curLine] ?? '', parsed)) {
    return null;
  }

  let startLine = curLine;
  while (startLine > 0 && isLineCommented(state.lines[startLine - 1], parsed)) {
    startLine--;
  }

  let endLine = curLine;
  while (endLine < state.lines.length - 1 && isLineCommented(state.lines[endLine + 1], parsed)) {
    endLine++;
  }

  return { startLine, endLine };
}
