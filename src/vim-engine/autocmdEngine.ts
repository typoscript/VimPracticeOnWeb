import { VimEditorState, AutocmdEntry } from './types';
import { msg } from './messages';

/** 표준 지원 자동 명령 이벤트 목록 (대소문자 정규화용) */
export const KNOWN_EVENTS = [
  'BufEnter',
  'BufLeave',
  'BufReadPost',
  'BufRead',
  'BufWritePost',
  'BufWrite',
  'BufWritePre',
  'FileType',
  'InsertEnter',
  'InsertLeave',
  'CursorMoved',
  'VimEnter',
  'WinEnter',
  'WinLeave',
  'User',
] as const;

export type KnownAutocmdEvent = (typeof KNOWN_EVENTS)[number];

const EVENT_ALIAS_MAP: Record<string, string> = {
  bufread: 'BufReadPost',
  bufreadpost: 'BufReadPost',
  bufwrite: 'BufWritePost',
  bufwritepost: 'BufWritePost',
  bufwritepre: 'BufWritePre',
  bufenter: 'BufEnter',
  bufleave: 'BufLeave',
  filetype: 'FileType',
  insertenter: 'InsertEnter',
  insertleave: 'InsertLeave',
  cursormoved: 'CursorMoved',
  vimenter: 'VimEnter',
  winenter: 'WinEnter',
  winleave: 'WinLeave',
  user: 'User',
};

/**
 * 이벤트 문자열을 표준 형태(CamelCase)로 정규화합니다.
 */
export function normalizeEvent(ev: string): string {
  const lower = ev.trim().toLowerCase();
  return EVENT_ALIAS_MAP[lower] ?? ev.trim();
}

/**
 * 와일드카드 문자열(*, ?, [abc])을 정규표현식으로 변환합니다.
 */
function wildcardToRegExp(pattern: string): RegExp {
  if (pattern === '*') return /^.*$/;
  let res = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      res += '.*';
    } else if (ch === '?') {
      res += '.';
    } else if (ch === '.') {
      res += '\\.';
    } else if (ch === '\\') {
      if (i + 1 < pattern.length) {
        res += '\\' + pattern[++i];
      }
    } else if ('+()|^$[]{}/'.includes(ch)) {
      res += '\\' + ch;
    } else {
      res += ch;
    }
  }
  res += '$';
  return new RegExp(res, 'i');
}

/**
 * 파일명 또는 컨텍스트가 패턴과 일치하는지 판별합니다.
 */
export function matchAutocmdPattern(
  pattern: string,
  event: string,
  context?: {
    filename?: string;
    bufferId?: number;
    filetype?: string;
    entryBufferId?: number;
  }
): boolean {
  const normEvent = normalizeEvent(event);
  const pats = pattern.split(',').map((p) => p.trim()).filter(Boolean);

  for (const pat of pats) {
    // 1. <buffer> 패턴 (버퍼 로컬 autocmd)
    if (pat === '<buffer>') {
      if (
        context?.bufferId !== undefined &&
        context?.entryBufferId !== undefined &&
        context.bufferId === context.entryBufferId
      ) {
        return true;
      }
      continue;
    }

    // 2. FileType 이벤트일 때: 파일타입 이름과 일치 여부 비교
    if (normEvent === 'FileType') {
      const curFt = (context?.filetype || '').trim().toLowerCase();
      if (pat === '*' || pat.toLowerCase() === curFt) {
        return true;
      }
      continue;
    }

    // 3. 파일명 와일드카드 매칭
    if (pat === '*') return true;
    const targetFile = context?.filename || '';
    const cleanTarget = targetFile.replace(/\\/g, '/');
    const baseName = cleanTarget.split('/').pop() || cleanTarget;

    const regex = wildcardToRegExp(pat);
    if (regex.test(cleanTarget) || regex.test(baseName)) {
      return true;
    }
  }

  return false;
}

/**
 * 등록된 자동 명령 목록을 텍스트 표로 포맷팅합니다 (:autocmd).
 */
export function formatAutocmdList(
  state: VimEditorState,
  filterGroup?: string,
  filterEvent?: string
): string {
  const list = state.autocmds ?? [];
  if (list.length === 0) {
    return '--- Auto-Commands ---';
  }

  const lines: string[] = ['--- Auto-Commands ---'];
  const normFilterEvent = filterEvent ? normalizeEvent(filterEvent) : null;

  // 그룹별로 정렬 및 출력
  const grouped: Record<string, AutocmdEntry[]> = {};
  for (const item of list) {
    const grp = item.group || 'default';
    if (filterGroup && filterGroup !== grp) continue;
    if (normFilterEvent && normalizeEvent(item.event) !== normFilterEvent) continue;

    if (!grouped[grp]) grouped[grp] = [];
    grouped[grp].push(item);
  }

  for (const [grp, entries] of Object.entries(grouped)) {
    if (grp !== 'default') {
      lines.push(`group: ${grp}`);
    }
    for (const e of entries) {
      lines.push(`  ${e.event.padEnd(14, ' ')} ${e.pattern.padEnd(12, ' ')} ${e.command}`);
    }
  }

  return lines.join('\n');
}

