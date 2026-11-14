import { VimEditorState } from './types';
import { msg } from './messages';
import { clampCursor } from './cursor';
import { recordJump } from './marks';
import { editBuffer, syncCurrentBuffer } from './bufferEngine';
import { buildVfsMap } from './vfs';
import { splitWindow, switchPaneFocus } from './splitWindow';

const FILENAME_CHAR_RE = /[A-Za-z0-9_./~\-+@]/;

export interface ExtractedFileTarget {
  filename: string;
  targetLine?: number;
}

function normalizePosixPath(pathStr: string): string {
  const parts = pathStr.split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') {
        stack.pop();
      }
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

/**
 * 커서 위치의 파일 경로(및 gF 용 :줄번호)를 추출합니다.
 */
export function extractFileTargetAtCursor(
  line: string,
  col: number,
  includeLineNumber = false
): ExtractedFileTarget | null {
  if (!line || col < 0 || col >= line.length) return null;

  let scanCol = col;
  const ch = line[scanCol];
  if (!FILENAME_CHAR_RE.test(ch)) {
    // 여는 따옴표(', ", `) 바로 위에 커서가 있을 경우 다음 글자부터 경로를 읽음 (Neovim 동일)
    if (
      (ch === "'" || ch === '"' || ch === '`') &&
      scanCol + 1 < line.length &&
      FILENAME_CHAR_RE.test(line[scanCol + 1])
    ) {
      scanCol += 1;
    } else {
      return null;
    }
  }

  let start = scanCol;
  while (start > 0 && FILENAME_CHAR_RE.test(line[start - 1])) {
    start--;
  }

  let end = scanCol;
  while (end + 1 < line.length && FILENAME_CHAR_RE.test(line[end + 1])) {
    end++;
  }

  const raw = line.slice(start, end + 1).replace(/^\.+$/, '');
  if (!raw) return null;

  let targetLine: number | undefined;
  if (includeLineNumber && end + 1 < line.length) {
    const tail = line.slice(end + 1);
    const lineMatch = tail.match(/^:(\d+)/);
    if (lineMatch) {
      targetLine = Math.max(1, parseInt(lineMatch[1], 10));
    }
  }

  return { filename: raw, targetLine };
}

const DEFAULT_SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.py', '.go', '.rs', '.css', '.html', '.vim'];

/**
 * 버퍼 목록 및 가상 파일 시스템(VFS)에서 경로 후보를 탐색합니다.
 */
