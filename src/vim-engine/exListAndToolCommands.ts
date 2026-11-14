import { VimEditorState } from './types';
import { undo, redo } from './operators';
import { formatUndoList, jumpUndoSeq, travelEarlier, travelLater } from './undoTreeEngine';
import { bufdo } from './bufferEngine';
import { tabdo } from './tabEngine';
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
  cdo,
  cfdo,
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
  ldo,
  lfdo,
} from './locationListEngine';
import { formatChangeList } from './advancedMotions';
import { formatMarksList, formatJumpsList, clearJumps, deleteMarks } from './marks';
import {
  setArgs,
  addArgs,
  deleteArgs,
  nextArg,
  prevArg,
  firstArg,
  lastArg,
  formatArgs,
  argdo,
} from './argEngine';
import { formatRegisters } from './registers';
import { executeSetCommand } from './setEngine';
import { sourceScript } from './sourceEngine';
import { executeMakeSession } from './sessionEngine';
import {
  executeAutocmdCommand,
  executeAugroupCommand,
  executeDeleteAutocmd,
  executeDoAutocmd,
  triggerAutocmd,
} from './autocmdEngine';
import { executeSyntaxCommand } from './syntaxEngine';
import { executeFiletypeCommand } from './ftpluginEngine';
import {
  jumpToTag,
  popTagStack,
  formatTagStack,
  tselectTag,
  tjumpTag,
  cycleTagMatch,
} from './tagEngine';
import { registerKeymap, unregisterKeymap, formatKeymapsList } from './keymapEngine';
import { executeAbbrevCommand } from './abbrevEngine';
import { executeUserCommandDefinition } from './userCommandEngine';
import { callUserFunction } from './vimscriptEngine';
import { msg } from './messages';
import type { ExCommandRunner } from './exWorkspaceCommands';

/**
 * 퀵픽스·로케이션 리스트·grep·옵션·마크·태그·undo 트리·배치 실행(:argdo/:bufdo/:cdo 등)·매핑 등 도구 Ex 명령을 처리합니다.
 * 일치하는 명령이 없으면 null 을 반환합니다.
 */
