// :s///c 대화형 치환 확인 모드 (exSubstitute.ts 에서 분리)
import { VimEditorState, ConfirmSubstituteMatch, ConfirmSubstituteSession } from './types';
import { clampCursor } from './cursor';
import { compileVimRegex } from './vimRegex';
import { msg } from './messages';
import { type KeyRunner, makeReplacer, splitReplacedLines } from './exSubstituteReplace';

/** findNextSubstituteOccurrence 의 부가 옵션 */
export interface SubstituteSearchOptions {
  /** 확정된 대소문자 무시 여부 (없으면 i 플래그로 판단) */
  ignoreCase?: boolean;
  /** 패턴 안의 ~ 가 가리키는 직전 치환 문자열 */
  tildeText?: string;
  /** \= 치환식을 평가할 때 사용할 에디터 상태 */
  exprState?: VimEditorState;
  keyRunner?: KeyRunner;
  runEx?: (state: VimEditorState, cmd: string) => VimEditorState;
}

/**
 * 대화형 치환 확인(:s/.../.../gc) 모드에서 다음 매치 위치를 검색합니다.
 */
export function findNextSubstituteOccurrence(
  lines: string[],
  range: { startLine: number; endLine: number },
  oldText: string,
  newText: string,
  flags: string,
  fromPos: { line: number; col: number },
  opts: SubstituteSearchOptions = {}
): ConfirmSubstituteMatch | null {
  const isGlobal = flags.includes('g');
  const isIgnoreCase = opts.ignoreCase ?? flags.includes('i');
  let regex: RegExp;
  try {
    regex = compileVimRegex(oldText, { ignorecase: isIgnoreCase, flags: 'g', lastSubstitute: opts.tildeText });
  } catch {
    return null;
  }

  const exprState: VimEditorState = opts.exprState ?? { lines, cursor: { line: fromPos.line, col: 0 }, mode: 'NORMAL' };
  const replacer = makeReplacer(newText, { ...exprState, lines }, opts.runEx);

  for (let l = fromPos.line; l <= range.endLine; l++) {
    const lineText = lines[l] ?? '';
    regex.lastIndex = l === fromPos.line ? fromPos.col : 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(lineText)) !== null) {
      const matchIndex = match.index;
      const matchedText = match[0];
      const matchLength = matchedText.length > 0 ? matchedText.length : 1;
      const groups = match.slice(1);
      const replacement = replacer(matchedText, groups, l);

      return {
        line: l,
        col: matchIndex,
        length: matchLength,
        matchedText,
        groups,
        replacement,
      };
    }

    if (!isGlobal && l === fromPos.line && fromPos.col > 0) {
      continue;
    }
  }

  return null;
}

/** 확인 모드 세션의 다음 매치 검색 */
function findNextInSession(
  state: VimEditorState,
  session: ConfirmSubstituteSession,
  lines: string[],
  fromPos: { line: number; col: number }
): ConfirmSubstituteMatch | null {
  return findNextSubstituteOccurrence(lines, session.range, session.oldText, session.newText, session.flags, fromPos, {
    ignoreCase: session.isIgnoreCase,
    tildeText: session.tildeText,
    exprState: state,
  });
}

/**
 * 대화형 치환 확인(:s/.../.../gc) 모드에서 키(y/n/a/q/l) 입력을 처리합니다.
 */
