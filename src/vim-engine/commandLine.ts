import { VimEditorState } from './types';
import { clampCursor, setActiveCursorContext } from './cursor';
import { setActiveIskeyword } from './wordMotion';
import { setActiveMatchpairs } from './bracketMatch';
import { getOptions } from './setEngine';
import { executeShellCommand, executeFilterRange, executeWriteShell } from './shellEngine';
import { retabRange } from './formatEngine';
import { executeUserCommand, lookupUserCommand } from './userCommandEngine';
import {
  appendFunctionDraftLine,
  executeCallCommand,
  executeScriptBlock,
  executeScriptCommandLine,
} from './vimscriptEngine';
import { appendRedirText, handleRedirCommand } from './vimscriptValues';
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
  executeExPut,
  parseRegisterCountArgs,
  applyRangeCount,
  executeRangeNorm,
  executeNormalKeysOnLine,
  parseKeyTokens,
  executeAlignRange,
} from './exBufferOps';
import { executeJoinRange, executeShiftRange, executePrintRange } from './exRangeOps';
import { finishEx, tryExecuteWorkspaceExCommand } from './exWorkspaceCommands';
import type { ExCommandRunner } from './exWorkspaceCommands';
import { tryExecuteToolExCommand } from './exListAndToolCommands';
import { syncActivePane } from './splitWindow';
import { triggerWindowAndTabAutocmds } from './autocmdEngine';

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
  userCommandDepth = 0,
  skipWindowAutocmds = false
): VimEditorState {
  const isControlFlow = (cmd: string) => {
    const word = cmd.trim().replace(/^:\s*/, '').match(/^(\w+)/)?.[1] ?? '';
    return /^(if|elseif|elsei|else|el|endif|en|while|wh|endwhile|endw|for|endfor|endfo|try|catch|cat|finally|finall|final|fina|endtry|endt|throw|th|return|retu)$/.test(
      word
    );
  };

  const hasControlFlow = commands.some(isControlFlow);
  const runEx = (s: VimEditorState, c: string) =>
    executeCommandLine(s, c, keyRunner, userCommandDepth, skipWindowAutocmds);

  if (hasControlFlow) {
    return executeScriptBlock(state, commands, runEx);
  }

  let cur = state;
  for (const cmd of commands) {
    const cleaned = cmd.trim();
    if (cleaned.length === 0) continue;
    cur = executeCommandLine(cur, cleaned, keyRunner, userCommandDepth, skipWindowAutocmds);
    if (cur.bell || cur.scriptFinished) {
      break;
    }
  }
  return cur;
}

const EX_MODIFIER_RE =
  /^:?\s*(sil(?:e(?:n(?:t)?)?)?|keepp(?:a(?:t(?:t(?:e(?:r(?:n(?:s)?)?)?)?)?)?)?|noa(?:u(?:t(?:o(?:c(?:m(?:d)?)?)?)?)?)?|verb(?:o(?:s(?:e)?)?)?)(!)?(?:\s+(.*))?$/;

/**
 * 선행 Ex 모디파이어(:silent[!], :keeppatterns, :noautocmd, :verbose)를 벗겨내고 래핑 실행합니다.
 */
function tryExecuteWithModifiers(
  state: VimEditorState,
  trimmed: string,
  runInner: ExCommandRunner
): VimEditorState | null {
  let rest = trimmed;
  let hasModifier = false;
  let silent = false;
  let silentBang = false;
  let keeppatterns = false;
  let noautocmd = false;

  for (;;) {
    const m = rest.match(EX_MODIFIER_RE);
    if (!m) break;
    hasModifier = true;
    const mod = m[1].toLowerCase();
    const bang = m[2] === '!';
    if (mod.startsWith('sil')) {
      silent = true;
      if (bang) silentBang = true;
    } else if (mod.startsWith('keepp')) {
      keeppatterns = true;
    } else if (mod.startsWith('noa')) {
      noautocmd = true;
    }
    rest = (m[3] ?? '').trimStart();
    if (!rest) break;
  }

  if (!hasModifier) return null;
  if (!rest) return finishEx(state);

  const prevNoa = state.noautocmdSuppressed;
  const savedSearch = keeppatterns
    ? {
        lastSearchQuery: state.lastSearchQuery,
        lastSearchDirection: state.lastSearchDirection,
        lastSearchOffset: state.lastSearchOffset,
        hlsearchSuppressed: state.hlsearchSuppressed,
      }
    : null;

  let res = runInner(noautocmd ? { ...state, noautocmdSuppressed: true } : state, rest);

  if (noautocmd) {
    res = { ...res, noautocmdSuppressed: prevNoa };
  }
  if (savedSearch) {
    res = { ...res, ...savedSearch };
  }
  if (silentBang) {
    res = { ...res, bell: undefined, commandMessage: undefined };
  } else if (silent && !res.bell) {
    res = { ...res, commandMessage: undefined };
  }
  return res;
}

