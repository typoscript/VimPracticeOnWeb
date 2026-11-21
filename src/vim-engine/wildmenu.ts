import { VimEditorState } from './types';
import { getAvailableDirectories, getWorkspaceFiles } from './vfs';
import { OPTION_ALIASES, getOptions } from './setEngine';
import { buildProjectTags } from './tagEngine';
import { HELP_TOPICS } from './helpData';

import {
  AVAILABLE_COMMANDS,
  AVAILABLE_OPTIONS,
  OPTION_VALUE_COMPLETIONS,
  AUTOCMD_EVENTS,
  BUILTIN_VIM_FUNCTIONS,
} from './wildmenuCatalog';

export { AVAILABLE_COMMANDS, AVAILABLE_OPTIONS };

/**
 * 현재 에디터 상태에서 파일 목록을 조회합니다.
 */
export function getAvailableFiles(state: VimEditorState): string[] {
  const fileSet = new Set<string>();

  // 1. 기본 VFS 파일
  for (const f of Object.keys(getWorkspaceFiles())) {
    fileSet.add(f);
  }

  // 2. Netrw 가상 파일
  if (state.netrw?.files) {
    for (const f of Object.keys(state.netrw.files)) {
      fileSet.add(f);
    }
  }

  // 3. 열려 있는 버퍼 파일명
  if (state.buffers) {
    for (const b of state.buffers) {
      if (b.name && !b.name.startsWith('Netrw')) {
        fileSet.add(b.name);
      }
    }
  }

  // 4. 시스템 설정 파일
  fileSet.add('~/.vimrc');
  fileSet.add('.vimrc');

  return Array.from(fileSet).sort();
}

/**
 * 현재 에디터 상태에서 열려 있는 버퍼 목록을 조회합니다.
 */
export function getAvailableBuffers(state: VimEditorState): string[] {
  const bufSet = new Set<string>();

  if (state.buffers && state.buffers.length > 0) {
    for (const b of state.buffers) {
      if (b.name) bufSet.add(b.name);
    }
  } else if (state.primaryFilename) {
    bufSet.add(state.primaryFilename);
  }

  return Array.from(bufSet).sort();
}

/**
 * 현재 에디터 상태에서 도움말 토픽/태그 목록을 조회합니다.
 */
export function getAvailableHelpTopics(): string[] {
  const topicSet = new Set<string>();
  for (const [filename, doc] of Object.entries(HELP_TOPICS)) {
    topicSet.add(filename);
    topicSet.add(doc.id);
    for (const tag of doc.tags) {
      topicSet.add(tag);
    }
    for (const line of doc.content) {
      const matches = line.matchAll(/\*([A-Za-z0-9_.:-]+)\*/g);
      for (const m of matches) {
        topicSet.add(m[1]);
      }
    }
  }
  return Array.from(topicSet).sort();
}

/**
 * 현재 입력된 커맨드라인 문자열에 대한 자동완성 접두사(prefix) 및 후보 목록(candidates)을 계산합니다.
 */
