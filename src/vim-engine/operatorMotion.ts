import { CursorPosition, VimEditorState } from './types';
import { curswantColumnOn, tabstopOf } from './virtualColumn';
import { clampCursor, getFirstNonBlankCol } from './cursor';
import { getOptions, parseWhichwrapFlags } from './setOptionsCore';
import { findParagraphTarget } from './advancedMotions';
import { pushUndoSnapshot } from './operators';
import { moveToFirstNonBlank, moveToPrevWord, moveToPrevWORD } from './motions';
import { EXTRA_MOTION_KEYS, evaluateExtraMotion } from './extraMotions';

/**
 * 연산자(d, c, y) + 일반 모션 실행 엔진
 *
 * - 줄 단위(linewise) 모션: j, k, G, gg  → 시작~끝 줄 전체가 대상
 * - 배타적 문자 단위(exclusive) 모션: h, l, b, B, ^ → 커서와 목표 위치 사이 (끝 위치 문자 제외)
 *
 * - 보조 모션(extraMotions.ts): + - Enter (줄 단위), ( ) | [( ]) (exclusive), ge gE g_ (inclusive)
 *
 * 모션이 실패하면(마지막 줄의 dj, 줄 시작의 dh, 버퍼 시작의 db 등) null을 반환하며,
 * 호출부는 이를 bell(실패 신호)로 처리합니다. 실제 Vim처럼 버퍼는 변경되지 않습니다.
 */

export const OPERATOR_MOTION_KEYS = new Set([
  'j', 'k', 'gj', 'gk', 'G', 'ArrowDown', 'ArrowUp',
  'h', 'l', 'b', 'B', '^', 'ArrowLeft', 'ArrowRight', 'Backspace', ' ', 'Space',
  '(', ')', '+', '-', '_', 'Enter', '|',
  '[[', ']]', '[]', '][', '[m', ']m', '[M', ']M', '[f', ']f', '[F', ']F',
  '[/', ']/', '[*', ']*',
  'g0', 'g^', 'g$', 'gm', 'gM',
]);

type Operator = 'd' | 'c' | 'y';

/**
 * @param count 반복 횟수. G / gg 에서는 줄 번호이며, 생략하면 마지막 줄 / 첫 줄입니다.
 * @returns 실행 결과 상태, 모션이 실패하면 null
 */
