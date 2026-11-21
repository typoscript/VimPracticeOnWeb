import { AbbreviationEntry, VimEditorState } from './types';
import { msg } from './messages';
import { isKeywordChar } from './wordMotion';
import {
  KeymapModifiers,
  evaluateExprKeymap,
  parseKeySequence,
} from './keymapEngine';

export type AbbrevMode = 'i' | 'c';

export interface AbbrevMatch {
  entry: AbbreviationEntry;
  lhsLen: number;
}

const ABBREV_DEFINE_RE =
  /^(?:(?:i|c)?(?:nore)?(?:ab|abb|abbr|abbre|abbrev|abbrevi|abbreviat|abbreviate)|(?:(?:i|c)(?:nore)?|nore)a)$/i;
const ABBREV_UNDEF_RE = /^(i|c)?(?:una|unab|unabb|unabbr|unabbre|unabbrev|unabbreviate)$/i;
const ABBREV_CLEAR_RE = /^(i|c)?(?:abc|abcl|abcle|abclea|abclear)$/i;
const ABBREV_FLAG_RE = /^<(buffer|silent|expr|unique|nowait)>$/i;

/** 단어를 구성하는 식별자 문자인지 판별합니다 (Vim iskeyword 설정 반영). */
export function isAbbrevWordChar(ch: string | undefined): boolean {
  return ch !== undefined && isKeywordChar(ch);
}

/**
 * Vim check_abbr 규약에 따라 약어 LHS 가 유효한지 검사합니다.
 * - 공백 문자를 포함할 수 없음
 * - 마지막 문자가 단어 문자(keyword)일 때:
 *   - 직전 문자가 단어 문자이면 전체가 단어 문자여야 함 (full-id)
 *   - 직전 문자가 비단어 문자이면 마지막 문자 앞의 모든 문자가 비단어 문자여야 함 (end-id)
 */
export function isValidAbbrevLhs(lhs: string): boolean {
  if (!lhs || /\s/.test(lhs)) return false;
  const len = lhs.length;
  if (len === 1) return true;
  if (isAbbrevWordChar(lhs[len - 1])) {
    const prevIsWord = isAbbrevWordChar(lhs[len - 2]);
    for (let i = 0; i < len - 2; i++) {
      if (isAbbrevWordChar(lhs[i]) !== prevIsWord) {
        return false;
      }
    }
  }
  return true;
}

/** 약어 LHS 가 전부 단어 문자로 이루어진 full-id 인지 판별합니다. */
function isFullIdAbbrev(lhs: string): boolean {
  for (let i = 0; i < lhs.length; i++) {
    if (!isAbbrevWordChar(lhs[i])) return false;
  }
  return lhs.length > 0;
}

/** :ab / :iab / :cab 인자에서 수식어(<buffer>, <expr>, <silent>, <unique>)와 lhs / rhs 를 분리합니다. */
export function parseAbbrevRest(rawRest: string): {
  modifiers: KeymapModifiers;
  lhs?: string;
  rhs?: string;
} {
  const modifiers: KeymapModifiers = {};
  let rest = rawRest.trim();
  while (rest.length > 0) {
    const firstMatch = rest.match(/^(\S+)(?:\s+([\s\S]*))?$/);
    if (!firstMatch || !ABBREV_FLAG_RE.test(firstMatch[1])) break;
    const flag = firstMatch[1].slice(1, -1).toLowerCase();
    if (flag === 'buffer') modifiers.buffer = true;
    else if (flag === 'silent') modifiers.silent = true;
    else if (flag === 'expr') modifiers.expr = true;
    else if (flag === 'unique') modifiers.unique = true;
    else if (flag === 'nowait') modifiers.nowait = true;
    rest = (firstMatch[2] ?? '').trimStart();
  }
  if (!rest) {
    return { modifiers };
  }
  const body = rest.match(/^(\S+)(?:\s+([\s\S]+))?$/);
  if (!body) return { modifiers };
  return {
    modifiers,
    lhs: body[1],
    rhs: body[2] !== undefined ? body[2].trim() : undefined,
  };
}

