import { SplitPlacement, VimEditorState } from './types';
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
import { openOilBuffer, closeOilBuffer, applyOilBufferChanges } from './oilEngine';
import { executeHarpoonCommand } from './harpoonEngine';
import { executeFindFileCommand, openFuzzyFinder } from './fuzzyFinder';
import { openHelp, closeHelp } from './helpEngine';
import { triggerAutocmd } from './autocmdEngine';
import { getOptions } from './setEngine';
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

/** Ex 명령 실행 후 COMMAND 모드를 정리하고 NORMAL 모드로 복귀합니다. */
export function finishEx(
  res: VimEditorState,
  overrides?: Partial<VimEditorState>
): VimEditorState {
  return {
    ...res,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    ...overrides,
  };
}

const SPLIT_MODIFIER_PREFIX_RE =
  /^(topleft|to|botright|bo|aboveleft|abo|leftabove|lefta|belowright|bel|rightbelow|rightb|vertical|vert|horizontal|hor)\s+([\s\S]+)$/i;

function parseSplitModifiers(raw: string): {
  placement: SplitPlacement;
  dirOverride?: 'horizontal' | 'vertical';
  rest: string;
} {
  let placement: SplitPlacement = 'default';
  let dirOverride: 'horizontal' | 'vertical' | undefined;
  let rest = raw;

  for (;;) {
    const m = rest.match(SPLIT_MODIFIER_PREFIX_RE);
    if (!m) break;
    const mod = m[1].toLowerCase();
    if (mod === 'topleft' || mod === 'to') placement = 'topleft';
    else if (mod === 'botright' || mod === 'bo') placement = 'botright';
    else if (mod === 'aboveleft' || mod === 'abo' || mod === 'leftabove' || mod === 'lefta') {
      placement = 'aboveleft';
    } else if (mod === 'belowright' || mod === 'bel' || mod === 'rightbelow' || mod === 'rightb') {
      placement = 'belowright';
    } else if (mod === 'vertical' || mod === 'vert') {
      dirOverride = 'vertical';
    } else if (mod === 'horizontal' || mod === 'hor') {
      dirOverride = 'horizontal';
    }
    rest = m[2].trimStart();
  }

  return { placement, dirOverride, rest };
}

