import { VimEditorState } from './types';
import { pushUndoSnapshot } from './operators';
import { clampCursor } from './cursor';
import { getOptions } from './setEngine';
import { msg } from './messages';

export type TreesjAction = 'toggle' | 'split' | 'join';

interface BracketSpan {
  openChar: '(' | '[' | '{';
  closeChar: ')' | ']' | '}';
  openOffset: number;
  closeOffset: number;
}

const OPEN_TO_CLOSE: Record<'(' | '[' | '{', ')' | ']' | '}'> = {
  '(': ')',
  '[': ']',
  '{': '}',
};

function lineColToOffset(lines: string[], line: number, col: number): number {
  let offset = 0;
  for (let i = 0; i < line && i < lines.length; i++) {
    offset += lines[i].length + 1;
  }
  return offset + Math.min(col, (lines[line] ?? '').length);
}

function offsetToLineCol(lines: string[], offset: number): { line: number; col: number } {
  let rem = Math.max(0, offset);
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i].length;
    if (rem <= len) {
      return { line: i, col: rem };
    }
    rem -= len + 1;
  }
  const last = Math.max(0, lines.length - 1);
  return { line: last, col: (lines[last] ?? '').length };
}

/**
 * 전체 텍스트에서 문자열 리터럴을 건너뛰며 모든 유효한 (), [], {} 쌍을 수집합니다.
 */
function scanBracketPairs(fullText: string): BracketSpan[] {
  const stack: Array<{ ch: '(' | '[' | '{'; offset: number }> = [];
  const pairs: BracketSpan[] = [];
  let inQuote: "'" | '"' | '`' | null = null;

  for (let i = 0; i < fullText.length; i++) {
    const ch = fullText[i];
    if (inQuote) {
      if (ch === '\\' && i + 1 < fullText.length) {
        i++;
        continue;
      }
      if (ch === inQuote) {
        inQuote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inQuote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push({ ch, offset: i });
    } else if (ch === ')' || ch === ']' || ch === '}') {
      for (let s = stack.length - 1; s >= 0; s--) {
        if (OPEN_TO_CLOSE[stack[s].ch] === ch) {
          const opened = stack.splice(s, 1)[0];
          pairs.push({
            openChar: opened.ch,
            closeChar: ch,
            openOffset: opened.offset,
            closeOffset: i,
          });
          break;
        }
      }
    }
  }
  return pairs;
}

/**
 * 커서를 감싸는 가장 안쪽 괄호 컨테이너를 찾고, 없으면 현재 줄에서 커서 오른쪽 첫 괄호 쌍을 찾습니다.
 */
function findTargetBracketSpan(lines: string[], line: number, col: number): BracketSpan | null {
  const fullText = lines.join('\n');
  const pairs = scanBracketPairs(fullText);
  if (pairs.length === 0) return null;

  const cursorOffset = lineColToOffset(lines, line, col);

  // 1) 커서를 포함하는 가장 안쪽 컨테이너 (길이가 가장 짧은 쌍)
  const enclosing = pairs.filter(
    (p) => p.openOffset <= cursorOffset && cursorOffset <= p.closeOffset
  );
  if (enclosing.length > 0) {
    enclosing.sort((a, b) => (a.closeOffset - a.openOffset) - (b.closeOffset - b.openOffset));
    return enclosing[0];
  }

  // 2) 현재 줄 안에서 커서 오른쪽(또는 현재 줄의 첫) 컨테이너
  const lineStart = lineColToOffset(lines, line, 0);
  const lineEnd = lineStart + (lines[line] ?? '').length;
  const onSameLine = pairs
    .filter((p) => p.openOffset >= lineStart && p.openOffset <= lineEnd)
    .sort((a, b) => a.openOffset - b.openOffset);

  const afterCursor = onSameLine.find((p) => p.openOffset >= cursorOffset);
  return afterCursor ?? onSameLine[0] ?? null;
}

/**
 * 괄호 내부 텍스트를 중첩 괄호·문자열 리터럴을 존중하며 최상위 쉼표(,) 기준으로 분할합니다.
 */
export function splitTopLevelItems(inner: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let inQuote: "'" | '"' | '`' | null = null;
  let cur = '';

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inQuote) {
      cur += ch;
      if (ch === '\\' && i + 1 < inner.length) {
        cur += inner[++i];
        continue;
      }
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inQuote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      cur += ch;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
      cur += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      const trimmed = cur.trim();
      if (trimmed.length > 0) items.push(trimmed);
      cur = '';
      continue;
    }
    cur += ch;
  }

  const last = cur.trim();
  if (last.length > 0) items.push(last);
  return items;
}