export function executeOperatorMotion(
  state: VimEditorState,
  op: Operator,
  motionKey: string,
  count?: number
): VimEditorState | null {
  const { lines, cursor } = state;
  const n = Math.max(1, count ?? 1);
  const lastLine = lines.length - 1;

  if (EXTRA_MOTION_KEYS.has(motionKey)) {
    const res = evaluateExtraMotion(lines, cursor, motionKey, n, tabstopOf(state));
    if (!res) return null;
    // 커서만 옮기고 실패한 모션(d9ge): 연산은 취소되고 커서는 옮긴 자리에 남습니다 (Vim clearopbeep).
    if (res.failed) return { ...state, cursor: { ...res.target }, pendingKeys: undefined, bell: true };
    // :help ]] — 연산자와 함께 쓰면 열 0 의 '}' 바로 아래 줄에서도 멈춥니다 (Vim findpar both=TRUE).
    if (motionKey === ']]' && res.target.line > cursor.line) {
      for (let l = cursor.line + 1; l < res.target.line; l++) {
        if ((lines[l] ?? '').startsWith('}') && l + 1 < res.target.line) {
          res.target = { line: l + 1, col: 0 };
          break;
        }
      }
    }
    const before = res.target.line < cursor.line || (res.target.line === cursor.line && res.target.col < cursor.col);
    const start = before ? res.target : cursor;
    const end = before ? cursor : res.target;
    if (res.kind === 'linewise') {
      const applied = applyLinewise(state, op, start.line, end.line);
      // y- 는 위로 가는 줄 단위 모션이라 커서가 모션 목적지(그 줄의 첫 비공백)에 남습니다 (Vim op_yank 는 oap->start 로).
      if (op === 'y' && motionKey === '-' && applied) return { ...applied, cursor: { ...res.target } };
      return applied;
    }
    if (res.kind === 'inclusive') return applyCharwise(state, op, start, { line: end.line, col: end.col + 1 });
    if (start.line === end.line && start.col === end.col) return emptyRegion(state, op);
    // 배타적 모션(( ) [( 등)도 :help exclusive-linewise 규칙을 따릅니다 (d( / d) / c( 가 빈 줄에서 끝날 때 줄 단위).
    return applyExclusive(state, op, start, end);
  }

  switch (motionKey) {
    case 'j':
    case 'gj':
    case 'ArrowDown':
      if (cursor.line >= lastLine) return null;
      return applyLinewise(state, op, cursor.line, Math.min(lastLine, cursor.line + n));

    case 'k':
    case 'gk':
    case 'ArrowUp':
      if (cursor.line <= 0) return null;
      return applyLinewise(state, op, Math.max(0, cursor.line - n), cursor.line, false, curswantColumnOn(state, lines, Math.max(0, cursor.line - n)));

    case 'G':
    case 'gg': {
      const fallback = motionKey === 'G' ? lastLine : 0;
      const target = count !== undefined ? Math.max(0, Math.min(lastLine, count - 1)) : fallback;
      const upLine = Math.min(cursor.line, target);
      const upCol = getOptions(state).startofline ? getFirstNonBlankCol(lines[upLine] ?? '') : curswantColumnOn(state, lines, upLine);
      return applyLinewise(state, op, upLine, Math.max(cursor.line, target), false, upCol);
    }

    case 'h':
    case 'ArrowLeft':
    case 'Backspace':
    case 'l':
    case 'ArrowRight':
    case ' ':
    case 'Space':
      return horizontalOperatorMotion(state, op, motionKey, n);

    case '^': {
      const target = moveToFirstNonBlank(lines, { line: cursor.line, col: 0 });
      if (target.col === cursor.col) return emptyRegion(state, op);
      return target.col < cursor.col
        ? applyCharwise(state, op, target, cursor)
        : applyCharwise(state, op, cursor, target);
    }

    case '}':
    case '{': {
      const found = findParagraphTarget(lines, cursor, motionKey === '}' ? 'next' : 'prev', n);
      if (!found) return null;
      const t = found.target;
      // 마지막 줄 끝에서 멈춘 } 는 포함 모션이라 커서가 이미 마지막 글자여도 그 글자가 범위입니다 (d} 가 마지막 글자를 지움).
      if (found.inclusive && motionKey === '}') return applyCharwise(state, op, cursor, { line: t.line, col: t.col + 1 });
      if (t.line === cursor.line && t.col === cursor.col) return emptyRegion(state, op);
      return motionKey === '}' ? applyExclusive(state, op, cursor, t) : applyExclusive(state, op, t, cursor);
    }

    case 'b':
    case 'B': {
      let target = cursor;
      for (let i = 0; i < n; i++) {
        target = motionKey === 'b' ? moveToPrevWord(lines, target) : moveToPrevWORD(lines, target);
      }
      if (target.line === cursor.line && target.col === cursor.col) return null;
      // b / B 는 배타적이라 끝(원래 커서)이 0열이면 :help exclusive-linewise 를 따릅니다 (빈 줄 아래 0열의 dB 는 빈 줄을 줄 단위로).
      return applyExclusive(state, op, target, cursor);
    }
  }

  return null;
}

const WRAP_FLAG: Record<string, string> = { h: 'h', ArrowLeft: '<', Backspace: 'b', l: 'l', ArrowRight: '>', ' ': 's', Space: 's' };

/**
 * 연산자 + h / l / <BS> / <Space> (Vim nv_left / nv_right). 'whichwrap' 에 해당 글자가 있으면 줄을 넘습니다:
 * 오른쪽은 줄 끝에서 먼저 마지막 글자를 포함(inclusive)하고 다음 번에 다음 줄 0열로 가며, 왼쪽은 이전 줄 끝으로 가되
 * d / c 이면 줄바꿈까지 지우도록 그 줄의 NUL 위치에 둡니다 (CA_NO_ADJ_OP_END: 배타적 끝 조정 없음).
 */
function horizontalOperatorMotion(state: VimEditorState, op: Operator, key: string, n: number): VimEditorState {
  const { lines, cursor } = state;
  const canWrap = parseWhichwrapFlags(getOptions(state).whichwrap).has(WRAP_FLAG[key]);
  const cur = { ...cursor };
  if (key === 'h' || key === 'ArrowLeft' || key === 'Backspace') {
    let noAdjust = false;
    for (let i = n; i > 0; i--) {
      if (cur.col > 0) {
        cur.col--;
        continue;
      }
      if (canWrap && cur.line > 0) {
        cur.line--;
        const text = lines[cur.line] ?? '';
        cur.col = (op === 'd' || op === 'c') && text.length > 0 ? text.length : Math.max(0, text.length - 1);
        noAdjust = true;
        continue;
      }
      // Vim nv_left: 줄 처음에서는 삐 소리(beep_flush: 매크로 중단)를 내고 연산자는 빈 범위로 계속됩니다
      // (ch 는 입력 모드, dh 는 빈 실행 취소 항목, yh 는 "" 복사).
      if (i === n) return op === 'c' ? emptyRegion(state, op) : { ...emptyRegion(state, op), bell: true };
      break;
    }
    return applyCharwise(state, op, cur, cursor, !noAdjust);
  }
  let inclusive = false;
  for (let i = n; i > 0; i--) {
    const text = lines[cur.line] ?? '';
    if (cur.col < text.length - 1) {
      cur.col++;
      continue;
    }
    if (canWrap && cur.line < lines.length - 1) {
      if (!inclusive && text.length > 0) {
        inclusive = true;
      } else {
        cur.line++;
        cur.col = 0;
        inclusive = false;
      }
      continue;
    }
    // 연산자와 함께 쓰인 l 은 마지막 글자까지 포함합니다 (dl == x). 빈 줄에서는 빈 범위이며 실패가 아닙니다.
    if (text.length > 0) inclusive = true;
    break;
  }
  if (inclusive) return applyCharwise(state, op, cursor, { line: cur.line, col: cur.col + 1 });
  if (cur.line === cursor.line && cur.col === cursor.col) return emptyRegion(state, op);
  return applyExclusive(state, op, cursor, cur);
}

