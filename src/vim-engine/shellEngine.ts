import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { moveToFirstNonBlank } from './motions';
import { pushUndoSnapshot } from './operators';
import { buildVfsMap, getDirectoryListing } from './vfs';
import { msg } from './messages';
import {
  readFilesOrStdin,
  runEcho,
  runPrintf,
  runSort,
  runUniq,
  runGrep,
  runCut,
  runTr,
} from './shellBuiltins';
import {
  runSed,
  runAwk,
  runHeadOrTail,
  runWc,
  runNl,
  runColumn,
  runJq,
} from './shellStreamFilters';

export interface ShellExecResult {
  ok: boolean;
  stdoutLines: string[];
  stderr?: string;
  exitCode: number;
  expandedCommand: string;
}

interface ParsedStage {
  args: string[];
  redirectFile?: string;
  redirectAppend?: boolean;
}

/**
 * 셸 명령어 내 %, #, ! 특수 문자를 Vim 규칙에 따라 확장합니다.
 * \%, \#, \! 는 리터럴 문자로 유지됩니다.
 */
export function expandShellCommand(
  state: VimEditorState,
  rawCmd: string
): { ok: true; command: string } | { ok: false; error: string } {
  let out = '';
  let i = 0;

  while (i < rawCmd.length) {
    const ch = rawCmd[i];
    if (ch === '\\' && i + 1 < rawCmd.length) {
      const next = rawCmd[i + 1];
      if (next === '%' || next === '#' || next === '!') {
        out += next;
        i += 2;
        continue;
      }
      out += ch + next;
      i += 2;
      continue;
    }

    if (ch === '%') {
      const filename = state.primaryFilename;
      if (!filename) {
        return {
          ok: false,
          error: msg('E499: \'%\' 또는 \'#\'에 대한 파일 이름이 비어 있습니다'),
        };
      }
      out += filename;
      i++;
      continue;
    }

    if (ch === '#') {
      const altBuf = state.alternateBufferId
        ? state.buffers?.find((b) => b.id === state.alternateBufferId)
        : undefined;
      const altName = altBuf?.name ?? state.secondaryFilename;
      if (!altName) {
        return {
          ok: false,
          error: msg('E194: 대체 파일 이름이 없습니다 (#)'),
        };
      }
      out += altName;
      i++;
      continue;
    }

    if (ch === '!') {
      if (!state.lastShellCommand) {
        return {
          ok: false,
          error: msg('E34: 이전 명령이 없습니다'),
        };
      }
      out += state.lastShellCommand;
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return { ok: true, command: out };
}

/**
 * 따옴표('...', "...")와 역슬래시를 존중하여 셸 파이프라인(|) 단계를 분리합니다.
 */
export function splitShellPipeline(command: string): string[] {
  const stages: string[] = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === '\\' && !inSingle && i + 1 < command.length) {
      cur += ch + command[i + 1];
      i++;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      cur += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      cur += ch;
      continue;
    }
    if (ch === '|' && !inSingle && !inDouble) {
      stages.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }

  if (cur.trim().length > 0 || stages.length > 0) {
    stages.push(cur.trim());
  }
  return stages.filter((s) => s.length > 0);
}

/**
 * 단일 셸 단계 문자열을 인자 배열과 리다이렉션 정보로 토큰화합니다.
 */
function tokenizeShellStage(stage: string): ParsedStage {
  const tokens: string[] = [];
  let cur = '';
  let hasToken = false;
  let inSingle = false;
  let inDouble = false;

  const flush = () => {
    if (hasToken) {
      tokens.push(cur);
      cur = '';
      hasToken = false;
    }
  };

  for (let i = 0; i < stage.length; i++) {
    const ch = stage[i];
    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        cur += ch;
      }
      hasToken = true;
      continue;
    }
    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      } else if (ch === '\\' && i + 1 < stage.length && /["\\$`]/.test(stage[i + 1])) {
        cur += stage[i + 1];
        i++;
      } else {
        cur += ch;
      }
      hasToken = true;
      continue;
    }

    if (ch === '\\' && i + 1 < stage.length) {
      cur += stage[i + 1];
      hasToken = true;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      hasToken = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      hasToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (ch === '>' && !hasToken) {
      flush();
      if (stage[i + 1] === '>') {
        tokens.push('>>');
        i++;
      } else {
        tokens.push('>');
      }
      continue;
    }
    cur += ch;
    hasToken = true;
  }
  flush();

  const args: string[] = [];
  let redirectFile: string | undefined;
  let redirectAppend = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if ((tok === '>' || tok === '>>') && i + 1 < tokens.length) {
      redirectAppend = tok === '>>';
      redirectFile = tokens[i + 1];
      i++;
      continue;
    }
    args.push(tok);
  }

  return { args, redirectFile, redirectAppend };
}

