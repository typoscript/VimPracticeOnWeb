import { QuickfixState, VimEditorState } from './types';
import {
  openQuickfixWindow,
  closeQuickfixWindow,
  toggleQuickfixWindow,
  nextQuickfix,
  prevQuickfix,
  firstQuickfix,
  lastQuickfix,
  jumpToQuickfixItem,
  formatQuickfixList,
  vimgrep,
  setQuickfixList,
  loadQuickfixFromFile,
  cexprQuickfix,
  grepToQuickfix,
} from './quickfixEngine';
import {
  openLocationListWindow,
  closeLocationListWindow,
  toggleLocationListWindow,
  nextLocationList,
  prevLocationList,
  firstLocationList,
  lastLocationList,
  jumpToLocationListItem,
  formatLocationList,
  lvimgrep,
  setLocationList,
  loadLocationListFromFile,
  lexprLocationList,
  grepToLocationList,
} from './locationListEngine';
import { ErrorExprUserFn } from './errorformat';
import { syncDiagnosticsToLocationList } from './lspEngine';
import { callUserFunction } from './vimscriptEngine';
import { msg } from './messages';
import type { ExCommandRunner } from './exWorkspaceCommands';

interface ListExCommandSpec {
  getList: (state: VimEditorState) => QuickfixState | null | undefined;
  beforeOpen?: (state: VimEditorState) => VimEditorState;
  open: (state: VimEditorState, height?: number) => VimEditorState;
  close: (state: VimEditorState) => VimEditorState;
  toggle: (state: VimEditorState, height?: number) => VimEditorState;
  next: (state: VimEditorState, count: number) => VimEditorState;
  prev: (state: VimEditorState, count: number) => VimEditorState;
  first: (state: VimEditorState) => VimEditorState;
  last: (state: VimEditorState) => VimEditorState;
  jump: (state: VimEditorState, idx: number) => VimEditorState;
  format: (state: VimEditorState) => string;
  loadFile: (state: VimEditorState, filename: string, jumpToFirst: boolean) => VimEditorState;
  vimgrep: (state: VimEditorState, args: string, isAppend: boolean) => VimEditorState;
  grep: (state: VimEditorState, args: string, isAppend: boolean, jump: boolean) => VimEditorState;
  clear: (state: VimEditorState) => VimEditorState;
  clearMessage: () => string;
  evalExpr: (
    state: VimEditorState,
    expr: string,
    mode: 'replace' | 'get' | 'add',
    callUserFn: ErrorExprUserFn
  ) => VimEditorState;
  patterns: {
    open: RegExp;
    close: readonly string[];
    window: RegExp;
    next: RegExp;
    prev: RegExp;
    first: readonly string[];
    last: readonly string[];
    jump: RegExp;
    list: readonly string[];
    file: RegExp;
    getfile: RegExp;
    vimgrep: RegExp;
    vimgrepAddCmd: string;
    grep: RegExp;
    grepAddCmd: string;
    expr: RegExp;
    exprReplaceCmds: readonly string[];
    exprAddCmds: readonly string[];
    exprGetCmds: readonly string[];
  };
}

function finishEx(res: VimEditorState, overrides?: Partial<VimEditorState>): VimEditorState {
  return {
    ...res,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    ...overrides,
  };
}

