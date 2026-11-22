import { TerminalSessionState, VimEditorState } from './types';
import { clampCursor } from './cursor';
import { splitWindow, closeSplitWindow, switchPaneFocus } from './splitWindow';
import { ensureBuffers } from './bufferEngine';
import { getEffectiveCwd } from './vfs';
import { runShellPipeline } from './shellEngine';
import { runVirtualTests, formatVirtualTestOutput } from './testRunnerEngine';
import { msg } from './messages';

const TERM_FILENAME = 'term://shell';

function formatPrompt(cwd: string): string {
  const shortCwd = cwd === '/workspace' || !cwd ? '~' : cwd.replace(/^\/workspace\/?/, '~/');
  return `${shortCwd} $ `;
}

function resolveCdTarget(currentCwd: string, arg: string): string {
  const trimmed = arg.trim();
  if (!trimmed || trimmed === '~') return '/workspace';
  if (trimmed.startsWith('/')) return trimmed.replace(/\/+$/, '') || '/';
  const parts = currentCwd.split('/').filter(Boolean);
  for (const seg of trimmed.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (parts.length > 0) parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return '/' + parts.join('/');
}

function executeTerminalLine(
  state: VimEditorState,
  session: TerminalSessionState,
  rawInput: string
): VimEditorState {
  const cmd = rawInput.trim();
  const baseLines = [...state.lines];
  // 현재 프롬프트 줄을 확정 텍스트로 고정
  baseLines[session.promptLine] = `${session.prompt}${rawInput}`;

  const nextHistory = cmd
    ? [...session.history.filter((h) => h !== cmd), cmd]
    : [...session.history];

  if (!cmd) {
    const nextLines = [...baseLines, session.prompt];
    const promptLine = nextLines.length - 1;
    return {
      ...state,
      lines: nextLines,
      cursor: { line: promptLine, col: session.prompt.length },
      mode: 'TERMINAL',
      terminalSession: {
        ...session,
        inputBuffer: '',
        history: nextHistory,
        historyIndex: nextHistory.length,
        promptLine,
        ctrlBackslashPending: false,
      },
    };
  }

  if (cmd === 'exit' || cmd === 'quit') {
    return closeTerminalBuffer(state);
  }

  if (cmd === 'clear') {
    const nextLines = [session.prompt];
    return {
      ...state,
      lines: nextLines,
      cursor: { line: 0, col: session.prompt.length },
      mode: 'TERMINAL',
      terminalSession: {
        ...session,
        inputBuffer: '',
        history: nextHistory,
        historyIndex: nextHistory.length,
        promptLine: 0,
        ctrlBackslashPending: false,
      },
    };
  }

  if (cmd === 'help') {
    const helpLines = [
      'Built-in shell: ls, cat, grep, echo, printf, wc, sort, uniq, head, tail, cut, tr, sed, awk, jq, pwd, cd, npm test, clear, exit',
      'Neovim tip: Press Ctrl-\\ Ctrl-n to enter NORMAL mode (yank/search output), press i to resume TERMINAL.',
    ];
    const nextLines = [...baseLines, ...helpLines, session.prompt];
    const promptLine = nextLines.length - 1;
    return {
      ...state,
      lines: nextLines,
      cursor: { line: promptLine, col: session.prompt.length },
      mode: 'TERMINAL',
      terminalSession: {
        ...session,
        inputBuffer: '',
        history: nextHistory,
        historyIndex: nextHistory.length,
        promptLine,
        ctrlBackslashPending: false,
      },
    };
  }

  // 가상 테스트 러너 실행: npm test / npm run test / vitest / testrun
  if (/^(?:npm\s+(?:run\s+)?test|vitest(?:\s+run)?|testrun)$/i.test(cmd)) {
    const tested = runVirtualTests(state);
    const reportLines = tested.lastTestRun
      ? formatVirtualTestOutput(tested.lastTestRun)
      : [tested.commandMessage || '[TestRun] No virtual tests configured.'];
    const nextLines = [...baseLines, ...reportLines, session.prompt];
    const promptLine = nextLines.length - 1;
    return {
      ...tested,
      lines: nextLines,
      cursor: { line: promptLine, col: session.prompt.length },
      mode: 'TERMINAL',
      lastShellCommand: cmd,
      terminalSession: {
        ...session,
        inputBuffer: '',
        history: nextHistory,
        historyIndex: nextHistory.length,
        promptLine,
        ctrlBackslashPending: false,
      },
    };
  }

  const cdMatch = cmd.match(/^cd(?:\s+(.*))?$/);
  if (cdMatch) {
    const nextCwd = resolveCdTarget(session.cwd, cdMatch[1] ?? '');
    const nextPrompt = formatPrompt(nextCwd);
    const nextLines = [...baseLines, nextPrompt];
    const promptLine = nextLines.length - 1;
    return {
      ...state,
      lines: nextLines,
      cursor: { line: promptLine, col: nextPrompt.length },
      mode: 'TERMINAL',
      terminalSession: {
        ...session,
        cwd: nextCwd,
        prompt: nextPrompt,
        inputBuffer: '',
        history: nextHistory,
        historyIndex: nextHistory.length,
        promptLine,
        ctrlBackslashPending: false,
      },
    };
  }

  const res = runShellPipeline({ ...state, cwd: session.cwd }, cmd, []);
  const outputLines = res.ok
    ? res.stdoutLines
    : [res.stderr || msg('셸 실행 실패 (exit {code})', { code: res.exitCode })];

  const nextLines = [...baseLines, ...outputLines, session.prompt];
  const promptLine = nextLines.length - 1;
  return {
    ...state,
    lines: nextLines,
    cursor: { line: promptLine, col: session.prompt.length },
    mode: 'TERMINAL',
    lastShellCommand: res.expandedCommand || cmd,
    terminalSession: {
      ...session,
      inputBuffer: '',
      history: nextHistory,
      historyIndex: nextHistory.length,
      promptLine,
      ctrlBackslashPending: false,
    },
  };
}

/**
 * `:terminal [cmd]` / `:term [cmd]` / `:ToggleTerm [cmd]` — 내장 가상 POSIX 터미널 버퍼를 엽니다.
 */
export function openTerminalBuffer(
  state: VimEditorState,
  options: { command?: string; split?: boolean } = {}
): VimEditorState {
  const { command, split = false } = options;
  const cwd = getEffectiveCwd(state);
  const prompt = formatPrompt(cwd);
  const banner = '[Neovim Terminal] Type shell commands (ls, cat, grep, echo...) · Ctrl-\\ Ctrl-n → NORMAL · exit to close';
  const initialTermLines = [banner, prompt];

  let nextState: VimEditorState;
  let session: TerminalSessionState;

  if (split) {
    const splitRes = splitWindow(
      { ...state, mode: 'NORMAL', commandBuffer: undefined, commandType: undefined },
      'horizontal',
      initialTermLines,
      TERM_FILENAME,
      'botright'
    );
    const termPaneIdx = splitRes.splitPanes
      ? splitRes.splitPanes.findIndex((p) => p.filename === TERM_FILENAME)
      : -1;
    const focusedTerm =
      termPaneIdx >= 0 ? switchPaneFocus(splitRes, termPaneIdx) : splitRes;
    session = {
      isOpen: true,
      cwd,
      prompt,
      inputBuffer: '',
      history: [],
      historyIndex: 0,
      promptLine: initialTermLines.length - 1,
      isSplit: true,
      ctrlBackslashPending: false,
    };
    nextState = {
      ...focusedTerm,
      lines: [...initialTermLines],
      primaryFilename: TERM_FILENAME,
      mode: 'TERMINAL',
      cursor: { line: session.promptLine, col: prompt.length },
      terminalSession: session,
      pendingKeys: undefined,
      commandMessage: msg('[Terminal] 내장 터미널이 열렸습니다 (Ctrl-\\ Ctrl-n 으로 NORMAL 복귀)'),
    };
  } else {
    const withBuf = ensureBuffers(state);
    session = {
      isOpen: true,
      cwd,
      prompt,
      inputBuffer: '',
      history: [],
      historyIndex: 0,
      promptLine: initialTermLines.length - 1,
      isSplit: false,
      returnBufferId: withBuf.currentBufferId,
      returnFilename: state.primaryFilename,
      returnLines: [...state.lines],
      returnCursor: { ...state.cursor },
      ctrlBackslashPending: false,
    };
    nextState = {
      ...withBuf,
      lines: initialTermLines,
      cursor: { line: session.promptLine, col: prompt.length },
      mode: 'TERMINAL',
      primaryFilename: TERM_FILENAME,
      terminalSession: session,
      undoStack: [],
      redoStack: [],
      pendingKeys: undefined,
      commandMessage: msg('[Terminal] 내장 터미널이 열렸습니다 (Ctrl-\\ Ctrl-n 으로 NORMAL 복귀)'),
    };
  }

  if (command && command.trim().length > 0) {
    return executeTerminalLine(nextState, session, command.trim());
  }
  return nextState;
}

/**
 * `:ToggleTerm [cmd]` — 하단 분할 터미널을 열거나 닫습니다.
 */
export function toggleTerminalBuffer(state: VimEditorState, command?: string): VimEditorState {
  if (state.terminalSession?.isOpen) {
    return closeTerminalBuffer(state);
  }
  return openTerminalBuffer(state, { command, split: true });
}

/**
 * 열려 있는 터미널 버퍼를 닫고 이전 버퍼 또는 코드 분할 창으로 복귀합니다.
 */
export function closeTerminalBuffer(state: VimEditorState): VimEditorState {
  const session = state.terminalSession;
  if (!session?.isOpen) {
    return { ...state, mode: 'NORMAL', terminalSession: null };
  }

  if (session.isSplit && state.splitPanes && state.splitPanes.length > 1) {
    const curIdx = state.activePaneIndex ?? 0;
    const termIdx = state.splitPanes.findIndex((p) => p.filename === TERM_FILENAME);
    const readyToClose =
      termIdx >= 0 && termIdx !== curIdx
        ? switchPaneFocus({ ...state, mode: 'NORMAL' }, termIdx)
        : { ...state, mode: 'NORMAL' as const };
    const closed = closeSplitWindow({ ...readyToClose, mode: 'NORMAL', terminalSession: null });
    return {
      ...closed,
      mode: 'NORMAL',
      terminalSession: null,
      pendingKeys: undefined,
      commandMessage: msg('[Terminal] 터미널을 닫았습니다'),
    };
  }

  const lines = session.returnLines && session.returnLines.length > 0 ? [...session.returnLines] : [''];
  const cursor = session.returnCursor
    ? clampCursor(lines, session.returnCursor, 'NORMAL')
    : { line: 0, col: 0 };

  return {
    ...state,
    lines,
    cursor,
    mode: 'NORMAL',
    primaryFilename: session.returnFilename ?? state.primaryFilename,
    currentBufferId: session.returnBufferId ?? state.currentBufferId,
    terminalSession: null,
    pendingKeys: undefined,
    commandMessage: msg('[Terminal] 터미널을 닫았습니다'),
  };
}

/**
 * 터미널 버퍼가 NORMAL 모드일 때 `i` / `a` / `A` 를 누르면 다시 TERMINAL 모드로 진입합니다.
 */
export function enterTerminalInsertMode(state: VimEditorState): VimEditorState | null {
  if (!state.terminalSession?.isOpen || state.primaryFilename !== TERM_FILENAME) {
    return null;
  }
  const session = state.terminalSession;
  const promptLine = Math.min(session.promptLine, state.lines.length - 1);
  const lineText = `${session.prompt}${session.inputBuffer}`;
  const nextLines = [...state.lines];
  nextLines[promptLine] = lineText;
  return {
    ...state,
    lines: nextLines,
    mode: 'TERMINAL',
    cursor: { line: promptLine, col: lineText.length },
    pendingKeys: undefined,
    terminalSession: { ...session, promptLine, ctrlBackslashPending: false },
  };
}

function updateInputBuffer(
  state: VimEditorState,
  session: TerminalSessionState,
  nextInput: string,
  extra?: Partial<TerminalSessionState>
): VimEditorState {
  const promptLine = Math.min(session.promptLine, state.lines.length - 1);
  const lineText = `${session.prompt}${nextInput}`;
  const nextLines = [...state.lines];
  nextLines[promptLine] = lineText;
  return {
    ...state,
    lines: nextLines,
    cursor: { line: promptLine, col: lineText.length },
    terminalSession: {
      ...session,
      promptLine,
      inputBuffer: nextInput,
      ctrlBackslashPending: false,
      ...extra,
    },
  };
}

/**
 * TERMINAL 모드 키 입력 처리기 (`Ctrl-\ Ctrl-n` NORMAL 전환, 셸 실행, 히스토리, Ctrl-c/u/w/l 지원)
 */
export function handleTerminalModeKey(state: VimEditorState, key: string): VimEditorState {
  const session = state.terminalSession;
  if (!session?.isOpen) {
    return { ...state, mode: 'NORMAL', cursor: clampCursor(state.lines, state.cursor, 'NORMAL') };
  }

  // 1) Ctrl-\ 대기 상태 → Ctrl-n (또는 n) 입력 시 NORMAL 모드 전환 (Neovim 표준 t_<C-\>_<C-N>)
  if (session.ctrlBackslashPending) {
    if (key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'ctrl-n' || key === '<C-n>' || key === 'n') {
      return {
        ...state,
        mode: 'NORMAL',
        cursor: clampCursor(state.lines, state.cursor, 'NORMAL'),
        pendingKeys: undefined,
        terminalSession: { ...session, ctrlBackslashPending: false },
        commandMessage: msg('[Terminal] NORMAL 모드 전환 (출력 복사·검색 가능 · i 로 입력 재개)'),
      };
    }
    return {
      ...state,
      pendingKeys: undefined,
      terminalSession: { ...session, ctrlBackslashPending: false },
    };
  }

  // Ctrl-\ 진입
  if (key === 'Ctrl-\\' || key === 'Ctrl+\\' || key === 'ctrl-\\' || key === '<C-\\>') {
    return {
      ...state,
      pendingKeys: '<C-\\>',
      terminalSession: { ...session, ctrlBackslashPending: true },
    };
  }

  if (key === 'Enter' || key === '<CR>') {
    return executeTerminalLine(state, session, session.inputBuffer);
  }

  if (key === 'Backspace' || key === 'Ctrl-h' || key === 'Ctrl+h') {
    const nextInput = session.inputBuffer.slice(0, -1);
    return updateInputBuffer(state, session, nextInput);
  }

  if (key === 'Ctrl-u' || key === 'Ctrl+u') {
    return updateInputBuffer(state, session, '');
  }

  if (key === 'Ctrl-w' || key === 'Ctrl+w') {
    const nextInput = session.inputBuffer.replace(/\S+\s*$/, '');
    return updateInputBuffer(state, session, nextInput);
  }

  if (key === 'Ctrl-c' || key === 'Ctrl+c') {
    const baseLines = [...state.lines];
    baseLines[session.promptLine] = `${session.prompt}${session.inputBuffer}^C`;
    const nextLines = [...baseLines, session.prompt];
    const promptLine = nextLines.length - 1;
    return {
      ...state,
      lines: nextLines,
      cursor: { line: promptLine, col: session.prompt.length },
      terminalSession: {
        ...session,
        inputBuffer: '',
        promptLine,
        ctrlBackslashPending: false,
      },
    };
  }

  if (key === 'Ctrl-l' || key === 'Ctrl+l') {
    const nextLines = [`${session.prompt}${session.inputBuffer}`];
    return {
      ...state,
      lines: nextLines,
      cursor: { line: 0, col: nextLines[0].length },
      terminalSession: {
        ...session,
        promptLine: 0,
        ctrlBackslashPending: false,
      },
    };
  }

  if (key === 'ArrowUp' || key === 'Ctrl-p' || key === 'Ctrl+p') {
    if (session.history.length === 0) return state;
    const nextIdx = Math.max(0, session.historyIndex - 1);
    return updateInputBuffer(state, session, session.history[nextIdx] ?? '', {
      historyIndex: nextIdx,
    });
  }

  if (key === 'ArrowDown' || key === 'Ctrl-n' || key === 'Ctrl+n') {
    if (session.history.length === 0) return state;
    const nextIdx = Math.min(session.history.length, session.historyIndex + 1);
    const nextText = nextIdx < session.history.length ? session.history[nextIdx] : '';
    return updateInputBuffer(state, session, nextText, { historyIndex: nextIdx });
  }

  if (key === 'Tab') {
    return updateInputBuffer(state, session, session.inputBuffer + '  ');
  }

  if (key.length === 1) {
    return updateInputBuffer(state, session, session.inputBuffer + key);
  }

  return state;
}
