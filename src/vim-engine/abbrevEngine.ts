import { AbbreviationEntry, VimEditorState } from './types';
import { msg } from './messages';
import { parseKeySequence } from './keymapEngine';

export type AbbrevMode = 'i' | 'c';

export interface AbbrevMatch {
  entry: AbbreviationEntry;
  lhsLen: number;
}

const ABBREV_DEFINE_RE =
  /^(?:(?:i|c)?(?:nore)?(?:ab|abb|abbr|abbre|abbrev|abbrevi|abbreviat|abbreviate)|(?:(?:i|c)(?:nore)?|nore)a)$/i;
const ABBREV_UNDEF_RE = /^(i|c)?(?:una|unab|unabb|unabbr|unabbre|unabbrev)$/i;
const ABBREV_CLEAR_RE = /^(i|c)?(?:abc|abcl|abcle|abclea|abclear)$/i;

/** 단어를 구성하는 식별자 문자인지 판별합니다 (Vim iskeyword 기본 영숫자 + _). */
export function isAbbrevWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /\w/.test(ch);
}

/** 입력 키가 해당 약어를 확장하는 트리거인지 판별합니다. */
export function isAbbrevTriggerKey(key: string, lhsEndsWithWordChar: boolean): boolean {
  if (key === 'Enter' || key === 'Tab' || key === 'Escape' || key === 'Ctrl-]' || key === 'Ctrl+]' || key === 'ctrl-]') {
    return true;
  }
  if (key.length !== 1) return false;
  return lhsEndsWithWordChar ? !/\w/.test(key) : /\s/.test(key);
}

/**
 * 커서 앞 문자열의 끝부분과 일치하는 약어를 단어 경계 규칙에 따라 찾습니다.
 * - full-id (식별자 시작): 앞 글자가 비식별자(또는 줄 시작)여야 함
 * - non-keyword 시작(예: @e): 앞 글자가 공백(또는 줄 시작)이어야 함
 */