/**
 * :augroup {name} 및 :augroup! {name} 실행
 */
export function executeAugroupCommand(
  state: VimEditorState,
  cmdArgs: string,
  bang: boolean
): VimEditorState {
  const trimmed = cmdArgs.trim();

  // 1. :augroup! {name} (그룹 내 모든 autocmd 삭제)
  if (bang) {
    if (!trimmed) {
      return {
        ...state,
        bell: true,
        commandMessage: msg('E216: 그러한 그룹 또는 이벤트가 없습니다: {name}', { name: '' }),
      };
    }
    const filtered = (state.autocmds ?? []).filter((a) => a.group !== trimmed);
    const activeAugroup = state.activeAugroup === trimmed ? undefined : state.activeAugroup;
    return {
      ...state,
      autocmds: filtered,
      activeAugroup,
      commandMessage: msg('"{name}" 자동 명령 그룹이 삭제되었습니다', { name: trimmed }),
    };
  }

  // 2. :augroup END (그룹 정의 종료 및 기본 그룹 복귀)
  if (trimmed.toUpperCase() === 'END') {
    return {
      ...state,
      activeAugroup: undefined,
      commandMessage: undefined,
    };
  }

  // 3. :augroup (현재 그룹 조회)
  if (!trimmed) {
    return {
      ...state,
      commandMessage: state.activeAugroup
        ? `augroup: ${state.activeAugroup}`
        : 'augroup: default',
    };
  }

  // 4. :augroup {name} (활성 그룹 지정)
  return {
    ...state,
    activeAugroup: trimmed,
    commandMessage: undefined,
  };
}

/**
 * :autocmd! [group] [{event} [{pat}]] (자동 명령 삭제)
 */
export function executeDeleteAutocmd(
  state: VimEditorState,
  args: string
): VimEditorState {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  let targetGroup: string | undefined = state.activeAugroup;
  let targetEvent: string | undefined;
  let targetPat: string | undefined;

  // 첫 번째 토큰이 이벤트 이름인지 또는 그룹 이름인지 판단
  if (tokens.length > 0) {
    const first = tokens[0];
    const isEvent = Object.keys(EVENT_ALIAS_MAP).includes(first.toLowerCase());
    if (isEvent) {
      targetEvent = normalizeEvent(first);
      targetPat = tokens[1];
    } else {
      targetGroup = first;
      if (tokens[1]) {
        targetEvent = normalizeEvent(tokens[1]);
        targetPat = tokens[2];
      }
    }
  }

  const prevList = state.autocmds ?? [];
  const nextList = prevList.filter((item) => {
    if (targetGroup && item.group !== targetGroup) return true;
    if (targetEvent && normalizeEvent(item.event) !== targetEvent) return true;
    if (targetPat && item.pattern !== targetPat) return true;
    return false;
  });

  return {
    ...state,
    autocmds: nextList,
    commandMessage: msg('자동 명령이 삭제되었습니다'),
  };
}

/**
 * :autocmd [group] {event} {pat} [nested] {cmd} 파싱 및 등록 / 목록 조회
 */
