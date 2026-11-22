import { SnippetSession, SnippetTabstop, VimEditorState } from './types';
import { pushUndoSnapshot } from './operators';
import { clampCursor } from './cursor';
import { getOptions } from './setEngine';
import { msg } from './messages';

export interface SnippetDefinition {
  trigger: string;
  description: string;
  /** `${1:placeholder}` 와 `$0` 최종 위치를 포함한 템플릿 줄 배열 */
  body: string[];
}

export const BUILTIN_SNIPPETS: readonly SnippetDefinition[] = [
  {
    trigger: 'fn',
    description: 'function declaration',
    body: ['function ${1:name}(${2:params}) {', '  ${3:// body}', '}$0'],
  },
  {
    trigger: 'afn',
    description: 'arrow function',
    body: ['const ${1:name} = (${2:params}) => {', '  ${3:return null;}', '};$0'],
  },
  {
    trigger: 'if',
    description: 'if block',
    body: ['if (${1:condition}) {', '  ${2:// then}', '}$0'],
  },
  {
    trigger: 'ife',
    description: 'if/else block',
    body: ['if (${1:condition}) {', '  ${2:// then}', '} else {', '  ${3:// else}', '}$0'],
  },
  {
    trigger: 'for',
    description: 'for...of loop',
    body: ['for (const ${1:item} of ${2:items}) {', '  ${3:// loop}', '}$0'],
  },
  {
    trigger: 'try',
    description: 'try/catch block',
    body: ['try {', '  ${1:// try}', '} catch (${2:err}) {', '  ${3:// handle}', '}$0'],
  },
  {
    trigger: 'clg',
    description: 'console.log()',
    body: ['console.log(${1:value});$0'],
  },
  {
    trigger: 'imp',
    description: 'ES module import',
    body: ['import { ${2:name} } fr' + 'om "${1:module}";$0'],
  },
  {
    trigger: 'iface',
    description: 'TypeScript interface',
    body: ['interface ${1:Name} {', '  ${2:prop}: ${3:string};', '}$0'],
  },
];

const SNIPPET_MAP = new Map<string, SnippetDefinition>(
  BUILTIN_SNIPPETS.map((s) => [s.trigger, s])
);

const TABSTOP_TOKEN_RE = /\$\{(\d+):([^}]*)\}|\$(\d+)/g;

interface ParsedTemplate {
  expandedLines: string[];
  tabstops: SnippetTabstop[];
}

function parseSnippetTemplate(
  body: string[],
  startLine: number,
  startCol: number,
  baseIndent: string,
  indentUnit: string
): ParsedTemplate {
  const expandedLines: string[] = [];
  const rawStops: Array<{ index: number; line: number; col: number; length: number; placeholder: string }> = [];

  for (let rowIdx = 0; rowIdx < body.length; rowIdx++) {
    const rawTemplateLine = body[rowIdx].replace(/^ {2}/, indentUnit);
    const prefix = rowIdx === 0 ? '' : baseIndent;
    const colBase = rowIdx === 0 ? startCol : baseIndent.length;

    let rendered = '';
    let lastPos = 0;
    TABSTOP_TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null = null;

    while ((m = TABSTOP_TOKEN_RE.exec(rawTemplateLine)) !== null) {
      rendered += rawTemplateLine.slice(lastPos, m.index);
      const stopIdx = parseInt(m[1] ?? m[3], 10);
      const placeholder = m[2] ?? '';
      const stopCol = colBase + rendered.length;
      rendered += placeholder;
      rawStops.push({
        index: stopIdx,
        line: startLine + rowIdx,
        col: stopCol,
        length: placeholder.length,
        placeholder,
      });
      lastPos = m.index + m[0].length;
    }
    rendered += rawTemplateLine.slice(lastPos);
    expandedLines.push(prefix + rendered);
  }

  // 탭스톱 정렬: 1, 2, 3... 오름차순, $0 은 항상 맨 마지막
  rawStops.sort((a, b) => {
    if (a.index === 0 && b.index !== 0) return 1;
    if (b.index === 0 && a.index !== 0) return -1;
    return a.index - b.index;
  });

  // 중복 인덱스 제거 (첫 등장 우선)
  const seen = new Set<number>();
  const tabstops: SnippetTabstop[] = [];
  for (const s of rawStops) {
    if (seen.has(s.index)) continue;
    seen.add(s.index);
    tabstops.push({
      index: s.index,
      line: s.line,
      col: s.col,
      length: s.length,
      placeholder: s.placeholder,
    });
  }

  return { expandedLines, tabstops };
}

