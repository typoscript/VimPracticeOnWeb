import { TagEntry, TagStackItem, VimEditorState } from './types';
import { getWorkspaceFiles } from './vfs';
import { editBuffer, ensureBuffers } from './bufferEngine';
import { recordJump } from './marks';
import { clampCursor } from './cursor';
import { msg } from './messages';

/**
 * 텍스트 라인들에서 함수, 클래스, 변수 등 심볼(Tag) 정의를 추출합니다.
 */
export function extractTagsFromLines(filename: string, lines: string[]): TagEntry[] {
  const tags: TagEntry[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('"') || line.startsWith('#') || line.startsWith('/*')) {
      continue;
    }

    // 1. function 정의: function foo(), export function foo(), async function foo()
    const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (funcMatch) {
      const name = funcMatch[1];
      const col = rawLine.indexOf(name);
      tags.push({ name, filename, line: lineIdx, col: col >= 0 ? col : 0 });
      continue;
    }

    // 2. 타입 정의: class Foo, interface Foo, type Foo, enum Foo
    const typeMatch = line.match(/(?:export\s+)?(?:class|interface|type|enum)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (typeMatch) {
      const name = typeMatch[1];
      const col = rawLine.indexOf(name);
      tags.push({ name, filename, line: lineIdx, col: col >= 0 ? col : 0 });
      continue;
    }

    // 3. 변수/상수/화살표 함수: const FOO =, let foo =, export const foo =
    const varMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
    if (varMatch) {
      const name = varMatch[1];
      const col = rawLine.indexOf(name);
      tags.push({ name, filename, line: lineIdx, col: col >= 0 ? col : 0 });
      continue;
    }

    // 4. 파이썬 / Vimscript 함수: def foo():, function! Foo()
    const pyVimMatch = line.match(/(?:def|function!?)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (pyVimMatch) {
      const name = pyVimMatch[1];
      const col = rawLine.indexOf(name);
      tags.push({ name, filename, line: lineIdx, col: col >= 0 ? col : 0 });
      continue;
    }
  }

  return tags;
}

/**
 * 현재 프로젝트의 모든 VFS 파일 및 열려 있는 버퍼로부터 태그 데이터베이스를 구축합니다.
 */
export function buildProjectTags(state: VimEditorState): TagEntry[] {
  const tags: TagEntry[] = [];
  const processedFiles = new Set<string>();

  // 1. 커스텀/수동 등록된 태그 우선 추가
  if (state.tags && state.tags.length > 0) {
    tags.push(...state.tags);
  }

  // 2. 현재 활성 버퍼
  const curName = state.primaryFilename || 'source.ts';
  if (!curName.startsWith('Netrw')) {
    tags.push(...extractTagsFromLines(curName, state.lines));
    processedFiles.add(curName);
  }

  // 3. 열려 있는 버퍼 목록 (또는 secondaryFilename/secondaryLines)
  const activeBuffers = state.buffers ?? ensureBuffers(state).buffers;
  if (activeBuffers) {
    for (const b of activeBuffers) {
      if (b.name && !processedFiles.has(b.name) && !b.name.startsWith('Netrw')) {
        tags.push(...extractTagsFromLines(b.name, b.lines));
        processedFiles.add(b.name);
      }
    }
  }

  // 4. VFS 기본 파일들
  for (const [filename, lines] of Object.entries(getWorkspaceFiles())) {
    if (!processedFiles.has(filename)) {
      tags.push(...extractTagsFromLines(filename, lines));
      processedFiles.add(filename);
    }
  }

  // 5. Netrw 가상 파일들
  if (state.netrw?.files) {
    for (const [filename, lines] of Object.entries(state.netrw.files)) {
      if (!processedFiles.has(filename)) {
        tags.push(...extractTagsFromLines(filename, lines));
        processedFiles.add(filename);
      }
    }
  }

  return tags;
}

/**
 * 프로젝트 태그 목록에서 주어진 이름에 부합하는 모든 태그를 검색합니다.
 */
export function findTags(state: VimEditorState, tagName: string): TagEntry[] {
  const clean = tagName.trim();
  if (!clean) return [];

  const allTags = buildProjectTags(state);
  return allTags.filter((t) => t.name === clean);
}

/**
 * 프로젝트 태그 목록에서 주어진 이름에 부합하는 태그를 단일 검색합니다.
 */
export function findTag(state: VimEditorState, tagName: string): TagEntry | null {
  const clean = tagName.trim();
  if (!clean) return null;

  const matches = findTags(state, clean);
  if (matches.length === 0) return null;

  const curFile = state.primaryFilename;
  const curLine = state.cursor.line;

  // 1순위: 현재 커서 위치가 아닌 다른 위치의 정확 일치 정의부
  const otherMatch = matches.find(
    (t) => t.filename !== curFile || t.line !== curLine
  );
  if (otherMatch) return otherMatch;

  // 2순위: 현재 라인을 포함한 동일 정의부
  return matches[0] ?? null;
}

/**
 * 다중 태그 일치 목록을 Vim 표준 테이블 형식으로 포맷팅합니다 (:tselect, :tjump).
 */
export function formatTagMatches(matches: TagEntry[], activeIndex = 0): string {
  if (matches.length === 0) return 'tag not found';
  const lines = ['  # pri kind tag               file'];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const isCurrent = i === activeIndex ? '>' : ' ';
    const num = (i + 1).toString().padStart(2, ' ');
    const name = m.name.padEnd(17, ' ');
    lines.push(`${isCurrent} ${num} F   f    ${name} ${m.filename}:${m.line + 1}`);
  }
  return lines.join('\n');
}

