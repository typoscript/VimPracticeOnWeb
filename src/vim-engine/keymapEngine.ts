import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { msg } from './messages';
import { evaluateScriptExpression, ExRunner } from './vimscriptEngine';

export type KeymapMode = 'n' | 'i' | 'v' | 'x' | 's' | 'o' | 'c';

/** 재귀 키매핑 최대 허용 깊이 */
export const MAX_REMAP_DEPTH = 15;

export interface KeymapEntry {
  mode: string;
  lhs: string;
  rhs: string;
}

export interface KeymapModifiers {
  buffer?: boolean;
  silent?: boolean;
  expr?: boolean;
  nowait?: boolean;
  unique?: boolean;
}

export interface ResolvedKeymap {
  rhs: string;
  silent?: boolean;
  expr?: boolean;
  noremap?: boolean;
  nowait?: boolean;
  buffer?: boolean;
}

const MAP_FLAG_RE = /^<(buffer|silent|expr|nowait|unique)>$/i;

/** :map / :nnoremap 뒤의 수식어(<buffer>, <silent>, <expr>, <nowait>, <unique>)와 lhs / rhs 를 분리합니다. */
export function parseMapRest(rawRest: string): { modifiers: KeymapModifiers; lhs: string; rhs: string } | null {
  const modifiers: KeymapModifiers = {};
  let rest = rawRest.trim();
  for (;;) {
    const m = rest.match(/^(\S+)\s+([\s\S]+)$/);
    if (!m || !MAP_FLAG_RE.test(m[1])) break;
    const flag = m[1].slice(1, -1).toLowerCase();
    if (flag === 'buffer') modifiers.buffer = true;
    else if (flag === 'silent') modifiers.silent = true;
    else if (flag === 'expr') modifiers.expr = true;
    else if (flag === 'nowait') modifiers.nowait = true;
    else if (flag === 'unique') modifiers.unique = true;
    rest = m[2].trimStart();
  }
  const body = rest.match(/^(\S+)\s+([\s\S]+)$/);
  if (!body) return null;
  return { modifiers, lhs: body[1], rhs: body[2].trim() };
}

/** :nmap [<buffer>] {lhs} 단일 매핑 조회 인수를 파싱합니다. */
export function parseMapQuery(rawRest: string): { bufferOnly: boolean; lhs: string } | null {
  let rest = rawRest.trim();
  let bufferOnly = false;
  if (/^<buffer>(?:\s+|$)/i.test(rest)) {
    bufferOnly = true;
    rest = rest.replace(/^<buffer>\s*/i, '').trim();
  }
  if (!rest) return { bufferOnly, lhs: '' };
  if (/\s/.test(rest)) return null;
  return { bufferOnly, lhs: rest };
}

/** :unmap 뒤의 <buffer> 수식어와 lhs 를 분리합니다. */
export function parseUnmapRest(rawRest: string): { buffer: boolean; lhs: string } | null {
  let rest = rawRest.trim();
  let buffer = false;
  if (/^<buffer>\s+/i.test(rest)) {
    buffer = true;
    rest = rest.replace(/^<buffer>\s+/i, '').trim();
  }
  return rest && !/\s/.test(rest) ? { buffer, lhs: rest } : null;
}

