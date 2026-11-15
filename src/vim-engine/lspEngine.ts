import {
  LspDiagnostic,
  LspDiagnosticSeverity,
  QuickfixItem,
  QuickfixState,
  VimEditorState,
} from './types';
import { msg } from './messages';
import { ringBell } from './engineHelpers';
import { clampCursor } from './cursor';

const SEVERITY_MAP: Record<LspDiagnosticSeverity, 'E' | 'W' | 'I'> = {
  error: 'E',
  warning: 'W',
  info: 'I',
  hint: 'I',
};

const SEVERITY_BADGE: Record<LspDiagnosticSeverity, string> = {
  error: 'E',
  warning: 'W',
  info: 'I',
  hint: 'H',
};

export function sortDiagnostics(diagnostics: readonly LspDiagnostic[]): LspDiagnostic[] {
  return [...diagnostics].sort((a, b) => (a.line !== b.line ? a.line - b.line : a.col - b.col));
}

export function diagnosticsToQuickfixItems(
  filename: string,
  diagnostics: readonly LspDiagnostic[]
): QuickfixItem[] {
  return sortDiagnostics(diagnostics).map((d) => ({
    filename,
    line: d.line + 1,
    col: d.col + 1,
    text: d.code ? `[${d.code}] ${d.message}` : d.message,
    type: SEVERITY_MAP[d.severity],
  }));
}

export function formatDiagnosticMessage(
  diag: LspDiagnostic,
  index: number,
  total: number
): string {
  const sev = SEVERITY_BADGE[diag.severity] ?? 'E';
  const label = diag.code ? `[${sev}][${diag.code}]` : `[${sev}]`;
  return msg('{label} {message} ({idx}/{total})', {
    label,
    message: diag.message,
    idx: index + 1,
    total,
  });
}

/**
 * [d, ]d, [D, ]D 진단(Diagnostic) 탐색
 */
export function jumpToDiagnostic(
  state: VimEditorState,
  direction: 'next' | 'prev' | 'first' | 'last',
  count = 1
): VimEditorState {
  const sorted = sortDiagnostics(state.lspDiagnostics ?? []);
  if (sorted.length === 0) {
    return ringBell({
      ...state,
      lspHover: null,
      pendingKeys: undefined,
      commandMessage: msg('진단(Diagnostic) 항목이 없습니다'),
    });
  }

  const { line: curLine, col: curCol } = state.cursor;
  const steps = Math.max(1, count);
  let targetIdx = 0;

  if (direction === 'first') {
    targetIdx = 0;
  } else if (direction === 'last') {
    targetIdx = sorted.length - 1;
  } else if (direction === 'next') {
    const afterIdx = sorted.findIndex(
      (d) => d.line > curLine || (d.line === curLine && d.col > curCol)
    );
    const baseIdx = afterIdx >= 0 ? afterIdx : 0;
    targetIdx = (baseIdx + (steps - 1)) % sorted.length;
  } else {
    let beforeIdx = -1;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const d = sorted[i];
      if (d.line < curLine || (d.line === curLine && d.col < curCol)) {
        beforeIdx = i;
        break;
      }
    }
    const baseIdx = beforeIdx >= 0 ? beforeIdx : sorted.length - 1;
    targetIdx = (((baseIdx - (steps - 1)) % sorted.length) + sorted.length) % sorted.length;
  }

  const target = sorted[targetIdx];
  const nextCursor = clampCursor(
    state.lines,
    { line: target.line, col: target.col },
    state.mode
  );

  let nextLoc = state.locationList;
  if (nextLoc && nextLoc.items.length > 0) {
    const locIdx = nextLoc.items.findIndex(
      (item) => item.line === target.line + 1 && item.col === target.col + 1
    );
    if (locIdx >= 0 && locIdx !== nextLoc.currentIndex) {
      nextLoc = { ...nextLoc, currentIndex: locIdx };
    }
  }

  return {
    ...state,
    cursor: nextCursor,
    lspHover: null,
    pendingKeys: undefined,
    locationList: nextLoc,
    commandMessage: formatDiagnosticMessage(target, targetIdx, sorted.length),
  };
}

/**
 * 현재 LSP 진단 목록을 창 로케이션 리스트(Location List)에 반영하고 필요 시 :lopen 으로 엽니다.
 */
export function syncDiagnosticsToLocationList(
  state: VimEditorState,
  openWindow = false
): VimEditorState {
  const diags = state.lspDiagnostics ?? [];
  const filename = state.primaryFilename || 'main.ts';
  const items = diagnosticsToQuickfixItems(filename, diags);
  const prevLoc = state.locationList;
  const nextLoc: QuickfixState = {
    items,
    currentIndex: items.length > 0 ? Math.min(prevLoc?.currentIndex ?? 0, items.length - 1) : 0,
    isOpen: openWindow ? true : (prevLoc?.isOpen ?? false),
    height: prevLoc?.height ?? 6,
  };

  return {
    ...state,
    locationList: nextLoc,
    commandMessage: openWindow
      ? msg('로케이션 리스트 윈도우 열림 ({itemsCount}개 항목)', { itemsCount: items.length })
      : state.commandMessage,
  };
}