/**
 * 특정 TagEntry 정의 위치로 점프합니다.
 */
export function jumpToTagEntry(
  state: VimEditorState,
  target: TagEntry,
  matches?: TagEntry[],
  matchIndex?: number,
  pushStack = true
): VimEditorState {
  let nextTagStack = state.tagStack ?? [];
  if (pushStack) {
    const currentStackItem: TagStackItem = {
      tag: target.name,
      filename: state.primaryFilename || 'source.ts',
      cursor: { ...state.cursor },
    };
    nextTagStack = [...nextTagStack, currentStackItem];
  }
  const stateWithJump = recordJump(state);

  const totalMatches = matches?.length ?? 1;
  const currMatch = (matchIndex ?? 0) + 1;
  const msgText = `tag ${currMatch} of ${totalMatches} "${target.name}" (${target.filename}:${target.line + 1})`;

  let nextState: VimEditorState;
  if (target.filename === state.primaryFilename) {
    nextState = {
      ...stateWithJump,
      tagStack: nextTagStack,
      tagMatches: matches ?? state.tagMatches,
      tagMatchIndex: matchIndex ?? state.tagMatchIndex,
      cursor: clampCursor(stateWithJump.lines, { line: target.line, col: target.col }, 'NORMAL'),
      commandMessage: msgText,
    };
  } else {
    const bufferSwitchedState = editBuffer(
      {
        ...stateWithJump,
        tagStack: nextTagStack,
      },
      target.filename
    );

    nextState = {
      ...bufferSwitchedState,
      tagStack: nextTagStack,
      tagMatches: matches ?? state.tagMatches,
      tagMatchIndex: matchIndex ?? state.tagMatchIndex,
      cursor: clampCursor(bufferSwitchedState.lines, { line: target.line, col: target.col }, 'NORMAL'),
      commandMessage: msgText,
    };
  }

  return nextState;
}

/**
 * 지정된 태그(심볼)의 정의 위치로 점프합니다 (Ctrl+], :tag <name>).
 */
export function jumpToTag(state: VimEditorState, tagName: string): VimEditorState {
  const clean = tagName.trim();
  if (!clean) {
    return {
      ...state,
      commandMessage: msg('E431: 태그를 지정하지 않았습니다 (tag name required)'),
    };
  }

  const matches = findTags(state, clean);
  const target = findTag(state, clean);
  if (!target) {
    return {
      ...state,
      commandMessage: msg('E426: 태그를 찾을 수 없습니다: "{clean}"', { clean }),
    };
  }

  return jumpToTagEntry(state, target, matches.length > 0 ? matches : [target], 0);
}

/**
 * 다중 정의 태그 목록을 조회하거나 특정 번호의 태그로 점프합니다 (:tselect [name|num], :ts).
 */
export function tselectTag(state: VimEditorState, target: string): VimEditorState {
  const clean = target.trim();
  // 1. 숫자 인덱스 지정인 경우 (예: :tselect 2)
  if (/^\d+$/.test(clean)) {
    const idx = parseInt(clean, 10) - 1;
    const matches = state.tagMatches ?? [];
    if (matches.length === 0) {
      return {
        ...state,
        commandMessage: msg('E428: 이전 태그 목록이 없습니다 (no previous tag list)'),
      };
    }
    if (idx < 0 || idx >= matches.length) {
      return {
        ...state,
        commandMessage: msg('E426: 유효하지 않은 태그 번호입니다'),
      };
    }
    return jumpToTagEntry(state, matches[idx], matches, idx, false);
  }

  // 2. 심볼 이름 지정인 경우 (예: :tselect save)
  const matches = findTags(state, clean);
  if (matches.length === 0) {
    return {
      ...state,
      commandMessage: msg('E426: 태그를 찾을 수 없습니다: "{clean}"', { clean }),
    };
  }

  // 첫 번째 항목으로 점프 후 전체 목록 메시지 출력
  const next = jumpToTagEntry(state, matches[0], matches, 0);
  return {
    ...next,
    commandMessage: formatTagMatches(matches, 0),
  };
}

/**
 * 1개 일치 시 즉시 점프하고, 2개 이상 일치 시 목록을 표시합니다 (:tjump [name], :tj, g]).
 */