function getKeyVariants(lhs: string, leaderKey: string): string[] {
  const variants = [lhs];
  if (lhs.includes('<leader>')) {
    variants.push(lhs.replace(/<leader>/gi, leaderKey));
  } else if (lhs.startsWith(leaderKey)) {
    variants.push('<leader>' + lhs.slice(leaderKey.length));
  }
  const lower = lhs.toLowerCase();
  if (lower === 'tab' || lower === '<tab>') variants.push(lower === 'tab' ? '<Tab>' : 'Tab');
  else if (lower === 'enter' || lower === '<cr>' || lower === '<enter>') variants.push('Enter', '<CR>');
  else if (lower === 'escape' || lower === '<esc>') variants.push('Escape', '<Esc>');
  else if (lower === 'backspace' || lower === '<bs>') variants.push('Backspace', '<BS>');
  else if (lower === 'home' || lower === '<home>') variants.push('Home', '<Home>');
  else if (lower === 'end' || lower === '<end>') variants.push('End', '<End>');
  else if (lower === 'delete' || lower === 'del' || lower === '<del>') variants.push('Delete', '<Del>');
  const ctrlBracket = lhs.match(/^<(?:c|ctrl)-([a-z0-9])>$/i);
  if (ctrlBracket) {
    variants.push(`Ctrl-${ctrlBracket[1].toLowerCase()}`);
  }
  const ctrlDash = lhs.match(/^Ctrl-([a-z0-9])$/i);
  if (ctrlDash) {
    const ch = ctrlDash[1].toLowerCase();
    variants.push(`<C-${ch}>`, `<c-${ch}>`);
  }
  const altBracket = lhs.match(/^<(?:a|m|alt)-([a-z0-9])>$/i);
  if (altBracket) {
    const ch = altBracket[1].toLowerCase();
    variants.push(`Alt-${ch}`, `<A-${ch}>`, `<M-${ch}>`);
  }
  const altDash = lhs.match(/^Alt-([a-z0-9])$/i);
  if (altDash) {
    const ch = altDash[1].toLowerCase();
    variants.push(`<A-${ch}>`, `<a-${ch}>`, `<M-${ch}>`, `<m-${ch}>`);
  }
  return Array.from(new Set(variants));
}

/** <expr> 매핑의 RHS 표현식을 평가해 확장 키 문자열을 반환합니다. */
export function evaluateExprKeymap(state: VimEditorState, expr: string, runEx?: ExRunner): string {
  try {
    return evaluateScriptExpression(state, expr, runEx);
  } catch {
    return '';
  }
}

/** <silent> 매핑 실행 후 커맨드라인 메시지를 복원합니다 (에러 시 제외). */
export function applySilentKeymapResult(
  prevMessage: string | undefined,
  nextState: VimEditorState,
  silent?: boolean
): VimEditorState {
  if (!silent || nextState.bell) return nextState;
  return { ...nextState, commandMessage: prevMessage };
}

export type KeymapRhsSegment =
  | { kind: 'cmd'; command: string }
  | { kind: 'keys'; text: string };

/** RHS 문자열에서 <Cmd>...<CR> 구간과 일반 키 시퀀스 구간을 분리합니다. */
export function splitCmdSegments(rhs: string): KeymapRhsSegment[] {
  if (!/<cmd>/i.test(rhs)) {
    return rhs ? [{ kind: 'keys', text: rhs }] : [];
  }
  const segments: KeymapRhsSegment[] = [];
  const re = /<cmd>([\s\S]*?)<(?:cr|enter|return)>/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rhs)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ kind: 'keys', text: rhs.slice(lastIndex, m.index) });
    }
    segments.push({ kind: 'cmd', command: m[1].trim() });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < rhs.length) {
    segments.push({ kind: 'keys', text: rhs.slice(lastIndex) });
  }
  return segments;
}

/** <Cmd>...<CR> 구간을 현재 모드(INSERT/VISUAL/NORMAL/COMMAND)를 유지한 채 직접 실행합니다. */
export function executeCmdSegment(
  state: VimEditorState,
  command: string,
  runEx?: ExRunner
): VimEditorState {
  if (!runEx || !command) return state;
  const prevMode = state.mode;
  const prevAnchor = state.visualAnchor;
  const prevBlockEol = state.visualBlockEndOfLine;
  const prevCmdBuf = state.commandBuffer;
  const prevCmdType = state.commandType;
  const prevCmdCol = state.commandCursorCol;
  const prevInsertText = state.currentInsertText;

  const after = runEx(state, command);
  const clampedCursor = clampCursor(after.lines, after.cursor, prevMode);
  const clampedAnchor = prevAnchor ? clampCursor(after.lines, prevAnchor, prevMode) : undefined;

  return {
    ...after,
    mode: prevMode,
    cursor: clampedCursor,
    visualAnchor: clampedAnchor,
    visualBlockEndOfLine: prevBlockEol,
    commandBuffer: prevMode === 'COMMAND' || prevMode === 'SEARCH' ? prevCmdBuf : after.commandBuffer,
    commandType: prevMode === 'COMMAND' || prevMode === 'SEARCH' ? prevCmdType : after.commandType,
    commandCursorCol: prevMode === 'COMMAND' || prevMode === 'SEARCH' ? prevCmdCol : after.commandCursorCol,
    currentInsertText: prevMode === 'INSERT' ? prevInsertText : after.currentInsertText,
  };
}