export function resolveFileFromProject(
  state: VimEditorState,
  rawPath: string
): { filename: string; lines: string[] } | null {
  const vfs = buildVfsMap(state);
  const buffers = state.buffers ?? [];

  const candidates: string[] = [];
  const baseDir = state.primaryFilename?.includes('/')
    ? state.primaryFilename.slice(0, state.primaryFilename.lastIndexOf('/'))
    : '';

  const pushCandidate = (p: string) => {
    const norm = normalizePosixPath(p);
    if (norm && !candidates.includes(norm)) candidates.push(norm);
    if (p && !candidates.includes(p)) candidates.push(p);
  };

  if (baseDir && (rawPath.startsWith('./') || rawPath.startsWith('../'))) {
    pushCandidate(`${baseDir}/${rawPath}`);
  }
  pushCandidate(rawPath);
  pushCandidate(rawPath.replace(/^\.\//, ''));

  const expanded: string[] = [];
  for (const base of candidates) {
    for (const ext of DEFAULT_SUFFIXES) {
      const withExt = ext && !base.endsWith(ext) ? `${base}${ext}` : base;
      if (!expanded.includes(withExt)) expanded.push(withExt);
    }
  }

  // 1. 정확 일치 탐색 (열려 있는 버퍼 우선, 다음 VFS)
  for (const cand of expanded) {
    const buf = buffers.find((b) => b.name === cand);
    if (buf) {
      return { filename: buf.name, lines: [...buf.lines] };
    }
    if (vfs[cand]) {
      return { filename: cand, lines: [...vfs[cand]] };
    }
  }

  // 2. 접미사 경로 일치 탐색 (예: payment.ts -> services/payment.ts)
  for (const cand of expanded) {
    const buf = buffers.find((b) => b.name.endsWith(`/${cand}`));
    if (buf) {
      return { filename: buf.name, lines: [...buf.lines] };
    }
    const vfsKey = Object.keys(vfs).find((k) => k.endsWith(`/${cand}`));
    if (vfsKey) {
      return { filename: vfsKey, lines: [...vfs[vfsKey]] };
    }
  }

  return null;
}

/**
 * gf / gF / Ctrl-w f: 커서 아래 파일 경로를 열어 이동합니다.
 */
export function gotoFileUnderCursor(
  state: VimEditorState,
  options: { withLineNumber?: boolean; split?: boolean } = {}
): VimEditorState {
  let target: ExtractedFileTarget | null = null;

  if (state.mode.startsWith('VISUAL') && state.visualAnchor) {
    const lineIdx = state.cursor.line;
    if (state.visualAnchor.line === lineIdx) {
      const start = Math.min(state.visualAnchor.col, state.cursor.col);
      const end = Math.max(state.visualAnchor.col, state.cursor.col);
      const selected = (state.lines[lineIdx] ?? '').slice(start, end + 1).trim();
      if (selected) {
        if (options.withLineNumber) {
          const m = selected.match(/^(.+?):(\d+)$/);
          target = m
            ? { filename: m[1], targetLine: Math.max(1, parseInt(m[2], 10)) }
            : { filename: selected };
        } else {
          target = { filename: selected };
        }
      }
    }
  }

  if (!target) {
    const lineStr = state.lines[state.cursor.line] ?? '';
    target = extractFileTargetAtCursor(lineStr, state.cursor.col, !!options.withLineNumber);
  }

  if (!target) {
    return {
      ...state,
      bell: true,
      mode: 'NORMAL',
      visualAnchor: undefined,
      pendingKeys: undefined,
      commandMessage: msg('E446: 커서 위치에 파일 이름이 없습니다'),
    };
  }

  const resolved = resolveFileFromProject(state, target.filename);
  if (!resolved) {
    return {
      ...state,
      bell: true,
      mode: 'NORMAL',
      visualAnchor: undefined,
      pendingKeys: undefined,
      commandMessage: msg('E447: 경로에서 "{filename}" 파일을 찾을 수 없습니다', {
        filename: target.filename,
      }),
    };
  }

  const jumpedState = recordJump({
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    pendingKeys: undefined,
  });

  if (options.split) {
    const synced = syncCurrentBuffer(jumpedState);
    const splitState = splitWindow(synced, 'horizontal', resolved.lines, resolved.filename);
    const focused = switchPaneFocus(splitState, 1);
    const targetRow = target.targetLine ? target.targetLine - 1 : 0;
    const nextCursor = clampCursor(resolved.lines, { line: targetRow, col: 0 }, 'NORMAL');
    const nextPanes = focused.splitPanes
      ? ([
          focused.splitPanes[0],
          { ...focused.splitPanes[1], cursor: nextCursor },
        ] as typeof focused.splitPanes)
      : undefined;

    return {
      ...focused,
      cursor: nextCursor,
      splitPanes: nextPanes,
      commandMessage: msg('"{filename}" 분할 창으로 열렸습니다', { filename: resolved.filename }),
    };
  }

  const opened = editBuffer(jumpedState, resolved.filename);
  if (target.targetLine) {
    const nextCursor = clampCursor(
      opened.lines,
      { line: target.targetLine - 1, col: 0 },
      'NORMAL'
    );
    return {
      ...opened,
      cursor: nextCursor,
      pendingKeys: undefined,
    };
  }

  return {
    ...opened,
    pendingKeys: undefined,
  };
}
