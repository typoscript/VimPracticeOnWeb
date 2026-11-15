import { VimEditorState } from './types';
import { formatChangeList } from './advancedMotions';
import { formatMarksList, formatJumpsList, clearJumps, deleteMarks } from './marks';
import { formatRegisters } from './registers';
import { formatCommandHistory } from './cmdlineWindow';
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
import { registerKeymap, unregisterKeymap, formatKeymapsList, parseMapRest, parseUnmapRest } from './keymapEngine';
import { executeAbbrevCommand } from './abbrevEngine';
import { executeUserCommandDefinition } from './userCommandEngine';
import { executeDigraphCommand } from './digraphs';
import { describeCharAt } from './engineHelpers';
import { msg } from './messages';
import { tryExecuteQuickfixExCommand } from './exQuickfixCommands';
import { tryExecuteBatchAndUndoExCommand } from './exBatchAndUndoCommands';
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
  const qfResult = tryExecuteQuickfixExCommand(state, cleanCmdRaw, cleanCmd, runEx);
  if (qfResult) return qfResult;

  // 커맨드라인/검색 히스토리 조회: :his, :history [: | / | ? | all]
  const hisMatch = cleanCmdRaw.match(/^his(?:t(?:o(?:r(?:y)?)?)?)?(?:\s+(.*))?$/);
  if (hisMatch) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatCommandHistory(state, hisMatch[1] ?? ''),
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

  const batchOrUndoResult = tryExecuteBatchAndUndoExCommand(
    state,
    cleanCmdRaw,
    cleanCmd,
    trimmed,
    runEx
  );
  if (batchOrUndoResult) return batchOrUndoResult;

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
    /^:?\s*(nmap|nnoremap|imap|inoremap|vmap|vnoremap|map|noremap)\s+([\s\S]+)$/i
  );
  if (mapMatch) {
    const cmdType = mapMatch[1];
    const parsed = parseMapRest(mapMatch[2]);
    if (parsed) {
      return registerKeymap(state, cmdType, parsed.lhs, parsed.rhs, parsed.modifiers);
    }
  }

  // 사용자 정의 명령 등록·삭제·목록: :command[!], :delcommand, :comclear
  const userCmdDef = executeUserCommandDefinition(state, cleanCmdRaw);
  if (userCmdDef) {
    return userCmdDef;
  }

  // 키매핑 해제: :unmap, :nunmap, :iunmap, :vunmap
  const unmapMatch = trimmed.match(/^:?\s*(unmap|nunmap|iunmap|vunmap)\s+([\s\S]+)$/i);
  if (unmapMatch) {
    const cmdType = unmapMatch[1];
    const parsed = parseUnmapRest(unmapMatch[2]);
    if (parsed) {
      return unregisterKeymap(state, cmdType, parsed.lhs, { buffer: parsed.buffer });
    }
  }

  // 약어: :iabbrev, :cabbrev, :abbrev, :inoreabbrev, :cnoreabbrev, :noreabbrev, :unabbrev, :abclear 등
  const abbrevRes = executeAbbrevCommand(state, trimmed);
  if (abbrevRes) return abbrevRes;

  // :ascii / :as — 커서 아래 문자 정보 출력 (ga 와 동일)
  if (/^(?:as|ascii)$/i.test(cleanCmdRaw)) {
    const curLine = state.lines[state.cursor.line] ?? '';
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandCursorCol: undefined,
      digraphPending: undefined,
      commandMessage: describeCharAt(curLine, state.cursor.col),
    };
  }

  // :digraphs / :dig [{c1}{c2} {code} ...] — 다이그래프 목록 조회 및 커스텀 등록
  const digMatch = cleanCmdRaw.match(/^(?:dig|digraph|digraphs)(?:!)?(?:\s+(.*))?$/i);
  if (digMatch) {
    return executeDigraphCommand(state, digMatch[1] ?? '');
  }

  return null;
}