function matchRuleOnLine(
  lineText: string,
  pattern: string,
  highlightGroup = 0
): { col: number; endCol: number } | null {
  try {
    const regex = new RegExp(pattern);
    const match = regex.exec(lineText);
    if (!match) return null;

    if (highlightGroup > 0 && match[highlightGroup] !== undefined) {
      const fullStart = match.index;
      const groupOffset = match[0].indexOf(match[highlightGroup]);
      const start = fullStart + Math.max(0, groupOffset);
      return {
        col: start,
        endCol: start + match[highlightGroup].length,
      };
    }

    return {
      col: match.index,
      endCol: Math.max(match.index + 1, match.index + match[0].length),
    };
  } catch {
    return null;
  }
}

/**
 * 버퍼 줄이 변경될 때 rule 기반 진단(Diagnostic)과 Location List 항목을 실시간 재계산합니다.
 */
export function syncLiveLspDiagnostics(
  prevState: VimEditorState,
  nextState: VimEditorState
): VimEditorState {
  if (!nextState.lspDiagnostics || prevState.lines === nextState.lines) {
    return nextState;
  }

  const nextDiags: LspDiagnostic[] = [];
  for (const diag of nextState.lspDiagnostics) {
    if (!diag.rule?.matchPattern) {
      if (diag.line >= 0 && diag.line < nextState.lines.length) {
        nextDiags.push(diag);
      }
      continue;
    }

    const { matchPattern, highlightGroup } = diag.rule;
    let resolvedLine = -1;
    let span: { col: number; endCol: number } | null = null;

    // 기존 줄 우선 확인 후, 줄 삽입/삭제 대응을 위해 전체 줄 스캔
    if (diag.line >= 0 && diag.line < nextState.lines.length) {
      const hit = matchRuleOnLine(nextState.lines[diag.line], matchPattern, highlightGroup);
      if (hit) {
        resolvedLine = diag.line;
        span = hit;
      }
    }

    if (!span) {
      for (let i = 0; i < nextState.lines.length; i++) {
        const hit = matchRuleOnLine(nextState.lines[i], matchPattern, highlightGroup);
        if (hit) {
          resolvedLine = i;
          span = hit;
          break;
        }
      }
    }

    if (span && resolvedLine >= 0) {
      nextDiags.push({
        ...diag,
        line: resolvedLine,
        col: span.col,
        endCol: span.endCol,
      });
    }
  }

  let nextLoc = nextState.locationList;
  if (nextLoc) {
    const filename = nextState.primaryFilename || 'main.ts';
    const items = diagnosticsToQuickfixItems(filename, nextDiags);
    nextLoc = {
      ...nextLoc,
      items,
      currentIndex: items.length > 0 ? Math.min(nextLoc.currentIndex, items.length - 1) : 0,
    };
  }

  return {
    ...nextState,
    lspDiagnostics: nextDiags,
    locationList: nextLoc,
  };
}

/**
 * Neovim 스타일 LSP 호버 팝업 열기/토글 (K)
 * lspSymbols가 설정되지 않은 일반 Vim 버퍼에서는 null을 반환해 기존 :help 로 폴백합니다.
 */
export function openLspHover(
  state: VimEditorState,
  word?: string | null
): VimEditorState | null {
  if (!state.lspSymbols) {
    return null;
  }

  if (state.lspHover?.isOpen && (!word || state.lspHover.symbol === word)) {
    return {
      ...state,
      lspHover: null,
      pendingKeys: undefined,
      commandMessage: '',
    };
  }

  const trimmed = word?.trim() ?? '';
  const entry = trimmed ? state.lspSymbols[trimmed] : undefined;

  if (!entry) {
    return {
      ...state,
      lspHover: null,
      pendingKeys: undefined,
      commandMessage: trimmed
        ? msg('LSP: "{word}"에 대한 호버 정보가 없습니다', { word: trimmed })
        : msg('LSP: 커서 아래 심볼에 대한 호버 정보가 없습니다'),
    };
  }

  return {
    ...state,
    lspHover: {
      isOpen: true,
      symbol: entry.symbol,
      kind: entry.kind,
      signature: entry.signature,
      documentation: entry.documentation,
      source: entry.source,
      line: state.cursor.line,
      col: state.cursor.col,
    },
    pendingKeys: undefined,
    commandMessage: msg('[LSP] {symbol}: {signature}', {
      symbol: entry.symbol,
      signature: entry.signature,
    }),
  };
}

export function closeLspHover(state: VimEditorState): VimEditorState {
  if (!state.lspHover?.isOpen) return state;
  return {
    ...state,
    lspHover: null,
    pendingKeys: undefined,
    commandMessage: '',
  };
}