/** 출력 리디렉션(:redir), 메시지 이력(:messages), 스크립트 조기 종료(:finish) 처리 */
function tryExecuteMetaExCommand(state: VimEditorState, trimmed: string): VimEditorState | null {
  const redirMatch = trimmed.match(/^:?\s*redi(?:r)?(?:\s+(.*))?$/i);
  if (redirMatch) {
    return handleRedirCommand(state, redirMatch[1] ?? '');
  }

  const mesMatch = trimmed.match(/^:?\s*mes(?:s(?:a(?:g(?:es?)?)?)?)?(?:\s+(.*))?$/);
  if (mesMatch) {
    const sub = (mesMatch[1] ?? '').trim().toLowerCase();
    if (sub === 'clear') {
      return finishEx(state, { messageHistory: [], commandMessage: undefined });
    }
    const hist = state.messageHistory ?? [];
    const text = hist.length > 0 ? hist.join('\n') : msg('메시지 기록이 비어 있습니다');
    let next = finishEx(state, { commandMessage: text });
    if (next.redirSession && hist.length > 0) next = appendRedirText(next, text);
    return next;
  }

  if (/^:?\s*(?:fin|fini|finis|finish)$/i.test(trimmed.trim())) {
    if ((state.scriptSourcingDepth ?? 0) > 0) {
      return finishEx(state, { scriptFinished: true });
    }
    return finishEx(state, {
      bell: true,
      commandMessage: msg('E168: :finish 는 소스 파일 안에서만 사용할 수 있습니다'),
    });
  }

  return null;
}

function withRedir(res: VimEditorState): VimEditorState {
  if (res.redirSession && res.commandMessage && !res.bell) {
    return appendRedirText(res, res.commandMessage);
  }
  return res;
}

/** 대문자 사용자 정의 Ex 명령 호출 (:Name[!] [args], :[range]Name) */
function tryExecuteUserCommandCall(
  state: VimEditorState,
  cmdTrimmed: string,
  hasRange: boolean,
  range: { startLine: number; endLine: number } | null,
  keyRunner: KeyRunner | undefined,
  userCommandDepth: number
): VimEditorState | null {
  const userCmdCall = cmdTrimmed.match(/^([A-Z][A-Za-z0-9]*)(!?)(?:\s+(.*))?$/);
  if (!userCmdCall || !state.userCommands) return null;

  const lookup = lookupUserCommand(state, userCmdCall[1]);
  if (lookup.kind === 'ambiguous') {
    return finishEx(state, {
      commandMessage: msg('E464: 사용자 정의 명령 이름이 모호합니다: {v} ({v2})', {
        v: userCmdCall[1],
        v2: lookup.candidates.join(', '),
      }),
      bell: true,
    });
  }
  if (lookup.kind === 'found') {
    return executeUserCommand(
      state,
      lookup.command,
      {
        bang: userCmdCall[2] === '!',
        args: (userCmdCall[3] ?? '').trim(),
        range: hasRange ? range : null,
      },
      (s, cmd) => executeCommandLine(s, cmd, keyRunner, userCommandDepth + 1),
      userCommandDepth
    );
  }
  return null;
}

