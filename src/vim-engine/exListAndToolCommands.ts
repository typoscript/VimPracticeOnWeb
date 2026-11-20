import { VimEditorState } from './types';
import { formatChangeList } from './advancedMotions';
import { formatMarksList, formatJumpsList, clearJumps, deleteMarks } from './marks';
import { formatRegisters } from './registers';
import { formatCommandHistory } from './cmdlineWindow';
import { executeSetCommand } from './setEngine';
import { runtimeScript, sourceScript } from './sourceEngine';
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
import {
  registerKeymap,
  unregisterKeymap,
  formatKeymapsList,
  parseMapRest,
  parseUnmapRest,
} from './keymapEngine';
import { executeAbbrevCommand } from './abbrevEngine';
import { executeUserCommandDefinition } from './userCommandEngine';
import { executeDigraphCommand } from './digraphs';
import { describeCharAt } from './engineHelpers';
import { msg } from './messages';
import { tryExecuteQuickfixExCommand } from './exQuickfixCommands';
import { tryExecuteBatchAndUndoExCommand } from './exBatchAndUndoCommands';
import { finishEx } from './exWorkspaceCommands';
import type { ExCommandRunner } from './exWorkspaceCommands';

function tryExecuteHistoryMarkAndRegisterCommand(
  state: VimEditorState,
  cleanCmdRaw: string,
  cleanCmd: string
): VimEditorState | null {
  // 커맨드라인/검색 히스토리 조회: :his, :history [: | / | ? | all]
  const hisMatch = cleanCmdRaw.match(/^his(?:t(?:o(?:r(?:y)?)?)?)?(?:\s+(.*))?$/);
  if (hisMatch) {
    return finishEx(state, { commandMessage: formatCommandHistory(state, hisMatch[1] ?? '') });
  }

  // 체인지 리스트 조회: :changes
  if (cleanCmd === 'changes') {
    return finishEx(state, { commandMessage: formatChangeList(state) });
  }

  // 마크/점프 뷰어 닫기: :marks close, :jumps close, :marksclose, :jumpsclose
  if (
    /^(?:marks|jumps)\s+close$/i.test(cleanCmdRaw) ||
    cleanCmdRaw === 'marksclose' ||
    cleanCmdRaw === 'jumpsclose'
  ) {
    return finishEx(state, {
      showMarksVisualizer: false,
      commandMessage: msg('마크/점프 뷰어 닫힘'),
    });
  }

  // 마크 목록 조회: :marks [filter]
  const marksMatch = cleanCmdRaw.match(/^(?:marks)(?:\s+(.*))?$/i);
  if (marksMatch) {
    return finishEx(state, {
      showMarksVisualizer: true,
      commandMessage: formatMarksList(state, marksMatch[1]?.trim()),
    });
  }

  // 점프 목록 조회/초기화: :jumps, :clearjumps, :cle
  if (/^jumps$/i.test(cleanCmdRaw)) {
    return finishEx(state, {
      showMarksVisualizer: true,
      commandMessage: formatJumpsList(state),
    });
  }
  if (/^(?:clearjumps|cle)$/i.test(cleanCmdRaw)) {
    return finishEx(clearJumps(state));
  }

  // 마크 삭제: :delmarks[!] [args], :delm[!] [args]
  const delmarksMatch = cleanCmdRaw.match(/^(?:delmarks|delm)(!?)(?:\s+(.*))?$/i);
  if (delmarksMatch) {
    return finishEx(deleteMarks(state, delmarksMatch[2]?.trim() ?? '', delmarksMatch[1] === '!'));
  }

  // 레지스터 뷰어 닫기/조회: :reg, :registers, :display, :di
  if (/^(?:reg|registers|display|di)\s+close$/i.test(cleanCmdRaw) || cleanCmdRaw === 'regclose') {
    return finishEx(state, {
      showRegisterInspector: false,
      commandMessage: msg('레지스터 뷰어 닫힘'),
    });
  }
  const regMatch = cleanCmdRaw.match(/^(?:reg|registers|display|di)(?:!?)(?:\s+(.*))?$/i);
  if (regMatch) {
    return finishEx(state, {
      showRegisterInspector: true,
      commandMessage: formatRegisters(state, regMatch[1]?.trim()),
    });
  }

  return null;
}