export function calculateCompletions(
  state: VimEditorState,
  input: string
): { prefix: string; candidates: string[] } | null {
  // 파이프(|) 뒤의 마지막 명령어 세그먼트 분리 지원 (:set nu | setl rnu<Tab>)
  const lastPipeIdx = input.lastIndexOf('|');
  if (lastPipeIdx >= 0 && (lastPipeIdx === 0 || input[lastPipeIdx - 1] !== '\\')) {
    const afterPipeRaw = input.slice(lastPipeIdx + 1);
    const leadingSpaces = afterPipeRaw.match(/^\s*/)?.[0] ?? '';
    const subInput = afterPipeRaw.slice(leadingSpaces.length);
    const subRes = calculateCompletions(state, subInput);
    if (!subRes) return null;
    return {
      prefix: `${input.slice(0, lastPipeIdx + 1)}${leadingSpaces}${subRes.prefix}`,
      candidates: subRes.candidates,
    };
  }

  // 공백이 없는 경우: 커맨드 이름 자체 자동완성 (선행 범위 %, '<,'>, 1,5 등 보존 + 사용자 정의 명령 포함)
  if (!input.includes(' ')) {
    const rangeMatch = input.match(/^([%$]|'<,'>|\d+(?:,\d+)?|\.,\$)?(.*)$/);
    const rangePrefix = rangeMatch?.[1] ?? '';
    const cmdPart = rangeMatch?.[2] ?? input;
    const userCmds = Object.keys(state.userCommands ?? {});
    const allCommands = Array.from(new Set([...AVAILABLE_COMMANDS, ...userCmds]));

    if (!cmdPart) {
      return { prefix: rangePrefix, candidates: allCommands };
    }
    const lower = cmdPart.toLowerCase();
    const matched = allCommands.filter((cmd) => cmd.toLowerCase().startsWith(lower));
    if (matched.length === 0) return null;
    return { prefix: rangePrefix, candidates: matched };
  }

  // 첫 공백을 기준으로 커맨드와 인수 분리
  const spaceIdx = input.indexOf(' ');
  const rawCmdToken = input.slice(0, spaceIdx).trim();
  const cmd = rawCmdToken.toLowerCase();
  const rest = input.slice(spaceIdx + 1);

  // 1. :set / :setlocal / :setglobal 옵션 및 옵션 값(opt=val) 자동완성
  if (
    cmd === 'set' ||
    cmd === 'se' ||
    cmd === 'setlocal' ||
    cmd === 'setl' ||
    cmd === 'setglobal' ||
    cmd === 'setg'
  ) {
    const cmdPrefixVerb = cmd === 'se' ? 'set' : rawCmdToken;
    const lastSpace = rest.lastIndexOf(' ');
    const basePrefix =
      lastSpace >= 0 ? `${cmdPrefixVerb} ${rest.slice(0, lastSpace + 1)}` : `${cmdPrefixVerb} `;
    const rawArg = lastSpace >= 0 ? rest.slice(lastSpace + 1) : rest;
    const arg = rawArg.toLowerCase();

    // 1-a. opt=val 또는 opt+=val 형태의 열거형 옵션 값 완성
    const eqIdx = rawArg.indexOf('=');
    if (eqIdx > 0) {
      const lhsWithMod = rawArg.slice(0, eqIdx + 1);
      const rawOptName = rawArg
        .slice(0, eqIdx)
        .replace(/[+^-]$/, '')
        .toLowerCase();
      const canonicalOpt = OPTION_ALIASES[rawOptName] ?? rawOptName;
      const valueList = OPTION_VALUE_COMPLETIONS[canonicalOpt];
      if (!valueList) return null;

      const rhsRaw = rawArg.slice(eqIdx + 1);
      const lastCommaIdx = rhsRaw.lastIndexOf(',');
      const valPrefix =
        lastCommaIdx >= 0
          ? `${basePrefix}${lhsWithMod}${rhsRaw.slice(0, lastCommaIdx + 1)}`
          : `${basePrefix}${lhsWithMod}`;
      const valQuery = (
        lastCommaIdx >= 0 ? rhsRaw.slice(lastCommaIdx + 1) : rhsRaw
      ).toLowerCase();

      const matchedVals = valueList.filter((v) => v.toLowerCase().startsWith(valQuery));
      if (matchedVals.length === 0) return null;
      return { prefix: valPrefix, candidates: [...matchedVals] };
    }

    // 1-b. 옵션 이름 자체 완성
    const matchedSet = new Set<string>();

    for (const opt of AVAILABLE_OPTIONS) {
      if (opt.toLowerCase().startsWith(arg)) {
        matchedSet.add(opt);
      }
    }

    // 별칭(Alias) 검사: e.g. 'rnu' -> 'relativenumber', 'nu' -> 'number'
    for (const [alias, canonical] of Object.entries(OPTION_ALIASES)) {
      if (alias.toLowerCase().startsWith(arg) || alias.toLowerCase() === arg) {
        matchedSet.add(canonical);
      }
      const noAlias = `no${alias}`;
      if (noAlias.toLowerCase().startsWith(arg) || noAlias.toLowerCase() === arg) {
        matchedSet.add(`no${canonical}`);
      }
    }

    const matched = Array.from(matchedSet).sort();
    if (matched.length === 0) return null;
    return { prefix: basePrefix, candidates: matched };
  }

  // 2. 버퍼 관련 커맨드 (:b, :buffer, :bd, :bdelete, :bunload, :bwipeout, :sb, :sbuffer 등)
  if (
    cmd === 'b' ||
    cmd === 'buffer' ||
    cmd === 'bd' ||
    cmd === 'bdel' ||
    cmd === 'bdelete' ||
    cmd === 'bun' ||
    cmd === 'bunload' ||
    cmd === 'bw' ||
    cmd === 'bwipeout' ||
    cmd === 'sb' ||
    cmd === 'sbuffer'
  ) {
    const prefix = `${rawCmdToken} `;
    const arg = rest.toLowerCase();
    const allBuffers = getAvailableBuffers(state);

    let matched = allBuffers.filter((b) => b.toLowerCase().startsWith(arg));
    if (matched.length === 0 && arg) {
      matched = allBuffers.filter((b) => b.toLowerCase().includes(arg));
    }
    if (matched.length === 0) return null;
    return { prefix, candidates: matched };
  }

  // 2.5. 디렉터리 관련 커맨드 (:cd, :chdir, :lcd, :lchdir, :tcd, :tchdir)
  if (
    cmd === 'cd' ||
    cmd === 'chdir' ||
    cmd === 'lcd' ||
    cmd === 'lchdir' ||
    cmd === 'tcd' ||
    cmd === 'tchdir'
  ) {
    const prefix = `${rawCmdToken} `;
    const arg = rest.toLowerCase();
    const allDirs = getAvailableDirectories(state);
    let matched = allDirs.filter((d) => d.toLowerCase().startsWith(arg));
    if (matched.length === 0 && arg) {
      matched = allDirs.filter((d) => d.toLowerCase().includes(arg));
    }
    if (matched.length === 0) return null;
    return { prefix, candidates: matched };
  }

  // 3. 파일 관련 커맨드 (:e, :edit, :sp, :split, :vsp, :vsplit, :so, :source, :saveas, :tabnew, :find, :r, :w 등)
  if (
    cmd === 'e' ||
    cmd === 'edit' ||
    cmd === 'sp' ||
    cmd === 'split' ||
    cmd === 'vsp' ||
    cmd === 'vsplit' ||
    cmd === 'vs' ||
    cmd === 'so' ||
    cmd === 'source' ||
    cmd === 'saveas' ||
    cmd === 'sav' ||
    cmd === 'diffs' ||
    cmd === 'diffsplit' ||
    cmd === 'tabe' ||
    cmd === 'tabedit' ||
    cmd === 'tabnew' ||
    cmd === 'find' ||
    cmd === 'fin' ||
    cmd === 'r' ||
    cmd === 'read' ||
    cmd === 'w' ||
    cmd === 'write' ||
    cmd === 'badd' ||
    cmd === 'bad' ||
    cmd === 'argadd' ||
    cmd === 'arga' ||
    cmd === 'view'
  ) {
    const prefix = `${rawCmdToken} `;
    const arg = rest.toLowerCase();
    const allFiles = getAvailableFiles(state);

    let matched = allFiles.filter((f) => f.toLowerCase().startsWith(arg));
    if (matched.length === 0 && arg) {
      matched = allFiles.filter((f) => f.toLowerCase().includes(arg));
    }
    if (matched.length === 0) return null;
    return { prefix, candidates: matched };
  }

  // 4. 태그 관련 커맨드 (:tag, :ta, :tselect, :ts, :tjump, :tj, :ptag, :pt)
  if (
    cmd === 'tag' ||
    cmd === 'ta' ||
    cmd === 'tselect' ||
    cmd === 'ts' ||
    cmd === 'tjump' ||
    cmd === 'tj' ||
    cmd === 'ptag' ||
    cmd === 'pt'
  ) {
    const prefix = `${rawCmdToken} `;
    const arg = rest.toLowerCase();
    const allTags = buildProjectTags(state);
    const tagNames = Array.from(new Set(allTags.map((t) => t.name))).sort();

    let matched = tagNames.filter((name) => name.toLowerCase().startsWith(arg));
    if (matched.length === 0 && arg) {
      matched = tagNames.filter((name) => name.toLowerCase().includes(arg));
    }
    if (matched.length === 0) return null;
    return { prefix, candidates: matched };
  }

  // 5. 도움말 토픽/태그 관련 커맨드 (:help, :h)
  if (cmd === 'help' || cmd === 'h') {
    const prefix = `${rawCmdToken} `;
    const arg = rest.toLowerCase();
    const allTopics = getAvailableHelpTopics();

    let matched = allTopics.filter((t) => t.toLowerCase().startsWith(arg));
    if (matched.length === 0 && arg) {
      matched = allTopics.filter((t) => t.toLowerCase().includes(arg));
    }
    if (matched.length === 0) return null;
    return { prefix, candidates: matched };
  }

  // 6. 함수 호출 및 삭제 (:call, :cal, :delfunction, :delf, :function, :fu, :fun, :func)
  if (
    cmd === 'call' ||
    cmd === 'cal' ||
    cmd === 'delfunction' ||
    cmd === 'delf' ||
    cmd === 'function' ||
    cmd === 'func' ||
    cmd === 'fun' ||
    cmd === 'fu'
  ) {
    const prefix = `${rawCmdToken} `;
    const arg = rest.toLowerCase();
    const userFnNames = Object.values(state.userFunctions ?? {}).map((fn) => fn.name);
    const pool =
      cmd === 'call' || cmd === 'cal'
        ? Array.from(new Set([...userFnNames, ...BUILTIN_VIM_FUNCTIONS])).sort()
        : Array.from(new Set(userFnNames)).sort();

    const matched = pool.filter((name) => name.toLowerCase().startsWith(arg));
    if (matched.length === 0) return null;
    return { prefix, candidates: matched };
  }

  // 7. 사용자 정의 명령 조회/삭제 (:command, :com, :delcommand, :delc)
  if (cmd === 'command' || cmd === 'com' || cmd === 'delcommand' || cmd === 'delc') {
    const prefix = `${rawCmdToken} `;
    const arg = rest.toLowerCase();
    const userCmds = Object.keys(state.userCommands ?? {}).sort();
    const matched = userCmds.filter((name) => name.toLowerCase().startsWith(arg));
    if (matched.length === 0) return null;
    return { prefix, candidates: matched };
  }

  // 8. 자동 명령 그룹 및 이벤트 (:augroup, :aug, :autocmd, :au, :doautocmd, :doau)
  if (cmd === 'augroup' || cmd === 'aug') {
    const prefix = `${rawCmdToken} `;
    const arg = rest.toLowerCase();
    const existingGroups = (state.autocmds ?? [])
      .map((a) => a.group)
      .filter((g): g is string => Boolean(g && g !== 'default'));
    const groups = Array.from(
      new Set([
        'END',
        ...(state.activeAugroup ? [state.activeAugroup] : []),
        ...existingGroups,
      ])
    ).sort();
    const matched = groups.filter((g) => g.toLowerCase().startsWith(arg));
    if (matched.length === 0) return null;
    return { prefix, candidates: matched };
  }
  if (cmd === 'autocmd' || cmd === 'au' || cmd === 'doautocmd' || cmd === 'doau') {
    const lastSpace = rest.lastIndexOf(' ');
    const prefix =
      lastSpace >= 0 ? `${rawCmdToken} ${rest.slice(0, lastSpace + 1)}` : `${rawCmdToken} `;
    const arg = (lastSpace >= 0 ? rest.slice(lastSpace + 1) : rest).toLowerCase();
    const matched = AUTOCMD_EVENTS.filter((ev) => ev.toLowerCase().startsWith(arg));
    if (matched.length === 0) return null;
    return { prefix, candidates: [...matched] };
  }

  // 9. 스크립트 변수 (:let, :unlet, :unl)
  if (cmd === 'let' || cmd === 'unlet' || cmd === 'unl') {
    if (!rest.includes(' ') && !rest.includes('=')) {
      const prefix = `${rawCmdToken} `;
      const scopeMatch = rest.match(/^([gbwts]):(.*)$/);
      const scope = scopeMatch ? scopeMatch[1] : undefined;
      const rawArg = scopeMatch ? scopeMatch[2] : rest;
      const arg = rawArg.toLowerCase();

      const store =
        scope === 'b'
          ? state.bufferVars?.[state.currentBufferId ?? 1] ?? {}
          : scope === 'w'
            ? state.windowVars?.[state.activePaneIndex ?? 0] ?? {}
            : scope === 't'
              ? state.tabVars?.[state.currentTabId ?? 1] ?? {}
              : scope === 's'
                ? state.scriptVars ?? {}
                : { ...(state.globalVars ?? {}), ...(state.scriptVars ?? {}) };

      const vars = Object.keys(store).sort();
      const matched = vars
        .filter((v) => v.toLowerCase().startsWith(arg))
        .map((v) => (scope ? `${scope}:${v}` : v));
      if (matched.length === 0) return null;
      return { prefix, candidates: matched };
    }
  }

  // 10. 등록된 키매핑/약어 해제 (:unmap, :nunmap, :iunmap, :vunmap, :xunmap, :ounmap, :cunmap, :unabbrev, :iunabbrev, :cunabbrev)
  if (
    cmd === 'unmap' ||
    cmd === 'unm' ||
    cmd === 'nunmap' ||
    cmd === 'nun' ||
    cmd === 'iunmap' ||
    cmd === 'iu' ||
    cmd === 'vunmap' ||
    cmd === 'vu' ||
    cmd === 'xunmap' ||
    cmd === 'xu' ||
    cmd === 'ounmap' ||
    cmd === 'oun' ||
    cmd === 'cunmap' ||
    cmd === 'cu'
  ) {
    const prefix = `${rawCmdToken} `;
    const arg = rest.toLowerCase();
    const bufId = state.currentBufferId ?? 1;
    const allKeys = [
      ...Object.keys(state.userKeymaps ?? {}),
      ...Object.keys(state.bufferKeymaps?.[bufId] ?? {}),
    ];
    const lhsSet = new Set<string>();
    for (const k of allKeys) {
      const colonIdx = k.indexOf(':');
      lhsSet.add(colonIdx >= 0 ? k.slice(colonIdx + 1) : k);
    }
    const matched = Array.from(lhsSet)
      .sort()
      .filter((lhs) => lhs.toLowerCase().startsWith(arg));
    if (matched.length === 0) return null;
    return { prefix, candidates: matched };
  }

  if (
    cmd === 'unabbrev' ||
    cmd === 'una' ||
    cmd === 'iunabbrev' ||
    cmd === 'iuna' ||
    cmd === 'cunabbrev' ||
    cmd === 'cuna'
  ) {
    const prefix = `${rawCmdToken} `;
    const arg = rest.toLowerCase();
    const bufId = state.currentBufferId ?? 1;
    const allKeys = [
      ...Object.keys(state.abbreviations ?? {}),
      ...Object.keys(state.bufferAbbreviations?.[bufId] ?? {}),
    ];
    const lhsSet = new Set<string>();
    for (const k of allKeys) {
      const colonIdx = k.indexOf(':');
      lhsSet.add(colonIdx >= 0 ? k.slice(colonIdx + 1) : k);
    }
    const matched = Array.from(lhsSet)
      .sort()
      .filter((lhs) => lhs.toLowerCase().startsWith(arg));
    if (matched.length === 0) return null;
    return { prefix, candidates: matched };
  }

  return null;
}

