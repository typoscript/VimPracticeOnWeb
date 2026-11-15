import { VimEditorState } from './types';
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
import { syncDiagnosticsToLocationList } from './lspEngine';
import { callUserFunction } from './vimscriptEngine';
import { msg } from './messages';
import type { ExCommandRunner } from './exWorkspaceCommands';

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
  // 퀵픽스 창 열기: :copen [height], :cope [height]
  const copenMatch = cleanCmdRaw.match(/^(?:copen|cope)(?:\s+(\d+))?$/i);
  if (copenMatch) {
    const height = copenMatch[1] ? parseInt(copenMatch[1], 10) : undefined;
    const res = openQuickfixWindow(state, height);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 창 닫기: :cclose, :ccl
  if (cleanCmd === 'cclose' || cleanCmd === 'ccl') {
    const res = closeQuickfixWindow(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 창 토글/열기: :cwindow [height], :cw [height]
  const cwMatch = cleanCmdRaw.match(/^(?:cwindow|cw)(?:\s+(\d+))?$/i);
  if (cwMatch) {
    const height = cwMatch[1] ? parseInt(cwMatch[1], 10) : undefined;
    const res = toggleQuickfixWindow(state, height);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 다음 에러 이동: :cnext [count], :cn [count]
  const cnMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:cnext|cn)(?:\s+(\d+))?$/i);
  if (cnMatch) {
    const countRaw = cnMatch[1] || cnMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = nextQuickfix(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 이전 에러 이동: :cprev [count], :cp [count], :cprevious [count]
  const cpMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:cprev|cp|cprevious)(?:\s+(\d+))?$/i);
  if (cpMatch) {
    const countRaw = cpMatch[1] || cpMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = prevQuickfix(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 양 끝 이동: :cfirst, :cr, :crewind, :clast, :cla
  if (cleanCmd === 'cfirst' || cleanCmd === 'cr' || cleanCmd === 'crewind') {
    const res = firstQuickfix(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }
  if (cleanCmd === 'clast' || cleanCmd === 'cla') {
    const res = lastQuickfix(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 특정 번호 점프: :cc [N]
  const ccMatch = cleanCmdRaw.match(/^(?:cc)(?:\s+(\d+))?$/i);
  if (ccMatch) {
    const targetIdx = ccMatch[1] ? parseInt(ccMatch[1], 10) - 1 : (state.quickfix?.currentIndex ?? 0);
    const res = jumpToQuickfixItem(state, targetIdx);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 목록 조회: :clist, :cl
  if (cleanCmd === 'clist' || cleanCmd === 'cl') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatQuickfixList(state),
    };
  }

  // 퀵픽스 파일 로드 및 첫 에러 점프: :cfile [filename], :cf [filename]
  const cfileMatch = cleanCmdRaw.match(/^(?:cfile|cf)\s+(.+)$/i);
  if (cfileMatch) {
    const filename = cfileMatch[1].trim();
    const res = loadQuickfixFromFile(state, filename, true);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 파일 로드(점프 없음): :cgetfile [filename], :cg [filename]
  const cgetfileMatch = cleanCmdRaw.match(/^(?:cgetfile|cg)\s+(.+)$/i);
  if (cgetfileMatch) {
    const filename = cgetfileMatch[1].trim();
    const res = loadQuickfixFromFile(state, filename, false);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // vimgrep / vimgrepadd 검색: :vimgrep /pat/[flags] {file}, :vimgrepadd ...
  const vimgrepMatch = cleanCmdRaw.match(/^(vimgrep|vimgrepadd)\s+(.*)$/i);
  if (vimgrepMatch) {
    const isAppend = vimgrepMatch[1].toLowerCase() === 'vimgrepadd';
    const args = vimgrepMatch[2];
    const res = vimgrep(state, args, isAppend);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }


  // grep / grepadd 검색: :grep[! ] {args}, :grepadd[! ] {args}
  const grepMatch = cleanCmdRaw.match(/^(grep|grepadd)(!)?(?:\s+(.*))?$/i);
  if (grepMatch) {
    const isAppend = grepMatch[1].toLowerCase() === 'grepadd';
    const jump = grepMatch[2] !== '!';
    const args = grepMatch[3] ?? '';
    const res = grepToQuickfix(state, args, isAppend, jump);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 표현식 평가: :cexpr, :cex, :cgetexpr, :cgete, :caddexpr, :cad
  const cexprMatch = cleanCmdRaw.match(/^(cexpr|cex|cgetexpr|cgete|caddexpr|cad)(?:\s+(.*))?$/i);
  if (cexprMatch) {
    const sub = cexprMatch[1].toLowerCase();
    const expr = (cexprMatch[2] ?? '').trim();
    if ((sub === 'cexpr' || sub === 'cex') && (expr === '[]' || expr === '')) {
      const res = setQuickfixList(state, [], false);
      return {
        ...res,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: msg('퀵픽스 목록 초기화됨'),
      };
    }
    const mode =
      sub === 'caddexpr' || sub === 'cad'
        ? 'add'
        : sub === 'cgetexpr' || sub === 'cgete'
          ? 'get'
          : 'replace';
    const res = cexprQuickfix(state, expr, mode, (s, name, fnArgs) => callUserFunction(s, name, fnArgs, runEx));
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // --- LSP 진단(Diagnostics) 로케이션 리스트 열기: :diagnostics, :diag ---
  if (cleanCmd === 'diagnostics' || cleanCmd === 'diagnostic' || cleanCmd === 'diag') {
    const res = syncDiagnosticsToLocationList(state, true);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // --- 로케이션 리스트 (Location List) Ex 명령 ---
  // 로케이션 리스트 창 열기: :lopen [height], :lope [height]
  const lopenMatch = cleanCmdRaw.match(/^(?:lopen|lope)(?:\s+(\d+))?$/i);
  if (lopenMatch) {
    const height = lopenMatch[1] ? parseInt(lopenMatch[1], 10) : undefined;
    const baseState = state.lspDiagnostics && !state.locationList
      ? syncDiagnosticsToLocationList(state, false)
      : state;
    const res = openLocationListWindow(baseState, height);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 창 닫기: :lclose, :lcl
  if (cleanCmd === 'lclose' || cleanCmd === 'lcl') {
    const res = closeLocationListWindow(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 창 토글/열기: :lwindow [height], :lw [height]
  const lwMatch = cleanCmdRaw.match(/^(?:lwindow|lw)(?:\s+(\d+))?$/i);
  if (lwMatch) {
    const height = lwMatch[1] ? parseInt(lwMatch[1], 10) : undefined;
    const res = toggleLocationListWindow(state, height);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 다음 에러 이동: :lnext [count], :lne [count]
  const lneMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:lnext|lne)(?:\s+(\d+))?$/i);
  if (lneMatch) {
    const countRaw = lneMatch[1] || lneMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = nextLocationList(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 이전 에러 이동: :lprev [count], :lp [count], :lprevious [count]
  const lpMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:lprev|lp|lprevious)(?:\s+(\d+))?$/i);
  if (lpMatch) {
    const countRaw = lpMatch[1] || lpMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = prevLocationList(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 양 끝 이동: :lfirst, :lr, :lrewind, :llast, :lla
  if (cleanCmd === 'lfirst' || cleanCmd === 'lr' || cleanCmd === 'lrewind') {
    const res = firstLocationList(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }
  if (cleanCmd === 'llast' || cleanCmd === 'lla') {
    const res = lastLocationList(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 특정 번호 점프: :ll [N]
  const llMatch = cleanCmdRaw.match(/^(?:ll)(?:\s+(\d+))?$/i);
  if (llMatch) {
    const targetIdx = llMatch[1] ? parseInt(llMatch[1], 10) - 1 : (state.locationList?.currentIndex ?? 0);
    const res = jumpToLocationListItem(state, targetIdx);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 목록 조회: :llist, :lli
  if (cleanCmd === 'llist' || cleanCmd === 'lli') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatLocationList(state),
    };
  }

  // 로케이션 리스트 파일 로드 및 첫 에러 점프: :lfile [filename], :lf [filename]
  const lfileMatch = cleanCmdRaw.match(/^(?:lfile|lf)\s+(.+)$/i);
  if (lfileMatch) {
    const filename = lfileMatch[1].trim();
    const res = loadLocationListFromFile(state, filename, true);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 파일 로드(점프 없음): :lgetfile [filename], :lg [filename]
  const lgetfileMatch = cleanCmdRaw.match(/^(?:lgetfile|lg)\s+(.+)$/i);
  if (lgetfileMatch) {
    const filename = lgetfileMatch[1].trim();
    const res = loadLocationListFromFile(state, filename, false);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // lvimgrep / lvimgrepadd / lv 검색: :lvimgrep /pat/[flags] {file}, :lv ...
  const lvimgrepMatch = cleanCmdRaw.match(/^(lvimgrep|lvimgrepadd|lv)\s+(.*)$/i);
  if (lvimgrepMatch) {
    const isAppend = lvimgrepMatch[1].toLowerCase() === 'lvimgrepadd';
    const args = lvimgrepMatch[2];
    const res = lvimgrep(state, args, isAppend);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }


  // lgrep / lgrepadd 검색: :lgrep[! ] {args}, :lgrepadd[! ] {args}
  const lgrepMatch = cleanCmdRaw.match(/^(lgrep|lgrepadd)(!)?(?:\s+(.*))?$/i);
  if (lgrepMatch) {
    const isAppend = lgrepMatch[1].toLowerCase() === 'lgrepadd';
    const jump = lgrepMatch[2] !== '!';
    const args = lgrepMatch[3] ?? '';
    const res = grepToLocationList(state, args, isAppend, jump);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 표현식 평가: :lexpr, :lex, :lgetexpr, :lgete, :laddexpr, :lad
  const lexprMatch = cleanCmdRaw.match(/^(lexpr|lex|lgetexpr|lgete|laddexpr|lad)(?:\s+(.*))?$/i);
  if (lexprMatch) {
    const sub = lexprMatch[1].toLowerCase();
    const expr = (lexprMatch[2] ?? '').trim();
    if ((sub === 'lexpr' || sub === 'lex') && (expr === '[]' || expr === '')) {
      const res = setLocationList(state, [], false);
      return {
        ...res,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: msg('로케이션 리스트 초기화됨'),
      };
    }
    const mode =
      sub === 'laddexpr' || sub === 'lad'
        ? 'add'
        : sub === 'lgetexpr' || sub === 'lgete'
          ? 'get'
          : 'replace';
    const res = lexprLocationList(state, expr, mode, (s, name, fnArgs) => callUserFunction(s, name, fnArgs, runEx));
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }


  return null;
}
