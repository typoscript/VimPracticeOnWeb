import { VimEditorState } from './types';
import { splitWindow, closeSplitWindow, closeOtherPanes, resizeSplit, executeWincmd } from './splitWindow';
import {
  formatBufferList,
  nextBuffer,
  prevBuffer,
  firstBuffer,
  lastBuffer,
  deleteBuffer,
  editBuffer,
  addBuffer,
  switchBuffer,
} from './bufferEngine';
import {
  openNewTab,
  closeTab,
  closeOtherTabs,
  nextTab,
  prevTab,
  firstTab,
  lastTab,
  moveTab,
} from './tabEngine';
import {
  startDiffSplit,
  diffThis,
  diffOff,
  diffUpdate,
  diffObtain,
  diffPut,
} from './diffEngine';
import {
  openNetrw,
  addNetrwBookmark,
  goToNetrwBookmark,
  formatNetrwBookmarks,
} from './netrwEngine';
import { executeFindFileCommand, openFuzzyFinder } from './fuzzyFinder';
import { openHelp, closeHelp } from './helpEngine';
import { triggerAutocmd } from './autocmdEngine';
import { recordFileSave } from './undoTreeEngine';
import { lookupUserCommand } from './userCommandEngine';
import { msg } from './messages';

export type ExCommandRunner = (state: VimEditorState, cmd: string) => VimEditorState;

/**
 * 창 분할·버퍼·탭·diff·Netrw·저장·종료·도움말 등 작업공간 관련 Ex 명령을 처리합니다.
 * 일치하는 명령이 없으면 null 을 반환합니다.
 */
