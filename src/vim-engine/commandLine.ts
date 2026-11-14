import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { executeShellCommand, executeFilterRange, executeWriteShell } from './shellEngine';
import { retabRange } from './formatEngine';
import { executeUserCommand, lookupUserCommand } from './userCommandEngine';
import { appendFunctionDraftLine, executeCallCommand, executeScriptBlock, executeScriptCommandLine } from './vimscriptEngine';
import { vimRegexToJsRegex } from './vimRegex';
import { msg } from './messages';
import {
  parseSingleAddress,
  extractRangeAndCommand,
  parseAddress,
  parseRange,
  splitPipedCommands,
  isExShellSegment,
} from './exRange';
import {
  KeyRunner,
  ReplaceToken,
  SubstituteOptions,
  SubstituteSearchOptions,
  parseReplacementTokens,
  evaluateReplacement,
  parseSubstitutionCommand,
  executeSubstitution,
  findNextSubstituteOccurrence,
  handleConfirmSubstituteKey,
  substituteAllRemaining,
} from './exSubstitute';
import {
  executeSort,
  executeRead,
  executeMove,
  executeCopy,
  executeGlobalCommand,
  executeRangeDelete,
  executeRangeYank,
  executeRangeNorm,
  executeNormalKeysOnLine,
  parseKeyTokens,
} from './exBufferOps';
import { tryExecuteWorkspaceExCommand } from './exWorkspaceCommands';
import { tryExecuteToolExCommand } from './exListAndToolCommands';

export {
  vimRegexToJsRegex,
  parseSingleAddress,
  extractRangeAndCommand,
  parseAddress,
  parseRange,
  splitPipedCommands,
  isExShellSegment,
  parseReplacementTokens,
  evaluateReplacement,
  parseSubstitutionCommand,
  executeSubstitution,
  findNextSubstituteOccurrence,
  handleConfirmSubstituteKey,
  substituteAllRemaining,
  executeSort,
  executeRead,
  executeMove,
  executeCopy,
  executeNormalKeysOnLine,
  parseKeyTokens,
};
export type { KeyRunner, ReplaceToken, SubstituteOptions, SubstituteSearchOptions };

/** 파이프로 연결된 다중 명령어 실행 */
function executePipedCommands(
  state: VimEditorState,
  commands: string[],
  keyRunner?: KeyRunner,
  userCommandDepth = 0
): VimEditorState {
  const isControlFlow = (cmd: string) => {
    const word = cmd.trim().replace(/^:\s*/, '').match(/^(\w+)/)?.[1] ?? '';
    return /^(if|elseif|elsei|else|el|endif|en|while|wh|endwhile|endw|for|endfor|endfo|try|catch|cat|finally|fin|endtry|endt|throw|th|return|retu)$/.test(word);
  };

  const hasControlFlow = commands.some(isControlFlow);
  const runEx = (s: VimEditorState, c: string) => executeCommandLine(s, c, keyRunner, userCommandDepth);

  if (hasControlFlow) {
    return executeScriptBlock(state, commands, runEx);
  }

  let cur = state;
  for (const cmd of commands) {
    const cleaned = cmd.trim();
    if (cleaned.length === 0) continue;
    cur = executeCommandLine(cur, cleaned, keyRunner, userCommandDepth);
    if (cur.bell) {
      break;
    }
  }
  return cur;
}

/**
 * COMMAND 모드(:)에서 입력된 명령어를 파싱하고 실행합니다.
 */
