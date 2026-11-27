import { VimEditorState, ConfirmSubstituteMatch } from './types';
import { clampCursor, getFirstNonBlankCol } from './cursor';
import { pushUndoSnapshot } from './operators';
import { compileVimRegex } from './vimRegex';
import { msg } from './messages';
import {
  type KeyRunner,
  expandReplacementTilde,
  makeReplacer,
  resolveSubstituteIgnoreCase,
  splitReplacedLines,
  substituteError,
} from './exSubstituteReplace';
import { findNextSubstituteOccurrence } from './exSubstituteConfirm';

// 분리한 모듈의 기존 export 를 이 경로에서도 그대로 제공합니다.
export type { KeyRunner, ReplaceToken } from './exSubstituteReplace';
export { parseReplacementTokens, evaluateReplacement, parseSubstitutionCommand } from './exSubstituteReplace';
export type { SubstituteSearchOptions } from './exSubstituteConfirm';
export {
  findNextSubstituteOccurrence,
  handleConfirmSubstituteKey,
  substituteAllRemaining,
} from './exSubstituteConfirm';
export { parseLiveSubstitutionCommand, computeIncCommandPreview } from './exSubstitutePreview';

/** :s 실행에 필요한 부가 정보 */
export interface SubstituteOptions {
  /** \= 치환식에서 사용자 함수를 호출할 때의 키 실행기 */
  keyRunner?: KeyRunner;
  /** :& / :&& 반복처럼 이미 ~ 를 펼친 치환 문자열이면 다시 펼치지 않음 */
  replacementExpanded?: boolean;
  /** Ex 명령 실행 콜백 (사용자 함수 호출 시 사용) */
  runEx?: (state: VimEditorState, cmd: string) => VimEditorState;
}

/**
 * 지정된 범위 내 텍스트 치환을 실행합니다.
 * 순정 Vim 정규식 캡처 그룹(\1~\9, &) 및 대소문자 변환 플래그(\u, \U, \l, \L, \E)를 완벽하게 지원합니다.
 * - 빈 패턴(:s//new/)은 직전 치환 또는 검색 패턴을 사용합니다.
 * - 치환 문자열의 ~ 는 직전 치환 문자열, 패턴의 ~ 도 직전 치환 문자열과 일치합니다.
 * - \=expr 치환식과 submatch(n), \r 줄 나누기를 지원합니다.
 * - 성공하면 패턴이 마지막 검색 패턴이 되어 n / N 으로 이어서 찾을 수 있습니다.
 */