/**
 * 와일드메뉴 후보 중 특정 인덱스 항목을 즉시 선택합니다.
 */
export function selectWildmenuCandidate(
  state: VimEditorState,
  index: number
): VimEditorState {
  if (!state.wildmenu?.active || state.wildmenu.candidates.length === 0) {
    return state;
  }
  const { candidates, prefix } = state.wildmenu;
  const clamped = Math.max(0, Math.min(index, candidates.length - 1));
  const candidate = candidates[clamped];
  return {
    ...state,
    commandBuffer: `${prefix}${candidate}`,
    commandCursorCol: undefined,
    wildmenu: {
      ...state.wildmenu,
      selectedIndex: clamped,
      phase: 'full',
    },
  };
}

/**
 * 후보 목록의 최장 공통 접두사(Longest Common Prefix)를 계산합니다.
 */
export function computeLongestCommonPrefix(candidates: readonly string[]): string {
  if (candidates.length === 0) return '';
  let prefix = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    const cand = candidates[i];
    let j = 0;
    while (j < prefix.length && j < cand.length && prefix[j] === cand[j]) {
      j++;
    }
    prefix = prefix.slice(0, j);
    if (prefix.length === 0) break;
  }
  return prefix;
}

/**
 * Tab 또는 Shift-Tab 키 입력 시 와일드메뉴 자동완성을 처리합니다 (:set wildmode 지원).
 */