/**
 * 해소된 키매핑 RHS 를 noremap(재매핑 금지) 또는 재귀 *map(최대 깊이 제한) 규약으로 실행합니다.
 * <Cmd>...<CR> 구간이 포함된 경우 현재 모드를 벗어나지 않고 Ex 명령을 실행합니다.
 */
export function runKeymapTokens(
  state: VimEditorState,
  resolved: ResolvedKeymap,
  macroDepth: number,
  executeRhs: (runState: VimEditorState, rhs: string, isNoremap: boolean, nextDepth: number) => VimEditorState,
  runEx?: ExRunner
): VimEditorState {
  const prevMessage = state.commandMessage;
  const prevDisabled = state.keymapsDisabled;
  const isNoremap = resolved.noremap !== false;

  if (!isNoremap && macroDepth >= MAX_REMAP_DEPTH) {
    return {
      ...state,
      pendingKeys: undefined,
      pendingKeymapPrefix: undefined,
      commandMessage: msg('E223: 재귀 키매핑 깊이를 초과했습니다'),
      bell: true,
    };
  }

  const rhs = resolved.expr ? evaluateExprKeymap(state, resolved.rhs, runEx) : resolved.rhs;
  if (!rhs) return applySilentKeymapResult(prevMessage, state, resolved.silent);

  const startState = isNoremap ? { ...state, keymapsDisabled: true } : state;
  const segments = splitCmdSegments(rhs);
  let after: VimEditorState = startState;
  if (segments.length === 1 && segments[0].kind === 'keys') {
    after = executeRhs(startState, segments[0].text, isNoremap, macroDepth + 1);
  } else {
    for (const seg of segments) {
      if (seg.kind === 'cmd') {
        after = executeCmdSegment(after, seg.command, runEx);
      } else {
        after = executeRhs(after, seg.text, isNoremap, macroDepth + 1);
      }
      if (after.bell) break;
    }
  }
  const restored = after.keymapsDisabled === prevDisabled ? after : { ...after, keymapsDisabled: prevDisabled };
  return applySilentKeymapResult(prevMessage, restored, resolved.silent);
}

/**
 * Parses RHS/LHS key notation into an array of Vim atomic key tokens.
 * Handles <CR>, <Esc>, <Space>, <leader>, <BS>, <Tab>, <C-x>, Ctrl-x, etc.
 */
export function parseKeySequence(rhs: string, leaderKey = ' '): string[] {
  if (!rhs) return [];
  const tokens: string[] = [];
  let i = 0;

  while (i < rhs.length) {
    // 1. Bracketed token <...>
    if (rhs[i] === '<') {
      const closeIdx = rhs.indexOf('>', i + 1);
      if (closeIdx !== -1) {
        const rawToken = rhs.slice(i + 1, closeIdx);
        const lower = rawToken.toLowerCase();

        if (lower === 'cr' || lower === 'return' || lower === 'enter') {
          tokens.push('Enter');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'esc' || lower === 'escape') {
          tokens.push('Escape');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'space') {
          tokens.push(' ');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'leader') {
          tokens.push(leaderKey);
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'bs' || lower === 'backspace') {
          tokens.push('Backspace');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'tab') {
          tokens.push('Tab');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 's-tab' || lower === 'shift-tab') {
          tokens.push('Shift-Tab');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'up') {
          tokens.push('ArrowUp');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'down') {
          tokens.push('ArrowDown');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'left') {
          tokens.push('ArrowLeft');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'right') {
          tokens.push('ArrowRight');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'home') {
          tokens.push('Home');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'end') {
          tokens.push('End');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'del' || lower === 'delete') {
          tokens.push('Delete');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'nop') {
          i = closeIdx + 1;
          continue;
        }

        const ctrlMatch = rawToken.match(/^(?:c|ctrl)-(.+)$/i);
        if (ctrlMatch) {
          const k = ctrlMatch[1].toLowerCase();
          tokens.push(`Ctrl-${k}`);
          i = closeIdx + 1;
          continue;
        }

        const altMatch = rawToken.match(/^(?:a|m|alt)-(.+)$/i);
        if (altMatch) {
          const k = altMatch[1].toLowerCase();
          tokens.push(`Alt-${k}`);
          i = closeIdx + 1;
          continue;
        }

        if (lower === 'lt') {
          tokens.push('<');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'gt') {
          tokens.push('>');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'bar') {
          tokens.push('|');
          i = closeIdx + 1;
          continue;
        }

        const fMatch = lower.match(/^f([1-9]|1[0-2])$/);
        if (fMatch) {
          tokens.push(`F${fMatch[1]}`);
          i = closeIdx + 1;
          continue;
        }
      }
    }

    // 2. Unbracketed Ctrl-x pattern (e.g. "Ctrl-w", "Ctrl-h")
    const sub = rhs.slice(i);
    const unbracketedCtrl = sub.match(/^Ctrl-([a-zA-Z0-9])/i);
    if (unbracketedCtrl) {
      tokens.push(`Ctrl-${unbracketedCtrl[1].toLowerCase()}`);
      i += unbracketedCtrl[0].length;
      if (rhs[i] === ' ' && i + 1 < rhs.length && /[a-zA-Z0-9]/.test(rhs[i + 1])) {
        i += 1;
      }
      continue;
    }

    const unbracketedF = sub.match(/^F([1-9]|1[0-2])\b/);
    if (unbracketedF) {
      tokens.push(`F${unbracketedF[1]}`);
      i += unbracketedF[0].length;
      continue;
    }

    // 3. Literal character
    tokens.push(rhs[i]);
    i++;
  }

  return tokens;
}