/** 입력 키가 해당 약어를 확장하는 트리거인지 판별합니다. */
export function isAbbrevTriggerKey(key: string, lhsEndsWithWordChar: boolean): boolean {
  if (
    key === 'Enter' ||
    key === 'Tab' ||
    key === 'Escape' ||
    key === 'Ctrl-]' ||
    key === 'Ctrl+]' ||
    key === 'ctrl-]' ||
    key === '<C-]>'
  ) {
    return true;
  }
  if (key.length !== 1) return false;
  return lhsEndsWithWordChar ? !/\w/.test(key) : /\s/.test(key);
}

/**
 * 커서 앞 문자열의 끝부분과 일치하는 약어를 단어 경계 규칙에 따라 찾습니다.
 * 버퍼 로컬 약어(<buffer>)가 전역 약어보다 우선합니다.
 * - full-id (전체가 식별자 문자): 앞 글자가 비식별자(또는 줄 시작)여야 함
 * - end-id / non-id (비식별자 포함): 앞 글자가 공백(또는 줄 시작)이어야 함
 */
export function findMatchingAbbrev(
  state: VimEditorState,
  mode: AbbrevMode,
  textBeforeCursor: string,
  triggerKey: string,
  excludedLhs?: ReadonlySet<string>
): AbbrevMatch | null {
  if (textBeforeCursor.length === 0) return null;
  const bufId = state.currentBufferId ?? 1;
  const bufAbbrevs = state.bufferAbbreviations?.[bufId];
  const globalAbbrevs = state.abbreviations;
  if (!bufAbbrevs && !globalAbbrevs) return null;

  const prefix = `${mode}:`;
  const byLhs = new Map<string, AbbreviationEntry>();
  if (globalAbbrevs) {
    for (const [k, entry] of Object.entries(globalAbbrevs)) {
      if (k.startsWith(prefix)) byLhs.set(entry.lhs, entry);
    }
  }
  if (bufAbbrevs) {
    for (const [k, entry] of Object.entries(bufAbbrevs)) {
      if (k.startsWith(prefix)) byLhs.set(entry.lhs, { ...entry, buffer: true });
    }
  }
  const candidates = Array.from(byLhs.values());
  if (candidates.length === 0) return null;

  // 더 긴 lhs 를 우선 매칭 (동일 길이면 버퍼 로컬이 이미 덮어씀)
  candidates.sort((a, b) => b.lhs.length - a.lhs.length);

  for (const entry of candidates) {
    if (excludedLhs?.has(entry.lhs)) continue;
    const lhs = entry.lhs;
    if (!lhs || !textBeforeCursor.endsWith(lhs)) continue;

    const prevIdx = textBeforeCursor.length - lhs.length - 1;
    const prevChar = prevIdx >= 0 ? textBeforeCursor[prevIdx] : undefined;
    const fullId = isFullIdAbbrev(lhs);

    if (prevChar !== undefined) {
      if (fullId) {
        if (isAbbrevWordChar(prevChar)) continue;
      } else {
        if (!/\s/.test(prevChar)) continue;
      }
    }

    const endsWithWord = isAbbrevWordChar(lhs[lhs.length - 1]);
    if (!isAbbrevTriggerKey(triggerKey, endsWithWord)) continue;

    return { entry, lhsLen: lhs.length };
  }

  return null;
}

/** :cunabbrev / :unabbrev / :abclear 등 약어 관리 명령 입력 중에는 확장을 막습니다. */
export function isAbbrevManagementCmd(cmdBuffer: string): boolean {
  const trimmed = cmdBuffer.trimStart().replace(/^:+/, '').trimStart();
  const verb = trimmed.split(/\s+/)[0] ?? '';
  return ABBREV_UNDEF_RE.test(verb) || ABBREV_CLEAR_RE.test(verb);
}