export function handleTabCompletion(
  state: VimEditorState,
  reverse = false
): VimEditorState {
  const wildmodeRaw = getOptions(state).wildmode ?? 'full';
  const stages = wildmodeRaw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s, idx) => idx === 0 || s.length > 0);

  // 이미 와일드메뉴가 활성화되어 있는 경우
  if (state.wildmenu?.active && state.wildmenu.candidates.length > 0) {
    const { candidates, prefix, selectedIndex, phase, step = 1 } = state.wildmenu;
    const len = candidates.length;

    // longest / list 단계에서 다음 Tab 입력 시 다음 wildmode 단계로 전이
    if (phase === 'longest') {
      const stageSpec = stages[Math.min(step, stages.length - 1)] || 'full';
      const atoms = stageSpec.split(':');
      if (atoms.includes('full') || stageSpec === '') {
        const nextIndex = reverse ? len - 1 : 0;
        return {
          ...state,
          commandBuffer: `${prefix}${candidates[nextIndex]}`,
          commandCursorCol: undefined,
          commandMessage: atoms.includes('list') ? candidates.join('  ') : state.commandMessage,
          wildmenu: {
            ...state.wildmenu,
            selectedIndex: nextIndex,
            phase: 'full',
            step: step + 1,
          },
        };
      }
      if (atoms.includes('list')) {
        return {
          ...state,
          commandMessage: candidates.join('  '),
          wildmenu: {
            ...state.wildmenu,
            step: step + 1,
          },
        };
      }
      return state;
    }

    // full 단계: 후보 순환 (Cycle)
    const nextIndex = reverse ? (selectedIndex - 1 + len) % len : (selectedIndex + 1) % len;
    const nextCandidate = candidates[nextIndex];

    return {
      ...state,
      commandBuffer: `${prefix}${nextCandidate}`,
      commandCursorCol: undefined,
      wildmenu: {
        ...state.wildmenu,
        selectedIndex: nextIndex,
        phase: 'full',
      },
    };
  }

  // 새로운 자동완성 세션 시작
  const rawInput = state.commandBuffer ?? '';
  const result = calculateCompletions(state, rawInput);

  if (!result || result.candidates.length === 0) {
    return state;
  }

  const { prefix, candidates } = result;
  const stage0 = stages[0] || 'full';
  const atoms0 = stage0.split(':');

  // 후보가 1개뿐이면 wildmode 와 무관하게 즉시 완성
  if (candidates.length === 1) {
    return {
      ...state,
      commandBuffer: `${prefix}${candidates[0]}`,
      commandCursorCol: undefined,
      wildmenu: {
        active: true,
        candidates,
        selectedIndex: 0,
        originalBuffer: rawInput,
        prefix,
        phase: 'full',
        step: 1,
      },
    };
  }

  // Stage 0 이 longest 또는 단독 list 인 경우
  if (atoms0.includes('longest')) {
    const lcp = computeLongestCommonPrefix(candidates);
    const currentArg = rawInput.slice(prefix.length);
    const expanded = lcp.length >= currentArg.length ? lcp : currentArg;
    return {
      ...state,
      commandBuffer: `${prefix}${expanded}`,
      commandCursorCol: undefined,
      commandMessage: atoms0.includes('list') ? candidates.join('  ') : state.commandMessage,
      wildmenu: {
        active: true,
        candidates,
        selectedIndex: -1,
        originalBuffer: rawInput,
        prefix,
        phase: 'longest',
        step: 1,
      },
    };
  }

  if (atoms0.includes('list') && !atoms0.includes('full')) {
    return {
      ...state,
      commandMessage: candidates.join('  '),
      wildmenu: {
        active: true,
        candidates,
        selectedIndex: -1,
        originalBuffer: rawInput,
        prefix,
        phase: 'longest',
        step: 1,
      },
    };
  }

  const initialIndex = reverse ? candidates.length - 1 : 0;
  const initialCandidate = candidates[initialIndex];

  return {
    ...state,
    commandBuffer: `${prefix}${initialCandidate}`,
    commandCursorCol: undefined,
    commandMessage: atoms0.includes('list') ? candidates.join('  ') : state.commandMessage,
    wildmenu: {
      active: true,
      candidates,
      selectedIndex: initialIndex,
      originalBuffer: rawInput,
      prefix,
      phase: 'full',
      step: 1,
    },
  };
}

