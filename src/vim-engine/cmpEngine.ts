import { CompletionItemKind, CompletionItemMeta, VimEditorState } from './types';
import {
  acceptCompletion,
  findCompletionPrefix,
  scanBufferWords,
  selectCompletionCandidate,
  startOrCycleCompletion,
} from './completion';
import { BUILTIN_SNIPPETS, tryExpandSnippetOnTab } from './snippetEngine';
import { extractDocumentSymbols } from './lspRefactorEngine';

function mapSymbolKindToCmpKind(rawKind: string): CompletionItemKind {
  const lower = rawKind.toLowerCase();
  if (lower.includes('func') || lower.includes('method')) return 'Function';
  if (lower.includes('class') || lower.includes('interface') || lower.includes('type')) {
    return 'Class';
  }
  if (lower.includes('prop') || lower.includes('field')) return 'Property';
  return 'Variable';
}

function collectCmpItems(
  state: VimEditorState,
  prefix: string,
  line: number,
  col: number
): CompletionItemMeta[] {
  const lowerPrefix = prefix.toLowerCase();
  const seen = new Set<string>();
  const items: CompletionItemMeta[] = [];

  // 1) LuaSnip 스타일 내장 스니펫 (최우선)
  for (const snip of BUILTIN_SNIPPETS) {
    if (!lowerPrefix || snip.trigger.toLowerCase().startsWith(lowerPrefix)) {
      if (seen.has(`snip:${snip.trigger}`)) continue;
      seen.add(`snip:${snip.trigger}`);
      items.push({
        label: snip.trigger,
        kind: 'Snippet',
        detail: snip.description,
        preview: snip.body.map((b) =>
          b.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\d+/g, '')
        ),
        snippetTrigger: snip.trigger,
      });
    }
  }

  // 2) LSP 문서 심볼 & 등록된 lspSymbols
  const docSymbols = extractDocumentSymbols(state.lines);
  for (const sym of docSymbols) {
    if (!sym.name) continue;
    if (lowerPrefix && !sym.name.toLowerCase().startsWith(lowerPrefix)) continue;
    if (sym.name === prefix) continue;
    if (seen.has(sym.name)) continue;
    seen.add(sym.name);
    items.push({
      label: sym.name,
      kind: mapSymbolKindToCmpKind(sym.kind),
      detail: `${sym.kind} · L${sym.line + 1}`,
      preview: [state.lines[sym.line]?.trim() ?? sym.name],
    });
  }

  if (state.lspSymbols) {
    for (const [symName, info] of Object.entries(state.lspSymbols)) {
      if (lowerPrefix && !symName.toLowerCase().startsWith(lowerPrefix)) continue;
      if (symName === prefix || seen.has(symName)) continue;
      seen.add(symName);
      items.push({
        label: symName,
        kind: mapSymbolKindToCmpKind(info.kind),
        detail: info.signature,
        preview: [info.signature, info.documentation].filter(Boolean),
      });
    }
  }

  // 3) 버퍼/분할창/열린 버퍼 단어 (중복 제외)
  const bufferWords = scanBufferWords(
    state.lines,
    prefix,
    line,
    col,
    state.buffers,
    state.splitPanes
  );
  for (const word of bufferWords) {
    if (seen.has(word) || seen.has(`snip:${word}`)) continue;
    seen.add(word);
    items.push({
      label: word,
      kind: 'Text',
      detail: 'buffer',
    });
  }

  return items.slice(0, 24);
}

/**
 * nvim-cmp 스타일 통합 자동완성 팝업을 시작하거나 다음/이전 항목으로 순환합니다 (Ctrl-Space).
 * LuaSnip 스니펫([Snip]), LSP 심볼([Func]/[Class]/[Var]), 버퍼 단어([Text])를 통합 제안합니다.
 */
export function startCmpCompletion(
  state: VimEditorState,
  direction: 'next' | 'prev' = 'next'
): VimEditorState {
  if (state.completionSession?.type === 'cmp') {
    return startOrCycleCompletion(state, direction);
  }

  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';
  const found = findCompletionPrefix(currentLine, col, 1);
  const prefix = found?.prefix ?? '';
  const startCol = found?.startCol ?? col;

  const items = collectCmpItems(state, prefix, line, col);
  if (items.length === 0) {
    return {
      ...state,
      commandMessage: '-- Pattern not found --',
    };
  }

  const candidates = items.map((it) => it.label);
  const initialIndex = direction === 'next' ? 0 : candidates.length - 1;
  const chosen = candidates[initialIndex];
  const newLine = currentLine.slice(0, startCol) + chosen + currentLine.slice(col);
  const nextLines = [...state.lines];
  nextLines[line] = newLine;
  const nextCol = startCol + chosen.length;

  return {
    ...state,
    lines: nextLines,
    cursor: { line, col: nextCol },
    insertCtrlXMode: false,
    commandMessage: undefined,
    completionSession: {
      prefix,
      prefixStartCol: startCol,
      candidates,
      selectedIndex: initialIndex,
      originalWord: prefix,
      type: 'cmp',
      items,
    },
  };
}

/**
 * nvim-cmp 통합 자동완성 확정: 선택된 항목이 스니펫이면 즉시 LuaSnip 템플릿을 확장하고,
 * 일반 심볼/단어이면 세션을 닫고 커서를 유지합니다.
 */
export function acceptCmpCompletion(state: VimEditorState): VimEditorState {
  const session = state.completionSession;
  if (!session) return state;

  const selectedMeta =
    session.type === 'cmp' ? session.items?.[session.selectedIndex] : undefined;
  const accepted = acceptCompletion(state);

  if (selectedMeta?.snippetTrigger) {
    const expanded = tryExpandSnippetOnTab(accepted);
    if (expanded) return expanded;
  }
  return accepted;
}

/**
 * nvim-cmp 통합 자동완성 팝업에서 특정 인덱스를 클릭/선택 확정합니다.
 */
export function selectCmpCompletionCandidate(
  state: VimEditorState,
  index: number
): VimEditorState {
  const session = state.completionSession;
  if (!session) return state;
  const selectedMeta = session.type === 'cmp' ? session.items?.[index] : undefined;
  const applied = selectCompletionCandidate(state, index);
  if (selectedMeta?.snippetTrigger) {
    const expanded = tryExpandSnippetOnTab(applied);
    if (expanded) return expanded;
  }
  return applied;
}