export function tjumpTag(state: VimEditorState, tagName: string): VimEditorState {
  const clean = tagName.trim();
  if (!clean) {
    return {
      ...state,
      commandMessage: msg('E431: 태그를 지정하지 않았습니다 (tag name required)'),
    };
  }

  const matches = findTags(state, clean);
  if (matches.length === 0) {
    return {
      ...state,
      commandMessage: msg('E426: 태그를 찾을 수 없습니다: "{clean}"', { clean }),
    };
  }

  // 1개뿐이면 :tag 처럼 즉시 점프
  if (matches.length === 1) {
    return jumpToTagEntry(state, matches[0], matches, 0);
  }

  // 2개 이상이면 :tselect 처럼 목록을 표시하고 첫 번째 항목으로 이동
  const next = jumpToTagEntry(state, matches[0], matches, 0);
  return {
    ...next,
    commandMessage: formatTagMatches(matches, 0),
  };
}

/**
 * 활성 태그 일치 목록 내에서 이전/다음 태그로 순회 이동합니다 (:tnext, :tprev, :tfirst, :tlast).
 */
export function cycleTagMatch(
  state: VimEditorState,
  direction: 'next' | 'prev' | 'first' | 'last',
  count = 1
): VimEditorState {
  const matches = state.tagMatches ?? [];
  if (matches.length === 0) {
    return {
      ...state,
      commandMessage: msg('E428: 이전 태그 목록이 없습니다 (no previous tag list)'),
    };
  }

  let nextIdx = state.tagMatchIndex ?? 0;
  if (direction === 'next') {
    if (nextIdx >= matches.length - 1) {
      return {
        ...state,
        commandMessage: msg('E427: 태그 목록의 끝입니다 (tag {curr} of {total})', {
          curr: matches.length,
          total: matches.length,
        }),
      };
    }
    nextIdx = Math.min(matches.length - 1, nextIdx + count);
  } else if (direction === 'prev') {
    if (nextIdx <= 0) {
      return {
        ...state,
        commandMessage: msg('E427: 태그 목록의 처음입니다 (tag 1 of {total})', {
          total: matches.length,
        }),
      };
    }
    nextIdx = Math.max(0, nextIdx - count);
  } else if (direction === 'first') {
    nextIdx = 0;
  } else if (direction === 'last') {
    nextIdx = matches.length - 1;
  }

  return jumpToTagEntry(state, matches[nextIdx], matches, nextIdx, false);
}

/**
 * 태그 스택을 팝하여 이전 위치로 복귀합니다 (Ctrl+t, :pop).
 */
export function popTagStack(state: VimEditorState, count = 1): VimEditorState {
  const stack = state.tagStack ?? [];
  if (stack.length === 0) {
    return {
      ...state,
      commandMessage: msg('E73: 태그 스택이 비어 있습니다 (tag stack empty)'),
    };
  }

  const popCount = Math.max(1, count);
  const targetIdx = Math.max(0, stack.length - popCount);
  const targetEntry = stack[targetIdx];
  const nextStack = stack.slice(0, targetIdx);

  // 점프 리스트 기록
  const stateWithJump = recordJump(state);

  let nextState: VimEditorState;
  if (targetEntry.filename === state.primaryFilename) {
    nextState = {
      ...stateWithJump,
      tagStack: nextStack,
      cursor: { ...targetEntry.cursor },
      commandMessage: `tag stack popped: ${targetEntry.filename}:${targetEntry.cursor.line + 1}`,
    };
  } else {
    // 이전 파일로 버퍼 복귀
    const bufferSwitchedState = editBuffer(
      {
        ...stateWithJump,
        tagStack: nextStack,
      },
      targetEntry.filename
    );

    nextState = {
      ...bufferSwitchedState,
      tagStack: nextStack,
      cursor: { ...targetEntry.cursor },
      commandMessage: `tag stack popped: ${targetEntry.filename}:${targetEntry.cursor.line + 1}`,
    };
  }

  return nextState;
}

/**
 * 현재 태그 스택 목록을 Vim 형식으로 포맷팅합니다 (:tags).
 */
export function formatTagStack(state: VimEditorState): string {
  const stack = state.tagStack ?? [];
  if (stack.length === 0) {
    return 'tag stack empty';
  }

  const lines = ['  # TO tag         FROM line  in file/text'];
  for (let i = 0; i < stack.length; i++) {
    const item = stack[i];
    const isCurrent = i === stack.length - 1 ? '>' : ' ';
    const num = (i + 1).toString().padStart(2, ' ');
    const tagName = item.tag.padEnd(14, ' ');
    const lineNum = (item.cursor.line + 1).toString().padStart(9, ' ');
    lines.push(`${isCurrent} ${num}  1 ${tagName} ${lineNum}  ${item.filename}`);
  }

  return lines.join('\n');
}