/** 약어 목록을 Vim 형식으로 포맷팅합니다 (:ab, :ia, :ca, :ab <buffer>). */
export function formatAbbrevsList(
  state: VimEditorState,
  modeFilter: 'all' | 'i' | 'c' = 'all',
  prefixFilter?: string,
  bufferOnly = false
): string {
  const bufId = state.currentBufferId ?? 1;
  const bufAbbrevs = state.bufferAbbreviations?.[bufId] ?? {};
  const globalAbbrevs = state.abbreviations ?? {};

  const collectFrom = (
    source: Record<string, AbbreviationEntry>,
    isBuf: boolean,
    out: string[]
  ) => {
    const byLhs = new Map<string, { i?: AbbreviationEntry; c?: AbbreviationEntry }>();
    for (const [k, entry] of Object.entries(source)) {
      const isI = k.startsWith('i:');
      const isC = k.startsWith('c:');
      if (!isI && !isC) continue;
      if (modeFilter === 'i' && !isI) continue;
      if (modeFilter === 'c' && !isC) continue;
      if (prefixFilter && !entry.lhs.startsWith(prefixFilter)) continue;

      const slot = byLhs.get(entry.lhs) ?? {};
      if (isI) slot.i = entry;
      if (isC) slot.c = entry;
      byLhs.set(entry.lhs, slot);
    }

    const scopeMark = isBuf ? '@' : '';
    const padWidth = isBuf ? 11 : 12;

    for (const [lhs, slot] of byLhs.entries()) {
      if (
        modeFilter === 'all' &&
        slot.i &&
        slot.c &&
        slot.i.rhs === slot.c.rhs &&
        Boolean(slot.i.noremap) === Boolean(slot.c.noremap)
      ) {
        const flag = slot.i.noremap ? '*' : ' ';
        out.push(`!${flag} ${scopeMark}${lhs.padEnd(padWidth)} ${slot.i.rhs}`);
      } else {
        if (slot.i) {
          const flag = slot.i.noremap ? '*' : ' ';
          out.push(`i${flag} ${scopeMark}${lhs.padEnd(padWidth)} ${slot.i.rhs}`);
        }
        if (slot.c) {
          const flag = slot.c.noremap ? '*' : ' ';
          out.push(`c${flag} ${scopeMark}${lhs.padEnd(padWidth)} ${slot.c.rhs}`);
        }
      }
    }
  };

  const linesOut: string[] = [];
  collectFrom(bufAbbrevs, true, linesOut);
  if (!bufferOnly) {
    collectFrom(globalAbbrevs, false, linesOut);
  }

  if (linesOut.length === 0) {
    const modeName =
      modeFilter === 'i'
        ? msg('입력 (Insert)')
        : modeFilter === 'c'
        ? msg('명령행 (Cmdline)')
        : msg('전체');
    return msg('정의된 {modeName} 약어가 없습니다.', { modeName });
  }

  const modeLabel = modeFilter === 'i' ? 'Insert' : modeFilter === 'c' ? 'Cmdline' : 'All';
  return [msg('--- 약어 목록 ({v}) ---', { v: modeLabel }), ...linesOut].join('\n');
}