export function tryExecuteToolExCommand(
  state: VimEditorState,
  cleanCmdRaw: string,
  cleanCmd: string,
  trimmed: string,
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

  // --- 로케이션 리스트 (Location List) Ex 명령 ---
  // 로케이션 리스트 창 열기: :lopen [height], :lope [height]
  const lopenMatch = cleanCmdRaw.match(/^(?:lopen|lope)(?:\s+(\d+))?$/i);
  if (lopenMatch) {
    const height = lopenMatch[1] ? parseInt(lopenMatch[1], 10) : undefined;
    const res = openLocationListWindow(state, height);
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

  // 체인지 리스트 조회: :changes
  if (cleanCmd === 'changes') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatChangeList(state),
    };
  }

  // 마크/점프 뷰어 닫기: :marks close, :jumps close, :marksclose, :jumpsclose
  if (
    /^(?:marks|jumps)\s+close$/i.test(cleanCmdRaw) ||
    cleanCmdRaw === 'marksclose' ||
    cleanCmdRaw === 'jumpsclose'
  ) {
    return {
      ...state,
      showMarksVisualizer: false,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('마크/점프 뷰어 닫힘'),
    };
  }

  // 마크 목록 조회: :marks [filter]
  const marksMatch = cleanCmdRaw.match(/^(?:marks)(?:\s+(.*))?$/i);
  if (marksMatch) {
    const filter = marksMatch[1]?.trim();
    return {
      ...state,
      showMarksVisualizer: true,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatMarksList(state, filter),
    };
  }

  // 점프 목록 조회: :jumps
  if (/^jumps$/i.test(cleanCmdRaw)) {
    return {
      ...state,
      showMarksVisualizer: true,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatJumpsList(state),
    };
  }

  // 점프 목록 초기화: :clearjumps, :cle
  if (/^(?:clearjumps|cle)$/i.test(cleanCmdRaw)) {
    const res = clearJumps(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 마크 삭제: :delmarks[!] [args], :delm[!] [args]
  const delmarksMatch = cleanCmdRaw.match(/^(?:delmarks|delm)(!?)(?:\s+(.*))?$/i);
  if (delmarksMatch) {
    const bang = delmarksMatch[1] === '!';
    const args = delmarksMatch[2]?.trim() ?? '';
    const res = deleteMarks(state, args, bang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 레지스터 뷰어 닫기: :reg close, :registers close, :regclose
  if (/^(?:reg|registers|display|di)\s+close$/i.test(cleanCmdRaw) || cleanCmdRaw === 'regclose') {
    return {
      ...state,
      showRegisterInspector: false,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('레지스터 뷰어 닫힘'),
    };
  }

  // 레지스터 뷰어 조회: :reg, :registers, :display, :di ([arg] 필터링 지원)
  const regMatch = cleanCmdRaw.match(/^(?:reg|registers|display|di)(?:!?)(?:\s+(.*))?$/i);
  if (regMatch) {
    const filterArg = regMatch[1]?.trim();
    const formatted = formatRegisters(state, filterArg);
    return {
      ...state,
      showRegisterInspector: true,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatted,
    };
  }

  // 순정 Vim 버퍼 로컬 옵션 설정: :setlocal, :setl [args]
  const setlocalMatch = cleanCmdRaw.match(/^(?:setlocal|setl)(?:\s+(.*))?$/i);
  if (setlocalMatch) {
    const rawArgs = setlocalMatch[1] ?? '';
    const res = executeSetCommand(state, rawArgs, 'local');
    let finalRes = res;
    if (res.options?.filetype && res.options.filetype !== state.options?.filetype) {
      finalRes = triggerAutocmd(
        res,
        'FileType',
        { filetype: res.options.filetype },
        runEx
      );
    }
    return {
      ...finalRes,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 순정 Vim 전역 옵션 설정: :setglobal, :setg [args]
  const setglobalMap = cleanCmdRaw.match(/^(?:setglobal|setg)(?:\s+(.*))?$/i);
  if (setglobalMap) {
    const rawArgs = setglobalMap[1] ?? '';
    const res = executeSetCommand(state, rawArgs, 'global');
    let finalRes = res;
    if (res.options?.filetype && res.options.filetype !== state.options?.filetype) {
      finalRes = triggerAutocmd(
        res,
        'FileType',
        { filetype: res.options.filetype },
        runEx
      );
    }
    return {
      ...finalRes,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 순정 Vim 환경 옵션 설정: :set, :se [args]
  const setMatch = cleanCmdRaw.match(/^(?:set|se)(?:\s+(.*))?$/i);
  if (setMatch) {
    const rawArgs = setMatch[1] ?? '';
    const res = executeSetCommand(state, rawArgs, 'both');
    let finalRes = res;
    if (res.options?.filetype && res.options.filetype !== state.options?.filetype) {
      finalRes = triggerAutocmd(
        res,
        'FileType',
        { filetype: res.options.filetype },
        runEx
      );
    }
    return {
      ...finalRes,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 순정 Vim 파일타입 플러그인/인덴트 제어: :filetype [args]
  const filetypeMatch = cleanCmdRaw.match(/^filetype(?:\s+(.*))?$/i);
  if (filetypeMatch) {
    const rawArgs = filetypeMatch[1] ?? '';
    const res = executeFiletypeCommand(state, rawArgs);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // .vimrc / 설정 내보내기 및 키바인딩 모달 열기: :vimrc, :config, :export, :keymap, :keymaps
  if (/^(?:vimrc|config|export|keymap|keymaps|mapconfig)$/i.test(cleanCmdRaw)) {
    return {
      ...state,
      showConfigModal: true,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('설정 및 .vimrc 내보내기/다운로드 창 열림'),
    };
  }

  // 스크립트 소싱 실행: :source, :so (:so %, :so ~/.vimrc 등)
  const sourceMatch = cleanCmdRaw.match(/^(?:source|so)(?:\s+(.*))?$/i);
  if (sourceMatch) {
    const targetFile = sourceMatch[1]?.trim() || '%';
    const res = sourceScript(state, targetFile, runEx);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 세션 파일 저장: :mksession, :mks [file]
  const mksessionMatch = cleanCmdRaw.match(/^(?:mksession|mks)(!?)(?:\s+(.*))?$/i);
  if (mksessionMatch) {
    const bang = Boolean(mksessionMatch[1]);
    const filename = mksessionMatch[2]?.trim() || 'Session.vim';
    const res = executeMakeSession(state, filename, bang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 자동 명령 그룹: :augroup[!], :aug[!] [name]
  const augroupMatch = cleanCmdRaw.match(/^(?:augroup|aug)(!?)(?:\s+(.*))?$/i);
  if (augroupMatch) {
    const bang = Boolean(augroupMatch[1]);
    const args = augroupMatch[2] ?? '';
    const res = executeAugroupCommand(state, args, bang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 자동 명령 삭제: :autocmd!, :au! [group] [{event} [{pat}]]
  const autocmdBangMatch = cleanCmdRaw.match(/^(?:autocmd|au)!\s*(.*)$/i);
  if (autocmdBangMatch) {
    const args = autocmdBangMatch[1] ?? '';
    const res = executeDeleteAutocmd(state, args);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 자동 명령 수동 실행: :doautocmd, :doau [group] {event} [fname]
  const doautocmdMatch = cleanCmdRaw.match(/^(?:doautocmd|doau)(?:\s+(.*))?$/i);
  if (doautocmdMatch) {
    const args = doautocmdMatch[1] ?? '';
    const res = executeDoAutocmd(state, args, runEx);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 자동 명령 등록 및 조회: :autocmd, :au [group] {event} {pat} [cmd]
  const autocmdMatch = cleanCmdRaw.match(/^(?:autocmd|au)(?:\s+(.*))?$/i);
  if (autocmdMatch) {
    const args = autocmdMatch[1] ?? '';
    const res = executeAutocmdCommand(state, args);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 순정 Vim 구문 강조 제어: :syntax, :syn [on|off|enable|manual|reset]
  const syntaxMatch = cleanCmdRaw.match(/^(?:syntax|syn)(?:\s+(.*))?$/i);
  if (syntaxMatch) {
    const args = syntaxMatch[1] ?? '';
    const res = executeSyntaxCommand(state, args);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 태그 스택 조회: :tags
  if (/^tags$/i.test(cleanCmdRaw)) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatTagStack(state),
    };
  }

  // 태그 스택 팝 복귀: :pop, :po, :[count]pop
  const popMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:pop|po)$/i);
  if (popMatch) {
    const count = popMatch[1] ? parseInt(popMatch[1], 10) : 1;
    const res = popTagStack(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 태그 점프: :tag [name], :ta [name]
  const tagMatch = cleanCmdRaw.match(/^(?:tag|ta)(?:\s+(.*))?$/i);
  if (tagMatch) {
    const tagName = tagMatch[1]?.trim() || '';
    const res = jumpToTag(state, tagName);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 태그 선택 및 조회: :tselect [name|num], :ts [name|num]
  const tselectMatch = cleanCmdRaw.match(/^(?:tselect|ts)(?:\s+(.*))?$/i);
  if (tselectMatch) {
    const target = tselectMatch[1]?.trim() || '';
    const res = tselectTag(state, target);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 태그 조건부 점프: :tjump [name], :tj [name]
  const tjumpMatch = cleanCmdRaw.match(/^(?:tjump|tj)(?:\s+(.*))?$/i);
  if (tjumpMatch) {
    const tagName = tjumpMatch[1]?.trim() || '';
    const res = tjumpTag(state, tagName);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 태그 목록 순회: :tnext, :tn, :[count]tnext
  const tnextMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:tnext|tn)$/i);
  if (tnextMatch) {
    const count = tnextMatch[1] ? parseInt(tnextMatch[1], 10) : 1;
    const res = cycleTagMatch(state, 'next', count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 태그 목록 역순회: :tprev, :tp, :[count]tprev, :tprevious
  const tprevMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:tprev|tprevious|tp)$/i);
  if (tprevMatch) {
    const count = tprevMatch[1] ? parseInt(tprevMatch[1], 10) : 1;
    const res = cycleTagMatch(state, 'prev', count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 첫 번째 / 마지막 태그 점프: :tfirst, :tf, :trewind, :tr / :tlast, :tl
  if (/^(?:tfirst|tf|trewind|tr)$/i.test(cleanCmdRaw)) {
    const res = cycleTagMatch(state, 'first');
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }
  if (/^(?:tlast|tl)$/i.test(cleanCmdRaw)) {
    const res = cycleTagMatch(state, 'last');
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 아규먼트 일괄 실행: :argdo[!] {cmd}
  const argdoMatch = cleanCmdRaw.match(/^argdo(!?)(?:\s+(.*))?$/i);
  if (argdoMatch) {
    const isBang = argdoMatch[1] === '!';
    const cmdToRun = argdoMatch[2] ?? '';
    const res = argdo(state, cmdToRun, runEx, isBang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 버퍼 일괄 실행: :bufdo[!] {cmd}
  const bufdoMatch = cleanCmdRaw.match(/^bufdo(!?)(?:\s+(.*))?$/i);
  if (bufdoMatch) {
    const isBang = bufdoMatch[1] === '!';
    const cmdToRun = bufdoMatch[2] ?? '';
    const res = bufdo(state, cmdToRun, runEx, isBang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 일괄 실행: :tabdo[!] {cmd}
  const tabdoMatch = cleanCmdRaw.match(/^tabdo(!?)(?:\s+(.*))?$/i);
  if (tabdoMatch) {
    const isBang = tabdoMatch[1] === '!';
    const cmdToRun = tabdoMatch[2] ?? '';
    const res = tabdo(state, cmdToRun, runEx, isBang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 일괄 실행: :cdo[!] {cmd}, :cfdo[!] {cmd}
  const cdoMatch = cleanCmdRaw.match(/^(cdo|cfdo)(!?)(?:\s+(.*))?$/i);
  if (cdoMatch) {
    const isFile = cdoMatch[1].toLowerCase() === 'cfdo';
    const isBang = cdoMatch[2] === '!';
    const cmdToRun = cdoMatch[3] ?? '';
    const runner = runEx;
    const res = isFile
      ? cfdo(state, cmdToRun, runner, isBang)
      : cdo(state, cmdToRun, runner, false, isBang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 일괄 실행: :ldo[!] {cmd}, :lfdo[!] {cmd}
  const ldoMatch = cleanCmdRaw.match(/^(ldo|lfdo)(!?)(?:\s+(.*))?$/i);
  if (ldoMatch) {
    const isFile = ldoMatch[1].toLowerCase() === 'lfdo';
    const isBang = ldoMatch[2] === '!';
    const cmdToRun = ldoMatch[3] ?? '';
    const runner = runEx;
    const res = isFile
      ? lfdo(state, cmdToRun, runner, isBang)
      : ldo(state, cmdToRun, runner, false, isBang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 아규먼트 추가: :argadd {file} ...
  const argaddMatch = cleanCmdRaw.match(/^argadd\s+(.*)$/i);
  if (argaddMatch) {
    const files = argaddMatch[1].trim().split(/\s+/);
    const res = addArgs(state, files);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 아규먼트 삭제: :argdelete {pattern}, :argd {pattern}
  const argdMatch = cleanCmdRaw.match(/^(?:argdelete|argd)\s+(.*)$/i);
  if (argdMatch) {
    const pattern = argdMatch[1].trim();
    const res = deleteArgs(state, pattern);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 아규먼트 설정 및 조회: :args [file1 file2 ...]
  const argsMatch = cleanCmdRaw.match(/^args(?:\s+(.*))?$/i);
  if (argsMatch) {
    const filesStr = argsMatch[1]?.trim();
    if (filesStr) {
      const files = filesStr.split(/\s+/);
      const res = setArgs(state, files);
      return {
        ...res,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
      };
    } else {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: formatArgs(state),
      };
    }
  }

  // 아규먼트 다음 파일 이동: :next, :n ([count] 지원)
  const nextArgMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:next|n)(?:\s+(\d+))?$/i);
  if (nextArgMatch) {
    const countRaw = nextArgMatch[1] || nextArgMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = nextArg(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 아규먼트 이전 파일 이동: :prev, :previous, :Next, :N ([count] 지원)
  const prevArgMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:prev|previous|Next|N)(?:\s+(\d+))?$/);
  if (prevArgMatch) {
    const countRaw = prevArgMatch[1] || prevArgMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = prevArg(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 아규먼트 양 끝 파일 이동: :first, :fir, :rewind, :rew, :last, :la
  if (
    cleanCmd === 'first' ||
    cleanCmd === 'fir' ||
    cleanCmd === 'rewind' ||
    cleanCmd === 'rew'
  ) {
    const res = firstArg(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }
  if (cleanCmd === 'last' || cleanCmd === 'la') {
    const res = lastArg(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }


  // Undo Tree 목록 확인: :undolist, :undol
  if (cleanCmd === 'undolist' || cleanCmd === 'undol') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatUndoList(state),
    };
  }

  // 이전 상태로 시간 여행: :earlier [count][s|m|h|d|f], :ea [count]...
  const earlierMatch = trimmed.match(/^:?\s*(?:earlier|ea)(?:\s+(.*))?$/i);
  if (earlierMatch) {
    const res = travelEarlier(state, earlierMatch[1]);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 이후 상태로 시간 여행: :later [count][s|m|h|d|f], :lat [count]...
  const laterMatch = trimmed.match(/^:?\s*(?:later|lat)(?:\s+(.*))?$/i);
  if (laterMatch) {
    const res = travelLater(state, laterMatch[1]);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 변경 번호로 직접 이동: :undo {seq}, :u {seq}
  const undoJumpMatch = trimmed.match(/^:?\s*u(?:ndo)?\s+(\d+)$/i);
  if (undoJumpMatch) {
    const seq = parseInt(undoJumpMatch[1], 10);
    const res = jumpUndoSeq(state, seq);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 단순 실행 취소 및 재실행: :u, :undo, :red, :redo
  if (cleanCmd === 'u' || cleanCmd === 'undo') {
    const res = undo(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  if (cleanCmd === 'red' || cleanCmd === 'redo') {
    const res = redo(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 리더 키(Leader Key) 설정: :let mapleader = " "
  const leaderMatch = trimmed.match(/^:?\s*let\s+(?:g:)?mapleader\s*=\s*(["'])(.*?)\1/i);
  if (leaderMatch) {
    let newLeader = leaderMatch[2];
    if (newLeader.toLowerCase() === '<space>') newLeader = ' ';
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      leaderKey: newLeader,
      commandMessage: msg('[리더 키 설정] mapleader = "{v}"', { v: newLeader === ' ' ? '<Space>' : newLeader }),
    };
  }

  // 3-x. 키매핑 목록 조회: :map, :nmap, :imap, :vmap, :noremap, :nnoremap, :inoremap, :vnoremap (인자 없음)
  const listMatch = trimmed.match(
    /^:?\s*(map|nmap|imap|vmap|noremap|nnoremap|inoremap|vnoremap)$/i
  );
  if (listMatch) {
    const cmd = listMatch[1].toLowerCase();
    let modeFilter = 'all';
    if (cmd.startsWith('i')) modeFilter = 'i';
    else if (cmd.startsWith('n')) modeFilter = 'n';
    else if (cmd.startsWith('v')) modeFilter = 'v';

    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatKeymapsList(state, modeFilter),
    };
  }

  // 커스텀 키매핑 등록: :imap, :inoremap, :nmap, :nnoremap, :vmap, :vnoremap, :map, :noremap
  const mapMatch = trimmed.match(
    /^:?\s*(nmap|nnoremap|imap|inoremap|vmap|vnoremap|map|noremap)\s+(\S+)\s+(.+)$/i
  );
  if (mapMatch) {
    const cmdType = mapMatch[1];
    const from = mapMatch[2];
    const to = mapMatch[3].trim();
    return registerKeymap(state, cmdType, from, to);
  }

  // 사용자 정의 명령 등록·삭제·목록: :command[!], :delcommand, :comclear
  const userCmdDef = executeUserCommandDefinition(state, cleanCmdRaw);
  if (userCmdDef) {
    return userCmdDef;
  }

  // 키매핑 해제: :unmap, :nunmap, :iunmap, :vunmap
  const unmapMatch = trimmed.match(/^:?\s*(unmap|nunmap|iunmap|vunmap)\s+(\S+)$/i);
  if (unmapMatch) {
    const cmdType = unmapMatch[1];
    const from = unmapMatch[2];
    return unregisterKeymap(state, cmdType, from);
  }

  // 약어: :iabbrev, :cabbrev, :abbrev, :inoreabbrev, :cnoreabbrev, :noreabbrev, :unabbrev, :abclear 등
  const abbrevRes = executeAbbrevCommand(state, trimmed);
  if (abbrevRes) return abbrevRes;

  return null;
}