const QUICKFIX_EX_SPEC: ListExCommandSpec = {
  getList: (s) => s.quickfix,
  open: openQuickfixWindow,
  close: closeQuickfixWindow,
  toggle: toggleQuickfixWindow,
  next: nextQuickfix,
  prev: prevQuickfix,
  first: firstQuickfix,
  last: lastQuickfix,
  jump: jumpToQuickfixItem,
  format: formatQuickfixList,
  loadFile: loadQuickfixFromFile,
  vimgrep,
  grep: grepToQuickfix,
  clear: (s) => setQuickfixList(s, [], false),
  clearMessage: () => msg('퀵픽스 목록 초기화됨'),
  evalExpr: cexprQuickfix,
  patterns: {
    open: /^(?:copen|cope)(?:\s+(\d+))?$/i,
    close: ['cclose', 'ccl'],
    window: /^(?:cwindow|cw)(?:\s+(\d+))?$/i,
    next: /^(?:(\d+)\s*)?(?:cnext|cn)(?:\s+(\d+))?$/i,
    prev: /^(?:(\d+)\s*)?(?:cprev|cp|cprevious)(?:\s+(\d+))?$/i,
    first: ['cfirst', 'cr', 'crewind'],
    last: ['clast', 'cla'],
    jump: /^(?:cc)(?:\s+(\d+))?$/i,
    list: ['clist', 'cl'],
    file: /^(?:cfile|cf)\s+(.+)$/i,
    getfile: /^(?:cgetfile|cg)\s+(.+)$/i,
    vimgrep: /^(vimgrep|vimgrepadd)\s+(.*)$/i,
    vimgrepAddCmd: 'vimgrepadd',
    grep: /^(grep|grepadd)(!)?(?:\s+(.*))?$/i,
    grepAddCmd: 'grepadd',
    expr: /^(cexpr|cex|cgetexpr|cgete|caddexpr|cad)(?:\s+(.*))?$/i,
    exprReplaceCmds: ['cexpr', 'cex'],
    exprAddCmds: ['caddexpr', 'cad'],
    exprGetCmds: ['cgetexpr', 'cgete'],
  },
};

const LOCATION_LIST_EX_SPEC: ListExCommandSpec = {
  getList: (s) => s.locationList,
  beforeOpen: (s) =>
    s.lspDiagnostics && !s.locationList ? syncDiagnosticsToLocationList(s, false) : s,
  open: openLocationListWindow,
  close: closeLocationListWindow,
  toggle: toggleLocationListWindow,
  next: nextLocationList,
  prev: prevLocationList,
  first: firstLocationList,
  last: lastLocationList,
  jump: jumpToLocationListItem,
  format: formatLocationList,
  loadFile: loadLocationListFromFile,
  vimgrep: lvimgrep,
  grep: grepToLocationList,
  clear: (s) => setLocationList(s, [], false),
  clearMessage: () => msg('로케이션 리스트 초기화됨'),
  evalExpr: lexprLocationList,
  patterns: {
    open: /^(?:lopen|lope)(?:\s+(\d+))?$/i,
    close: ['lclose', 'lcl'],
    window: /^(?:lwindow|lw)(?:\s+(\d+))?$/i,
    next: /^(?:(\d+)\s*)?(?:lnext|lne)(?:\s+(\d+))?$/i,
    prev: /^(?:(\d+)\s*)?(?:lprev|lp|lprevious)(?:\s+(\d+))?$/i,
    first: ['lfirst', 'lr', 'lrewind'],
    last: ['llast', 'lla'],
    jump: /^(?:ll)(?:\s+(\d+))?$/i,
    list: ['llist', 'lli'],
    file: /^(?:lfile|lf)\s+(.+)$/i,
    getfile: /^(?:lgetfile|lg)\s+(.+)$/i,
    vimgrep: /^(lvimgrep|lvimgrepadd|lv)\s+(.*)$/i,
    vimgrepAddCmd: 'lvimgrepadd',
    grep: /^(lgrep|lgrepadd)(!)?(?:\s+(.*))?$/i,
    grepAddCmd: 'lgrepadd',
    expr: /^(lexpr|lex|lgetexpr|lgete|laddexpr|lad)(?:\s+(.*))?$/i,
    exprReplaceCmds: ['lexpr', 'lex'],
    exprAddCmds: ['laddexpr', 'lad'],
    exprGetCmds: ['lgetexpr', 'lgete'],
  },
};