export function findMatchingAbbrev(
  state: VimEditorState,
  mode: AbbrevMode,
  textBeforeCursor: string,
  triggerKey: string,
  excludedLhs?: ReadonlySet<string>
): AbbrevMatch | null {
  const abbrevs = state.abbreviations;
  if (!abbrevs || textBeforeCursor.length === 0) return null;

  const prefix = `${mode}:`;
  const candidates: AbbreviationEntry[] = [];
  for (const [k, entry] of Object.entries(abbrevs)) {
    if (k.startsWith(prefix)) {
      candidates.push(entry);
    }
  }
  if (candidates.length === 0) return null;

  // 더 긴 lhs 를 우선 매칭
  candidates.sort((a, b) => b.lhs.length - a.lhs.length);

  for (const entry of candidates) {
    if (excludedLhs?.has(entry.lhs)) continue;
    const lhs = entry.lhs;
    if (!lhs || !textBeforeCursor.endsWith(lhs)) continue;

    const prevIdx = textBeforeCursor.length - lhs.length - 1;
    const prevChar = prevIdx >= 0 ? textBeforeCursor[prevIdx] : undefined;
    const startsWithWord = isAbbrevWordChar(lhs[0]);

    if (prevChar !== undefined) {
      if (startsWithWord) {
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

/** 약어 목록을 Vim 형식으로 포맷팅합니다 (:ab, :ia, :ca). */
export function formatAbbrevsList(
  state: VimEditorState,
  modeFilter: 'all' | 'i' | 'c' = 'all',
  prefixFilter?: string
): string {
  const abbrevs = state.abbreviations ?? {};
  const byLhs = new Map<string, { i?: AbbreviationEntry; c?: AbbreviationEntry }>();

  for (const [k, entry] of Object.entries(abbrevs)) {
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

  const linesOut: string[] = [];
  for (const [lhs, slot] of byLhs.entries()) {
    if (
      modeFilter === 'all' &&
      slot.i &&
      slot.c &&
      slot.i.rhs === slot.c.rhs &&
      Boolean(slot.i.noremap) === Boolean(slot.c.noremap)
    ) {
      const flag = slot.i.noremap ? '*' : ' ';
      linesOut.push(`!${flag} ${lhs.padEnd(12)} ${slot.i.rhs}`);
    } else {
      if (slot.i) {
        const flag = slot.i.noremap ? '*' : ' ';
        linesOut.push(`i${flag} ${lhs.padEnd(12)} ${slot.i.rhs}`);
      }
      if (slot.c) {
        const flag = slot.c.noremap ? '*' : ' ';
        linesOut.push(`c${flag} ${lhs.padEnd(12)} ${slot.c.rhs}`);
      }
    }
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
  rhs: string
): VimEditorState {
  const lower = cmdVerb.toLowerCase();
  const mode: 'all' | 'i' | 'c' = lower.startsWith('i')
    ? 'i'
    : lower.startsWith('c')
    ? 'c'
    : 'all';
  const noremap = lower.includes('nore');
  const nextAbbrevs: Record<string, AbbreviationEntry> = { ...(state.abbreviations ?? {}) };

  if (mode === 'all' || mode === 'i') {
    nextAbbrevs[`i:${lhs}`] = { mode: 'i', lhs, rhs, noremap };
  }
  if (mode === 'all' || mode === 'c') {
    nextAbbrevs[`c:${lhs}`] = { mode: 'c', lhs, rhs, noremap };
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    abbreviations: nextAbbrevs,
    commandMessage: msg('[약어 등록] {cmd}: {lhs} -> {rhs}', { cmd: cmdVerb, lhs, rhs }),
  };
}

/** 등록된 약어를 삭제합니다 (:unabbrev, :iunabbrev, :cunabbrev). */
export function unregisterAbbrev(
  state: VimEditorState,
  cmdVerb: string,
  lhs: string
): VimEditorState {
  const lower = cmdVerb.toLowerCase();
  const mode: 'all' | 'i' | 'c' = lower.startsWith('i')
    ? 'i'
    : lower.startsWith('c')
    ? 'c'
    : 'all';
  const nextAbbrevs: Record<string, AbbreviationEntry> = { ...(state.abbreviations ?? {}) };
  let removed = 0;

  if ((mode === 'all' || mode === 'i') && nextAbbrevs[`i:${lhs}`]) {
    delete nextAbbrevs[`i:${lhs}`];
    removed++;
  }
  if ((mode === 'all' || mode === 'c') && nextAbbrevs[`c:${lhs}`]) {
    delete nextAbbrevs[`c:${lhs}`];
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
    abbreviations: nextAbbrevs,
    commandMessage: msg('[약어 해제] {cmd}: {lhs}', { cmd: cmdVerb, lhs }),
  };
}

/** 약어를 일괄 초기화합니다 (:abclear, :iabclear, :cabclear). */
export function clearAbbrevs(state: VimEditorState, cmdVerb: string): VimEditorState {
  const lower = cmdVerb.toLowerCase();
  const mode: 'all' | 'i' | 'c' = lower.startsWith('i')
    ? 'i'
    : lower.startsWith('c')
    ? 'c'
    : 'all';
  const nextAbbrevs: Record<string, AbbreviationEntry> = {};

  for (const [k, entry] of Object.entries(state.abbreviations ?? {})) {
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
    abbreviations: nextAbbrevs,
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

    if (!rest) {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: formatAbbrevsList(state, modeFilter),
      };
    }

    const defMatch = rest.match(/^(\S+)\s+([\s\S]+)$/);
    if (!defMatch) {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: formatAbbrevsList(state, modeFilter, rest.trim()),
      };
    }

    return registerAbbrev(state, verb, defMatch[1], defMatch[2]);
  }

  if (ABBREV_UNDEF_RE.test(verb)) {
    const lhs = rest.trim().split(/\s+/)[0];
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
    return unregisterAbbrev(state, verb, lhs);
  }

  if (ABBREV_CLEAR_RE.test(verb)) {
    return clearAbbrevs(state, verb);
  }

  return null;
}

/** Command 모드에서 직전 단어를 :cabbrev 약어로 확장합니다. */
export function expandCmdlineAbbrev(
  state: VimEditorState,
  cmdBuffer: string,
  triggerKey: string,
  seenLhs?: Set<string>
): string {
  if (!state.abbreviations || isAbbrevManagementCmd(cmdBuffer)) return cmdBuffer;

  const seen = seenLhs ? new Set(seenLhs) : new Set<string>();
  const match = findMatchingAbbrev(state, 'c', cmdBuffer, triggerKey, seen);
  if (!match) return cmdBuffer;

  const prefix = cmdBuffer.slice(0, cmdBuffer.length - match.lhsLen);
  const tokens = parseKeySequence(match.entry.rhs, state.leaderKey || ' ');
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