/** 약어를 상태에 등록합니다 (:iabbrev, :cabbrev, :abbrev, :inoreabbrev, :cnoreabbrev, :noreabbrev). */
export function registerAbbrev(
  state: VimEditorState,
  cmdVerb: string,
  lhs: string,
  rhs: string,
  modifiers: KeymapModifiers = {}
): VimEditorState {
  if (!isValidAbbrevLhs(lhs)) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      bell: true,
      commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token: lhs }),
    };
  }

  const lower = cmdVerb.toLowerCase();
  const mode: 'all' | 'i' | 'c' = lower.startsWith('i')
    ? 'i'
    : lower.startsWith('c')
    ? 'c'
    : 'all';
  const noremap = lower.includes('nore');
  const bufId = state.currentBufferId ?? 1;
  const targetAbbrevs: Record<string, AbbreviationEntry> = modifiers.buffer
    ? { ...(state.bufferAbbreviations?.[bufId] ?? {}) }
    : { ...(state.abbreviations ?? {}) };

  if (modifiers.unique) {
    const existsI = (mode === 'all' || mode === 'i') && targetAbbrevs[`i:${lhs}`] !== undefined;
    const existsC = (mode === 'all' || mode === 'c') && targetAbbrevs[`c:${lhs}`] !== undefined;
    if (existsI || existsC) {
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

  const extraProps = {
    ...(modifiers.expr ? { expr: true } : {}),
    ...(modifiers.silent ? { silent: true } : {}),
    ...(modifiers.buffer ? { buffer: true } : {}),
  };

  if (mode === 'all' || mode === 'i') {
    targetAbbrevs[`i:${lhs}`] = { mode: 'i', lhs, rhs, noremap, ...extraProps };
  }
  if (mode === 'all' || mode === 'c') {
    targetAbbrevs[`c:${lhs}`] = { mode: 'c', lhs, rhs, noremap, ...extraProps };
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    ...(modifiers.buffer
      ? {
          bufferAbbreviations: {
            ...(state.bufferAbbreviations ?? {}),
            [bufId]: targetAbbrevs,
          },
        }
      : { abbreviations: targetAbbrevs }),
    commandMessage: msg('[약어 등록] {cmd}: {lhs} -> {rhs}', { cmd: cmdVerb, lhs, rhs }),
  };
}

/** 등록된 약어를 삭제합니다 (:unabbrev, :iunabbrev, :cunabbrev). */
export function unregisterAbbrev(
  state: VimEditorState,
  cmdVerb: string,
  lhs: string,
  options: { buffer?: boolean } = {}
): VimEditorState {
  const lower = cmdVerb.toLowerCase();
  const mode: 'all' | 'i' | 'c' = lower.startsWith('i')
    ? 'i'
    : lower.startsWith('c')
    ? 'c'
    : 'all';
  const bufId = state.currentBufferId ?? 1;
  const targetAbbrevs: Record<string, AbbreviationEntry> = options.buffer
    ? { ...(state.bufferAbbreviations?.[bufId] ?? {}) }
    : { ...(state.abbreviations ?? {}) };
  let removed = 0;

  if ((mode === 'all' || mode === 'i') && targetAbbrevs[`i:${lhs}`]) {
    delete targetAbbrevs[`i:${lhs}`];
    removed++;
  }
  if ((mode === 'all' || mode === 'c') && targetAbbrevs[`c:${lhs}`]) {
    delete targetAbbrevs[`c:${lhs}`];
    removed++;
  }

  if (removed === 0) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      bell: true,
      commandMessage: msg('E24: 그런 약어가 없습니다: {lhs}', { lhs }),
    };
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    ...(options.buffer
      ? {
          bufferAbbreviations: {
            ...(state.bufferAbbreviations ?? {}),
            [bufId]: targetAbbrevs,
          },
        }
      : { abbreviations: targetAbbrevs }),
    commandMessage: msg('[약어 해제] {cmd}: {lhs}', { cmd: cmdVerb, lhs }),
  };
}

/** 약어를 일괄 초기화합니다 (:abclear, :iabclear, :cabclear). */
export function clearAbbrevs(
  state: VimEditorState,
  cmdVerb: string,
  options: { buffer?: boolean } = {}
): VimEditorState {
  const lower = cmdVerb.toLowerCase();
  const mode: 'all' | 'i' | 'c' = lower.startsWith('i')
    ? 'i'
    : lower.startsWith('c')
    ? 'c'
    : 'all';
  const bufId = state.currentBufferId ?? 1;
  const sourceAbbrevs = options.buffer
    ? state.bufferAbbreviations?.[bufId] ?? {}
    : state.abbreviations ?? {};
  const nextAbbrevs: Record<string, AbbreviationEntry> = {};

  for (const [k, entry] of Object.entries(sourceAbbrevs)) {
    if (mode === 'all') continue;
    if (mode === 'i' && k.startsWith('i:')) continue;
    if (mode === 'c' && k.startsWith('c:')) continue;
    nextAbbrevs[k] = entry;
  }

  const modeName =
    mode === 'i' ? msg('입력 (Insert)') : mode === 'c' ? msg('명령행 (Cmdline)') : msg('전체');

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    ...(options.buffer
      ? {
          bufferAbbreviations: {
            ...(state.bufferAbbreviations ?? {}),
            [bufId]: nextAbbrevs,
          },
        }
      : { abbreviations: nextAbbrevs }),
    commandMessage: msg('[약어 초기화] {modeName} 약어를 모두 삭제했습니다.', { modeName }),
  };
}