/**
 * 움직이지 않고 성공한 모션의 빈 범위 (Vim: 'cpoptions' 에 E 가 없으면 빈 범위도 오류가 아님).
 * d 는 아무것도 지우지 않지만 빈 실행 취소 항목을 남기고(op_delete 의 `if (oap->empty) return u_save_cursor()`),
 * y 는 빈 문자열을 복사하며(op_yank), c 는 그 자리에서 입력 모드로 들어갑니다 (c0 / c^ / ch 처럼).
 */
export function emptyRegion(state: VimEditorState, op: Operator): VimEditorState {
  if (op === 'c') return { ...pushUndoSnapshot(state), mode: 'INSERT', pendingKeys: undefined };
  if (op === 'y') return { ...state, clipboard: { type: 'text', content: '' }, pendingKeys: undefined };
  return { ...pushUndoSnapshot(state), pendingKeys: undefined };
}

/** Vim inindent(0): 위치 앞이 모두 공백·탭인지 (들여쓰기 안 또는 첫 비공백 위) */
function inIndent(lineText: string, col: number): boolean {
  return /^[ \t]*$/.test(lineText.slice(0, col));
}

/**
 * 모션이 정한 범위(from → to, inclusive 여부)에 d / c / y 를 적용합니다 (Vim do_pending_operator → op_delete / op_change / op_yank).
 * 방향은 상관없고, 배타적 빈 범위는 emptyRegion, 배타적 끝이 다음 줄 0열이면 :help exclusive-linewise,
 * 여러 줄 문자 단위 d 는 op_delete 의 줄 단위 규칙을 따릅니다.
 */
export function applyOperatorToMotionRange(
  state: VimEditorState,
  op: Operator,
  from: CursorPosition,
  to: CursorPosition,
  inclusive: boolean
): VimEditorState {
  const backward = to.line < from.line || (to.line === from.line && to.col < from.col);
  const start = backward ? to : from;
  const end = backward ? from : to;
  if (inclusive) return applyCharwise(state, op, start, { line: end.line, col: end.col + 1 });
  if (start.line === end.line && start.col === end.col) return emptyRegion(state, op);
  return applyExclusive(state, op, start, end);
}

/**
 * 배타적 모션 범위에 연산자를 적용합니다 (:help exclusive-linewise).
 * 끝이 다음 줄 첫 칸이고 시작이 그 줄의 첫 비공백 이전이면 줄 단위가 되고,
 * 아니면 applyCharwise 가 끝을 이전 줄 끝으로 옮깁니다.
 */
function applyExclusive(state: VimEditorState, op: Operator, start: CursorPosition, end: CursorPosition): VimEditorState {
  if (end.col === 0 && end.line > start.line) {
    if (inIndent(state.lines[start.line] ?? '', start.col)) return applyLinewise(state, op, start.line, end.line - 1, true, start.col);
  }
  return applyCharwise(state, op, start, end);
}

/**
 * startLine ~ endLine 줄 전체에 연산자를 적용합니다.
 * endAdjusted: 배타적 끝을 이전 줄로 옮겨 줄 단위가 된 범위 (Vim oap->end_adjusted). 이때 d 뒤 커서는 첫 비공백입니다
 * (op_delete 의 beginline 뒤 'nostartofline' 열 복원이 end_adjusted 에서는 일어나지 않음).
 */