export function executeAutocmdCommand(
  state: VimEditorState,
  rawArgs: string
): VimEditorState {
  const trimmed = rawArgs.trim();

  // 인자가 없으면 전체 목록 조회
  if (!trimmed) {
    return {
      ...state,
      commandMessage: formatAutocmdList(state),
    };
  }

  // 첫 번째 단어 확인
  const spaceIdx = trimmed.search(/\s/);
  if (spaceIdx === -1) {
    // 단일 단어: :autocmd {event} 또는 :autocmd {group} 조회
    const token = trimmed;
    const isEvent = Object.keys(EVENT_ALIAS_MAP).includes(token.toLowerCase());
    if (isEvent) {
      return {
        ...state,
        commandMessage: formatAutocmdList(state, undefined, token),
      };
    } else {
      return {
        ...state,
        commandMessage: formatAutocmdList(state, token),
      };
    }
  }

  // 등록 명령 파싱: [group] {event} {pat} [nested] {cmd}
  let remaining = trimmed;
  let group: string | undefined = state.activeAugroup;

  // 첫 번째 토큰 검사
  const matchFirst = remaining.match(/^(\S+)\s+(.*)$/);
  if (!matchFirst) return state;

  const firstToken = matchFirst[1];
  const restAfterFirst = matchFirst[2];

  // firstToken의 첫 번째 이벤트가 유효한 이벤트인지 확인
  const candidateEvents = firstToken.split(',').map((e) => e.trim().toLowerCase());
  const isAllEvents = candidateEvents.every((e) => Object.keys(EVENT_ALIAS_MAP).includes(e));

  let eventToken: string;
  let afterEvent: string;

  if (isAllEvents) {
    eventToken = firstToken;
    afterEvent = restAfterFirst;
  } else {
    // 첫 토큰이 그룹명임
    group = firstToken;
    const matchSecond = restAfterFirst.match(/^(\S+)\s+(.*)$/);
    if (!matchSecond) {
      // :autocmd {group} {event} 조회
      return {
        ...state,
        commandMessage: formatAutocmdList(state, group, restAfterFirst.trim()),
      };
    }
    eventToken = matchSecond[1];
    afterEvent = matchSecond[2];
  }

  // 패턴과 커맨드 분리
  const matchPatAndCmd = afterEvent.match(/^(\S+)\s+(.*)$/);
  if (!matchPatAndCmd) {
    // 패턴만 있고 커맨드가 없는 경우 -> 조회
    return {
      ...state,
      commandMessage: formatAutocmdList(state, group, eventToken),
    };
  }

  const patternToken = matchPatAndCmd[1];
  let cmdPart = matchPatAndCmd[2].trim();

  // nested 플래그 검사
  let nested = false;
  if (/^nested\s+/i.test(cmdPart)) {
    nested = true;
    cmdPart = cmdPart.replace(/^nested\s+/i, '').trim();
  }

  // 콜론(:) 접두사가 있으면 표준 Ex 명령어로 유지
  if (cmdPart.startsWith(':')) {
    cmdPart = cmdPart.replace(/^:+/, '').trim();
  }

  const curBufferId = patternToken === '<buffer>' ? state.currentBufferId ?? 1 : undefined;

  // 쉼표로 연결된 다중 이벤트 등록 지원 (예: BufRead,BufNewFile)
  const eventList = eventToken.split(',').map((e) => e.trim()).filter(Boolean);
  const currentList = state.autocmds ? [...state.autocmds] : [];
  let nextId = currentList.length > 0 ? Math.max(...currentList.map((a) => a.id)) + 1 : 1;

  for (const ev of eventList) {
    currentList.push({
      id: nextId++,
      group,
      event: normalizeEvent(ev),
      pattern: patternToken,
      command: cmdPart,
      nested,
      bufferId: curBufferId,
    });
  }

  return {
    ...state,
    autocmds: currentList,
    commandMessage: undefined,
  };
}

/**
 * :doautocmd [group] {event} [fname] 실행 (수동 이벤트 트리거)
 */
export function executeDoAutocmd(
  state: VimEditorState,
  args: string,
  keyRunner?: (s: VimEditorState, cmd: string) => VimEditorState
): VimEditorState {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('E216: 그러한 그룹 또는 이벤트가 없습니다: {name}', { name: '' }),
    };
  }

  let group: string | undefined;
  let eventToken: string;
  let fname: string | undefined;

  const firstLower = tokens[0].toLowerCase();
  const isEvent = Object.keys(EVENT_ALIAS_MAP).includes(firstLower);

  if (isEvent) {
    eventToken = tokens[0];
    fname = tokens[1];
  } else {
    group = tokens[0];
    eventToken = tokens[1];
    fname = tokens[2];
  }

  if (!eventToken) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('E216: 그러한 그룹 또는 이벤트가 없습니다: {name}', { name: '' }),
    };
  }

  return triggerAutocmd(
    state,
    eventToken,
    { filename: fname, group },
    keyRunner
  );
}

/**
 * 특정 이벤트가 발생했을 때 등록된 자동 명령들을 순차 실행합니다.
 */
export function triggerAutocmd(
  state: VimEditorState,
  event: string,
  context?: {
    filename?: string;
    bufferId?: number;
    filetype?: string;
    group?: string;
  },
  keyRunner?: (s: VimEditorState, cmd: string) => VimEditorState
): VimEditorState {
  const autocmds = state.autocmds;
  if (!autocmds || autocmds.length === 0) return state;

  const depth = state.autocmdDepth ?? 0;
  if (depth >= 5) {
    // 재귀 한도 초과 시 무한 루프 방지
    return state;
  }

  const normEvent = normalizeEvent(event);
  const curFilename = context?.filename || state.primaryFilename || 'practice.txt';
  const curBufId = context?.bufferId ?? state.currentBufferId ?? 1;
  const curFt = context?.filetype || state.options?.filetype;

  // 매칭되는 자동 명령 수집
  const matched = autocmds.filter((entry) => {
    if (context?.group && entry.group !== context.group) return false;
    if (normalizeEvent(entry.event) !== normEvent) return false;
    return matchAutocmdPattern(entry.pattern, normEvent, {
      filename: curFilename,
      bufferId: curBufId,
      filetype: curFt,
      entryBufferId: entry.bufferId,
    });
  });

  if (matched.length === 0) return state;

  let currState: VimEditorState = {
    ...state,
    autocmdDepth: depth + 1,
  };

  for (const entry of matched) {
    if (keyRunner) {
      currState = keyRunner(currState, entry.command);
    }
  }

  return {
    ...currState,
    autocmdDepth: depth,
  };
}