function runSetWithFiletypeAutocmd(
  state: VimEditorState,
  rawArgs: string,
  scope: 'both' | 'local' | 'global',
  runEx: ExCommandRunner
): VimEditorState {
  const res = executeSetCommand(state, rawArgs, scope);
  const finalRes =
    res.options?.filetype && res.options.filetype !== state.options?.filetype
      ? triggerAutocmd(res, 'FileType', { filetype: res.options.filetype }, runEx)
      : res;
  return finishEx(finalRes);
}

function tryExecuteOptionAndScriptCommand(
  state: VimEditorState,
  cleanCmdRaw: string,
  runEx: ExCommandRunner
): VimEditorState | null {
  // :setlocal / :setglobal / :set
  const setlocalMatch = cleanCmdRaw.match(/^(?:setlocal|setl)(?:\s+(.*))?$/i);
  if (setlocalMatch) {
    return runSetWithFiletypeAutocmd(state, setlocalMatch[1] ?? '', 'local', runEx);
  }
  const setglobalMatch = cleanCmdRaw.match(/^(?:setglobal|setg)(?:\s+(.*))?$/i);
  if (setglobalMatch) {
    return runSetWithFiletypeAutocmd(state, setglobalMatch[1] ?? '', 'global', runEx);
  }
  const setMatch = cleanCmdRaw.match(/^(?:set|se)(?:\s+(.*))?$/i);
  if (setMatch) {
    return runSetWithFiletypeAutocmd(state, setMatch[1] ?? '', 'both', runEx);
  }

  // 파일타입 플러그인/인덴트 제어: :filetype [args]
  const filetypeMatch = cleanCmdRaw.match(/^filetype(?:\s+(.*))?$/i);
  if (filetypeMatch) {
    return finishEx(executeFiletypeCommand(state, filetypeMatch[1] ?? ''));
  }

  // .vimrc / 설정 내보내기 및 키바인딩 모달 열기
  if (/^(?:vimrc|config|export|keymap|keymaps|mapconfig)$/i.test(cleanCmdRaw)) {
    return finishEx(state, {
      showConfigModal: true,
      commandMessage: msg('설정 및 .vimrc 내보내기/다운로드 창 열림'),
    });
  }

  // 스크립트 소싱/런타임/세션 저장: :source, :runtime, :mksession
  const sourceMatch = cleanCmdRaw.match(/^(?:source|so)(?:\s+(.*))?$/i);
  if (sourceMatch) {
    return finishEx(sourceScript(state, sourceMatch[1]?.trim() || '%', runEx));
  }
  const runtimeMatch = cleanCmdRaw.match(/^(?:runtime|ru)(!)?(?:\s+(.*))?$/i);
  if (runtimeMatch) {
    return finishEx(runtimeScript(state, runtimeMatch[2] ?? '', Boolean(runtimeMatch[1]), runEx));
  }
  const mksessionMatch = cleanCmdRaw.match(/^(?:mksession|mks)(!?)(?:\s+(.*))?$/i);
  if (mksessionMatch) {
    const filename = mksessionMatch[2]?.trim() || 'Session.vim';
    return finishEx(executeMakeSession(state, filename, Boolean(mksessionMatch[1])));
  }

  // 자동 명령: :augroup, :autocmd!, :doautocmd, :autocmd
  const augroupMatch = cleanCmdRaw.match(/^(?:augroup|aug)(!?)(?:\s+(.*))?$/i);
  if (augroupMatch) {
    return finishEx(executeAugroupCommand(state, augroupMatch[2] ?? '', Boolean(augroupMatch[1])));
  }
  const autocmdBangMatch = cleanCmdRaw.match(/^(?:autocmd|au)!\s*(.*)$/i);
  if (autocmdBangMatch) {
    return finishEx(executeDeleteAutocmd(state, autocmdBangMatch[1] ?? ''));
  }
  const doautocmdMatch = cleanCmdRaw.match(/^(?:doautocmd|doau)(?:\s+(.*))?$/i);
  if (doautocmdMatch) {
    return finishEx(executeDoAutocmd(state, doautocmdMatch[1] ?? '', runEx));
  }
  const autocmdMatch = cleanCmdRaw.match(/^(?:autocmd|au)(?:\s+(.*))?$/i);
  if (autocmdMatch) {
    return finishEx(executeAutocmdCommand(state, autocmdMatch[1] ?? ''));
  }

  // 구문 강조 제어: :syntax, :syn
  const syntaxMatch = cleanCmdRaw.match(/^(?:syntax|syn)(?:\s+(.*))?$/i);
  if (syntaxMatch) {
    return finishEx(executeSyntaxCommand(state, syntaxMatch[1] ?? ''));
  }

  return null;
}