export function executeSubstitution(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  oldText: string,
  newText: string,
  flags: string,
  commandStr: string,
  options: SubstituteOptions = {}
): VimEditorState {
  const pattern = oldText.length > 0 ? oldText : state.lastSubstitute?.pattern ?? state.lastSearchQuery ?? '';
  if (pattern.length === 0) {
    return substituteError(state, msg('E35: 이전에 사용한 정규식이 없습니다'));
  }

  const isGlobal = flags.includes('g');
  const isCountOnly = flags.includes('n');
  const suppressNoMatchError = flags.includes('e');
  const isIgnoreCase = resolveSubstituteIgnoreCase(pattern, flags, state);
  const tildeText = state.lastSubstitute?.replacement;
  const replacement = options.replacementExpanded ? newText : expandReplacementTilde(newText, tildeText);

  let regex: RegExp;
  let testRegex: RegExp;
  try {
    regex = compileVimRegex(pattern, { ignorecase: isIgnoreCase, flags: isGlobal ? 'g' : '', lastSubstitute: tildeText });
    testRegex = compileVimRegex(pattern, { ignorecase: isIgnoreCase, lastSubstitute: tildeText });
  } catch {
    return substituteError(state, msg('E486: 잘못된 정규식 패턴입니다: {pattern}', { pattern }));
  }

  // 직전 치환·검색 패턴 기록 (Vim 처럼 :s 의 패턴으로 n 을 이어서 쓸 수 있음)
  const remembered: Partial<VimEditorState> = {
    lastSubstitute: { pattern, replacement, flags },
    lastSearchQuery: pattern,
  };

  // 매치 개수 카운트 전용 플래그 (n): 버퍼를 변경하지 않고 일치 횟수와 줄 수만 보고 (:help :s_n)
  if (isCountOnly) {
    let matchCount = 0;
    let matchedLines = 0;
    for (let l = range.startLine; l <= range.endLine && l < state.lines.length; l++) {
      const line = state.lines[l] ?? '';
      if (isGlobal) {
        regex.lastIndex = 0;
        let lineHits = 0;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(line)) !== null) {
          lineHits++;
          if (m.index === regex.lastIndex) regex.lastIndex++;
        }
        if (lineHits > 0) {
          matchCount += lineHits;
          matchedLines++;
        }
      } else if (testRegex.test(line)) {
        matchCount++;
        matchedLines++;
      }
    }
    if (matchCount === 0) {
      if (suppressNoMatchError) {
        return {
          ...state,
          ...remembered,
          mode: 'NORMAL',
          visualAnchor: undefined,
          commandBuffer: undefined,
          commandType: undefined,
          commandMessage: undefined,
        };
      }
      return substituteError({ ...state, ...remembered }, msg('E486: 패턴을 찾을 수 없습니다: {pattern}', { pattern }));
    }
    return {
      ...state,
      ...remembered,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('{count}개 일치 ({lines}줄)', { count: matchCount, lines: matchedLines }),
    };
  }

  // 대화형 확인 플래그 (c) 처리 (:s/old/new/gc)
  if (flags.includes('c')) {
    let firstMatch: ConfirmSubstituteMatch | null;
    try {
      firstMatch = findNextSubstituteOccurrence(
        state.lines,
        range,
        pattern,
        replacement,
        flags,
        { line: range.startLine, col: 0 },
        { ignoreCase: isIgnoreCase, tildeText, exprState: state, keyRunner: options.keyRunner, runEx: options.runEx }
      );
    } catch (err) {
      return substituteError(state, err instanceof Error ? err.message : String(err));
    }

    if (!firstMatch) {
      if (suppressNoMatchError) {
        return {
          ...state,
          ...remembered,
          mode: 'NORMAL',
          visualAnchor: undefined,
          commandBuffer: undefined,
          commandType: undefined,
          commandMessage: undefined,
        };
      }
      return substituteError({ ...state, ...remembered }, msg('E486: 패턴을 찾을 수 없습니다: {pattern}', { pattern }));
    }

    const stateWithSnapshot = pushUndoSnapshot(state);
    return {
      ...stateWithSnapshot,
      ...remembered,
      mode: 'NORMAL',
      cursor: { line: firstMatch.line, col: firstMatch.col },
      confirmSubstitute: {
        range,
        oldText: pattern,
        newText: replacement,
        flags,
        isGlobal,
        isIgnoreCase,
        commandStr,
        substitutedCount: 0,
        currentMatch: firstMatch,
        tildeText,
      },
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: undefined,
    };
  }

  const replacer = makeReplacer(replacement, state, options.runEx);
  let totalSubCount = 0;
  let lastModifiedLine = -1;

  let nextLines = [...state.lines];
  try {
    for (let l = range.startLine; l <= range.endLine; l++) {
      const line = nextLines[l];
      // 패턴 매칭 여부 사전 테스트
      if (!testRegex.test(line)) {
        continue;
      }

      if (isGlobal) {
        regex.lastIndex = 0;
      }

      let lineMatched = false;
      nextLines[l] = line.replace(regex, (...args) => {
        totalSubCount++;
        lineMatched = true;
        const match = args[0] as string;
        const offsetIndex = args.findIndex((arg, idx) => idx > 0 && typeof arg === 'number');
        const groups = (offsetIndex > 1 ? args.slice(1, offsetIndex) : []) as (string | undefined)[];
        return replacer(match, groups, l);
      });
      if (lineMatched) lastModifiedLine = l;
    }
  } catch (err) {
    return substituteError(state, err instanceof Error ? err.message : String(err));
  }

  if (totalSubCount === 0) {
    if (suppressNoMatchError) {
      return {
        ...state,
        ...remembered,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: undefined,
      };
    }
    return substituteError({ ...state, ...remembered }, msg('E486: 패턴을 찾을 수 없습니다: {pattern}', { pattern }));
  }

  nextLines = splitReplacedLines(nextLines);
  const stateWithSnapshot = pushUndoSnapshot(state);
  // Vim do_sub: 마지막으로 치환한 줄의 첫 비공백으로 갑니다.
  const lastSubLine = Math.max(0, Math.min(lastModifiedLine, nextLines.length - 1));
  const nextCursor = clampCursor(
    nextLines,
    { line: lastSubLine, col: getFirstNonBlankCol(nextLines[lastSubLine] ?? '') },
    'NORMAL'
  );

  let resultMessage = msg('{totalSubCount}개 항목을 치환했습니다.', { totalSubCount });
  if (lastModifiedLine >= 0 && (flags.includes('#') || flags.includes('l') || flags.includes('p'))) {
    const outIdx = Math.min(lastModifiedLine, nextLines.length - 1);
    const outLine = nextLines[outIdx] ?? '';
    if (flags.includes('#')) {
      resultMessage = `${String(outIdx + 1).padStart(6, ' ')}  ${outLine}`;
    } else if (flags.includes('l')) {
      let escaped = '';
      for (let c = 0; c < outLine.length; c++) {
        const ch = outLine[c];
        const code = outLine.charCodeAt(c);
        if (ch === '\t') escaped += '^I';
        else if (code < 32) escaped += `^${String.fromCharCode(code + 64)}`;
        else escaped += ch;
      }
      resultMessage = `${escaped}$`;
    } else {
      resultMessage = outLine;
    }
  }

  return {
    ...stateWithSnapshot,
    ...remembered,
    lines: nextLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: resultMessage,
    lastChangeKeys: [':', commandStr, 'Enter'],
  };
}