export function executeCommandLine(
  state: VimEditorState,
  commandStr: string,
  keyRunner?: KeyRunner,
  userCommandDepth = 0
): VimEditorState {
  const trimmed = commandStr.trimStart();

  // 0. :function 본문 입력 중이면 입력한 줄을 본문에 추가 (endfunction 에서 확정)
  if (state.functionDraft) {
    return appendFunctionDraftLine(state, commandStr);
  }

  // 1. 빈 명령인 경우 NORMAL 모드로 복귀
  if (trimmed.trim().length === 0) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: undefined,
    };
  }

  // 1-0. 다중 파이프(|) 명령어 분할 및 순차/스크립트 실행 (:help :bar)
  const pipedCommands = splitPipedCommands(trimmed);
  if (pipedCommands.length > 1) {
    return executePipedCommands(state, pipedCommands, keyRunner, userCommandDepth);
  }

  // 1-1. Vim script: :function, :endfunction, :delfunction, :let, :unlet, :echo, :execute, :[range]call
  const runEx = (s: VimEditorState, cmd: string) => executeCommandLine(s, cmd, keyRunner, userCommandDepth);
  const scriptRes = executeScriptCommandLine(state, trimmed, runEx);
  if (scriptRes) {
    return scriptRes;
  }
  const callExtracted = extractRangeAndCommand(trimmed, state);
  const callMatch = !callExtracted.error && callExtracted.command.trim().match(/^cal(?:l)?\s+(.+)$/);
  if (callMatch) {
    return executeCallCommand(state, callMatch[1], callExtracted.hasRange ? callExtracted.range : null, runEx);
  }

  // 2. 글로벌 명령: :g/pattern/cmd, :v/pattern/cmd, :g!/pattern/cmd
  const gMatch = trimmed.match(/^:?\s*(g|global|v|vglobal)(!?)\s*\/([^\/]+)\/(.*)$/);
  if (gMatch) {
    return executeGlobalCommand(state, gMatch, commandStr, keyRunner);
  }

  // 3. 창 분할 및 종료, 설정, 키매핑 명령어
  let cleanCmdRaw = trimmed.replace(/^:/, '').trim();
  if (/^silent!?\s+/i.test(cleanCmdRaw)) {
    cleanCmdRaw = cleanCmdRaw.replace(/^silent!?\s+/i, '');
  }
  const cleanCmd = cleanCmdRaw.toLowerCase();

  const wsRes = tryExecuteWorkspaceExCommand(state, cleanCmdRaw, cleanCmd, trimmed, runEx);
  if (wsRes) return wsRes;

  const toolRes = tryExecuteToolExCommand(state, cleanCmdRaw, cleanCmd, trimmed, runEx);
  if (toolRes) return toolRes;

  // 4. 공통 Range 파서 및 Ex 명령어 실행
  const extracted = extractRangeAndCommand(trimmed, state);
  if (extracted.error) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: extracted.error,
      bell: true,
    };
  }

  const { range, hasRange, command } = extracted;
  const cmdTrimmed = command.trim();

  // 4-0. 사용자 정의 명령 호출 (:Name[!] [args], :[range]Name) - 내장 명령보다 뒤에 평가되어 내장 명령을 가리지 않음
  const userCmdCall = cmdTrimmed.match(/^([A-Z][A-Za-z0-9]*)(!?)(?:\s+(.*))?$/);
  if (userCmdCall && state.userCommands) {
    const lookup = lookupUserCommand(state, userCmdCall[1]);
    if (lookup.kind === 'ambiguous') {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: msg('E464: 사용자 정의 명령 이름이 모호합니다: {v} ({v2})', { v: userCmdCall[1], v2: lookup.candidates.join(', ') }),
        bell: true,
      };
    }
    if (lookup.kind === 'found') {
      return executeUserCommand(
        state,
        lookup.command,
        { bang: userCmdCall[2] === '!', args: (userCmdCall[3] ?? '').trim(), range: hasRange ? range : null },
        (s, cmd) => executeCommandLine(s, cmd, keyRunner, userCommandDepth + 1),
        userCommandDepth
      );
    }
  }

  // 4-1. 명령어 없이 범위 또는 주소만 주어진 경우: 라인 이동 (예: ':10', ':$', ':+3', ':-2', ':\'a')
  if (hasRange && cmdTrimmed.length === 0 && range) {
    const targetLine = Math.max(0, Math.min(range.endLine, state.lines.length - 1));
    const nextCursor = clampCursor(
      state.lines,
      { line: targetLine, col: state.cursor.col },
      'NORMAL'
    );
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      cursor: nextCursor,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('{v}번째 줄로 이동했습니다.', { v: targetLine + 1 }),
    };
  }

  const currentLineRange = { startLine: state.cursor.line, endLine: state.cursor.line };
  const fullBufferRange = { startLine: 0, endLine: Math.max(0, state.lines.length - 1) };

  // 4-1-0. 가상 셸 실행/필터링/파이프 (:[range]!cmd, :!cmd, :[range]w !cmd)
  if (cmdTrimmed.startsWith('!')) {
    const shellCmd = cmdTrimmed.slice(1);
    if (hasRange && range) {
      return executeFilterRange(state, range, shellCmd);
    }
    return executeShellCommand(state, shellCmd);
  }

  const writePipeMatch = cmdTrimmed.match(/^w(?:r(?:i(?:te?)?)?)?\s+!(.*)$/);
  if (writePipeMatch) {
    const targetRange = range ?? fullBufferRange;
    return executeWriteShell(state, targetRange, writePipeMatch[1]);
  }

  // 4-1-1. :nohlsearch / :noh — 다음 검색 전까지 검색 하이라이트 끄기
  if (/^noh(?:l(?:s(?:e(?:a(?:r(?:c(?:h)?)?)?)?)?)?)?$/.test(cmdTrimmed)) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: undefined,
      hlsearchSuppressed: true,
    };
  }

  // 4-2. 치환: :[range]s/old/new/flags 또는 :s/old/new/flags
  const sub = parseSubstitutionCommand(command);
  if (sub) {
    const targetRange = range ?? currentLineRange;
    return executeSubstitution(state, targetRange, sub.oldText, sub.newText, sub.flags, trimmed, { keyRunner, runEx });
  }

  // 4-2-1. 직전 치환 반복: :& (플래그 없이), :&& (플래그 유지), :s (인자 없이), 뒤에 플래그 추가 가능
  const repeatSub = cmdTrimmed.match(/^(?:&(&?)|s)([cegiInI]*)$/);
  if (repeatSub && (cmdTrimmed.startsWith('&') || cmdTrimmed === 's')) {
    const last = state.lastSubstitute;
    if (!last) {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: msg('E35: 이전에 사용한 치환 명령이 없습니다'),
        bell: true,
      };
    }
    const repeatFlags = (repeatSub[1] === '&' ? last.flags : '') + (repeatSub[2] ?? '');
    return executeSubstitution(state, range ?? currentLineRange, last.pattern, last.replacement, repeatFlags, trimmed, {
      keyRunner,
      runEx,
      replacementExpanded: true,
    });
  }

  // 4-3. 삭제: :[range]d, :d, :[range]delete
  if (cmdTrimmed === 'd' || cmdTrimmed === 'delete') {
    const targetRange = range ?? currentLineRange;
    return executeRangeDelete(state, targetRange, trimmed);
  }

  // 4-4. 복사: :[range]y, :y, :[range]yank
  if (cmdTrimmed === 'y' || cmdTrimmed === 'yank') {
    const targetRange = range ?? currentLineRange;
    return executeRangeYank(state, targetRange);
  }

  // 4-5. Normal 모드 명령 실행: :[range]norm {keys}, :norm {keys}
  const normMatch = command.match(/^(?:norm|normal)(!?)\s+(.*)$/);
  if (normMatch) {
    const targetRange = range ?? currentLineRange;
    return executeRangeNorm(state, targetRange, normMatch[2], trimmed, keyRunner);
  }

  // 4-6. 정렬: :[range]sort[!] [i][u][n|f|x|o|b][r] [/{pattern}/]
  const sortMatch = cmdTrimmed.match(/^sort(!?)(?:\s+(.*)|([/!#@?,].*))?$/);
  if (sortMatch) {
    const targetRange = range ?? fullBufferRange;
    const rawArgs = [sortMatch[2], sortMatch[3]].filter(Boolean).join(' ');
    return executeSort(state, targetRange, sortMatch[1], rawArgs);
  }

  // 4-6-0. 파일 및 셸 출력 읽기 삽입: :[range]r[ead] [file | !cmd] (:0r, :$r, :r %, :r #, :r !cmd 지원)
  const readMatch = cmdTrimmed.match(/^r(?:e(?:ad?)?)?(?:\s+(.*)|(!.*))?$/);
  if (readMatch) {
    const insertAfterLine = hasRange
      ? extracted.isLineZero
        ? -1
        : (range?.endLine ?? state.cursor.line)
      : state.cursor.line;
    return executeRead(state, insertAfterLine, readMatch[1] ?? readMatch[2]);
  }

  // 4-6-1. 탭/공백 일괄 변환: :[range]ret[ab][!] [N]
  const retabMatch = cmdTrimmed.match(/^ret(?:a|ab)?(!?)(?:\s+(\S+))?$/);
  if (retabMatch) {
    const targetRange = range ?? fullBufferRange;
    const rawN = retabMatch[2];
    if (rawN !== undefined && !/^\d+$/.test(rawN)) {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token: rawN }),
        bell: true,
      };
    }
    const res = retabRange(
      state,
      targetRange.startLine,
      targetRange.endLine,
      retabMatch[1] === '!',
      rawN !== undefined ? parseInt(rawN, 10) : undefined
    );
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 4-7. 이동: :[range]m[ove] {address}
  // :m0 / :t. / :1cop /pat/ 처럼 공백 없이 주소를 바로 붙여 쓸 수 있습니다
  const moveMatch = cmdTrimmed.match(/^(?:m|mo|mov|move)(?:(?=\s|[\d.$+\-'/?])|$)\s*(.*)$/);
  if (moveMatch) {
    const targetRange = range ?? currentLineRange;
    return executeMove(state, targetRange, moveMatch[1]);
  }

  // 4-8. 복제: :[range]t {address}, :co[py] {address}
  const copyMatch = cmdTrimmed.match(/^(?:t|co|cop|copy)(?:(?=\s|[\d.$+\-'/?])|$)\s*(.*)$/);
  if (copyMatch) {
    const targetRange = range ?? currentLineRange;
    return executeCopy(state, targetRange, copyMatch[1]);
  }

  // 5. 알 수 없는 명령어는 에러 메시지와 함께 NORMAL 모드로 복귀
  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('E492: 지원하지 않는 에디터 명령어입니다: {trimmed}', { trimmed }),
    bell: true,
  };
}