function resolveKeymapModePrefix(cmdType: string): KeymapMode | 'all' | 'ic' {
  const cmd = cmdType.toLowerCase();
  if (cmd.endsWith('!')) return 'ic';
  if (cmd.startsWith('i')) return 'i';
  if (cmd.startsWith('x')) return 'x';
  if (cmd.startsWith('s')) return 's';
  if (cmd.startsWith('o')) return 'o';
  if (cmd.startsWith('c')) return 'c';
  if (cmd.startsWith('v')) return 'v';
  if (cmd.startsWith('n') && !cmd.startsWith('nore')) return 'n';
  return 'all';
}

/**
 * Resolves a matching keymap + metadata for the given mode and key sequence.
 */
export function resolveKeymapWithMeta(
  state: VimEditorState,
  mode: KeymapMode,
  keySequence: string
): ResolvedKeymap | null {
  if (state.keymapsDisabled) return null;

  const bufId = state.currentBufferId ?? 1;
  const bufMaps = state.bufferKeymaps?.[bufId];
  const userKeymaps = state.userKeymaps;
  if (!bufMaps && !userKeymaps) return null;

  const leaderKey = state.leaderKey || ' ';
  const variants = getKeyVariants(keySequence, leaderKey);
  const strictModeOnly = mode === 'x' || mode === 's' || mode === 'o' || mode === 'c';

  const lookupIn = (map: Record<string, string> | undefined, isBuf: boolean): ResolvedKeymap | null => {
    if (!map) return null;
    for (const v of variants) {
      const keysToCheck = strictModeOnly ? [`${mode}:${v}`] : [`${mode}:${v}`, v];
      for (const mapKey of keysToCheck) {
        if (map[mapKey] !== undefined) {
          const metaKey = isBuf ? `b:${bufId}:${mode}:${v}` : `${mode}:${v}`;
          const meta = state.keymapMeta?.[metaKey] ?? (strictModeOnly ? undefined : state.keymapMeta?.[isBuf ? `b:${bufId}:${v}` : v]);
          return { rhs: map[mapKey], buffer: isBuf, ...meta };
        }
      }
    }
    return null;
  };

  return lookupIn(bufMaps, true) ?? lookupIn(userKeymaps, false);
}

/**
 * Resolves a matching keymap for the given mode and key sequence.
 */
export function resolveKeymap(
  state: VimEditorState,
  mode: KeymapMode,
  keySequence: string
): string | null {
  return resolveKeymapWithMeta(state, mode, keySequence)?.rhs ?? null;
}

/**
 * Checks if the current key sequence is a prefix of any registered keymap.
 */