function tryExecuteTagCommand(
  state: VimEditorState,
  cleanCmdRaw: string
): VimEditorState | null {
  if (/^tags$/i.test(cleanCmdRaw)) {
    return finishEx(state, { commandMessage: formatTagStack(state) });
  }

  const popMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:pop|po)$/i);
  if (popMatch) {
    const count = popMatch[1] ? parseInt(popMatch[1], 10) : 1;
    return finishEx(popTagStack(state, count));
  }

  const tagMatch = cleanCmdRaw.match(/^(?:tag|ta)(?:\s+(.*))?$/i);
  if (tagMatch) {
    return finishEx(jumpToTag(state, tagMatch[1]?.trim() || ''));
  }

  const tselectMatch = cleanCmdRaw.match(/^(?:tselect|ts)(?:\s+(.*))?$/i);
  if (tselectMatch) {
    return finishEx(tselectTag(state, tselectMatch[1]?.trim() || ''));
  }

  const tjumpMatch = cleanCmdRaw.match(/^(?:tjump|tj)(?:\s+(.*))?$/i);
  if (tjumpMatch) {
    return finishEx(tjumpTag(state, tjumpMatch[1]?.trim() || ''));
  }

  const tnextMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:tnext|tn)$/i);
  if (tnextMatch) {
    const count = tnextMatch[1] ? parseInt(tnextMatch[1], 10) : 1;
    return finishEx(cycleTagMatch(state, 'next', count));
  }

  const tprevMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:tprev|tprevious|tp)$/i);
  if (tprevMatch) {
    const count = tprevMatch[1] ? parseInt(tprevMatch[1], 10) : 1;
    return finishEx(cycleTagMatch(state, 'prev', count));
  }

  if (/^(?:tfirst|tf|trewind|tr)$/i.test(cleanCmdRaw)) {
    return finishEx(cycleTagMatch(state, 'first'));
  }
  if (/^(?:tlast|tl)$/i.test(cleanCmdRaw)) {
    return finishEx(cycleTagMatch(state, 'last'));
  }

  return null;
}

