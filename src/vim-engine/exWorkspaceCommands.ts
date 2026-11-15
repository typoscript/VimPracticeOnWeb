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
import { changeWorkingDirectory, getEffectiveCwd } from './vfs';
import {
  fileBufferCommand,
  markCurrentBufferSaved,
  newEmptyBuffer,
  quitAllWindows,
  renameBufferForSaveAs,
  writeAllNamedBuffers,
} from './bufferLifecycle';
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
  const finishEx = (res: VimEditorState): VimEditorState => ({
    ...res,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
  });

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
    return finishEx(res);
  }

  // :diffthis, :difft
  if (cleanCmdRaw.toLowerCase() === 'diffthis' || cleanCmdRaw.toLowerCase() === 'difft') {
    return finishEx(diffThis(state));
  }

  // :diffoff, :diffo, :diffoff!
  if (/^diffo(?:ff)?!?$/i.test(cleanCmdRaw)) {
    return finishEx(diffOff(state, cleanCmdRaw.includes('!')));
  }

  // :diffupdate, :diffu
  if (cleanCmdRaw.toLowerCase() === 'diffupdate' || cleanCmdRaw.toLowerCase() === 'diffu') {
    return finishEx(diffUpdate(state));
  }

  // :diffget, :diffg (do)
  if (cleanCmdRaw.toLowerCase() === 'diffget' || cleanCmdRaw.toLowerCase() === 'diffg') {
    return finishEx(diffObtain(state));
  }

  // :diffput, :diffp (dp)
  if (cleanCmdRaw.toLowerCase() === 'diffput' || cleanCmdRaw.toLowerCase() === 'diffp') {
    return finishEx(diffPut(state));
  }

  // 창 닫기: :close, :clo
  if (cleanCmd === 'close' || cleanCmd === 'clo') {
    return finishEx(closeSplitWindow(state));
  }

  // 현재 창만 유지: :only, :on
  if (cleanCmd === 'only' || cleanCmd === 'on') {
    return finishEx(closeOtherPanes(state));
  }

  // 창 제어 Ex 명령: :wincmd {arg}, :1wincmd w, :2wincmd w 등
  const wincmdMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?wincmd\s+(\S+)$/i);
  if (wincmdMatch) {
    const count = wincmdMatch[1] ? parseInt(wincmdMatch[1], 10) : undefined;
    return finishEx(executeWincmd(state, wincmdMatch[2], count));
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

  // 작업 디렉터리 확인/변경: :pwd, :cd [dir], :lcd [dir]
  if (cleanCmd === 'pwd') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: getEffectiveCwd(state),
    };
  }
  const cdMatch = cleanCmdRaw.match(/^(?:cd|chd|chdir|lcd|lchd|lchdir)(?:\s+(.*))?$/);
  if (cdMatch) {
    const res = changeWorkingDirectory(state, cdMatch[1]);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 새 빈 버퍼: :enew[!]
  const enewMatch = cleanCmdRaw.match(/^ene(?:w)?(!)?$/i);
  if (enewMatch) {
    const res = newEmptyBuffer(state, enewMatch[1] === '!');
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 현재 버퍼 파일명 조회/변경: :f[ile] [name]
  const fileMatch = cleanCmdRaw.match(/^(?:f|fi|fil|file)(?:\s+(.*))?$/);
  if (fileMatch) {
    const res = fileBufferCommand(state, fileMatch[1]);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
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

  // 버퍼 삭제·언로드·완전 제거: :bd[!], :bunload[!], :bwipeout[!]
  const bdMatch = cleanCmdRaw.match(/^(bd|bdelete|bdel|bun|bunload|bw|bwipe|bwipeout)(!)?(?:\s+(.+))?$/i);
  if (bdMatch) {
    const sub = bdMatch[1].toLowerCase();
    const force = bdMatch[2] === '!';
    const target = bdMatch[3]?.trim();
    const kind = sub.startsWith('bun') ? 'unload' : sub.startsWith('bw') ? 'wipe' : 'delete';
    const res = deleteBuffer(state, target, force, kind);
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
    return finishEx(addNetrwBookmark(state, targetPath));
  }

  // Netrw 북마크 이동: :gb [index]
  const gbMatch = cleanCmdRaw.match(/^gb(?:\s+(\d+))?$/i);
  if (gbMatch) {
    const idx = gbMatch[1] ? parseInt(gbMatch[1], 10) - 1 : undefined;
    return finishEx(goToNetrwBookmark(state, idx));
  }

  // 퍼지 파일 탐색: :find [filename], :fin [filename]
  const findMatch = cleanCmdRaw.match(/^(?:find|fin)(?:\s+(.*))?$/i);
  if (findMatch) {
    return finishEx(executeFindFileCommand(state, (findMatch[1] ?? '').trim()));
  }

  // 파일 열기/새 버퍼 생성: :e, :edit
  const eMatch = cleanCmdRaw.match(/^(?:e|edit)\s+(\S+)$/i);
  if (eMatch) {
    const filename = eMatch[1].trim();
    if (filename === '.' || filename === './') {
      return finishEx(openNetrw(state, '', 'current'));
    }
    const res = editBuffer(state, filename);
    const postRead = triggerAutocmd(res, 'BufReadPost', { filename }, runEx);
    return finishEx(triggerAutocmd(postRead, 'BufEnter', { filename }, runEx));
  }

  // 버퍼 전환: :b {target}, :buffer {target}
  const bMatch = cleanCmdRaw.match(/^(?:b|buffer)(?:\s+(.+))?$/i);
  if (bMatch && !cleanCmdRaw.match(/^(?:bn|bnext|bp|bprev|bprevious|bf|bfirst|bl|blast|bd|bdelete|bdel)/i)) {
    const target = bMatch[1]?.trim();
    const leftState = triggerAutocmd(state, 'BufLeave', undefined, runEx);
    const res = target ? switchBuffer(leftState, target) : nextBuffer(leftState, 1);
    return finishEx(triggerAutocmd(res, 'BufEnter', undefined, runEx));
  }

  // 버퍼 추가: :badd, :bad [+line] {file}
  const baddMatch = cleanCmdRaw.match(/^(?:badd|bad)(?:\s+\+(\d+))?\s+(\S+)$/i);
  if (baddMatch) {
    const lineNum = baddMatch[1] ? parseInt(baddMatch[1], 10) : undefined;
    return finishEx(addBuffer(state, baddMatch[2], lineNum));
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


  const writeCurrentBuffer = (curState: VimEditorState): VimEditorState => {
    const preSaved = triggerAutocmd(curState, 'BufWritePre', undefined, runEx);
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
    const marked = markCurrentBufferSaved(postSaved);
    return finishEx({
      ...marked,
      commandMessage: marked.commandMessage || msg('[가상 저장 완료] 변경사항이 안전하게 메모리에 저장되었습니다.'),
    });
  };

  const quitCurrentWindow = (curState: VimEditorState, force = false): VimEditorState => {
    if (curState.helpSession?.isOpen) return finishEx(closeHelp(curState));
    if (curState.splitDirection && curState.splitDirection !== 'none') return finishEx(closeSplitWindow(curState));
    return finishEx({
      ...curState,
      commandMessage: curState.commandMessage || (force ? msg('단일 창 종료 무시 (:q!)') : msg('단일 창 상태입니다 (:q)')),
    });
  };

  // 다른 이름으로 저장: :saveas[!] {file}
  const saveasMatch = cleanCmdRaw.match(/^sav(?:e(?:a(?:s)?)?)?(!)?(?:\s+(.*))?$/i);
  if (saveasMatch) {
    const prep = renameBufferForSaveAs(state, saveasMatch[2] ?? '', saveasMatch[1] === '!');
    if (!prep.ok) return finishEx(prep.state);
    const withVfs = {
      ...prep.state,
      virtualFiles: { ...(prep.state.virtualFiles ?? {}), [prep.filename]: [...prep.state.lines] },
    };
    const written = writeCurrentBuffer({ ...withVfs, commandMessage: undefined });
    return finishEx({
      ...written,
      commandMessage: msg('"{filename}" [새로 저장됨] {count}줄', {
        filename: prep.filename,
        count: written.lines.length,
      }),
    });
  }

  // 전체 저장 / 전체 종료: :wa[!], :qa[!], :wqa[!], :xa[!]
  const writeAllMatch = cleanCmdRaw.match(/^(?:wa|wal|wall)(!)?$/i);
  if (writeAllMatch) {
    const res = writeAllNamedBuffers(state);
    if (!res.ok) return finishEx(res.state);
    const recorded = recordFileSave(res.state);
    return finishEx({
      ...recorded,
      commandMessage: msg('{count}개 버퍼를 모두 저장했습니다 (:wall)', { count: res.savedCount }),
    });
  }

  const wqaMatch = cleanCmdRaw.match(/^(?:wqa|wqal|wqall|xa|xal|xall)(!)?$/i);
  if (wqaMatch) {
    const res = writeAllNamedBuffers(state);
    if (!res.ok) return finishEx(res.state);
    const recorded = recordFileSave(res.state);
    return finishEx(quitAllWindows(recorded, true));
  }

  const qaMatch = cleanCmdRaw.match(/^(?:qa|qal|qall)(!)?$/i);
  if (qaMatch) {
    return finishEx(quitAllWindows(state, qaMatch[1] === '!'));
  }

  if (
    (cleanCmd === 'w' || cleanCmd === 'write' || cleanCmd === 'update' || cleanCmdRaw === 'up') &&
    !(state.userCommands && lookupUserCommand(state, cleanCmdRaw).kind === 'found')
  ) {
    return writeCurrentBuffer(state);
  }

  if (cleanCmd === 'wq' || cleanCmd === 'x' || cleanCmd === 'exit' || cleanCmdRaw === 'wq!') {
    const written = writeCurrentBuffer(state);
    return quitCurrentWindow(written, cleanCmdRaw.endsWith('!'));
  }

  if (cleanCmd === 'q' || cleanCmd === 'quit' || cleanCmdRaw === 'q!' || cleanCmdRaw === 'quit!') {
    return quitCurrentWindow(state, cleanCmdRaw.endsWith('!'));
  }

  if (cleanCmd === 'helpclose' || cleanCmd === 'hclose') {
    return finishEx(closeHelp(state));
  }

  // 순정 Vim 내장 도움말 (:help, :h [topic])
  const helpMatch = trimmed.match(/^:?\s*(?:help|h)(?:\s+(.+))?$/i);
  if (helpMatch) {
    return finishEx(openHelp(state, helpMatch[1]?.trim()));
  }

  return null;
}