function executeSingleStage(
  stage: ParsedStage,
  stdinLines: string[],
  state: VimEditorState
): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  const [cmd, ...args] = stage.args;
  if (!cmd) return { stdoutLines: stdinLines, exitCode: 0 };

  switch (cmd) {
    case 'echo':
      return runEcho(args);
    case 'printf':
      return runPrintf(args);
    case 'true':
      return { stdoutLines: [], exitCode: 0 };
    case 'false':
      return { stdoutLines: [], exitCode: 1 };
    case 'pwd':
      return { stdoutLines: ['/workspace'], exitCode: 0 };
    case 'whoami':
      return { stdoutLines: ['vimuser'], exitCode: 0 };
    case 'uname':
      return { stdoutLines: [args.includes('-a') ? 'VimOS 1.0 virtual x86_64' : 'VimOS'], exitCode: 0 };
    case 'date':
      return { stdoutLines: ['2026-01-01 00:00:00 UTC'], exitCode: 0 };
    case 'basename': {
      const p = args[0] ?? '';
      return { stdoutLines: [p.split('/').filter(Boolean).pop() ?? p], exitCode: 0 };
    }
    case 'dirname': {
      const p = args[0] ?? '';
      const idx = p.lastIndexOf('/');
      return { stdoutLines: [idx <= 0 ? (idx === 0 ? '/' : '.') : p.slice(0, idx)], exitCode: 0 };
    }
    case 'ls': {
      const target = (args.filter((a) => !a.startsWith('-'))[0] ?? '').replace(/^\/+|\/+$/g, '');
      const vfs = buildVfsMap(state);
      const listing = getDirectoryListing(vfs, target);
      const entries = [...listing.dirs.map((d) => `${d}/`), ...listing.files];
      return { stdoutLines: entries, exitCode: 0 };
    }
    case 'cat': {
      let showNumbers = false;
      const files: string[] = [];
      for (const a of args) {
        if (a === '-n') showNumbers = true;
        else files.push(a);
      }
      const input = readFilesOrStdin(state, files, stdinLines);
      if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };
      const lines = showNumbers
        ? input.lines.map((l, idx) => `${String(idx + 1).padStart(6, ' ')}\t${l}`)
        : [...input.lines];
      return { stdoutLines: lines, exitCode: 0 };
    }
    case 'sort':
      return runSort(args, stdinLines, state);
    case 'uniq':
      return runUniq(args, stdinLines, state);
    case 'grep':
    case 'egrep':
    case 'fgrep':
      return runGrep(
        args,
        stdinLines,
        state,
        cmd === 'egrep' ? 'extended' : cmd === 'fgrep' ? 'fixed' : 'basic'
      );
    case 'cut':
      return runCut(args, stdinLines, state);
    case 'tr':
      return runTr(args, stdinLines);
    case 'sed':
      return runSed(args, stdinLines, state);
    case 'awk':
      return runAwk(args, stdinLines, state);
    case 'head':
      return runHeadOrTail('head', args, stdinLines, state);
    case 'tail':
      return runHeadOrTail('tail', args, stdinLines, state);
    case 'wc':
      return runWc(args, stdinLines, state);
    case 'nl':
      return runNl(args, stdinLines, state);
    case 'tac': {
      const input = readFilesOrStdin(state, args, stdinLines);
      if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };
      return { stdoutLines: [...input.lines].reverse(), exitCode: 0 };
    }
    case 'rev': {
      const input = readFilesOrStdin(state, args, stdinLines);
      if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };
      return { stdoutLines: input.lines.map((l) => [...l].reverse().join('')), exitCode: 0 };
    }
    case 'column':
      return runColumn(args, stdinLines, state);
    case 'jq':
      return runJq(args, stdinLines);
    default:
      return {
        stdoutLines: [],
        exitCode: 127,
        stderr: msg('{cmd}: 명령어를 찾을 수 없습니다', { cmd }),
      };
  }
}