function tryExecuteSplitAndDiffCommand(
  state: VimEditorState,
  cleanCmdRaw: string,
  cleanCmd: string
): VimEditorState | null {
  const { placement, dirOverride, rest: splitRest } = parseSplitModifiers(cleanCmdRaw);

  const splitMatch = splitRest.match(/^(sp|split|vsp|vsplit)(?:\s+(.+))?$/i);
  if (splitMatch) {
    const baseDir: 'horizontal' | 'vertical' = splitMatch[1].toLowerCase().startsWith('v')
      ? 'vertical'
      : 'horizontal';
    const direction = dirOverride ?? baseDir;
    const targetFile = splitMatch[2]?.trim();
    const isAlreadySplit = Boolean(
      state.splitDirection &&
        state.splitDirection !== 'none' &&
        state.splitPanes &&
        state.splitPanes.length >= 2
    );
    let targetLines: string[] | undefined = isAlreadySplit ? undefined : state.secondaryLines;
    if (targetFile) {
      const matchedPane = state.splitPanes?.find((p) => p.filename === targetFile);
      const matchedBuf = state.buffers?.find((b) => b.name === targetFile);
      const matchedVfs = state.virtualFiles?.[targetFile] ?? state.netrw?.files?.[targetFile];
      if (matchedPane) {
        const matchedIdx = state.splitPanes!.indexOf(matchedPane);
        targetLines =
          matchedIdx === (state.activePaneIndex ?? 0) ? [...state.lines] : [...matchedPane.lines];
      } else if (matchedBuf) {
        targetLines = [...matchedBuf.lines];
      } else if (matchedVfs) {
        targetLines = [...matchedVfs];
      }
    }
    return finishEx(
      splitWindow(
        state,
        direction,
        targetLines,
        targetFile || (isAlreadySplit ? undefined : state.secondaryFilename),
        placement
      )
    );
  }

  // 새 파일 창 분할: :new, :vnew [filename] (+ 배치 모디파이어 지원)
  const newWinMatch = splitRest.match(/^(new|vnew)(?:\s+(.+))?$/i);
  if (newWinMatch) {
    const baseDir: 'horizontal' | 'vertical' =
      newWinMatch[1].toLowerCase() === 'vnew' ? 'vertical' : 'horizontal';
    const direction = dirOverride ?? baseDir;
    const targetFile = newWinMatch[2]?.trim() || '[No Name]';
    return finishEx(splitWindow(state, direction, [''], targetFile, placement));
  }

  // 순정 Vim Diff 모드 분할: :diffsplit, :diffs, :vert diffsplit, :vertical diffsplit
  const diffSplitMatch = cleanCmdRaw.match(
    /^(?:(vert(?:ical)?|hor(?:izontal)?)\s+)?(diffs(?:plit)?)(?:\s+(.+))?$/i
  );
  if (diffSplitMatch) {
    const mod = diffSplitMatch[1]?.toLowerCase();
    const isVert = mod ? mod.startsWith('vert') : true;
    const targetFile = diffSplitMatch[3]?.trim();
    return finishEx(startDiffSplit(state, targetFile, isVert ? 'vertical' : 'horizontal'));
  }

  if (cleanCmd === 'diffthis' || cleanCmd === 'difft') {
    return finishEx(diffThis(state));
  }
  if (/^diffo(?:ff)?!?$/i.test(cleanCmdRaw)) {
    return finishEx(diffOff(state, cleanCmdRaw.includes('!')));
  }
  if (cleanCmd === 'diffupdate' || cleanCmd === 'diffu') {
    return finishEx(diffUpdate(state));
  }
  if (cleanCmd === 'diffget' || cleanCmd === 'diffg') {
    return finishEx(diffObtain(state));
  }
  if (cleanCmd === 'diffput' || cleanCmd === 'diffp') {
    return finishEx(diffPut(state));
  }

  // 창 닫기 / 단독화 / 제어 / 크기 조절
  if (cleanCmd === 'close' || cleanCmd === 'clo') {
    return finishEx(closeSplitWindow(state));
  }
  if (cleanCmd === 'only' || cleanCmd === 'on') {
    return finishEx(closeOtherPanes(state));
  }

  const wincmdMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?wincmd\s+(\S+)$/i);
  if (wincmdMatch) {
    const count = wincmdMatch[1] ? parseInt(wincmdMatch[1], 10) : undefined;
    return finishEx(executeWincmd(state, wincmdMatch[2], count));
  }

  const resizeMatch = cleanCmdRaw.match(/^(?:(vertical|vert)\s+)?(?:res|resize)(?:\s+([+-]?\d+|=))?$/i);
  if (resizeMatch) {
    const axis = resizeMatch[1] ? 'vertical' : 'horizontal';
    const deltaStr = resizeMatch[2];
    const delta = deltaStr === '=' ? '=' : deltaStr ? parseInt(deltaStr, 10) : 5;
    return finishEx(resizeSplit(state, delta, axis));
  }

  return null;
}

function tryExecuteBufferListAndCwdCommand(
  state: VimEditorState,
  cleanCmdRaw: string,
  cleanCmd: string
): VimEditorState | null {
  // 퍼지 파인더 팝업: :Files, :FZF, :Buffers
  if (/^(?:Files|FZF|fzf)$/.test(cleanCmdRaw)) {
    return finishEx(openFuzzyFinder(state, 'files'));
  }
  const liveGrepMatch = cleanCmdRaw.match(/^(?:LiveGrep|Rg)(?:\s+(.*))?$/);
  if (liveGrepMatch) {
    return finishEx(openFuzzyFinder(state, 'grep', liveGrepMatch[1]?.trim() ?? ''));
  }
  if (/^(?:Buffers)$/.test(cleanCmdRaw)) {
    return finishEx(openFuzzyFinder(state, 'buffers'));
  }

  // 버퍼 목록 조회: :ls, :buffers, :files (순정 소문자 명령)
  if (cleanCmd === 'ls' || cleanCmdRaw === 'buffers' || cleanCmdRaw === 'files') {
    return finishEx(state, { commandMessage: formatBufferList(state) });
  }

  // 작업 디렉터리 확인/변경: :pwd, :cd [dir], :lcd [dir], :tcd [dir]
  if (cleanCmd === 'pwd') {
    return finishEx(state, { commandMessage: getEffectiveCwd(state) });
  }
  const cdMatch = cleanCmdRaw.match(/^(cd|chd|chdir|lcd|lchd|lchdir|tcd|tchd|tchdir)(?:\s+(.*))?$/);
  if (cdMatch) {
    const scope = cdMatch[1].startsWith('l')
      ? 'window'
      : cdMatch[1].startsWith('t')
        ? 'tab'
        : 'global';
    return finishEx(changeWorkingDirectory(state, cdMatch[2], scope));
  }

  // 새 빈 버퍼: :enew[!]
  const enewMatch = cleanCmdRaw.match(/^ene(?:w)?(!)?$/i);
  if (enewMatch) {
    return finishEx(newEmptyBuffer(state, enewMatch[1] === '!'));
  }

  // 현재 버퍼 파일명 조회/변경: :f[ile] [name]
  const fileMatch = cleanCmdRaw.match(/^(?:f|fi|fil|file)(?:\s+(.*))?$/);
  if (fileMatch) {
    return finishEx(fileBufferCommand(state, fileMatch[1]));
  }

  // 버퍼 순회 및 양 끝 이동: :bn, :bp, :bf, :bl
  const bnMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(bn|bnext|bp|bprev|bprevious)$/i);
  if (bnMatch) {
    const count = bnMatch[1] ? parseInt(bnMatch[1], 10) : 1;
    const isNext = bnMatch[2].toLowerCase().startsWith('bn');
    return finishEx(isNext ? nextBuffer(state, count) : prevBuffer(state, count));
  }
  if (cleanCmd === 'bf' || cleanCmd === 'bfirst') {
    return finishEx(firstBuffer(state));
  }
  if (cleanCmd === 'bl' || cleanCmd === 'blast') {
    return finishEx(lastBuffer(state));
  }

  // 버퍼 삭제·언로드·완전 제거: :bd[!], :bunload[!], :bwipeout[!]
  const bdMatch = cleanCmdRaw.match(/^(bd|bdelete|bdel|bun|bunload|bw|bwipe|bwipeout)(!)?(?:\s+(.+))?$/i);
  if (bdMatch) {
    const sub = bdMatch[1].toLowerCase();
    const force = bdMatch[2] === '!';
    const target = bdMatch[3]?.trim();
    const kind = sub.startsWith('bun') ? 'unload' : sub.startsWith('bw') ? 'wipe' : 'delete';
    return finishEx(deleteBuffer(state, target, force, kind));
  }

  return null;
}