function tryExecuteMappingAndMiscToolCommand(
  state: VimEditorState,
  cleanCmdRaw: string,
  trimmed: string
): VimEditorState | null {
  // 리더 키(Leader Key) 설정: :let mapleader = " "
  const leaderMatch = trimmed.match(/^:?\s*let\s+(?:g:)?mapleader\s*=\s*(["'])(.*?)\1/i);
  if (leaderMatch) {
    let newLeader = leaderMatch[2];
    if (newLeader.toLowerCase() === '<space>') newLeader = ' ';
    return finishEx(state, {
      leaderKey: newLeader,
      commandMessage: msg('[리더 키 설정] mapleader = "{v}"', {
        v: newLeader === ' ' ? '<Space>' : newLeader,
      }),
    });
  }

  // 키매핑 목록 조회: :map, :nmap, :imap, :vmap, :xmap, :omap, :cmap 등 (인자 없음)
  const listMatch = trimmed.match(
    /^:?\s*(map|nmap|imap|vmap|xmap|omap|cmap|noremap|nnoremap|inoremap|vnoremap|xnoremap|onoremap|cnoremap)$/i
  );
  if (listMatch) {
    const cmd = listMatch[1].toLowerCase();
    let modeFilter = 'all';
    if (cmd.startsWith('i')) modeFilter = 'i';
    else if (cmd.startsWith('n') && !cmd.startsWith('nore')) modeFilter = 'n';
    else if (cmd.startsWith('v')) modeFilter = 'v';
    else if (cmd.startsWith('x')) modeFilter = 'x';
    else if (cmd.startsWith('o')) modeFilter = 'o';
    else if (cmd.startsWith('c')) modeFilter = 'c';
    return finishEx(state, { commandMessage: formatKeymapsList(state, modeFilter) });
  }

  // 커스텀 키매핑 등록
  const mapMatch = trimmed.match(
    /^:?\s*(nmap|nnoremap|imap|inoremap|vmap|vnoremap|xmap|xnoremap|omap|onoremap|cmap|cnoremap|map|noremap)\s+([\s\S]+)$/i
  );
  if (mapMatch) {
    const parsed = parseMapRest(mapMatch[2]);
    if (parsed) {
      return registerKeymap(state, mapMatch[1], parsed.lhs, parsed.rhs, parsed.modifiers);
    }
  }

  // 사용자 정의 명령 등록·삭제·목록: :command[!], :delcommand, :comclear
  const userCmdDef = executeUserCommandDefinition(state, cleanCmdRaw);
  if (userCmdDef) {
    return userCmdDef;
  }

  // 키매핑 해제: :unmap, :nunmap, :iunmap, :vunmap, :xunmap, :ounmap, :cunmap
  const unmapMatch = trimmed.match(
    /^:?\s*(unmap|nunmap|iunmap|vunmap|xunmap|ounmap|cunmap)\s+([\s\S]+)$/i
  );
  if (unmapMatch) {
    const parsed = parseUnmapRest(unmapMatch[2]);
    if (parsed) {
      return unregisterKeymap(state, unmapMatch[1], parsed.lhs, { buffer: parsed.buffer });
    }
  }

  // 약어: :iabbrev, :cabbrev, :abbrev, :unabbrev, :abclear 등
  const abbrevRes = executeAbbrevCommand(state, trimmed);
  if (abbrevRes) return abbrevRes;

  // :ascii / :as — 커서 아래 문자 정보 출력 (ga 와 동일)
  if (/^(?:as|ascii)$/i.test(cleanCmdRaw)) {
    const curLine = state.lines[state.cursor.line] ?? '';
    return finishEx(state, {
      commandCursorCol: undefined,
      digraphPending: undefined,
      commandMessage: describeCharAt(curLine, state.cursor.col),
    });
  }

  // :digraphs / :dig [{c1}{c2} {code} ...]
  const digMatch = cleanCmdRaw.match(/^(?:dig|digraph|digraphs)(?:!)?(?:\s+(.*))?$/i);
  if (digMatch) {
    return executeDigraphCommand(state, digMatch[1] ?? '');
  }

  return null;
}

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
  return (
    tryExecuteQuickfixExCommand(state, cleanCmdRaw, cleanCmd, runEx) ??
    tryExecuteHistoryMarkAndRegisterCommand(state, cleanCmdRaw, cleanCmd) ??
    tryExecuteOptionAndScriptCommand(state, cleanCmdRaw, runEx) ??
    tryExecuteTagCommand(state, cleanCmdRaw) ??
    tryExecuteBatchAndUndoExCommand(state, cleanCmdRaw, cleanCmd, trimmed, runEx) ??
    tryExecuteMappingAndMiscToolCommand(state, cleanCmdRaw, trimmed)
  );
}