/**
 * 가상 POSIX 셸 파이프라인을 실행하고 표준 출력 줄 배열을 반환합니다.
 */
export function runShellPipeline(
  state: VimEditorState,
  rawCmd: string,
  stdinLines: string[] = []
): ShellExecResult {
  const trimmedCmd = rawCmd.trim();
  if (!trimmedCmd) {
    return {
      ok: false,
      stdoutLines: [],
      exitCode: 1,
      stderr: msg('E471: 인수가 필요합니다'),
      expandedCommand: '',
    };
  }

  const expanded = expandShellCommand(state, trimmedCmd);
  if (!expanded.ok) {
    return {
      ok: false,
      stdoutLines: [],
      exitCode: 1,
      stderr: expanded.error,
      expandedCommand: trimmedCmd,
    };
  }

  const stageStrings = splitShellPipeline(expanded.command);
  if (stageStrings.length === 0) {
    return {
      ok: false,
      stdoutLines: [],
      exitCode: 1,
      stderr: msg('E471: 인수가 필요합니다'),
      expandedCommand: expanded.command,
    };
  }

  let currentLines = [...stdinLines];
  let lastExit = 0;

  for (const sStr of stageStrings) {
    const parsed = tokenizeShellStage(sStr);
    if (parsed.args.length === 0) continue;
    const res = executeSingleStage(parsed, currentLines, state);
    if (res.exitCode >= 2) {
      return {
        ok: false,
        stdoutLines: [],
        exitCode: res.exitCode,
        stderr: res.stderr,
        expandedCommand: expanded.command,
      };
    }
    currentLines = res.stdoutLines;
    lastExit = res.exitCode;
  }

  return {
    ok: true,
    stdoutLines: currentLines,
    exitCode: lastExit,
    expandedCommand: expanded.command,
  };
}

function exitCmdMode(state: VimEditorState, message?: string, bell = false): VimEditorState {
  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    filterOperatorKeys: undefined,
    commandMessage: message,
    bell: bell || undefined,
  };
}

/**
 * `:!{cmd}` — 버퍼 수정 없이 가상 셸 명령을 실행하고 결과를 상태바에 표시합니다.
 */
export function executeShellCommand(state: VimEditorState, rawCmd: string): VimEditorState {
  const res = runShellPipeline(state, rawCmd, []);
  if (!res.ok) {
    return exitCmdMode(state, res.stderr || msg('셸 실행 실패 (exit {code})', { code: res.exitCode }), true);
  }
  const outputPreview = res.stdoutLines.length > 0 ? res.stdoutLines.join(' | ') : msg('(출력 없음, exit {code})', { code: res.exitCode });
  return exitCmdMode(
    { ...state, lastShellCommand: res.expandedCommand },
    outputPreview,
    res.exitCode !== 0
  );
}

/**
 * `:[range]!{cmd}` — 지정 줄 범위를 stdin 으로 파이프 필터링하여 stdout 으로 교체합니다.
 */