/**
 * treesj 스타일 구조적 Split/Join (`gS`, `:TSJToggle`, `:TSJSplit`, `:TSJJoin`)
 */
export function executeTreesj(
  state: VimEditorState,
  action: TreesjAction = 'toggle',
  isReplayingDot = false
): VimEditorState {
  const span = findTargetBracketSpan(state.lines, state.cursor.line, state.cursor.col);
  if (!span) {
    return {
      ...state,
      bell: true,
      pendingKeys: undefined,
      commandMessage: msg('[treesj] 분할·병합할 괄호 블록을 찾을 수 없습니다'),
    };
  }

  const fullText = state.lines.join('\n');
  const openPos = offsetToLineCol(state.lines, span.openOffset);
  const closePos = offsetToLineCol(state.lines, span.closeOffset);
  const isMultiline = closePos.line > openPos.line;

  const effectiveAction: 'split' | 'join' =
    action === 'toggle' ? (isMultiline ? 'join' : 'split') : action;

  if (effectiveAction === 'split' && isMultiline) {
    return {
      ...state,
      pendingKeys: undefined,
      commandMessage: msg('[treesj] 이미 멀티라인으로 분할되어 있습니다'),
    };
  }
  if (effectiveAction === 'join' && !isMultiline) {
    return {
      ...state,
      pendingKeys: undefined,
      commandMessage: msg('[treesj] 이미 한 줄로 병합되어 있습니다'),
    };
  }

  const innerRaw = fullText.slice(span.openOffset + 1, span.closeOffset);
  const items = splitTopLevelItems(innerRaw);
  if (items.length === 0) {
    return {
      ...state,
      bell: true,
      pendingKeys: undefined,
      commandMessage: msg('[treesj] 빈 블록은 분할·병합할 수 없습니다'),
    };
  }

  const opts = getOptions(state);
  const sw = opts.shiftwidth ?? 2;
  const indentUnit = opts.expandtab === false ? '\t' : ' '.repeat(sw);
  const baseIndent = (state.lines[openPos.line] ?? '').match(/^[ \t]*/)?.[0] ?? '';

  let replacement: string;
  if (effectiveAction === 'split') {
    const itemIndent = baseIndent + indentUnit;
    const formattedItems = items.map((item, idx) => {
      const normalizedItem = item.replace(/\s*\n\s*/g, ' ');
      const suffix = idx < items.length - 1 ? ',' : '';
      return `${itemIndent}${normalizedItem}${suffix}`;
    });
    replacement = `${span.openChar}\n${formattedItems.join('\n')}\n${baseIndent}${span.closeChar}`;
  } else {
    const joinedItems = items
      .map((item) => item.replace(/\s*\n\s*/g, ' '))
      .join(', ');
    if (span.openChar === '{') {
      replacement = `{ ${joinedItems} }`;
    } else {
      replacement = `${span.openChar}${joinedItems}${span.closeChar}`;
    }
  }

  const nextFullText =
    fullText.slice(0, span.openOffset) + replacement + fullText.slice(span.closeOffset + 1);
  const newLines = nextFullText.split('\n');
  const stateWithUndo = pushUndoSnapshot(state);

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: clampCursor(newLines, openPos, 'NORMAL'),
    pendingKeys: undefined,
    lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['g', 'S'],
    commandMessage:
      effectiveAction === 'split'
        ? msg('[treesj] 멀티라인으로 분할했습니다 ({count}개 항목)', { count: items.length })
        : msg('[treesj] 한 줄로 병합했습니다 ({count}개 항목)', { count: items.length }),
  };
}
