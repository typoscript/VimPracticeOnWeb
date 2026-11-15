import { VimEditorState } from './types';
import { pushUndoSnapshot } from './operators';
import { getOptions } from './setEngine';
import { isPositionSelected } from './visual';

interface ParsedNumberToken {
  start: number;
  end: number;
  raw: string;
}

function parseNrFormatFlags(nrformats?: string) {
  const flags = new Set(
    (nrformats ?? 'bin,hex')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return {
    hex: flags.has('hex'),
    bin: flags.has('bin'),
    octal: flags.has('octal'),
    alpha: flags.has('alpha'),
    unsigned: flags.has('unsigned'),
  };
}

function buildNrFormatRegex(nrformats?: string): RegExp {
  const f = parseNrFormatFlags(nrformats);
  const parts: string[] = [];
  if (f.hex) parts.push('0[xX][0-9a-fA-F]+');
  if (f.bin) parts.push('0[bB][01]+');
  if (f.octal) parts.push('0[0-7]+');
  parts.push(f.unsigned ? '\\d+' : '-?\\d+');
  if (f.alpha) parts.push('[a-zA-Z]');
  return new RegExp(parts.join('|'), 'g');
}

function formatNumberTokenDelta(raw: string, delta: number, nrformats?: string): string {
  const f = parseNrFormatFlags(nrformats);

  if (f.alpha && /^[a-zA-Z]$/.test(raw)) {
    const code = raw.charCodeAt(0);
    const min = code >= 97 ? 97 : 65;
    const max = code >= 97 ? 122 : 90;
    const nextCode = Math.max(min, Math.min(max, code + delta));
    return String.fromCharCode(nextCode);
  }

  if (f.hex && /^0[xX][0-9a-fA-F]+$/.test(raw)) {
    const prefix = raw.slice(0, 2);
    const digits = raw.slice(2);
    const nextVal = Math.max(0, parseInt(digits, 16) + delta);
    const hasUpper = /[A-F]/.test(digits) && !/[a-f]/.test(digits);
    let hexStr = nextVal.toString(16);
    if (hasUpper) hexStr = hexStr.toUpperCase();
    if (digits.length > 1 && digits.startsWith('0')) {
      hexStr = hexStr.padStart(digits.length, '0');
    }
    return `${prefix}${hexStr}`;
  }

  if (f.bin && /^0[bB][01]+$/.test(raw)) {
    const prefix = raw.slice(0, 2);
    const digits = raw.slice(2);
    const nextVal = Math.max(0, parseInt(digits, 2) + delta);
    let binStr = nextVal.toString(2);
    if (digits.length > 1 && digits.startsWith('0')) {
      binStr = binStr.padStart(digits.length, '0');
    }
    return `${prefix}${binStr}`;
  }

  if (f.octal && /^0[0-7]+$/.test(raw)) {
    const nextVal = Math.max(0, parseInt(raw, 8) + delta);
    return nextVal === 0 ? '0' : `0${nextVal.toString(8)}`;
  }

  const parsed = parseInt(raw, 10);
  const nextVal = f.unsigned ? Math.max(0, parsed + delta) : parsed + delta;
  return String(nextVal);
}

/**
 * Ctrl+a / Ctrl+x: 커서 위치 또는 커서 오른쪽에서 가장 가까운 숫자(또는 nrformats 기준 토큰)를 찾아 증감
 * (음수·hex·bin·octal·alpha·unsigned 및 [count] 결합 지원)
 */
export function modifyNumberAtCursor(
  state: VimEditorState,
  delta: number
): VimEditorState {
  const currentLine = state.lines[state.cursor.line] ?? '';
  const col = state.cursor.col;
  const nrformats = getOptions(state).nrformats;

  const regex = buildNrFormatRegex(nrformats);
  let match: RegExpExecArray | null = null;
  let targetMatch: ParsedNumberToken | null = null;

  while ((match = regex.exec(currentLine)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    // 커서가 토큰 위에 있거나, 커서 오른쪽에 있는 첫 번째 토큰
    if (end > col || start >= col) {
      targetMatch = {
        start,
        end,
        raw: match[0],
      };
      break;
    }
  }

  if (!targetMatch) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const newStr = formatNumberTokenDelta(targetMatch.raw, delta, nrformats);

  const before = currentLine.slice(0, targetMatch.start);
  const after = currentLine.slice(targetMatch.end);
  const updatedLine = before + newStr + after;

  const newLines = [...state.lines];
  newLines[state.cursor.line] = updatedLine;

  // 커서를 변경된 토큰의 마지막 자리로 이동
  const newCol = Math.max(0, before.length + newStr.length - 1);

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: { line: state.cursor.line, col: newCol },
    pendingKeys: undefined,
  };
}

/**
 * VISUAL 모드 Ctrl-a / Ctrl-x 및 g Ctrl-a / g Ctrl-x:
 * 선택된 행들(또는 VISUAL_BLOCK 영역) 내의 숫자를 일괄 증가/감소하거나
 * 계단식(Sequential)으로 +1, +2, +3... 순차 증가/감소합니다.
 */
export function modifyNumberVisual(
  state: VimEditorState,
  isIncrement: boolean,
  isSequential: boolean,
  count = 1
): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
  }

  const anchor = state.visualAnchor;
  const cursor = state.cursor;
  const mode = state.mode;

  const minLine = Math.min(anchor.line, cursor.line);
  const maxLine = Math.max(anchor.line, cursor.line);
  const minCol = Math.min(anchor.col, cursor.col);
  const maxCol = Math.max(anchor.col, cursor.col);

  const stateWithUndo = pushUndoSnapshot(state);
  const newLines = [...state.lines];
  const nrformats = getOptions(state).nrformats;
  let stepIndex = 0;

  for (let l = minLine; l <= maxLine; l++) {
    const lineStr = newLines[l];
    const regex = buildNrFormatRegex(nrformats);
    let match: RegExpExecArray | null = null;
    let targetMatch: ParsedNumberToken | null = null;

    while ((match = regex.exec(lineStr)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      let isSelected = false;
      if (mode === 'VISUAL_BLOCK') {
        // VISUAL_BLOCK: 토큰의 적어도 한 문자가 [minCol, maxCol] 컬럼 범위 안에 걸쳐 있어야 함
        if (start <= maxCol && end - 1 >= minCol) {
          isSelected = true;
        }
      } else if (mode === 'VISUAL_LINE') {
        // VISUAL_LINE: 해당 줄 전체가 선택 영역이므로 줄의 첫 번째 토큰이 타겟
        isSelected = true;
      } else {
        // 일반 VISUAL: 토큰의 적어도 한 글자가 visual 선택 영역 안에 포함되는지 검사
        for (let c = start; c < end; c++) {
          if (isPositionSelected(l, c, anchor, cursor, mode)) {
            isSelected = true;
            break;
          }
        }
      }

      if (isSelected) {
        targetMatch = {
          start,
          end,
          raw: match[0],
        };
        break; // 줄 당 첫 번째 매칭 토큰만 변경
      }
    }

    if (targetMatch) {
      stepIndex++;
      const multiplier = isSequential ? stepIndex * count : count;
      const delta = isIncrement ? multiplier : -multiplier;
      const newNumStr = formatNumberTokenDelta(targetMatch.raw, delta, nrformats);

      const before = lineStr.slice(0, targetMatch.start);
      const after = lineStr.slice(targetMatch.end);
      newLines[l] = before + newNumStr + after;
    }
  }

  // Visual 모드 종료 후 커서는 선택 영역의 시작점으로 복귀
  const startLine = minLine;
  const startCol =
    mode === 'VISUAL_BLOCK'
      ? minCol
      : anchor.line < cursor.line || (anchor.line === cursor.line && anchor.col <= cursor.col)
      ? anchor.col
      : cursor.col;

  const finalCol = Math.max(0, Math.min(startCol, Math.max(0, (newLines[startLine] ?? '').length - 1)));

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: { line: startLine, col: finalCol },
    mode: 'NORMAL',
    visualAnchor: undefined,
    pendingKeys: undefined,
    lastVisualSelection: {
      mode: state.mode as 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK',
      anchor: { ...anchor },
      cursor: { ...cursor },
    },
  };
}
