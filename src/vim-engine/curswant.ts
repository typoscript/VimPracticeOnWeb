import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { getOptions } from './setEngine';

/** `$` 뒤의 curswant: 세로 이동이 항상 줄 끝으로 갑니다 (Vim MAXCOL). */
export const CURSWANT_EOL = Number.MAX_SAFE_INTEGER;

const CURSWANT_MODES = new Set(['NORMAL', 'VISUAL', 'VISUAL_LINE', 'VISUAL_BLOCK']);
const ALWAYS_VERTICAL_KEYS = new Set(['j', 'k', 'ArrowDown', 'ArrowUp', 'Ctrl-e', 'Ctrl-y']);
/** 'nostartofline' 일 때만 열을 유지하는 세로 이동 */
const NOSOL_VERTICAL_KEYS = new Set(['G', 'H', 'L', 'M', 'Ctrl-d', 'Ctrl-u', 'Ctrl-f', 'Ctrl-b']);

/** 이번 키가 curswant 를 유지하는 세로 이동(또는 커서를 옮기지 않는 화면 정렬)인지 */
function keepsCurswant(prev: VimEditorState, key: string): boolean {
  const pending = prev.pendingKeys ?? '';
  // 사용자가 매핑한 키(:nmap H ^ 등)는 기본 세로 이동이 아닙니다.
  const lhs = pending.replace(/^[1-9][0-9]*/, '') + key;
  const maps = prev.userKeymaps ?? {};
  if (Object.keys(maps).some((m) => m === lhs || m.endsWith(':' + lhs))) return false;
  const countOnly = /^([1-9][0-9]*)?$/.test(pending);
  const nosol = !getOptions(prev).startofline;
  if (countOnly && ALWAYS_VERTICAL_KEYS.has(key)) return true;
  if (countOnly && nosol && NOSOL_VERTICAL_KEYS.has(key)) return true;
  if (/^([1-9][0-9]*)?g$/.test(pending)) return key === 'j' || key === 'k' || (key === 'g' && nosol);
  if (/^([1-9][0-9]*)?z$/.test(pending)) return key === 'z' || key === 't' || key === 'b';
  return false;
}

/**
 * Vim curswant 규칙을 적용합니다.
 * - 세로 이동(j k G gg Ctrl-d … , 'nostartofline' 기준)은 기억한 열로 가고(줄이 짧으면 줄 끝까지) 그 열을 유지합니다.
 * - 실패한 모션(bell, 커서 그대로)도 기억한 열을 유지합니다.
 * - `$` 는 '줄 끝'을 기억하고, 그 밖의 명령이 끝나면 현재 열을 새로 기억합니다.
 */
export function applyCurswant(prev: VimEditorState, next: VimEditorState, key: string): VimEditorState {
  const remembered = prev.curswant ?? prev.cursor.col;
  // Ex 명령이 Vim 처럼 curswant 를 건드리지 않고 커서를 옮긴 경우 (`:N`, `:>`, `:t`, `:m`, `:y` …, keepCurswantAt)
  if (next.keepCurswantAt) {
    const { keepCurswantAt: kept, ...rest } = next;
    const honored =
      !rest.pendingKeys && CURSWANT_MODES.has(rest.mode) && kept.line === rest.cursor.line && kept.col === rest.cursor.col;
    if (honored) return { ...rest, curswant: remembered };
    next = rest;
  }
  // 아직 명령이 끝나지 않았거나(대기 키), 입력·명령줄 모드 중에는 기억한 열을 그대로 둡니다.
  if (next.pendingKeys || !CURSWANT_MODES.has(next.mode)) {
    return next.curswant === remembered ? next : { ...next, curswant: remembered };
  }
  const sameText = next.lines === prev.lines;
  const sameCursor = next.cursor.line === prev.cursor.line && next.cursor.col === prev.cursor.col;
  if (CURSWANT_MODES.has(prev.mode) && sameText && keepsCurswant(prev, key)) {
    const line = next.lines[next.cursor.line] ?? '';
    const lastCol = Math.max(0, line.length - 1);
    const col = Math.min(remembered, lastCol);
    const cursor = col === next.cursor.col ? next.cursor : clampCursor(next.lines, { line: next.cursor.line, col }, next.mode);
    return { ...next, cursor, curswant: remembered };
  }
  // v / V / Ctrl-v 로 비주얼 모드를 시작해도 Vim(n_start_visual_mode)은 curswant 를 바꾸지 않습니다.
  const startsVisual =
    prev.mode === 'NORMAL' && !prev.pendingKeys && (key === 'v' || key === 'V' || key === 'Ctrl-v') && next.mode.startsWith('VISUAL');
  // 매크로 녹화 시작·끝(q{reg}, q)과 마크(m{a})는 Vim 에서 curswant 를 건드리지 않습니다.
  const pending = prev.pendingKeys ?? '';
  const keepsForRecordOrMark =
    prev.mode === 'NORMAL' && ((key === 'q' && !pending && !!prev.recordingMacro) || pending === 'q' || pending === 'm');
  if ((next.bell || startsVisual || keepsForRecordOrMark) && sameText && sameCursor) {
    return next.curswant === remembered ? next : { ...next, curswant: remembered };
  }
  const isDollar = key === '$' && /^([1-9][0-9]*)?$/.test(prev.pendingKeys ?? '') && CURSWANT_MODES.has(prev.mode);
  const want = isDollar ? CURSWANT_EOL : next.cursor.col;
  return next.curswant === want ? next : { ...next, curswant: want };
}
