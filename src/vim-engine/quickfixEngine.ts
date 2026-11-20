import { QuickfixItem, VimEditorState } from './types';
import { parseLinesWithErrorformat, ErrorExprUserFn } from './errorformat';
import {
  ErrorListAdapter,
  setErrorList,
  jumpToErrorListItem,
  nextErrorListItem,
  prevErrorListItem,
  firstErrorListItem,
  lastErrorListItem,
  openErrorListWindow,
  closeErrorListWindow,
  toggleErrorListWindow,
  formatErrorList,
  runVimgrepToList,
  loadErrorListFromFile,
  evalExprToErrorList,
  grepToErrorList,
  runBatchOverErrorList,
} from './errorListCore';
import { msg } from './messages';

const QUICKFIX_ADAPTER: ErrorListAdapter = {
  getList: (state) => state.quickfix,
  writeList: (state, nextList) => ({ ...state, quickfix: nextList }),
  emptyError: 'E42: No Errors',
  loadedMessage: (itemsCount) =>
    msg('({itemsCount} of {itemsCount}) 퀵픽스 목록 로드됨', { itemsCount }),
  openedMessage: (itemsCount) =>
    msg('퀵픽스 윈도우 열림 ({itemsCount}개 항목)', { itemsCount }),
  closedMessage: () => msg('퀵픽스 윈도우 닫힘'),
  batchDoneMessage: (count, cleanCmd, isFile) =>
    isFile
      ? msg('({filesCount}개 파일에 대해 :cfdo \'{cleanCmd}\' 실행 완료)', {
          filesCount: count,
          cleanCmd,
        })
      : msg('({count}개 항목에 대해 :cdo \'{cleanCmd}\' 실행 완료)', { count, cleanCmd }),
  fileOpenFailedMessage: (cleanName) =>
    msg('E484: 파일을 열 수 없습니다: {cleanName}', { cleanName }),
  fileEmptyErrorsMessage: (cleanName) =>
    msg('E42: 에러 목록이 비어 있습니다: {cleanName}', { cleanName }),
  vimgrepOptions: {
    alwaysGlobalLineMatch: false,
    jumpIndexOnAppend: 'newFirst',
    noJumpMessage: (totalCount) => `(${totalCount} matches found)`,
  },
};

/**
 * 퀵픽스(Quickfix) 목록을 설정합니다.
 */
export function setQuickfixList(
  state: VimEditorState,
  items: QuickfixItem[],
  jumpToFirst = true
): VimEditorState {
  return setErrorList(state, items, jumpToFirst, QUICKFIX_ADAPTER);
}

/**
 * 지정된 인덱스(0-based)의 퀵픽스 항목 위치(파일, 라인, 컬럼)로 에디터 커서를 점프합니다.
 */
export function jumpToQuickfixItem(state: VimEditorState, index: number): VimEditorState {
  return jumpToErrorListItem(state, index, QUICKFIX_ADAPTER);
}

/**
 * 다음 퀵픽스 에러 항목으로 이동합니다 (:cnext, :cn, [count]cn).
 */
export function nextQuickfix(state: VimEditorState, count = 1): VimEditorState {
  return nextErrorListItem(state, count, QUICKFIX_ADAPTER);
}

/**
 * 이전 퀵픽스 에러 항목으로 이동합니다 (:cprev, :cp, :cprevious, [count]cp).
 */
export function prevQuickfix(state: VimEditorState, count = 1): VimEditorState {
  return prevErrorListItem(state, count, QUICKFIX_ADAPTER);
}

/**
 * 첫 번째 퀵픽스 항목으로 이동합니다 (:cfirst, :cr, :crewind).
 */
export function firstQuickfix(state: VimEditorState): VimEditorState {
  return firstErrorListItem(state, QUICKFIX_ADAPTER);
}

/**
 * 마지막 퀵픽스 항목으로 이동합니다 (:clast, :cla).
 */
export function lastQuickfix(state: VimEditorState): VimEditorState {
  return lastErrorListItem(state, QUICKFIX_ADAPTER);
}

/**
 * 퀵픽스 윈도우를 엽니다 (:copen [height], :cope).
 */
