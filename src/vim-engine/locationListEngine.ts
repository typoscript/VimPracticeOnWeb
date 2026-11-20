import { QuickfixItem, QuickfixState, VimEditorState, SplitPaneState } from './types';
import { ErrorExprUserFn } from './errorformat';
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

/**
 * 활성 분할 창이 있을 경우 해당 창의 locationList도 동기화합니다.
 */
function syncPaneLocationList(
  state: VimEditorState,
  locList: QuickfixState | null | undefined
): SplitPaneState[] | undefined {
  if (!state.splitPanes || state.activePaneIndex === undefined) {
    return state.splitPanes;
  }
  const curIdx = state.activePaneIndex;
  return state.splitPanes.map((pane, idx) =>
    idx === curIdx ? { ...pane, locationList: locList } : pane
  );
}

const LOCATION_LIST_ADAPTER: ErrorListAdapter = {
  getList: (state) => state.locationList,
  writeList: (state, nextList) => ({
    ...state,
    locationList: nextList,
    splitPanes: syncPaneLocationList(state, nextList),
  }),
  emptyError: 'E776: No location list',
  loadedMessage: (itemsCount) =>
    msg('({itemsCount} of {itemsCount}) 로케이션 리스트 로드됨', { itemsCount }),
  openedMessage: (itemsCount) =>
    msg('로케이션 리스트 윈도우 열림 ({itemsCount}개 항목)', { itemsCount }),
  closedMessage: () => msg('로케이션 리스트 윈도우 닫힘'),
  batchDoneMessage: (count, cleanCmd, isFile) =>
    isFile
      ? msg('({filesCount}개 파일에 대해 :lfdo \'{cleanCmd}\' 실행 완료)', {
          filesCount: count,
          cleanCmd,
        })
      : msg('({count}개 항목에 대해 :ldo \'{cleanCmd}\' 실행 완료)', { count, cleanCmd }),
  fileOpenFailedMessage: (filename) => `E484: Can't open file ${filename}`,
  fileEmptyErrorsMessage: (filename) =>
    msg('({filename}): 파싱 가능한 에러 항목이 없습니다', { filename }),
  vimgrepOptions: {
    alwaysGlobalLineMatch: true,
    jumpIndexOnAppend: 'first',
  },
};

/**
 * 현재 창의 로케이션 리스트(Location List)를 설정합니다.
 */
export function setLocationList(
  state: VimEditorState,
  items: QuickfixItem[],
  jumpToFirst = true
): VimEditorState {
  return setErrorList(state, items, jumpToFirst, LOCATION_LIST_ADAPTER);
}

/**
 * 지정된 인덱스(0-based)의 로케이션 리스트 항목 위치로 커서를 점프합니다.
 */
export function jumpToLocationListItem(
  state: VimEditorState,
  index: number
): VimEditorState {
  return jumpToErrorListItem(state, index, LOCATION_LIST_ADAPTER);
}

/**
 * 다음 로케이션 리스트 에러 항목으로 이동합니다 (:lnext, :lne, [count]lne).
 */
export function nextLocationList(state: VimEditorState, count = 1): VimEditorState {
  return nextErrorListItem(state, count, LOCATION_LIST_ADAPTER);
}

/**
 * 이전 로케이션 리스트 에러 항목으로 이동합니다 (:lprev, :lp, :lprevious, [count]lp).
 */
export function prevLocationList(state: VimEditorState, count = 1): VimEditorState {
  return prevErrorListItem(state, count, LOCATION_LIST_ADAPTER);
}

/**
 * 첫 번째 로케이션 리스트 항목으로 이동합니다 (:lfirst, :lr, :lrewind).
 */
export function firstLocationList(state: VimEditorState): VimEditorState {
  return firstErrorListItem(state, LOCATION_LIST_ADAPTER);
}

/**
 * 마지막 로케이션 리스트 항목으로 이동합니다 (:llast, :lla).
 */
export function lastLocationList(state: VimEditorState): VimEditorState {
  return lastErrorListItem(state, LOCATION_LIST_ADAPTER);
}