export function isKeymapPrefix(
  state: VimEditorState,
  mode: KeymapMode,
  keySequence: string
): boolean {
  if (state.keymapsDisabled) return false;
  const bufMaps = state.bufferKeymaps?.[state.currentBufferId ?? 1];
  const userKeymaps = state.userKeymaps;
  if (!bufMaps && !userKeymaps) return false;

  const leaderKey = state.leaderKey || ' ';
  const variants = getKeyVariants(keySequence, leaderKey);

  const checkEntries = (map: Record<string, string> | undefined): boolean => {
    if (!map) return false;
    for (const [k] of Object.entries(map)) {
      let targetLhs = k;
      let targetMode = 'all';
      if (/^[nivxsoc]:/.test(k)) {
        targetMode = k[0];
        targetLhs = k.slice(2);
      }

      if (targetMode !== 'all' && targetMode !== mode) continue;
      if (targetMode === 'all' && (mode === 'x' || mode === 's' || mode === 'o' || mode === 'c')) continue;

      for (const v of variants) {
        if (targetLhs.length > v.length && targetLhs.startsWith(v)) {
          return true;
        }
        if (targetLhs.includes('<leader>')) {
          const expandedLhs = targetLhs.replace(/<leader>/gi, leaderKey);
          if (expandedLhs.length > v.length && expandedLhs.startsWith(v)) {
            return true;
          }
        }
      }
    }
    return false;
  };

  return checkEntries(bufMaps) || checkEntries(userKeymaps);
}

/**
 * Formats user keymaps into a clean Vim-style list string.
 * lhsFilter 가 주어지면 해당 키(또는 접두어)와 일치하는 매핑만 필터링합니다 (:nmap {lhs}).
 */
export function formatKeymapsList(
  state: VimEditorState,
  modeFilter = 'all',
  options?: { lhsFilter?: string; bufferOnly?: boolean }
): string {
  const bufId = state.currentBufferId ?? 1;
  const bufMaps = state.bufferKeymaps?.[bufId] ?? {};
  const userKeymaps = state.userKeymaps ?? {};
  const entries: Array<KeymapEntry & { buffer?: boolean }> = [];
  const seen = new Set<string>();
  const leaderKey = state.leaderKey || ' ';
  const lhsFilter = options?.lhsFilter?.trim();
  const filterVariants = lhsFilter ? getKeyVariants(lhsFilter, leaderKey) : null;

  const matchesLhsFilter = (lhs: string): boolean => {
    if (!filterVariants) return true;
    const lhsVariants = getKeyVariants(lhs, leaderKey);
    return lhsVariants.some((lv) =>
      filterVariants.some((fv) => lv === fv || lv.startsWith(fv))
    );
  };

  const collect = (source: Record<string, string>, isBuf: boolean) => {
    for (const [rawKey, rhs] of Object.entries(source)) {
      let mode = ' ';
      let lhs = rawKey;

      if (/^[nivxsoc]:/.test(rawKey)) {
        mode = rawKey[0];
        lhs = rawKey.slice(2);
      }

      const keyId = `${isBuf ? '@' : ''}${mode}:${lhs}:${rhs}`;
      if (seen.has(keyId)) continue;

      if (modeFilter === 'ic') {
        if (mode !== 'i' && mode !== 'c') continue;
      } else if (modeFilter === 'x' || modeFilter === 's' || modeFilter === 'o' || modeFilter === 'c') {
        if (mode !== modeFilter) continue;
      } else if (modeFilter !== 'all' && modeFilter !== 'map') {
        if (mode !== modeFilter && mode !== ' ') continue;
      }

      if (!matchesLhsFilter(lhs)) continue;

      seen.add(keyId);
      entries.push({ mode, lhs, rhs, buffer: isBuf });
    }
  };
  collect(bufMaps, true);
  if (!options?.bufferOnly) {
    collect(userKeymaps, false);
  }

  if (entries.length === 0) {
    if (lhsFilter) {
      return msg('매핑을 찾을 수 없습니다: {lhs}', { lhs: lhsFilter });
    }
    const modeName =
      modeFilter === 'n'
        ? msg('일반 (Normal)')
        : modeFilter === 'i'
        ? msg('입력 (Insert)')
        : modeFilter === 'ic'
        ? msg('입력/명령행 (Insert/Cmdline)')
        : modeFilter === 'v' || modeFilter === 'x'
        ? msg('비주얼 (Visual)')
        : modeFilter === 's'
        ? msg('셀렉트 (Select)')
        : modeFilter === 'o'
        ? msg('연산자 대기 (Operator-pending)')
        : modeFilter === 'c'
        ? msg('명령행 (Cmdline)')
        : msg('전체');
    return msg('정의된 {modeName} 키 매핑이 없습니다.', { modeName });
  }

  const lines = [
    msg('--- 키 매핑 목록 ({v}) ---', { v: modeFilter === 'n'
        ? 'Normal'
        : modeFilter === 'i'
        ? 'Insert'
        : modeFilter === 'ic'
        ? 'Insert/Cmdline'
        : modeFilter === 'v'
        ? 'Visual'
        : modeFilter === 'x'
        ? 'Visual-x'
        : modeFilter === 's'
        ? 'Select'
        : modeFilter === 'o'
        ? 'Operator-pending'
        : modeFilter === 'c'
        ? 'Cmdline'
        : 'All' }),
    ...entries.map(
      (e) => `${(e.mode === ' ' ? ' ' : e.mode).padEnd(2)} ${e.buffer ? '@' : ''}${e.lhs.padEnd(e.buffer ? 11 : 12)} ${e.rhs}`
    ),
  ];

  return lines.join('\n');
}