export function executeFilterRange(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  rawCmd: string
): VimEditorState {
  const start = Math.max(0, Math.min(range.startLine, state.lines.length - 1));
  const end = Math.max(start, Math.min(range.endLine, state.lines.length - 1));
  const inputSlice = state.lines.slice(start, end + 1);

  const res = runShellPipeline(state, rawCmd, inputSlice);
  if (!res.ok) {
    return exitCmdMode(state, res.stderr || msg('필터 실행 오류 (exit {code})', { code: res.exitCode }), true);
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const replacedSlice = res.stdoutLines;
  let newLines = [
    ...state.lines.slice(0, start),
    ...replacedSlice,
    ...state.lines.slice(end + 1),
  ];
  if (newLines.length === 0) {
    newLines = [''];
  }

  const targetLine = Math.min(start, newLines.length - 1);
  const nextCursor = moveToFirstNonBlank(newLines, { line: targetLine, col: 0 });
  const filteredCount = end - start + 1;

  return exitCmdMode(
    {
      ...stateWithUndo,
      lines: newLines,
      cursor: clampCursor(newLines, nextCursor, 'NORMAL'),
      lastShellCommand: res.expandedCommand,
    },
    msg('{count}개 줄 필터링 완료 (!{cmd})', { count: filteredCount, cmd: res.expandedCommand }),
    false
  );
}

/**
 * `:[range]r[ead] !{cmd}` — 가상 셸 명령의 표준 출력을 지정 줄 아래에 삽입합니다.
 */
export function executeReadShell(
  state: VimEditorState,
  insertAfterLine: number,
  rawCmd: string
): VimEditorState {
  const res = runShellPipeline(state, rawCmd, []);
  if (!res.ok) {
    return exitCmdMode(state, res.stderr || msg('E484: 셸 명령을 실행할 수 없습니다: {cmd}', { cmd: rawCmd }), true);
  }

  const insertIndex = Math.max(0, Math.min(state.lines.length, insertAfterLine + 1));
  if (res.stdoutLines.length === 0) {
    return exitCmdMode(
      { ...state, lastShellCommand: res.expandedCommand },
      msg('!{cmd} 출력 없음 (0줄 삽입)', { cmd: res.expandedCommand }),
      false
    );
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const newLines = [
    ...state.lines.slice(0, insertIndex),
    ...res.stdoutLines,
    ...state.lines.slice(insertIndex),
  ];
  const targetLine = Math.min(insertIndex, newLines.length - 1);
  const nextCursor = moveToFirstNonBlank(newLines, { line: targetLine, col: 0 });

  return exitCmdMode(
    {
      ...stateWithUndo,
      lines: newLines,
      cursor: clampCursor(newLines, nextCursor, 'NORMAL'),
      lastShellCommand: res.expandedCommand,
    },
    msg('"!{cmd}" {count}줄 읽음', { cmd: res.expandedCommand, count: res.stdoutLines.length }),
    false
  );
}

/**
 * `:[range]w[rite] !{cmd}` — 버퍼(또는 지정 범위) 내용을 stdin 으로 셸 명령에 전달합니다.
 */
export function executeWriteShell(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  rawCmd: string
): VimEditorState {
  const start = Math.max(0, Math.min(range.startLine, state.lines.length - 1));
  const end = Math.max(start, Math.min(range.endLine, state.lines.length - 1));
  const inputSlice = state.lines.slice(start, end + 1);

  const res = runShellPipeline(state, rawCmd, inputSlice);
  if (!res.ok) {
    return exitCmdMode(state, res.stderr || msg('셸 파이프 실패: {cmd}', { cmd: rawCmd }), true);
  }

  const outputPreview = res.stdoutLines.length > 0 ? res.stdoutLines.join(' | ') : msg('(출력 없음, exit {code})', { code: res.exitCode });
  return exitCmdMode(
    { ...state, lastShellCommand: res.expandedCommand },
    outputPreview,
    res.exitCode !== 0
  );
}