export function tryExecuteWorkspaceExCommand(
  state: VimEditorState,
  cleanCmdRaw: string,
  cleanCmd: string,
  trimmed: string,
  runEx: ExCommandRunner
): VimEditorState | null {
  const splitMatch = cleanCmdRaw.match(/^(sp|split|vsp|vsplit)(?:\s+(.+))?$/i);
  if (splitMatch) {
    const isVertical = splitMatch[1].toLowerCase().startsWith('v');
    const targetFile = splitMatch[2]?.trim();
    const splitRes = splitWindow(
      state,
      isVertical ? 'vertical' : 'horizontal',
      state.secondaryLines,
      targetFile || state.secondaryFilename
    );
    return {
      ...splitRes,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 새 파일 창 분할: :new, :vnew [filename]
  const newWinMatch = cleanCmdRaw.match(/^(new|vnew)(?:\s+(.+))?$/i);
  if (newWinMatch) {
    const isVertical = newWinMatch[1].toLowerCase() === 'vnew';
    const targetFile = newWinMatch[2]?.trim() || '[No Name]';
    const splitRes = splitWindow(
      state,
      isVertical ? 'vertical' : 'horizontal',
      [''],
      targetFile
    );
    return {
      ...splitRes,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 순정 Vim Diff 모드 분할: :diffsplit, :diffs, :vert diffsplit, :vertical diffsplit
  const diffSplitMatch = cleanCmdRaw.match(/^(?:(vert(?:ical)?|hor(?:izontal)?)\s+)?(diffs(?:plit)?)(?:\s+(.+))?$/i);
  if (diffSplitMatch) {
    const mod = diffSplitMatch[1]?.toLowerCase();
    const isVert = mod ? mod.startsWith('vert') : true; // 기본값 세로(vertical) 분할
    const targetFile = diffSplitMatch[3]?.trim();
    const res = startDiffSplit(state, targetFile, isVert ? 'vertical' : 'horizontal');
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // :diffthis, :difft
  if (cleanCmdRaw.toLowerCase() === 'diffthis' || cleanCmdRaw.toLowerCase() === 'difft') {
    const res = diffThis(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // :diffoff, :diffo, :diffoff!
  if (/^diffo(?:ff)?!?$/i.test(cleanCmdRaw)) {
    const isAll = cleanCmdRaw.includes('!');
    const res = diffOff(state, isAll);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // :diffupdate, :diffu
  if (cleanCmdRaw.toLowerCase() === 'diffupdate' || cleanCmdRaw.toLowerCase() === 'diffu') {
    const res = diffUpdate(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // :diffget, :diffg (do)
  if (cleanCmdRaw.toLowerCase() === 'diffget' || cleanCmdRaw.toLowerCase() === 'diffg') {
    const res = diffObtain(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // :diffput, :diffp (dp)
  if (cleanCmdRaw.toLowerCase() === 'diffput' || cleanCmdRaw.toLowerCase() === 'diffp') {
    const res = diffPut(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 창 닫기: :close, :clo
  if (cleanCmd === 'close' || cleanCmd === 'clo') {
    const res = closeSplitWindow(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 현재 창만 유지: :only, :on
  if (cleanCmd === 'only' || cleanCmd === 'on') {
    const res = closeOtherPanes(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 창 제어 Ex 명령: :wincmd {arg}, :1wincmd w, :2wincmd w 등
  const wincmdMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?wincmd\s+(\S+)$/i);
  if (wincmdMatch) {
    const count = wincmdMatch[1] ? parseInt(wincmdMatch[1], 10) : undefined;
    const arg = wincmdMatch[2];
    const res = executeWincmd(state, arg, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 창 크기 조절: :res, :resize, :vertical res
  const resizeMatch = cleanCmdRaw.match(/^(?:(vertical|vert)\s+)?(?:res|resize)(?:\s+([+-]?\d+|=))?$/i);
  if (resizeMatch) {
    const deltaStr = resizeMatch[2];
    const delta = deltaStr === '=' ? '=' : deltaStr ? parseInt(deltaStr, 10) : 5;
    const res = resizeSplit(state, delta);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퍼지 파일 파인더 팝업: :Files, :FZF
  if (/^(?:Files|FZF|fzf)$/.test(cleanCmdRaw)) {
    const res = openFuzzyFinder(state, 'files');
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퍼지 버퍼 파인더 팝업: :Buffers
  if (/^(?:Buffers)$/.test(cleanCmdRaw)) {
    const res = openFuzzyFinder(state, 'buffers');
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 버퍼 목록 조회: :ls, :buffers, :files (순정 소문자 명령)
  if (cleanCmd === 'ls' || cleanCmdRaw === 'buffers' || cleanCmdRaw === 'files') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatBufferList(state),
    };
  }

  // 버퍼 순회: :bn, :bnext, :bp, :bprev, :bprevious ([count] 지원)
  const bnMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(bn|bnext|bp|bprev|bprevious)$/i);
  if (bnMatch) {
    const count = bnMatch[1] ? parseInt(bnMatch[1], 10) : 1;
    const isNext = bnMatch[2].toLowerCase().startsWith('bn');
    const res = isNext ? nextBuffer(state, count) : prevBuffer(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 버퍼 양 끝 이동: :bf, :bfirst, :bl, :blast
  if (cleanCmd === 'bf' || cleanCmd === 'bfirst') {
    return {
      ...firstBuffer(state),
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }
  if (cleanCmd === 'bl' || cleanCmd === 'blast') {
    return {
      ...lastBuffer(state),
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 버퍼 삭제: :bd, :bdelete, :bdel
  const bdMatch = cleanCmdRaw.match(/^(?:bd|bdelete|bdel)(?:\s+(.+))?$/i);
  if (bdMatch) {
    const target = bdMatch[1]?.trim();
    const res = deleteBuffer(state, target);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 순정 파일 탐색기 Netrw 열기: :Explore, :E, :Vexplore, :Ve, :Sexplore, :Se, :Hexplore, :He, :Texplore, :Te
  const netrwMatch = cleanCmdRaw.match(/^(?:Explore|E|Vexplore|Ve|Sexplore|Se|Hexplore|He|Texplore|Te)(?:\s+(.*))?$/);
  if (netrwMatch) {
    const cmdName = netrwMatch[0].split(/\s+/)[0];
    const targetDir = netrwMatch[1]?.trim() || '';
    let mode: 'current' | 'vsplit' | 'split' | 'tab' = 'current';
    if (cmdName === 'Vexplore' || cmdName === 'Ve') {
      mode = 'vsplit';
    } else if (cmdName === 'Sexplore' || cmdName === 'Se' || cmdName === 'Hexplore' || cmdName === 'He') {
      mode = 'split';
    } else if (cmdName === 'Texplore' || cmdName === 'Te') {
      mode = 'tab';
    }
    const res = openNetrw(state, targetDir, mode);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // Netrw 북마크 목록 조회: :Bookmarks, :BookmarkList
  if (/^(?:Bookmarks|BookmarkList|bmlist)$/i.test(cleanCmdRaw)) {
    const listMsg = formatNetrwBookmarks(state);
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: listMsg,
    };
  }

  // Netrw 북마크 추가: :Bookmark [path]
  const bmMatch = cleanCmdRaw.match(/^(?:Bookmark|bookmark)(?:\s+(.*))?$/);
  if (bmMatch) {
    const rawPath = (bmMatch[1] ?? '').trim();
    let targetPath = rawPath;
    if (!targetPath) {
      if (state.netrw?.isOpen) {
        targetPath = state.netrw.currentPath;
      } else {
        const curFile = state.primaryFilename ?? '';
        const parts = curFile.split('/');
        parts.pop();
        targetPath = parts.join('/');
      }
    }
    const res = addNetrwBookmark(state, targetPath);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // Netrw 북마크 이동: :gb [index]
  const gbMatch = cleanCmdRaw.match(/^gb(?:\s+(\d+))?$/i);
  if (gbMatch) {
    const idx = gbMatch[1] ? parseInt(gbMatch[1], 10) - 1 : undefined;
    const res = goToNetrwBookmark(state, idx);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퍼지 파일 탐색: :find [filename], :fin [filename]
  const findMatch = cleanCmdRaw.match(/^(?:find|fin)(?:\s+(.*))?$/i);
  if (findMatch) {
    const arg = (findMatch[1] ?? '').trim();
    const res = executeFindFileCommand(state, arg);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 파일 열기/새 버퍼 생성: :e, :edit
  const eMatch = cleanCmdRaw.match(/^(?:e|edit)\s+(\S+)$/i);
  if (eMatch) {
    const filename = eMatch[1].trim();
    if (filename === '.' || filename === './') {
      const res = openNetrw(state, '', 'current');
      return {
        ...res,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
      };
    }
    const res = editBuffer(state, filename);
    const postRead = triggerAutocmd(res, 'BufReadPost', { filename }, runEx);
    const entered = triggerAutocmd(postRead, 'BufEnter', { filename }, runEx);
    return {
      ...entered,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 버퍼 전환: :b {target}, :buffer {target}
  const bMatch = cleanCmdRaw.match(/^(?:b|buffer)(?:\s+(.+))?$/i);
  if (bMatch && !cleanCmdRaw.match(/^(?:bn|bnext|bp|bprev|bprevious|bf|bfirst|bl|blast|bd|bdelete|bdel)/i)) {
    const target = bMatch[1]?.trim();
    const leftState = triggerAutocmd(state, 'BufLeave', undefined, runEx);
    const res = target ? switchBuffer(leftState, target) : nextBuffer(leftState, 1);
    const entered = triggerAutocmd(res, 'BufEnter', undefined, runEx);
    return {
      ...entered,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 버퍼 추가: :badd, :bad [+line] {file}
  const baddMatch = cleanCmdRaw.match(/^(?:badd|bad)(?:\s+\+(\d+))?\s+(\S+)$/i);
  if (baddMatch) {
    const lineNum = baddMatch[1] ? parseInt(baddMatch[1], 10) : undefined;
    const file = baddMatch[2];
    const res = addBuffer(state, file, lineNum);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 생성: :tabnew, :tabedit, :tabe [filename]
  const tabNewMatch = cleanCmdRaw.match(/^(?:tabnew|tabedit|tabe)(?:\s+(.+))?$/i);
  if (tabNewMatch) {
    const filename = tabNewMatch[1]?.trim();
    const res = openNewTab(state, filename);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 닫기: :tabc, :tabclose [N]
  const tabCloseMatch = cleanCmdRaw.match(/^(?:tabc|tabclose)(?:\s+(\d+))?$/i);
  if (tabCloseMatch) {
    const targetIdx = tabCloseMatch[1] ? parseInt(tabCloseMatch[1], 10) : undefined;
    const res = closeTab(state, targetIdx);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 다른 탭 모두 닫기: :tabo, :tabonly
  if (cleanCmd === 'tabo' || cleanCmd === 'tabonly') {
    const res = closeOtherTabs(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 순회(다음): :tabn, :tabnext [count]
  const tabNextMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:tabn|tabnext)(?:\s+(\d+))?$/i);
  if (tabNextMatch) {
    const countRaw = tabNextMatch[1] || tabNextMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : undefined;
    const res = nextTab(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 순회(이전): :tabp, :tabprev, :tabprevious [count]
  const tabPrevMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:tabp|tabprev|tabprevious)(?:\s+(\d+))?$/i);
  if (tabPrevMatch) {
    const countRaw = tabPrevMatch[1] || tabPrevMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = prevTab(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 양 끝 이동: :tabfirst, :tabfir, :tabr, :tabrewind, :tablast, :tabl
  if (
    cleanCmd === 'tabfirst' ||
    cleanCmd === 'tabfir' ||
    cleanCmd === 'tabr' ||
    cleanCmd === 'tabrewind'
  ) {
    const res = firstTab(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }
  if (cleanCmd === 'tablast' || cleanCmd === 'tabl') {
    const res = lastTab(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 이동: :tabmove, :tabm [N]
  const tabMoveMatch = cleanCmdRaw.match(/^(?:tabmove|tabm)(?:\s+(.+))?$/i);
  if (tabMoveMatch) {
    const targetPos = tabMoveMatch[1]?.trim();
    const res = moveTab(state, targetPos);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }


  if (
    (cleanCmd === 'w' || cleanCmd === 'write' || cleanCmd === 'update' || cleanCmdRaw === 'up') &&
    !(state.userCommands && lookupUserCommand(state, cleanCmdRaw).kind === 'found')
  ) {
    const preSaved = triggerAutocmd(state, 'BufWritePre', undefined, runEx);
    const savedState = recordFileSave(preSaved);
    const syncedVirtualFiles =
      savedState.virtualFiles && savedState.primaryFilename
        ? { ...savedState.virtualFiles, [savedState.primaryFilename]: [...savedState.lines] }
        : savedState.virtualFiles;
    const postSaved = triggerAutocmd(
      { ...savedState, virtualFiles: syncedVirtualFiles },
      'BufWritePost',
      undefined,
      runEx
    );
    return {
      ...postSaved,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: postSaved.commandMessage || msg('[가상 저장 완료] 변경사항이 안전하게 메모리에 저장되었습니다.'),
    };
  }

  if (cleanCmd === 'q' || cleanCmd === 'quit') {
    if (state.helpSession?.isOpen) {
      const closed = closeHelp(state);
      return {
        ...closed,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
      };
    }
    if (state.splitDirection && state.splitDirection !== 'none') {
      const closed = closeSplitWindow(state);
      return {
        ...closed,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
      };
    }
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('단일 창 상태입니다 (:q)'),
    };
  }

  if (cleanCmd === 'helpclose' || cleanCmd === 'hclose') {
    const closed = closeHelp(state);
    return {
      ...closed,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 순정 Vim 내장 도움말 (:help, :h [topic])
  const helpMatch = trimmed.match(/^:?\s*(?:help|h)(?:\s+(.+))?$/i);
  if (helpMatch) {
    const topic = helpMatch[1]?.trim();
    const opened = openHelp(state, topic);
    return {
      ...opened,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  return null;
}