/**
 * Ex 커맨드 문자열이 약어 관련 명령인지 검사하고 실행합니다 (:iabbrev, :cabbrev, :unabbrev, :abclear 등).
 * 약어 명령이 아니면 null 을 반환합니다.
 */
export function executeAbbrevCommand(
  state: VimEditorState,
  rawCmd: string
): VimEditorState | null {
  const trimmed = rawCmd.trim().replace(/^:+/, '').trim();
  if (!trimmed) return null;

  const firstSpace = trimmed.search(/\s/);
  const verb = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
  const rest = firstSpace === -1 ? '' : trimmed.slice(firstSpace).replace(/^\s+/, '');

  if (ABBREV_DEFINE_RE.test(verb)) {
    const lower = verb.toLowerCase();
    const modeFilter: 'all' | 'i' | 'c' = lower.startsWith('i')
      ? 'i'
      : lower.startsWith('c')
      ? 'c'
      : 'all';

    const parsed = parseAbbrevRest(rest);
    if (!parsed.lhs) {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: formatAbbrevsList(state, modeFilter, undefined, Boolean(parsed.modifiers.buffer)),
      };
    }

    if (parsed.rhs === undefined) {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: formatAbbrevsList(state, modeFilter, parsed.lhs, Boolean(parsed.modifiers.buffer)),
      };
    }

    return registerAbbrev(state, verb, parsed.lhs, parsed.rhs, parsed.modifiers);
  }

  if (ABBREV_UNDEF_RE.test(verb)) {
    const parsed = parseAbbrevRest(rest);
    const lhs = parsed.lhs ?? '';
    if (!lhs) {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        bell: true,
        commandMessage: msg('E24: 그런 약어가 없습니다: {lhs}', { lhs: '' }),
      };
    }
    return unregisterAbbrev(state, verb, lhs, { buffer: Boolean(parsed.modifiers.buffer) });
  }

  if (ABBREV_CLEAR_RE.test(verb)) {
    const parsed = parseAbbrevRest(rest);
    return clearAbbrevs(state, verb, { buffer: Boolean(parsed.modifiers.buffer) });
  }

  return null;
}

/** Command 모드에서 직전 단어를 :cabbrev 약어로 확장합니다. (<buffer>, <expr> 지원) */
export function expandCmdlineAbbrev(
  state: VimEditorState,
  cmdBuffer: string,
  triggerKey: string,
  seenLhs?: Set<string>
): string {
  const bufId = state.currentBufferId ?? 1;
  const hasAnyAbbrev =
    Boolean(state.abbreviations && Object.keys(state.abbreviations).length > 0) ||
    Boolean(state.bufferAbbreviations?.[bufId] && Object.keys(state.bufferAbbreviations[bufId]).length > 0);
  if (!hasAnyAbbrev || isAbbrevManagementCmd(cmdBuffer)) return cmdBuffer;

  const seen = seenLhs ? new Set(seenLhs) : new Set<string>();
  const match = findMatchingAbbrev(state, 'c', cmdBuffer, triggerKey, seen);
  if (!match) return cmdBuffer;

  const prefix = cmdBuffer.slice(0, cmdBuffer.length - match.lhsLen);
  const evalState: VimEditorState = {
    ...state,
    mode: 'COMMAND',
    commandType: state.commandType ?? ':',
    commandBuffer: cmdBuffer,
  };
  const rhs = match.entry.expr ? evaluateExprKeymap(evalState, match.entry.rhs) : match.entry.rhs;
  const tokens = parseKeySequence(rhs, state.leaderKey || ' ');
  let expanded = prefix;

  for (const tok of tokens) {
    if (tok === 'Backspace') {
      expanded = expanded.slice(0, -1);
    } else if (tok === 'Tab') {
      expanded += ' ';
    } else if (tok.length === 1) {
      expanded += tok;
    }
  }

  if (!match.entry.noremap && seen.size < 5) {
    seen.add(match.entry.lhs);
    return expandCmdlineAbbrev(state, expanded, triggerKey, seen);
  }
  return expanded;
}