function tryExecuteNetrwAndBufferSwitchCommand(
  state: VimEditorState,
  cleanCmdRaw: string,
  runEx: ExCommandRunner
): VimEditorState | null {
  // oil.nvim 스타일 버퍼 기반 디렉터리 편집기: :Oil [dir]
  const oilMatch = cleanCmdRaw.match(/^Oil(?:\s+(.*))?$/i);
  if (oilMatch) {
    return finishEx(openOilBuffer(state, oilMatch[1]?.trim()));
  }

  // harpoon.nvim 스타일 파일 핀 & 빠른 전환: :Harpoon, :HarpoonAdd, :HarpoonMenu, :HarpoonNext, :HarpoonPrev, :HarpoonRemove, :HarpoonClear
  const harpoonMatch = cleanCmdRaw.match(
    /^(Harpoon(?:Add|Menu|Next|Prev|Remove|Clear)?)(?:\s+(.*))?$/i
  );
  if (harpoonMatch) {
    return finishEx(executeHarpoonCommand(state, harpoonMatch[1], harpoonMatch[2] ?? ''));
  }

  // 순정 파일 탐색기 Netrw 열기: :Explore, :E, :Vexplore, :Ve, :Sexplore, :Se, :Hexplore, :He, :Texplore, :Te
  const netrwMatch = cleanCmdRaw.match(
    /^(?:Explore|E|Vexplore|Ve|Sexplore|Se|Hexplore|He|Texplore|Te)(?:\s+(.*))?$/
  );
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
    return finishEx(openNetrw(state, targetDir, mode));
  }

  // Netrw 북마크 조회/추가/이동
  if (/^(?:Bookmarks|BookmarkList|bmlist)$/i.test(cleanCmdRaw)) {
    return finishEx(state, { commandMessage: formatNetrwBookmarks(state) });
  }
  const bmMatch = cleanCmdRaw.match(/^(?:Bookmark|bookmark)(?:\s+(.*))?$/);
  if (bmMatch) {
    let targetPath = (bmMatch[1] ?? '').trim();
    if (!targetPath) {
      if (state.netrw?.isOpen) {
        targetPath = state.netrw.currentPath;
      } else {
        const parts = (state.primaryFilename ?? '').split('/');
        parts.pop();
        targetPath = parts.join('/');
      }
    }
    return finishEx(addNetrwBookmark(state, targetPath));
  }
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
  if (
    bMatch &&
    !cleanCmdRaw.match(/^(?:bn|bnext|bp|bprev|bprevious|bf|bfirst|bl|blast|bd|bdelete|bdel)/i)
  ) {
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

  return null;
}