export function openQuickfixWindow(state: VimEditorState, height?: number): VimEditorState {
  return openErrorListWindow(state, height, QUICKFIX_ADAPTER);
}

/**
 * 퀵픽스 윈도우를 닫습니다 (:cclose, :ccl).
 */
export function closeQuickfixWindow(state: VimEditorState): VimEditorState {
  return closeErrorListWindow(state, QUICKFIX_ADAPTER);
}

/**
 * 퀵픽스 목록에 에러가 있으면 창을 열고, 없으면 닫습니다 (:cwindow [height], :cw).
 */
export function toggleQuickfixWindow(state: VimEditorState, height?: number): VimEditorState {
  return toggleErrorListWindow(state, height, QUICKFIX_ADAPTER);
}

/**
 * 퀵픽스 목록을 문자열로 포맷팅합니다 (:clist, :cl).
 */
export function formatQuickfixList(state: VimEditorState): string {
  return formatErrorList(state, QUICKFIX_ADAPTER);
}

/**
 * 프로젝트 및 버퍼 내에서 정규식 패턴을 검색하여 퀵픽스 목록을 구성합니다 (:vimgrep, :vimgrepadd).
 * 구문: :vimgrep /pattern/[flags] {file}
 */
export function vimgrep(
  state: VimEditorState,
  args: string,
  isAppend = false
): VimEditorState {
  return runVimgrepToList(state, args, isAppend, QUICKFIX_ADAPTER);
}

/**
 * 에러 로그 텍스트 줄을 'errorformat' 규칙에 따라 파싱하여 Quickfix 항목 목록을 생성합니다.
 */
export function parseQuickfixErrorLines(lines: string[], errorformat?: string): QuickfixItem[] {
  return parseLinesWithErrorformat(lines, errorformat);
}

/**
 * 파일(또는 가상 파일 시스템)의 에러 로그를 읽어 퀵픽스 목록을 로드합니다. (:cfile, :cgetfile)
 */
export function loadQuickfixFromFile(
  state: VimEditorState,
  filename: string,
  jumpToFirst = true
): VimEditorState {
  return loadErrorListFromFile(state, filename, jumpToFirst, QUICKFIX_ADAPTER);
}

/**
 * Vim script 표현식을 평가해 'errorformat' 으로 파싱한 뒤 퀵픽스 목록을 설정·추가합니다 (:cexpr, :cgetexpr, :caddexpr).
 */
export function cexprQuickfix(
  state: VimEditorState,
  rawExpr: string,
  mode: 'replace' | 'get' | 'add',
  callUserFn: ErrorExprUserFn
): VimEditorState {
  return evalExprToErrorList(state, rawExpr, mode, callUserFn, QUICKFIX_ADAPTER);
}

/**
 * VFS 파일 및 버퍼에서 :grep / :grepadd 를 실행하여 퀵픽스 목록을 구성합니다.
 */
export function grepToQuickfix(
  state: VimEditorState,
  rawArgs: string,
  isAppend = false,
  jumpToFirst = true
): VimEditorState {
  return grepToErrorList(state, rawArgs, isAppend, jumpToFirst, QUICKFIX_ADAPTER);
}

/**
 * 퀵픽스 목록의 유효한 항목들에 대해 지정된 Ex 명령어를 일괄 실행합니다 (:cdo[!] {cmd}).
 * isFile = true 인 경우, 파일 단위로 첫 번째 매치에 대해 한 번씩만 실행합니다 (:cfdo[!] {cmd}).
 */
export function cdo(
  state: VimEditorState,
  commandStr: string,
  executeCmd: (s: VimEditorState, c: string) => VimEditorState,
  isFile = false,
  isBang = false
): VimEditorState {
  return runBatchOverErrorList(state, commandStr, executeCmd, isFile, isBang, QUICKFIX_ADAPTER);
}

/**
 * 퀵픽스 목록에 속한 각 파일에 대해 Ex 명령어를 한 번씩 실행합니다 (:cfdo[!] {cmd}).
 */
export function cfdo(
  state: VimEditorState,
  commandStr: string,
  executeCmd: (s: VimEditorState, c: string) => VimEditorState,
  isBang = false
): VimEditorState {
  return cdo(state, commandStr, executeCmd, true, isBang);
}