function applyLinewise(
  state: VimEditorState,
  op: Operator,
  startLine: number,
  endLine: number,
  endAdjusted = false,
  /** 위로 가는 모션(k, gg)의 목적지 열: 복사 뒤 커서는 연산 시작(oap->start)인 그 자리입니다 */
  upCol?: number
): VimEditorState {
  const content = state.lines.slice(startLine, endLine + 1).join('\n');
  const clipboard = { type: 'line' as const, content };

  if (op === 'y') {
    return {
      ...state,
      cursor: clampCursor(state.lines, { line: startLine, col: upCol !== undefined && startLine < state.cursor.line ? upCol : state.cursor.col }, 'NORMAL'),
      clipboard,
      lastBracketMarks: {
        start: { row: startLine, col: 0 },
        end: { row: endLine, col: Math.max(0, (state.lines[endLine] ?? '').length - 1) },
      },
      pendingKeys: undefined,
    };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const before = state.lines.slice(0, startLine);
  const after = state.lines.slice(endLine + 1);

  // cj / ck: 대상 줄들을 빈 줄 하나로 교체 후 INSERT ('autoindent' 이면 첫 줄 들여쓰기를 남김, Vim op_change)
  if (op === 'c') {
    const indentStr = getOptions(state).autoindent ? (state.lines[startLine] ?? '').match(/^[ \t]*/)?.[0] ?? '' : '';
    return {
      ...stateWithSnapshot,
      lines: [...before, indentStr, ...after],
      cursor: { line: startLine, col: indentStr.length },
      mode: 'INSERT',
      clipboard,
      pendingKeys: undefined,
    };
  }

  const nextLines = before.length + after.length === 0 ? [''] : [...before, ...after];
  const targetLine = Math.min(startLine, nextLines.length - 1);
  // 'nostartofline'(기본값)이면 Vim 처럼 원래 열을 유지합니다 (dG, dk, dgg).
  const cursor = getOptions(state).startofline || endAdjusted
    ? moveToFirstNonBlank(nextLines, { line: targetLine, col: 0 })
    : clampCursor(nextLines, { line: targetLine, col: curswantColumnOn(state, nextLines, targetLine) }, 'NORMAL');
  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor,
    clipboard,
    pendingKeys: undefined,
  };
}

/** start(포함) ~ end(제외) 사이의 문자에 연산자를 적용합니다. */
function applyCharwise(
  state: VimEditorState,
  op: Operator,
  start: CursorPosition,
  end: CursorPosition,
  adjustEnd = true
): VimEditorState {
  const { lines } = state;
  // 배타적 모션의 끝이 다음 줄의 첫 칸이면 이전 줄 끝까지로 조정합니다. (:help exclusive)
  let realEnd = end;
  if (adjustEnd && end.col === 0 && end.line > start.line) {
    realEnd = { line: end.line - 1, col: (lines[end.line - 1] ?? '').length };
  }

  const startText = lines[start.line] ?? '';
  const endText = lines[realEnd.line] ?? '';

  // Vim op_delete: 여러 줄에 걸친 문자 단위 삭제가 들여쓰기 안에서 시작하고 끝 뒤에 공백만 남으면 줄 단위가 됩니다
  // (빈 줄에서 de / d2w / d% 가 다음 줄 끝까지 지우면 두 줄이 모두 사라짐).
  if (
    op === 'd' &&
    realEnd.line > start.line &&
    inIndent(startText, start.col) &&
    /^[ \t]*$/.test(endText.slice(realEnd.col))
  ) {
    return applyLinewise(state, op, start.line, realEnd.line);
  }

  const content =
    start.line === realEnd.line
      ? startText.slice(start.col, realEnd.col)
      : [startText.slice(start.col), ...lines.slice(start.line + 1, realEnd.line), endText.slice(0, realEnd.col)].join('\n');
  const clipboard = { type: 'text' as const, content };

  if (op === 'y') {
    const endCol =
      realEnd.col > 0
        ? realEnd.col - 1
        : realEnd.line > start.line
        ? Math.max(0, (lines[realEnd.line - 1] ?? '').length - 1)
        : start.col;
    const endRow = realEnd.col === 0 && realEnd.line > start.line ? realEnd.line - 1 : realEnd.line;
    return {
      ...state,
      cursor: clampCursor(lines, start, 'NORMAL'),
      clipboard,
      lastBracketMarks: {
        start: { row: start.line, col: start.col },
        end: { row: endRow, col: Math.max(start.line === endRow ? start.col : 0, endCol) },
      },
      pendingKeys: undefined,
    };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const merged = startText.slice(0, start.col) + endText.slice(realEnd.col);
  const nextLines = [...lines.slice(0, start.line), merged, ...lines.slice(realEnd.line + 1)];

  if (op === 'c') {
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: { line: start.line, col: start.col },
      mode: 'INSERT',
      clipboard,
      pendingKeys: undefined,
    };
  }

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampCursor(nextLines, start, 'NORMAL'),
    clipboard,
    pendingKeys: undefined,
  };
}