export function handleConfirmSubstituteKey(
  state: VimEditorState,
  key: string
): VimEditorState {
  const session = state.confirmSubstitute;
  if (!session) return state;

  const { currentMatch, isGlobal, commandStr, substitutedCount } = session;

  // 1. 'y': 현재 매치 치환 후 다음 매치로 이동
  if (key === 'y' || key === 'Y') {
    const lineText = state.lines[currentMatch.line] ?? '';
    const newLineText =
      lineText.slice(0, currentMatch.col) +
      currentMatch.replacement +
      lineText.slice(currentMatch.col + currentMatch.length);

    const nextLines = [...state.lines];
    nextLines[currentMatch.line] = newLineText;
    const newCount = substitutedCount + 1;

    const nextSearchPos = isGlobal
      ? { line: currentMatch.line, col: currentMatch.col + currentMatch.replacement.length }
      : { line: currentMatch.line + 1, col: 0 };

    const nextMatch = findNextInSession(state, session, nextLines, nextSearchPos);

    if (nextMatch) {
      return {
        ...state,
        lines: nextLines,
        cursor: { line: nextMatch.line, col: nextMatch.col },
        confirmSubstitute: {
          ...session,
          substitutedCount: newCount,
          currentMatch: nextMatch,
        },
      };
    } else {
      const finalLines = splitReplacedLines(nextLines);
      return {
        ...state,
        lines: finalLines,
        cursor: clampCursor(finalLines, { line: currentMatch.line, col: currentMatch.col }, 'NORMAL'),
        confirmSubstitute: null,
        commandMessage: msg('{newCount}개 항목을 치환했습니다.', { newCount }),
        lastChangeKeys: [':', commandStr, 'Enter'],
      };
    }
  }

  // 2. 'n': 현재 매치 건너뛰고 다음 매치로 이동
  if (key === 'n' || key === 'N') {
    const nextSearchPos = isGlobal
      ? { line: currentMatch.line, col: currentMatch.col + currentMatch.length }
      : { line: currentMatch.line + 1, col: 0 };

    const nextMatch = findNextInSession(state, session, state.lines, nextSearchPos);

    if (nextMatch) {
      return {
        ...state,
        cursor: { line: nextMatch.line, col: nextMatch.col },
        confirmSubstitute: {
          ...session,
          currentMatch: nextMatch,
        },
      };
    } else {
      return {
        ...state,
        lines: splitReplacedLines(state.lines),
        confirmSubstitute: null,
        commandMessage: substitutedCount > 0
          ? msg('{substitutedCount}개 항목을 치환했습니다.', { substitutedCount })
          : msg('치환을 완료했습니다.'),
      };
    }
  }

  // 3. 'a': 현재 매치 및 나머지 모든 매치 일괄 치환 후 종료
  if (key === 'a' || key === 'A') {
    return substituteAllRemaining(state, session);
  }

  // 4. 'l': 현재 매치 치환하고 즉시 종료 (last)
  if (key === 'l' || key === 'L') {
    const lineText = state.lines[currentMatch.line] ?? '';
    const newLineText =
      lineText.slice(0, currentMatch.col) +
      currentMatch.replacement +
      lineText.slice(currentMatch.col + currentMatch.length);

    const nextLines = [...state.lines];
    nextLines[currentMatch.line] = newLineText;
    const newCount = substitutedCount + 1;
    const finalLines = splitReplacedLines(nextLines);

    return {
      ...state,
      lines: finalLines,
      cursor: clampCursor(finalLines, { line: currentMatch.line, col: currentMatch.col }, 'NORMAL'),
      confirmSubstitute: null,
      commandMessage: msg('{newCount}개 항목을 치환했습니다.', { newCount }),
      lastChangeKeys: [':', commandStr, 'Enter'],
    };
  }

  // 5. 'q', 'Escape', 'Ctrl-c': 치환 중단 및 즉시 복귀
  if (key === 'q' || key === 'Q' || key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c') {
    return {
      ...state,
      lines: splitReplacedLines(state.lines),
      confirmSubstitute: null,
      commandMessage: substitutedCount > 0
        ? msg('{substitutedCount}개 항목을 치환했습니다.', { substitutedCount })
        : msg('치환이 취소되었습니다.'),
    };
  }

  return state;
}

/**
 * 대화형 치환 확인 모드에서 나머지 모든 일치 항목을 일괄 치환합니다.
 */
export function substituteAllRemaining(
  state: VimEditorState,
  session: ConfirmSubstituteSession
): VimEditorState {
  const curLines = [...state.lines];
  let totalCount = session.substitutedCount;
  let curMatch: ConfirmSubstituteMatch | null = session.currentMatch;
  let lastPos = { line: curMatch.line, col: curMatch.col };

  while (curMatch) {
    const lineText = curLines[curMatch.line] ?? '';
    const newLineText =
      lineText.slice(0, curMatch.col) +
      curMatch.replacement +
      lineText.slice(curMatch.col + curMatch.length);
    curLines[curMatch.line] = newLineText;
    totalCount++;
    lastPos = { line: curMatch.line, col: curMatch.col };

    const nextSearchPos = session.isGlobal
      ? { line: curMatch.line, col: curMatch.col + curMatch.replacement.length }
      : { line: curMatch.line + 1, col: 0 };

    curMatch = findNextInSession(state, session, curLines, nextSearchPos);
  }

  const finalLines = splitReplacedLines(curLines);
  return {
    ...state,
    lines: finalLines,
    cursor: clampCursor(finalLines, lastPos, 'NORMAL'),
    confirmSubstitute: null,
    commandMessage: msg('{totalCount}개 항목을 치환했습니다.', { totalCount }),
    lastChangeKeys: [':', session.commandStr, 'Enter'],
  };
}
