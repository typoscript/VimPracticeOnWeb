import { TagEntry, TagStackItem, VimEditorState } from './types';
import { getWorkspaceFiles } from './vfs';
import { editBuffer } from './bufferEngine';
import { recordJump } from './marks';

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

  // 3. 열려 있는 버퍼 목록
  if (state.buffers) {
    for (const b of state.buffers) {
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
 * 프로젝트 태그 목록에서 주어진 이름에 부합하는 태그를 검색합니다.
 */
export function findTag(state: VimEditorState, tagName: string): TagEntry | null {
  const clean = tagName.trim();
  if (!clean) return null;

  const allTags = buildProjectTags(state);
  const curFile = state.primaryFilename;
  const curLine = state.cursor.line;

  // 1순위: 현재 커서 위치가 아닌 다른 위치의 정확 일치 정의부
  const otherMatch = allTags.find(
    (t) => t.name === clean && (t.filename !== curFile || t.line !== curLine)
  );
  if (otherMatch) return otherMatch;

  // 2순위: 현재 라인을 포함한 동일 정의부
  return allTags.find((t) => t.name === clean) ?? null;
}

/**
 * 지정된 태그(심볼)의 정의 위치로 점프합니다 (Ctrl+], :tag <name>).
 */
export function jumpToTag(state: VimEditorState, tagName: string): VimEditorState {
  const clean = tagName.trim();
  if (!clean) {
    return {
      ...state,
      commandMessage: 'E431: 태그를 지정하지 않았습니다 (tag name required)',
    };
  }

  const target = findTag(state, clean);
  if (!target) {
    return {
      ...state,
      commandMessage: `E426: 태그를 찾을 수 없습니다: "${clean}"`,
    };
  }

  // 1. 현재 커서 위치를 태그 스택(tagStack)에 푸시
  const currentStackItem: TagStackItem = {
    tag: clean,
    filename: state.primaryFilename || 'source.ts',
    cursor: { ...state.cursor },
  };
  const nextTagStack = [...(state.tagStack ?? []), currentStackItem];

  // 2. 점프 전 위치를 Vim 점프 리스트(Ctrl+o용)에도 기록
  const stateWithJump = recordJump(state);

  // 3. 파일/버퍼 전환 처리
  let nextState: VimEditorState;
  if (target.filename === state.primaryFilename) {
    nextState = {
      ...stateWithJump,
      tagStack: nextTagStack,
      cursor: { line: target.line, col: target.col },
      commandMessage: `tag 1 of 1 "${target.name}" (${target.filename}:${target.line + 1})`,
    };
  } else {
    // 다른 파일인 경우 해당 버퍼 열기/전환
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
      cursor: { line: target.line, col: target.col },
      commandMessage: `tag 1 of 1 "${target.name}" (${target.filename}:${target.line + 1})`,
    };
  }

  return nextState;
}

/**
 * 태그 스택을 팝하여 이전 위치로 복귀합니다 (Ctrl+t, :pop).
 */
export function popTagStack(state: VimEditorState, count = 1): VimEditorState {
  const stack = state.tagStack ?? [];
  if (stack.length === 0) {
    return {
      ...state,
      commandMessage: 'E73: 태그 스택이 비어 있습니다 (tag stack empty)',
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