/**
 * Registers a keymap into the editor state.
 */
export function registerKeymap(
  state: VimEditorState,
  cmdType: string,
  lhs: string,
  rhs: string,
  modifiers: KeymapModifiers = {}
): VimEditorState {
  const cmd = cmdType.toLowerCase();
  const modePrefix = resolveKeymapModePrefix(cmd);
  const noremap = cmd.includes('nore');

  const leaderKey = state.leaderKey || ' ';
  const variants = getKeyVariants(lhs, leaderKey);
  const modes: KeymapMode[] =
    modePrefix === 'all' ? ['n', 'i', 'v'] : modePrefix === 'ic' ? ['i', 'c'] : [modePrefix];
  const strictMode =
    modePrefix === 'x' ||
    modePrefix === 's' ||
    modePrefix === 'o' ||
    modePrefix === 'c' ||
    modePrefix === 'ic';
  const bufId = state.currentBufferId ?? 1;

  const targetMap = modifiers.buffer
    ? { ...(state.bufferKeymaps?.[bufId] ?? {}) }
    : { ...(state.userKeymaps ?? {}) };

  if (modifiers.unique) {
    const existsAlready = variants.some((v) =>
      modes.some((m) => targetMap[`${m}:${v}`] !== undefined) || (!strictMode && targetMap[v] !== undefined)
    );
    if (existsAlready) {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        bell: true,
        commandMessage: msg('E227: {lhs} 에 대한 매핑이 이미 존재합니다', { lhs }),
      };
    }
  }

  const nextMeta = { ...(state.keymapMeta ?? {}) };

  for (const v of variants) {
    for (const m of modes) {
      targetMap[`${m}:${v}`] = rhs;
      const metaKey = modifiers.buffer ? `b:${bufId}:${m}:${v}` : `${m}:${v}`;
      nextMeta[metaKey] = {
        ...(modifiers.silent ? { silent: true } : {}),
        ...(modifiers.expr ? { expr: true } : {}),
        ...(modifiers.nowait ? { nowait: true } : {}),
        noremap,
      };
    }
    if (!strictMode) {
      targetMap[v] = rhs;
    }
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    ...(modifiers.buffer
      ? { bufferKeymaps: { ...(state.bufferKeymaps ?? {}), [bufId]: targetMap } }
      : { userKeymaps: targetMap }),
    keymapMeta: nextMeta,
    commandMessage: msg('[키매핑 등록] {cmd}: {lhs} -> {rhs}', { cmd, lhs, rhs }),
  };
}

/**
 * Unregisters a keymap from the editor state.
 */