function tryExecuteTabCommand(
  state: VimEditorState,
  cleanCmdRaw: string,
  cleanCmd: string
): VimEditorState | null {
  const tabNewMatch = cleanCmdRaw.match(/^(?:tabnew|tabedit|tabe)(?:\s+(.+))?$/i);
  if (tabNewMatch) {
    return finishEx(openNewTab(state, tabNewMatch[1]?.trim()));
  }

  const tabCloseMatch = cleanCmdRaw.match(/^(?:tabc|tabclose)(?:\s+(\d+))?$/i);
  if (tabCloseMatch) {
    const targetIdx = tabCloseMatch[1] ? parseInt(tabCloseMatch[1], 10) : undefined;
    return finishEx(closeTab(state, targetIdx));
  }

  if (cleanCmd === 'tabo' || cleanCmd === 'tabonly') {
    return finishEx(closeOtherTabs(state));
  }

  const tabNextMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:tabn|tabnext)(?:\s+(\d+))?$/i);
  if (tabNextMatch) {
    const countRaw = tabNextMatch[1] || tabNextMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : undefined;
    return finishEx(nextTab(state, count));
  }

  const tabPrevMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:tabp|tabprev|tabprevious)(?:\s+(\d+))?$/i);
  if (tabPrevMatch) {
    const countRaw = tabPrevMatch[1] || tabPrevMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    return finishEx(prevTab(state, count));
  }

  if (
    cleanCmd === 'tabfirst' ||
    cleanCmd === 'tabfir' ||
    cleanCmd === 'tabr' ||
    cleanCmd === 'tabrewind'
  ) {
    return finishEx(firstTab(state));
  }
  if (cleanCmd === 'tablast' || cleanCmd === 'tabl') {
    return finishEx(lastTab(state));
  }

  const tabMoveMatch = cleanCmdRaw.match(/^(?:tabmove|tabm)(?:\s+(.+))?$/i);
  if (tabMoveMatch) {
    return finishEx(moveTab(state, tabMoveMatch[1]?.trim()));
  }

  return null;
}

function tryExecuteSaveQuitAndHelpCommand(
  state: VimEditorState,
  cleanCmdRaw: string,
  cleanCmd: string,
  trimmed: string,
  runEx: ExCommandRunner
): VimEditorState | null {
  const writeCurrentBuffer = (curState: VimEditorState, force = false): VimEditorState => {
    if (curState.oilSession?.isOpen) {
      return finishEx(applyOilBufferChanges(curState));
    }
    if (!force && getOptions(curState).readonly === true) {
      return finishEx(curState, {
        bell: true,
        commandMessage: msg('E45: \'readonly\' 옵션이 설정되어 있습니다 (덮어쓰려면 ! 추가)'),
      });
    }
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
    return finishEx(marked, {
      commandMessage:
        marked.commandMessage ||
        msg('[가상 저장 완료] 변경사항이 안전하게 메모리에 저장되었습니다.'),
    });
  };

  const quitCurrentWindow = (curState: VimEditorState, force = false): VimEditorState => {
    if (curState.oilSession?.isOpen) return finishEx(closeOilBuffer(curState));
    if (curState.helpSession?.isOpen) return finishEx(closeHelp(curState));
    if (curState.splitDirection && curState.splitDirection !== 'none') {
      return finishEx(closeSplitWindow(curState));
    }
    return finishEx(curState, {
      commandMessage:
        curState.commandMessage ||
        (force ? msg('단일 창 종료 무시 (:q!)') : msg('단일 창 상태입니다 (:q)')),
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
    return finishEx(written, {
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
    return finishEx(recorded, {
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
    (cleanCmd === 'w' ||
      cleanCmd === 'write' ||
      cleanCmd === 'update' ||
      cleanCmdRaw === 'up' ||
      cleanCmd === 'w!' ||
      cleanCmd === 'write!' ||
      cleanCmd === 'update!' ||
      cleanCmdRaw === 'up!') &&
    !(state.userCommands && lookupUserCommand(state, cleanCmdRaw).kind === 'found')
  ) {
    return writeCurrentBuffer(state, cleanCmdRaw.endsWith('!'));
  }

  if (
    cleanCmd === 'wq' ||
    cleanCmd === 'x' ||
    cleanCmd === 'exit' ||
    cleanCmdRaw === 'wq!' ||
    cleanCmdRaw === 'x!' ||
    cleanCmdRaw === 'exit!'
  ) {
    const force = cleanCmdRaw.endsWith('!');
    const written = writeCurrentBuffer(state, force);
    if (written.bell) return written;
    return quitCurrentWindow(written, force);
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
  return (
    tryExecuteSplitAndDiffCommand(state, cleanCmdRaw, cleanCmd) ??
    tryExecuteBufferListAndCwdCommand(state, cleanCmdRaw, cleanCmd) ??
    tryExecuteNetrwAndBufferSwitchCommand(state, cleanCmdRaw, runEx) ??
    tryExecuteTabCommand(state, cleanCmdRaw, cleanCmd) ??
    tryExecuteSaveQuitAndHelpCommand(state, cleanCmdRaw, cleanCmd, trimmed, runEx)
  );
}