function focusTabstop(
  state: VimEditorState,
  session: SnippetSession,
  targetIdx: number
): VimEditorState {
  const stop = session.tabstops[targetIdx];
  if (!stop) {
    return {
      ...state,
      mode: 'INSERT',
      visualAnchor: undefined,
      snippetSession: null,
    };
  }

  const targetLine = Math.max(0, Math.min(stop.line, state.lines.length - 1));
  const lineText = state.lines[targetLine] ?? '';

  // 최종 종료 위치($0) 또는 빈 플레이스홀더 → INSERT 모드로 커서 이동 및 세션 종료/유지
  if (stop.index === 0 || stop.length === 0) {
    const col = Math.max(0, Math.min(stop.col, lineText.length));
    const isFinal = stop.index === 0 || targetIdx >= session.tabstops.length - 1;
    return {
      ...state,
      mode: 'INSERT',
      cursor: { line: targetLine, col },
      visualAnchor: undefined,
      snippetSession: isFinal ? null : { ...session, currentIndex: targetIdx },
      commandMessage: isFinal
        ? msg('[Snippet] "{trigger}" 완료', { trigger: session.trigger })
        : state.commandMessage,
    };
  }

  // 플레이스홀더 텍스트가 같은 줄에 아직 존재하면 실제 현재 위치 보정 (이전 편집으로 열이 밀린 경우 대응)
  let startCol = Math.max(0, Math.min(stop.col, Math.max(0, lineText.length - 1)));
  if (stop.placeholder && lineText.slice(startCol, startCol + stop.length) !== stop.placeholder) {
    const foundIdx = lineText.indexOf(stop.placeholder);
    if (foundIdx >= 0) {
      startCol = foundIdx;
    }
  }
  const endCol = Math.min(Math.max(0, lineText.length - 1), startCol + stop.length - 1);

  return {
    ...state,
    mode: 'SELECT',
    visualAnchor: { line: targetLine, col: startCol },
    cursor: { line: targetLine, col: endCol },
    snippetSession: {
      ...session,
      currentIndex: targetIdx,
      tabstops: session.tabstops.map((ts, i) =>
        i === targetIdx ? { ...ts, line: targetLine, col: startCol } : ts
      ),
    },
    commandMessage: msg('[Snippet] "{trigger}" (${step}/{total} · Tab 다음 · Shift-Tab 이전)', {
      trigger: session.trigger,
      step: targetIdx + 1,
      total: session.tabstops.length,
    }),
  };
}

/**
 * Insert 모드에서 커서 앞 토큰이 스니펫 트리거와 일치하면 Tab 으로 확장하고 $1 을 SELECT 모드로 선택합니다.
 */
export function tryExpandSnippetOnTab(state: VimEditorState): VimEditorState | null {
  if (state.blockInsertSession) return null;
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';
  const before = currentLine.slice(0, col);
  const after = currentLine.slice(col);

  // 줄 시작(들여쓰기 포함) 또는 공백 뒤의 단독 트리거 단어만 매칭
  const match = before.match(/^([ \t]*)([a-zA-Z]+)$/) ?? before.match(/(\s)([a-zA-Z]+)$/);
  if (!match) return null;

  const trigger = match[2];
  const def = SNIPPET_MAP.get(trigger);
  if (!def) return null;

  const startCol = col - trigger.length;
  const baseIndent = currentLine.match(/^[ \t]*/)?.[0] ?? '';
  const opts = getOptions(state);
  const sw = Math.max(1, opts.shiftwidth || 2);
  const indentUnit = opts.expandtab === false ? '\t' : ' '.repeat(sw);

  const { expandedLines, tabstops } = parseSnippetTemplate(
    def.body,
    line,
    startCol,
    baseIndent,
    indentUnit
  );

  const prefixBeforeTrigger = currentLine.slice(0, startCol);
  const splicedLines = [...expandedLines];
  splicedLines[0] = prefixBeforeTrigger + splicedLines[0];
  splicedLines[splicedLines.length - 1] = splicedLines[splicedLines.length - 1] + after;

  const nextLines = [
    ...state.lines.slice(0, line),
    ...splicedLines,
    ...state.lines.slice(line + 1),
  ];

  const stateWithUndo = pushUndoSnapshot(state);
  const session: SnippetSession = {
    trigger,
    tabstops,
    currentIndex: 0,
  };

  const baseState: VimEditorState = {
    ...stateWithUndo,
    lines: nextLines,
    cursor: clampCursor(nextLines, { line, col: startCol }, 'INSERT'),
    snippetSession: session,
  };

  return focusTabstop(baseState, session, 0);
}

/**
 * 활성 스니펫 세션에서 다음(Tab) 또는 이전(Shift-Tab) 탭스톱으로 점프합니다.
 */
export function jumpSnippetTabstop(
  state: VimEditorState,
  direction: 'next' | 'prev'
): VimEditorState | null {
  const session = state.snippetSession;
  if (!session || session.tabstops.length === 0) return null;

  const nextIdx =
    direction === 'next' ? session.currentIndex + 1 : session.currentIndex - 1;
  if (nextIdx < 0) {
    return focusTabstop(state, session, 0);
  }
  if (nextIdx >= session.tabstops.length) {
    return {
      ...state,
      mode: 'INSERT',
      visualAnchor: undefined,
      snippetSession: null,
      commandMessage: msg('[Snippet] "{trigger}" 완료', { trigger: session.trigger }),
    };
  }
  return focusTabstop(state, session, nextIdx);
}

/**
 * `:Snippets` — 사용 가능한 내장 스니펫 트리거 목록을 반환합니다.
 */
export function formatSnippetsList(): string {
  const summary = BUILTIN_SNIPPETS.map((s) => `${s.trigger}<Tab>(${s.description})`).join(' · ');
  return msg('[Snippets] {list}', { list: summary });
}