/** Range 기반 버퍼 편집·치환·정렬·출력·셸 명령 처리 */
function tryExecuteRangeExCommand(
  state: VimEditorState,
  extracted: ReturnType<typeof extractRangeAndCommand>,
  trimmed: string,
  keyRunner: KeyRunner | undefined,
  runEx: ExCommandRunner
): VimEditorState | null {
  const { range, hasRange, command } = extracted;
  const cmdTrimmed = command.trim();

  // 명령어 없이 범위 또는 주소만 주어진 경우: 라인 이동 (예: ':10', ':$', ':+3', ':-2', ':\'a')
  if (hasRange && cmdTrimmed.length === 0 && range) {
    const targetLine = Math.max(0, Math.min(range.endLine, state.lines.length - 1));
    const nextCursor = clampCursor(state.lines, { line: targetLine, col: state.cursor.col }, 'NORMAL');
    return finishEx(state, {
      cursor: nextCursor,
      commandMessage: msg('{v}번째 줄로 이동했습니다.', { v: targetLine + 1 }),
    });
  }

  const currentLineRange = { startLine: state.cursor.line, endLine: state.cursor.line };
  const fullBufferRange = { startLine: 0, endLine: Math.max(0, state.lines.length - 1) };

  // 가상 셸 실행/필터링/파이프 (:[range]!cmd, :!cmd, :[range]w !cmd)
  if (cmdTrimmed.startsWith('!')) {
    const shellCmd = cmdTrimmed.slice(1);
    return hasRange && range
      ? executeFilterRange(state, range, shellCmd)
      : executeShellCommand(state, shellCmd);
  }
  const writePipeMatch = cmdTrimmed.match(/^w(?:r(?:i(?:te?)?)?)?\s+!(.*)$/);
  if (writePipeMatch) {
    return executeWriteShell(state, range ?? fullBufferRange, writePipeMatch[1]);
  }

  // :nohlsearch / :noh — 다음 검색 전까지 검색 하이라이트 끄기
  if (/^noh(?:l(?:s(?:e(?:a(?:r(?:c(?:h)?)?)?)?)?)?)?$/.test(cmdTrimmed)) {
    return finishEx(state, { commandMessage: undefined, hlsearchSuppressed: true });
  }

  // 치환: :[range]s/old/new/flags
  const sub = parseSubstitutionCommand(command);
  if (sub) {
    return executeSubstitution(
      state,
      range ?? currentLineRange,
      sub.oldText,
      sub.newText,
      sub.flags,
      trimmed,
      { keyRunner, runEx }
    );
  }

  // 직전 치환 반복: :&, :&&, :s
  const repeatSub = cmdTrimmed.match(/^(?:&(&?)|s)([cegiInI]*)$/);
  if (repeatSub && (cmdTrimmed.startsWith('&') || cmdTrimmed === 's')) {
    const last = state.lastSubstitute;
    if (!last) {
      return finishEx(state, {
        commandMessage: msg('E35: 이전에 사용한 치환 명령이 없습니다'),
        bell: true,
      });
    }
    const repeatFlags = (repeatSub[1] === '&' ? last.flags : '') + (repeatSub[2] ?? '');
    return executeSubstitution(
      state,
      range ?? currentLineRange,
      last.pattern,
      last.replacement,
      repeatFlags,
      trimmed,
      { keyRunner, runEx, replacementExpanded: true }
    );
  }

  // 삭제: :[range]d [x] [count], :[range]delete
  const delMatch = cmdTrimmed.match(/^d(?:e(?:l(?:e(?:t(?:e)?)?)?)?)?(?:\s+(.*))?$/);
  const delArgs = delMatch ? parseRegisterCountArgs(delMatch[1] ?? '') : null;
  if (delMatch && delArgs) {
    const targetRange = applyRangeCount(range ?? currentLineRange, delArgs.count, state.lines.length);
    return executeRangeDelete(state, targetRange, trimmed, delArgs.register);
  }

  // 복사: :[range]y [x] [count], :[range]yank
  const yankMatch = cmdTrimmed.match(/^y(?:a(?:n(?:k)?)?)?(?:\s+(.*))?$/);
  const yankArgs = yankMatch ? parseRegisterCountArgs(yankMatch[1] ?? '') : null;
  if (yankMatch && yankArgs) {
    const targetRange = applyRangeCount(range ?? currentLineRange, yankArgs.count, state.lines.length);
    return executeRangeYank(state, targetRange, yankArgs.register);
  }

  // 레지스터 붙여넣기: :[line]pu[t][!] [x]
  const putMatch = cmdTrimmed.match(/^pu(?:t)?(!?)(?:\s+([A-Za-z0-9"_+*/%.:-]))?$/);
  if (putMatch) {
    const afterLine = hasRange
      ? extracted.isLineZero
        ? -1
        : (range?.endLine ?? state.cursor.line)
      : state.cursor.line;
    return executeExPut(state, afterLine, putMatch[1] === '!', putMatch[2]);
  }

  // Normal 모드 명령 실행: :[range]norm[!] {keys}
  const normMatch = command.match(/^(?:norm|normal)(!?)\s+(.*)$/);
  if (normMatch) {
    return executeRangeNorm(
      state,
      range ?? currentLineRange,
      normMatch[2],
      trimmed,
      keyRunner,
      normMatch[1] === '!'
    );
  }

  // 정렬: :[range]sort[!] [flags] [/{pattern}/]
  const sortMatch = cmdTrimmed.match(/^sort(!?)(?:\s+(.*)|([/!#@?,].*))?$/);
  if (sortMatch) {
    const rawArgs = [sortMatch[2], sortMatch[3]].filter(Boolean).join(' ');
    return executeSort(state, range ?? fullBufferRange, sortMatch[1], rawArgs);
  }

  // 파일 및 셸 출력 읽기 삽입: :[range]r[ead] [file | !cmd]
  const readMatch = cmdTrimmed.match(/^r(?:e(?:ad?)?)?(?:\s+(.*)|(!.*))?$/);
  if (readMatch) {
    const insertAfterLine = hasRange
      ? extracted.isLineZero
        ? -1
        : (range?.endLine ?? state.cursor.line)
      : state.cursor.line;
    return executeRead(state, insertAfterLine, readMatch[1] ?? readMatch[2]);
  }

  // 탭/공백 일괄 변환: :[range]ret[ab][!] [N]
  const retabMatch = cmdTrimmed.match(/^ret(?:a|ab)?(!?)(?:\s+(\S+))?$/);
  if (retabMatch) {
    const targetRange = range ?? fullBufferRange;
    const rawN = retabMatch[2];
    if (rawN !== undefined && !/^\d+$/.test(rawN)) {
      return finishEx(state, {
        commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token: rawN }),
        bell: true,
      });
    }
    return finishEx(
      retabRange(
        state,
        targetRange.startLine,
        targetRange.endLine,
        retabMatch[1] === '!',
        rawN !== undefined ? parseInt(rawN, 10) : undefined
      )
    );
  }

  // 이동 / 복제: :[range]m[ove] {address}, :[range]t / :co[py] {address}
  const moveMatch = cmdTrimmed.match(/^(?:m|mo|mov|move)(?:(?=\s|[\d.$+\-'/?])|$)\s*(.*)$/);
  if (moveMatch) {
    return executeMove(state, range ?? currentLineRange, moveMatch[1]);
  }
  const copyMatch = cmdTrimmed.match(/^(?:t|co|cop|copy)(?:(?=\s|[\d.$+\-'/?])|$)\s*(.*)$/);
  if (copyMatch) {
    return executeCopy(state, range ?? currentLineRange, copyMatch[1]);
  }

  // 텍스트 정렬: :[range]ce[nter] / :ri[ght] / :le[ft]
  const centerMatch = cmdTrimmed.match(/^ce(?:n(?:t(?:er?)?)?)?(?:\s+(.*))?$/);
  if (centerMatch) {
    return executeAlignRange(state, range ?? currentLineRange, 'center', centerMatch[1]);
  }
  const rightMatch = cmdTrimmed.match(/^ri(?:g(?:ht?)?)?(?:\s+(.*))?$/);
  if (rightMatch) {
    return executeAlignRange(state, range ?? currentLineRange, 'right', rightMatch[1]);
  }
  const leftMatch = cmdTrimmed.match(/^le(?:f(?:t)?)?(?:\s+(.*))?$/);
  if (leftMatch) {
    return executeAlignRange(state, range ?? currentLineRange, 'left', leftMatch[1]);
  }

  // 줄 병합: :[range]j[oin][!] [count]
  const joinMatch = cmdTrimmed.match(/^j(?:o(?:i(?:n)?)?)?(!)?(?:\s+(\d+))?$/);
  if (joinMatch) {
    const count = joinMatch[2] !== undefined ? parseInt(joinMatch[2], 10) : undefined;
    return executeJoinRange(state, range, hasRange, joinMatch[1] === '!', count);
  }

  // 범위 들여쓰기/내어쓰기: :[range]>[>] [count], :[range]<[<] [count]
  const shiftMatch = cmdTrimmed.match(/^(>+|<+)(?:\s+(\d+))?$/);
  if (shiftMatch) {
    const dir = shiftMatch[1][0] === '>' ? 'in' : 'out';
    const lineCount = shiftMatch[2] !== undefined ? parseInt(shiftMatch[2], 10) : undefined;
    return executeShiftRange(state, range, dir, shiftMatch[1].length, lineCount);
  }

  // 줄 출력: :[range]p[rint], :[range]nu[mber], :[range]#, :[range]l[ist]
  const printMatch = cmdTrimmed.match(/^p(?:r(?:i(?:n(?:t)?)?)?)?(?:\s+(\d+))?$/);
  if (printMatch) {
    const count = printMatch[1] !== undefined ? parseInt(printMatch[1], 10) : undefined;
    return withRedir(executePrintRange(state, range, 'print', count));
  }
  const numberMatch = cmdTrimmed.match(/^(?:nu(?:m(?:b(?:e(?:r)?)?)?)?|#)(?:\s+(\d+))?$/);
  if (numberMatch) {
    const count = numberMatch[1] !== undefined ? parseInt(numberMatch[1], 10) : undefined;
    return withRedir(executePrintRange(state, range, 'number', count));
  }
  const listMatch = cmdTrimmed.match(/^l(?:i(?:s(?:t)?)?)?(?:\s+(\d+))?$/);
  if (listMatch) {
    const count = listMatch[1] !== undefined ? parseInt(listMatch[1], 10) : undefined;
    return withRedir(executePrintRange(state, range, 'list', count));
  }

  return null;
}

/**
 * COMMAND 모드(:)에서 입력된 명령어를 파싱하고 실행합니다.
 */
export function executeCommandLine(
  state: VimEditorState,
  commandStr: string,
  keyRunner?: KeyRunner,
  userCommandDepth = 0,
  skipWindowAutocmds = false
): VimEditorState {
  const prevState = state;
  state = state.bell ? { ...state, bell: undefined } : state;
  const trimmed = commandStr.trimStart();

  // 0. :function 본문 입력 중이면 입력한 줄을 본문에 추가 (endfunction 에서 확정)
  if (state.functionDraft) {
    return appendFunctionDraftLine(state, commandStr);
  }

  // 1. 빈 명령인 경우 NORMAL 모드로 복귀
  if (trimmed.trim().length === 0) {
    return finishEx(state, { commandMessage: undefined });
  }

  // 1-0. 다중 파이프(|) 명령어 분할 및 순차/스크립트 실행 (:help :bar)
  const pipedCommands = splitPipedCommands(trimmed);
  if (pipedCommands.length > 1) {
    return executePipedCommands(state, pipedCommands, keyRunner, userCommandDepth, skipWindowAutocmds);
  }

  const runEx: ExCommandRunner = (s, cmd) =>
    executeCommandLine(s, cmd, keyRunner, userCommandDepth, skipWindowAutocmds);

  const startOpts = getOptions(state);
  setActiveIskeyword(startOpts.iskeyword);
  setActiveMatchpairs(startOpts.matchpairs);
  setActiveCursorContext(state.mode, startOpts.virtualedit);

  const finalize = (res: VimEditorState): VimEditorState => {
    if (
      startOpts.modifiable === false &&
      res.lines !== state.lines &&
      (res.currentBufferId ?? 1) === (state.currentBufferId ?? 1) &&
      (res.activePaneIndex ?? 0) === (state.activePaneIndex ?? 0) &&
      (res.currentTabId ?? 1) === (state.currentTabId ?? 1) &&
      !res.netrw?.isOpen &&
      !res.helpSession?.isOpen
    ) {
      return finishEx(state, {
        bell: true,
        commandMessage: msg('E21: \'modifiable\' 옵션이 꺼져 있어 변경할 수 없습니다'),
      });
    }
    const endOpts = getOptions(res);
    setActiveIskeyword(endOpts.iskeyword);
    setActiveMatchpairs(endOpts.matchpairs);
    setActiveCursorContext(res.mode, endOpts.virtualedit);
    const synced = syncActivePane(res);
    return skipWindowAutocmds
      ? synced
      : triggerWindowAndTabAutocmds(prevState, synced, runEx);
  };

  // 1-0a. Ex 명령 모디파이어 (:silent[!], :keeppatterns, :noautocmd, :verbose)
  const modRes = tryExecuteWithModifiers(state, trimmed, runEx);
  if (modRes) return modRes;

  // 1-0b. 출력 리디렉션(:redir), 메시지 이력(:messages), 스크립트 조기 종료(:finish)
  const metaRes = tryExecuteMetaExCommand(state, trimmed);
  if (metaRes) return finalize(metaRes);

  // 1-1. Vim script: :function, :endfunction, :delfunction, :let, :unlet, :echo, :execute, :[range]call
  const scriptRes = executeScriptCommandLine(state, trimmed, runEx);
  if (scriptRes) return finalize(scriptRes);

  const callExtracted = extractRangeAndCommand(trimmed, state);
  const callMatch = !callExtracted.error && callExtracted.command.trim().match(/^cal(?:l)?\s+(.+)$/);
  if (callMatch) {
    return finalize(
      executeCallCommand(
        state,
        callMatch[1],
        callExtracted.hasRange ? callExtracted.range : null,
        runEx
      )
    );
  }

  // 2. 글로벌 명령: :g/pattern/cmd, :v/pattern/cmd, :g!/pattern/cmd
  const gMatch = trimmed.match(/^:?\s*(g|global|v|vglobal)(!?)\s*\/([^\/]+)\/(.*)$/);
  if (gMatch) {
    return finalize(withRedir(executeGlobalCommand(state, gMatch, commandStr, keyRunner)));
  }

  // 3. 작업공간(창/버퍼/탭/Netrw/저장·종료) 및 도구(퀵픽스/옵션/마크/태그/매핑) 명령어
  const cleanCmdRaw = trimmed.replace(/^:/, '').trim();
  const cleanCmd = cleanCmdRaw.toLowerCase();

  const wsRes = tryExecuteWorkspaceExCommand(state, cleanCmdRaw, cleanCmd, trimmed, runEx);
  if (wsRes) return finalize(withRedir(wsRes));

  const toolRes = tryExecuteToolExCommand(state, cleanCmdRaw, cleanCmd, trimmed, runEx);
  if (toolRes) return finalize(withRedir(toolRes));

  // 4. 공통 Range 파서 및 사용자 명령 / 버퍼 범위 편집 명령 실행
  const extracted = extractRangeAndCommand(trimmed, state);
  if (extracted.error) {
    return finishEx(state, { commandMessage: extracted.error, bell: true });
  }

  const userCmdRes = tryExecuteUserCommandCall(
    state,
    extracted.command.trim(),
    extracted.hasRange,
    extracted.range,
    keyRunner,
    userCommandDepth
  );
  if (userCmdRes) return finalize(userCmdRes);

  const rangeRes = tryExecuteRangeExCommand(state, extracted, trimmed, keyRunner, runEx);
  if (rangeRes) return finalize(rangeRes);

  // 5. 알 수 없는 명령어는 에러 메시지와 함께 NORMAL 모드로 복귀
  return finishEx(state, {
    commandMessage: msg('E492: 지원하지 않는 에디터 명령어입니다: {trimmed}', { trimmed }),
    bell: true,
  });
}