/**
 * 와일드메뉴 세션을 취소하고 원래 입력 내용으로 복원합니다.
 */
export function cancelWildmenu(
  state: VimEditorState,
  restoreOriginal = true
): VimEditorState {
  if (!state.wildmenu?.active) return state;

  const original = restoreOriginal ? state.wildmenu.originalBuffer : state.commandBuffer;
  return {
    ...state,
    commandBuffer: original,
    commandCursorCol: undefined,
    wildmenu: null,
  };
}

/**
 * 와일드메뉴 세션을 종료하고 현재 완성된 커맨드라인을 확정합니다.
 */
export function acceptWildmenu(state: VimEditorState): VimEditorState {
  if (!state.wildmenu) return state;
  return {
    ...state,
    wildmenu: null,
  };
}

/**
 * Ctrl-d 입력 시 현재 커맨드라인 입력에 일치하는 자동완성 후보 목록을 표시합니다.
 */
export function listCmdlineCompletions(state: VimEditorState): VimEditorState {
  const rawInput = state.commandBuffer ?? '';
  const result = calculateCompletions(state, rawInput);
  if (!result || result.candidates.length === 0) {
    return {
      ...state,
      bell: true,
    };
  }
  return {
    ...state,
    commandMessage: result.candidates.join('  '),
  };
}
