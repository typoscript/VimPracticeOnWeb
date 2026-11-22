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
  clearKeymaps,
  registerKeymap,
  unregisterKeymap,
  formatKeymapsList,
  parseMapQuery,
  parseMapRest,
  parseUnmapRest,
} from './keymapEngine';
import { executeAbbrevCommand } from './abbrevEngine';
import { executeUserCommandDefinition } from './userCommandEngine';
import { executeDigraphCommand } from './digraphs';
import { addSpellGoodWord, addSpellWrongWord, undoSpellWord } from './spellEngine';
import { executeGitsignsCommand } from './gitSignsEngine';
import { executeGitCommand } from './gitFugitiveEngine';
import { formatSnippetsList } from './snippetEngine';
import { openFlashJump } from './flashJumpEngine';
import { startMultiCursor } from './multiCursorEngine';
import { executeDialCommand } from './dialEngine';
import { executeAbolishCommand } from './abolishEngine';
import { executeTreesj } from './treesjEngine';
import { runVirtualTests } from './testRunnerEngine';
import { executeLuaChunk, executeLuaFile, executeLuaPrintExpr } from './luaEngine';
import { compileVimRegex } from './vimRegex';
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

  // Neovim Lua 실행: :lua {code}, :luafile {file}, :={expr}
  const luaPrintMatch = cleanCmdRaw.match(/^=\s*([\s\S]+)$/);
  if (luaPrintMatch) {
    return finishEx(executeLuaPrintExpr(state, luaPrintMatch[1], runEx));
  }
  const luaFileMatch = cleanCmdRaw.match(/^luaf(?:i(?:l(?:e)?)?)?\s+(.+)$/i);
  if (luaFileMatch) {
    return finishEx(executeLuaFile(state, luaFileMatch[1], runEx));
  }
  const luaMatch = cleanCmdRaw.match(/^lua(?:\s+([\s\S]+))?$/i);
  if (luaMatch) {
    return finishEx(executeLuaChunk(state, luaMatch[1] ?? '', runEx));
  }

  // 스크립트 소싱/런타임/세션 저장: :source (.lua 자동 분기), :runtime, :mksession
  const sourceMatch = cleanCmdRaw.match(/^(?:source|so)(?:\s+(.*))?$/i);
  if (sourceMatch) {
    const target = sourceMatch[1]?.trim() || '%';
    const isLuaTarget =
      target.toLowerCase().endsWith('.lua') ||
      (target === '%' && Boolean(state.primaryFilename?.toLowerCase().endsWith('.lua')));
    if (isLuaTarget) {
      return finishEx(executeLuaFile(state, target, runEx));
    }
    return finishEx(sourceScript(state, target, runEx));
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

  const tagMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:tag|ta)(?:!)?(?:\s+(.*))?$/i);
  if (tagMatch) {
    const count = tagMatch[1] ? parseInt(tagMatch[1], 10) : 1;
    return finishEx(jumpToTag(state, tagMatch[2]?.trim() || '', count));
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

  // 키매핑 초기화: :mapclear[!], :nmapclear, :imapclear, :vmapclear, :xmapclear, :smapclear, :omapclear, :cmapclear
  const mapclearMatch = trimmed.match(
    /^:?\s*([nivxsoc]?mapclear!?)(?:\s+(.*))?$/i
  );
  if (mapclearMatch) {
    const bufferOnly = /^<buffer>$/i.test((mapclearMatch[2] ?? '').trim());
    return clearKeymaps(state, mapclearMatch[1], { buffer: bufferOnly });
  }

  const resolveListModeFilter = (rawCmd: string): string => {
    const cmd = rawCmd.toLowerCase();
    if (cmd.endsWith('!')) return 'ic';
    if (cmd.startsWith('i')) return 'i';
    if (cmd.startsWith('n') && !cmd.startsWith('nore')) return 'n';
    if (cmd.startsWith('v')) return 'v';
    if (cmd.startsWith('x')) return 'x';
    if (cmd.startsWith('s')) return 's';
    if (cmd.startsWith('o')) return 'o';
    if (cmd.startsWith('c')) return 'c';
    return 'all';
  };

  // 키매핑 목록 조회: :map[!], :nmap, :imap, :vmap, :xmap, :smap, :omap, :cmap 등 (인자 없음)
  const listMatch = trimmed.match(
    /^:?\s*(map!|noremap!|map|nmap|imap|vmap|xmap|smap|omap|cmap|noremap|nnoremap|inoremap|vnoremap|xnoremap|snoremap|onoremap|cnoremap)$/i
  );
  if (listMatch) {
    return finishEx(state, { commandMessage: formatKeymapsList(state, resolveListModeFilter(listMatch[1])) });
  }

  // 커스텀 키매핑 등록 또는 단일 키 조회(:nmap {lhs}, :imap <buffer> {lhs}, :smap, :map!)
  const mapMatch = trimmed.match(
    /^:?\s*(nmap|nnoremap|imap|inoremap|vmap|vnoremap|xmap|xnoremap|smap|snoremap|omap|onoremap|cmap|cnoremap|map!|noremap!|map|noremap)\s+([\s\S]+)$/i
  );
  if (mapMatch) {
    const parsed = parseMapRest(mapMatch[2]);
    if (parsed) {
      return registerKeymap(state, mapMatch[1], parsed.lhs, parsed.rhs, parsed.modifiers);
    }
    const query = parseMapQuery(mapMatch[2]);
    if (query) {
      return finishEx(state, {
        commandMessage: formatKeymapsList(state, resolveListModeFilter(mapMatch[1]), {
          lhsFilter: query.lhs || undefined,
          bufferOnly: query.bufferOnly,
        }),
      });
    }
  }

  // 사용자 정의 명령 등록·삭제·목록: :command[!], :delcommand, :comclear
  const userCmdDef = executeUserCommandDefinition(state, cleanCmdRaw);
  if (userCmdDef) {
    return userCmdDef;
  }

  // 키매핑 해제: :unmap[!], :nunmap, :iunmap, :vunmap, :xunmap, :sunmap, :ounmap, :cunmap
  const unmapMatch = trimmed.match(
    /^:?\s*(unmap!|unmap|nunmap|iunmap|vunmap|xunmap|sunmap|ounmap|cunmap)\s+([\s\S]+)$/i
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

  // :clearmatches — 모든 커스텀 하이라이트 매치 해제
  if (/^clearm(?:a(?:t(?:c(?:h(?:e(?:s)?)?)?)?)?)?$/i.test(cleanCmdRaw)) {
    return finishEx(state, {
      customMatches: undefined,
      commandMessage: msg('커스텀 하이라이트 매치가 모두 해제되었습니다 (:clearmatches)'),
    });
  }

  // :match / :2match / :3match [{group} /{pat}/ | none]
  const matchCmd = cleanCmdRaw.match(/^([23])?mat(?:c(?:h)?)?(?:\s+(.*))?$/i);
  if (matchCmd) {
    const slotId = matchCmd[1] === '2' ? 2 : matchCmd[1] === '3' ? 3 : 1;
    const cmdName = matchCmd[1] ? `:${matchCmd[1]}match` : ':match';
    const rawArg = (matchCmd[2] ?? '').trim();
    const existing = state.customMatches ?? [];

    if (!rawArg || /^none$/i.test(rawArg)) {
      const next = existing.filter((m) => m.id !== slotId);
      return finishEx(state, {
        customMatches: next.length > 0 ? next : undefined,
        commandMessage: msg('커스텀 하이라이트 매치 해제 ({cmd})', { cmd: cmdName }),
      });
    }

    const groupAndPat = rawArg.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+([^\w\s])([\s\S]*)$/);
    if (!groupAndPat) {
      return finishEx(state, {
        bell: true,
        commandMessage: msg('E475: 잘못된 인수입니다: {arg}', { arg: rawArg }),
      });
    }
    const group = groupAndPat[1];
    const delim = groupAndPat[2];
    const restAfterDelim = groupAndPat[3];
    // 끝 구분자(unescaped delim) 탐색
    let endDelimIdx = -1;
    for (let i = 0; i < restAfterDelim.length; i++) {
      if (restAfterDelim[i] === '\\') {
        i++;
        continue;
      }
      if (restAfterDelim[i] === delim) {
        endDelimIdx = i;
        break;
      }
    }
    const pattern =
      endDelimIdx >= 0 ? restAfterDelim.slice(0, endDelimIdx) : restAfterDelim;
    if (!pattern) {
      return finishEx(state, {
        bell: true,
        commandMessage: msg('E475: 잘못된 인수입니다: {arg}', { arg: rawArg }),
      });
    }
    try {
      compileVimRegex(pattern);
    } catch {
      return finishEx(state, {
        bell: true,
        commandMessage: msg('E475: 잘못된 인수입니다: {arg}', { arg: rawArg }),
      });
    }

    const next = [
      ...existing.filter((m) => m.id !== slotId),
      { id: slotId, group, pattern, priority: 10 },
    ];
    return finishEx(state, {
      customMatches: next,
      commandMessage: msg('[하이라이트 매치] {group}: /{pattern}/', { group, pattern }),
    });
  }

  // :digraphs / :dig [{c1}{c2} {code} ...]
  const digMatch = cleanCmdRaw.match(/^(?:dig|digraph|digraphs)(?:!)?(?:\s+(.*))?$/i);
  if (digMatch) {
    return executeDigraphCommand(state, digMatch[1] ?? '');
  }

  // :spellgood / :spellwrong / :spellundo
  const spellGoodMatch = cleanCmdRaw.match(/^spe(?:l(?:l(?:g(?:o(?:o(?:d)?)?)?)?)?)?!?(?:\s+(.*))?$/i);
  if (spellGoodMatch) {
    return finishEx(addSpellGoodWord(state, spellGoodMatch[1]));
  }
  const spellWrongMatch = cleanCmdRaw.match(/^spellw(?:r(?:o(?:n(?:g)?)?)?)?!?(?:\s+(.*))?$/i);
  if (spellWrongMatch) {
    return finishEx(addSpellWrongWord(state, spellWrongMatch[1]));
  }
  const spellUndoMatch = cleanCmdRaw.match(/^(?:speu|spellu(?:n(?:d(?:o)?)?)?)!?(?:\s+(.*))?$/i);
  if (spellUndoMatch) {
    return finishEx(undoSpellWord(state, spellUndoMatch[1]));
  }

  // :Gitsigns [next_hunk|prev_hunk|preview_hunk|reset_hunk|reset_buffer|stage_hunk|undo_stage_hunk|status]
  const gitsignsMatch = cleanCmdRaw.match(/^(?:Gitsigns|Gitsign|GitHunk)(?:\s+(.*))?$/i);
  if (gitsignsMatch) {
    return finishEx(executeGitsignsCommand(state, gitsignsMatch[1] ?? ''));
  }

  // vim-fugitive 스타일 미니 Git 워크플로: :Git [...], :G [...], :Gstatus, :Gblame, :Glog
  if (/^Gstatus$/i.test(cleanCmdRaw)) {
    return finishEx(executeGitCommand(state, 'status'));
  }
  if (/^Gblame(?:\s+(.*))?$/i.test(cleanCmdRaw)) {
    const arg = cleanCmdRaw.replace(/^Gblame/i, '').trim();
    return finishEx(executeGitCommand(state, `blame ${arg}`.trim()));
  }
  if (/^Glog$/i.test(cleanCmdRaw)) {
    return finishEx(executeGitCommand(state, 'log'));
  }
  const gitMatch = cleanCmdRaw.match(/^(Git|G)(?:\s+(.*))?$/);
  if (gitMatch) {
    const isShadowedByUserCmd = gitMatch[1] === 'G' && Boolean(state.userCommands?.G);
    if (!isShadowedByUserCmd) {
      return finishEx(executeGitCommand(state, gitMatch[2] ?? 'status'));
    }
  }

  // :Snippets — 내장 LuaSnip 스타일 스니펫 목록 조회
  if (/^Snippets?$/i.test(cleanCmdRaw)) {
    return finishEx(state, { commandMessage: formatSnippetsList() });
  }

  // :Flash [query] — flash.nvim 스타일 화면 라벨 점프 세션 열기
  const flashMatch = cleanCmdRaw.match(/^Flash(?:\s+(.*))?$/i);
  if (flashMatch) {
    return finishEx(openFlashJump(state, { query: flashMatch[1]?.trim() }));
  }

  // :MultiCursor[!] [query] / :MultiCursorAll [query] — vim-visual-multi 다중 커서 시작
  const multiMatch = cleanCmdRaw.match(/^(MultiCursorAll|MultiCursor)(!)?(?:\s+(.*))?$/i);
  if (multiMatch) {
    const selectAll = multiMatch[1].toLowerCase() === 'multicursorall' || multiMatch[2] === '!';
    return finishEx(startMultiCursor(state, { query: multiMatch[3]?.trim(), selectAll }));
  }

  // :DialInc [count] / :DialDec [count] — dial.nvim 스마트 토글·증감
  const dialMatch = cleanCmdRaw.match(/^(DialInc|DialDec)(?:\s+(\d+))?$/i);
  if (dialMatch) {
    const step = dialMatch[2] ? parseInt(dialMatch[2], 10) : 1;
    const delta = dialMatch[1].toLowerCase() === 'dialdec' ? -step : step;
    return finishEx(executeDialCommand(state, delta));
  }

  // :Coerce {variant} / :AbolishCase {variant} — vim-abolish 케이스 변환
  const coerceMatch = cleanCmdRaw.match(/^(?:Coerce|AbolishCase)(?:\s+(.*))?$/i);
  if (coerceMatch) {
    return finishEx(executeAbolishCommand(state, coerceMatch[1] ?? ''));
  }

  // :TSJToggle / :TSJSplit / :TSJJoin — treesj 구조적 Split/Join
  const tsjMatch = cleanCmdRaw.match(/^TSJ(Toggle|Split|Join)$/i);
  if (tsjMatch) {
    const action = tsjMatch[1].toLowerCase() as 'toggle' | 'split' | 'join';
    return finishEx(executeTreesj(state, action, false));
  }

  // :TestRun / :RunTests / :TestSuite — 실무 캡스톤 가상 테스트 러너
  if (/^(?:TestRun|RunTests|TestSuite)$/i.test(cleanCmdRaw)) {
    return finishEx(runVirtualTests(state));
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