function tryExecuteListExCommand(
  state: VimEditorState,
  cleanCmdRaw: string,
  cleanCmd: string,
  runEx: ExCommandRunner,
  spec: ListExCommandSpec
): VimEditorState | null {
  const { patterns } = spec;

  const openMatch = cleanCmdRaw.match(patterns.open);
  if (openMatch) {
    const height = openMatch[1] ? parseInt(openMatch[1], 10) : undefined;
    const baseState = spec.beforeOpen ? spec.beforeOpen(state) : state;
    return finishEx(spec.open(baseState, height));
  }

  if (patterns.close.includes(cleanCmd)) {
    return finishEx(spec.close(state));
  }

  const windowMatch = cleanCmdRaw.match(patterns.window);
  if (windowMatch) {
    const height = windowMatch[1] ? parseInt(windowMatch[1], 10) : undefined;
    return finishEx(spec.toggle(state, height));
  }

  const nextMatch = cleanCmdRaw.match(patterns.next);
  if (nextMatch) {
    const countRaw = nextMatch[1] || nextMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    return finishEx(spec.next(state, count));
  }

  const prevMatch = cleanCmdRaw.match(patterns.prev);
  if (prevMatch) {
    const countRaw = prevMatch[1] || prevMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    return finishEx(spec.prev(state, count));
  }

  if (patterns.first.includes(cleanCmd)) {
    return finishEx(spec.first(state));
  }

  if (patterns.last.includes(cleanCmd)) {
    return finishEx(spec.last(state));
  }

  const jumpMatch = cleanCmdRaw.match(patterns.jump);
  if (jumpMatch) {
    const targetIdx = jumpMatch[1]
      ? parseInt(jumpMatch[1], 10) - 1
      : (spec.getList(state)?.currentIndex ?? 0);
    return finishEx(spec.jump(state, targetIdx));
  }

  if (patterns.list.includes(cleanCmd)) {
    return finishEx(state, { commandMessage: spec.format(state) });
  }

  const fileMatch = cleanCmdRaw.match(patterns.file);
  if (fileMatch) {
    return finishEx(spec.loadFile(state, fileMatch[1].trim(), true));
  }

  const getfileMatch = cleanCmdRaw.match(patterns.getfile);
  if (getfileMatch) {
    return finishEx(spec.loadFile(state, getfileMatch[1].trim(), false));
  }

  const vimgrepMatch = cleanCmdRaw.match(patterns.vimgrep);
  if (vimgrepMatch) {
    const isAppend = vimgrepMatch[1].toLowerCase() === patterns.vimgrepAddCmd;
    return finishEx(spec.vimgrep(state, vimgrepMatch[2], isAppend));
  }

  const grepMatch = cleanCmdRaw.match(patterns.grep);
  if (grepMatch) {
    const isAppend = grepMatch[1].toLowerCase() === patterns.grepAddCmd;
    const jump = grepMatch[2] !== '!';
    return finishEx(spec.grep(state, grepMatch[3] ?? '', isAppend, jump));
  }

  const exprMatch = cleanCmdRaw.match(patterns.expr);
  if (exprMatch) {
    const sub = exprMatch[1].toLowerCase();
    const expr = (exprMatch[2] ?? '').trim();
    if (patterns.exprReplaceCmds.includes(sub) && (expr === '[]' || expr === '')) {
      return finishEx(spec.clear(state), { commandMessage: spec.clearMessage() });
    }
    const mode = patterns.exprAddCmds.includes(sub)
      ? 'add'
      : patterns.exprGetCmds.includes(sub)
        ? 'get'
        : 'replace';
    return finishEx(
      spec.evalExpr(state, expr, mode, (s, name, fnArgs) =>
        callUserFunction(s, name, fnArgs, runEx)
      )
    );
  }

  return null;
}

/**
 * 퀵픽스(:copen/:cn/:vimgrep 등)와 로케이션 리스트(:lopen/:lne/:lvimgrep 등) Ex 명령을 처리합니다.
 * 일치하는 명령이 없으면 null 을 반환합니다.
 */
export function tryExecuteQuickfixExCommand(
  state: VimEditorState,
  cleanCmdRaw: string,
  cleanCmd: string,
  runEx: ExCommandRunner
): VimEditorState | null {
  // LSP 진단(Diagnostics) 로케이션 리스트 열기: :diagnostics, :diag
  if (cleanCmd === 'diagnostics' || cleanCmd === 'diagnostic' || cleanCmd === 'diag') {
    return finishEx(syncDiagnosticsToLocationList(state, true));
  }

  return (
    tryExecuteListExCommand(state, cleanCmdRaw, cleanCmd, runEx, QUICKFIX_EX_SPEC) ??
    tryExecuteListExCommand(state, cleanCmdRaw, cleanCmd, runEx, LOCATION_LIST_EX_SPEC)
  );
}