export function unregisterKeymap(
  state: VimEditorState,
  cmdType: string,
  lhs: string,
  options: { buffer?: boolean } = {}
): VimEditorState {
  const cmd = cmdType.toLowerCase();
  const modePrefix = resolveKeymapModePrefix(cmd);
  const strictMode =
    modePrefix === 'x' ||
    modePrefix === 's' ||
    modePrefix === 'o' ||
    modePrefix === 'c' ||
    modePrefix === 'ic';

  const bufId = state.currentBufferId ?? 1;
  const targetMap = options.buffer
    ? { ...(state.bufferKeymaps?.[bufId] ?? {}) }
    : { ...(state.userKeymaps ?? {}) };
  const nextMeta = state.keymapMeta ? { ...state.keymapMeta } : undefined;
  const leaderKey = state.leaderKey || ' ';
  const variants = getKeyVariants(lhs, leaderKey);
  const modes: KeymapMode[] =
    modePrefix === 'all'
      ? ['n', 'i', 'v', 'x', 's', 'o', 'c']
      : modePrefix === 'ic'
      ? ['i', 'c']
      : [modePrefix];

  let deletedCount = 0;
  for (const v of variants) {
    for (const m of modes) {
      if (targetMap[`${m}:${v}`]) {
        delete targetMap[`${m}:${v}`];
        deletedCount++;
      }
      if (nextMeta) {
        delete nextMeta[options.buffer ? `b:${bufId}:${m}:${v}` : `${m}:${v}`];
      }
    }
    if (!strictMode && targetMap[v]) {
      delete targetMap[v];
      deletedCount++;
    }
  }

  if (deletedCount === 0) {
    return {
      ...state,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('E31: 매핑을 찾을 수 없습니다: {lhs}', { lhs }),
    };
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    ...(options.buffer
      ? { bufferKeymaps: { ...(state.bufferKeymaps ?? {}), [bufId]: targetMap } }
      : { userKeymaps: targetMap }),
    ...(nextMeta ? { keymapMeta: nextMeta } : {}),
    commandMessage: msg('[키매핑 해제] {cmd}: {lhs}', { cmd, lhs }),
  };
}

/**
 * Clears all keymaps for the specified mode (:mapclear[!], :nmapclear, :imapclear, :vmapclear, :xmapclear, :smapclear, :omapclear, :cmapclear).
 */
export function clearKeymaps(
  state: VimEditorState,
  cmdType: string,
  options: { buffer?: boolean } = {}
): VimEditorState {
  const cmd = cmdType.toLowerCase();
  const modePrefix = resolveKeymapModePrefix(cmd);
  const modesToClear: Set<string> = new Set(
    modePrefix === 'all'
      ? ['n', 'v', 'x', 's', 'o']
      : modePrefix === 'ic'
      ? ['i', 'c']
      : [modePrefix]
  );
  const clearBare = modePrefix === 'all';
  const bufId = state.currentBufferId ?? 1;
  const sourceMap = options.buffer
    ? state.bufferKeymaps?.[bufId] ?? {}
    : state.userKeymaps ?? {};
  const nextMap: Record<string, string> = {};
  let removed = 0;

  for (const [k, v] of Object.entries(sourceMap)) {
    const modeMatch = k.match(/^([nivxsoc]):/);
    if (modeMatch) {
      if (modesToClear.has(modeMatch[1])) {
        removed++;
        continue;
      }
    } else if (clearBare) {
      removed++;
      continue;
    }
    nextMap[k] = v;
  }

  let nextMeta = state.keymapMeta;
  if (state.keymapMeta) {
    nextMeta = {};
    for (const [mk, mv] of Object.entries(state.keymapMeta)) {
      const isBufMeta = mk.startsWith(`b:${bufId}:`);
      if (Boolean(options.buffer) !== isBufMeta) {
        nextMeta[mk] = mv;
        continue;
      }
      const stripped = isBufMeta ? mk.slice(`b:${bufId}:`.length) : mk;
      const modeMatch = stripped.match(/^([nivxsoc]):/);
      if (modeMatch && modesToClear.has(modeMatch[1])) continue;
      if (!modeMatch && clearBare) continue;
      nextMeta[mk] = mv;
    }
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    ...(options.buffer
      ? { bufferKeymaps: { ...(state.bufferKeymaps ?? {}), [bufId]: nextMap } }
      : { userKeymaps: nextMap }),
    ...(nextMeta ? { keymapMeta: nextMeta } : {}),
    commandMessage: msg('[키매핑 초기화] {cmd} ({count}개 삭제)', { cmd, count: removed }),
  };
}