/**
 * 로케이션 리스트 윈도우를 엽니다 (:lopen [height], :lope).
 */
export function openLocationListWindow(
  state: VimEditorState,
  height?: number
): VimEditorState {
  return openErrorListWindow(state, height, LOCATION_LIST_ADAPTER);
}

/**
 * 로케이션 리스트 윈도우를 닫습니다 (:lclose, :lcl).
 */
export function closeLocationListWindow(state: VimEditorState): VimEditorState {
  return closeErrorListWindow(state, LOCATION_LIST_ADAPTER);
}

/**
 * 로케이션 리스트에 항목이 있으면 창을 열고, 없으면 닫습니다 (:lwindow [height], :lw).
 */
export function toggleLocationListWindow(
  state: VimEditorState,
  height?: number
): VimEditorState {
  return toggleErrorListWindow(state, height, LOCATION_LIST_ADAPTER);
}

/**
 * 로케이션 리스트 목록을 문자열로 포맷팅합니다 (:llist, :lli).
 */
export function formatLocationList(state: VimEditorState): string {
  return formatErrorList(state, LOCATION_LIST_ADAPTER);
}

/**
 * 현재 창과 버퍼 내에서 정규식 패턴을 검색하여 로케이션 리스트를 구성합니다 (:lvimgrep, :lvimgrepadd, :lv).
 */
export function lvimgrep(
  state: VimEditorState,
  args: string,
  isAppend = false
): VimEditorState {
  return runVimgrepToList(state, args, isAppend, LOCATION_LIST_ADAPTER);
}

/**
 * 외부 에러 로그 파일에서 에러 목록을 읽어 로케이션 리스트로 로드합니다 (:lfile, :lf, :lgetfile, :lg).
 */
export function loadLocationListFromFile(
  state: VimEditorState,
  filename: string,
  jumpToFirst = true
): VimEditorState {
  return loadErrorListFromFile(state, filename, jumpToFirst, LOCATION_LIST_ADAPTER);
}

/**
 * Vim script 표현식을 평가해 'errorformat' 으로 파싱한 뒤 로케이션 리스트를 설정·추가합니다 (:lexpr, :lgetexpr, :laddexpr).
 */
export function lexprLocationList(
  state: VimEditorState,
  rawExpr: string,
  mode: 'replace' | 'get' | 'add',
  callUserFn: ErrorExprUserFn
): VimEditorState {
  return evalExprToErrorList(state, rawExpr, mode, callUserFn, LOCATION_LIST_ADAPTER);
}

/**
 * VFS 파일 및 버퍼에서 :lgrep / :lgrepadd 를 실행하여 로케이션 리스트를 구성합니다.
 */
export function grepToLocationList(
  state: VimEditorState,
  rawArgs: string,
  isAppend = false,
  jumpToFirst = true
): VimEditorState {
  return grepToErrorList(state, rawArgs, isAppend, jumpToFirst, LOCATION_LIST_ADAPTER);
}

/**
 * 로케이션 리스트의 유효한 항목들에 대해 지정된 Ex 명령어를 일괄 실행합니다 (:ldo[!] {cmd}).
 * isFile = true 인 경우, 파일 단위로 첫 번째 매치에 대해 한 번씩만 실행합니다 (:lfdo[!] {cmd}).
 */
export function ldo(
  state: VimEditorState,
  commandStr: string,
  executeCmd: (s: VimEditorState, c: string) => VimEditorState,
  isFile = false,
  isBang = false
): VimEditorState {
  return runBatchOverErrorList(
    state,
    commandStr,
    executeCmd,
    isFile,
    isBang,
    LOCATION_LIST_ADAPTER
  );
}

/**
 * 로케이션 리스트에 속한 각 파일에 대해 Ex 명령어를 한 번씩 실행합니다 (:lfdo[!] {cmd}).
 */
export function lfdo(
  state: VimEditorState,
  commandStr: string,
  executeCmd: (s: VimEditorState, c: string) => VimEditorState,
  isBang = false
): VimEditorState {
  return ldo(state, commandStr, executeCmd, true, isBang);
}
