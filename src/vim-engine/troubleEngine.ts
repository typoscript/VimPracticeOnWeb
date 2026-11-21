import {
  TroubleItem,
  TroubleMode,
  TroubleSeverity,
  VimEditorState,
} from './types';
import { clampCursor } from './cursor';
import { buildVfsMap } from './vfs';
import { editBuffer, ensureBuffers } from './bufferEngine';
import { msg } from './messages';

const TODO_TAG_RE = /\b(TODO|FIXME|HACK|BUG|WARN|NOTE)\b\s*:?\s*(.*)$/i;

function mapDiagnosticSeverity(sev: string): TroubleSeverity {
  if (sev === 'error') return 'error';
  if (sev === 'warning') return 'warning';
  return 'info';
}

/**
 * 현재 버퍼·열린 버퍼·VFS 전체에서 진단(Diagnostics), TODO 주석, 퀵픽스 항목을 수집합니다.
 */
export function collectTroubleItems(
  state: VimEditorState,
  mode: TroubleMode = 'all'
): TroubleItem[] {
  const items: TroubleItem[] = [];
  const seen = new Set<string>();
  const curFile = state.primaryFilename || 'current';

  const pushUnique = (item: TroubleItem) => {
    const key = `${item.filename}:${item.line}:${item.col}:${item.source}:${item.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  // 1. LSP Diagnostics
  if (mode === 'all' || mode === 'diagnostics') {
    for (const d of state.lspDiagnostics ?? []) {
      pushUnique({
        id: `diag-${curFile}-${d.line}-${d.col}-${d.id}`,
        filename: curFile,
        line: d.line,
        col: d.col,
        severity: mapDiagnosticSeverity(d.severity),
        tag: d.code || d.severity.toUpperCase(),
        message: d.message,
        source: 'diagnostics',
      });
    }
  }

  // 2. TODO / FIXME / HACK / BUG / WARN / NOTE 주석 스캔 (현재 버퍼 + VFS)
  if (mode === 'all' || mode === 'todo') {
    const fileMap: Record<string, string[]> = { ...buildVfsMap(state) };
    fileMap[curFile] = state.lines;
    for (const buf of state.buffers ?? []) {
      if (buf.name) fileMap[buf.name] = buf.lines;
    }

    const sortedFiles = Object.keys(fileMap).sort((a, b) => a.localeCompare(b));
    for (const filename of sortedFiles) {
      const lines = fileMap[filename] ?? [];
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const lineText = lines[lineIdx] ?? '';
        const m = lineText.match(TODO_TAG_RE);
        if (!m) continue;
        const tag = m[1].toUpperCase();
        const col = m.index ?? 0;
        const detail = (m[2] ?? '').trim() || lineText.trim();
        const sev: TroubleSeverity =
          tag === 'BUG' || tag === 'FIXME'
            ? 'error'
            : tag === 'WARN' || tag === 'HACK'
              ? 'warning'
              : 'todo';
        pushUnique({
          id: `todo-${filename}-${lineIdx}-${col}`,
          filename,
          line: lineIdx,
          col,
          severity: sev,
          tag,
          message: detail,
          source: 'todo',
        });
      }
    }
  }

  // 3. Quickfix List
  if (mode === 'all' || mode === 'quickfix') {
    for (const q of state.quickfix?.items ?? []) {
      const filename = q.filename || curFile;
      const line = Math.max(0, (q.line ?? 1) - 1);
      const col = Math.max(0, (q.col ?? 1) - 1);
      const sev: TroubleSeverity =
        q.type === 'E' ? 'error' : q.type === 'W' ? 'warning' : 'info';
      pushUnique({
        id: `qf-${filename}-${line}-${col}-${q.text}`,
        filename,
        line,
        col,
        severity: sev,
        tag: q.type || 'QF',
        message: q.text,
        source: 'quickfix',
      });
    }
  }

  items.sort(
    (a, b) => a.filename.localeCompare(b.filename) || a.line - b.line || a.col - b.col
  );

  return items;
}

/**
 * `:Trouble [mode]` — trouble.nvim 통합 진단/TODO 허브 패널을 엽니다.
 */
export function openTroublePanel(
  state: VimEditorState,
  mode: TroubleMode = 'all'
): VimEditorState {
  const items = collectTroubleItems(state, mode);
  return {
    ...state,
    troublePanel: {
      isOpen: true,
      mode,
      selectedIndex: 0,
      items,
    },
    commandMessage:
      items.length > 0
        ? msg('[Trouble:{mode}] {count}개 항목 발견', { mode, count: items.length })
        : msg('[Trouble:{mode}] 표시할 항목이 없습니다', { mode }),
  };
}

/**
 * Trouble 패널을 닫습니다 (:TroubleClose).
 */
export function closeTroublePanel(state: VimEditorState): VimEditorState {
  if (!state.troublePanel?.isOpen) return state;
  return {
    ...state,
    troublePanel: {
      ...state.troublePanel,
      isOpen: false,
    },
    commandMessage: msg('[Trouble] 패널을 닫았습니다'),
  };
}

/**
 * Trouble 패널을 토글합니다 (:TroubleToggle).
 */
export function toggleTroublePanel(
  state: VimEditorState,
  mode?: TroubleMode
): VimEditorState {
  if (state.troublePanel?.isOpen && (!mode || mode === state.troublePanel.mode)) {
    return closeTroublePanel(state);
  }
  return openTroublePanel(state, mode ?? state.troublePanel?.mode ?? 'all');
}

/**
 * Trouble 패널의 필터 모드를 변경하고 항목을 재수집합니다.
 */
export function setTroubleMode(
  state: VimEditorState,
  mode: TroubleMode
): VimEditorState {
  return openTroublePanel(state, mode);
}

/**
 * Trouble 패널의 특정 항목(0-based index)으로 파일 전환 및 커서 점프를 수행합니다.
 */
export function jumpToTroubleItem(
  state: VimEditorState,
  index: number
): VimEditorState {
  const panel = state.troublePanel;
  if (!panel || panel.items.length === 0) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[Trouble] 이동할 항목이 없습니다'),
    };
  }
  const safeIdx = ((index % panel.items.length) + panel.items.length) % panel.items.length;
  const item = panel.items[safeIdx];
  let nextState = ensureBuffers(state);
  if (item.filename && item.filename !== 'current' && item.filename !== nextState.primaryFilename) {
    nextState = editBuffer(nextState, item.filename);
  }
  const nextCursor = clampCursor(
    nextState.lines,
    { line: item.line, col: item.col },
    'NORMAL'
  );
  return {
    ...nextState,
    cursor: nextCursor,
    mode: 'NORMAL',
    troublePanel: {
      ...panel,
      selectedIndex: safeIdx,
    },
    commandMessage: msg('[Trouble] {file}:{line} — {msg}', {
      file: item.filename,
      line: item.line + 1,
      msg: item.message,
    }),
  };
}

/**
 * `:Trouble*` 계열 Ex 명령을 통합 처리합니다.
 */
export function executeTroubleCommand(
  state: VimEditorState,
  cmdName: string,
  rawArg: string
): VimEditorState {
  const lowerCmd = cmdName.toLowerCase();
  const arg = rawArg.trim().toLowerCase();

  if (lowerCmd === 'troubleclose') return closeTroublePanel(state);
  if (lowerCmd === 'troubletoggle') {
    const mode = isTroubleMode(arg) ? arg : undefined;
    return toggleTroublePanel(state, mode);
  }
  if (lowerCmd === 'troublenext') {
    const cur = state.troublePanel?.isOpen ? state.troublePanel : openTroublePanel(state).troublePanel!;
    return jumpToTroubleItem({ ...state, troublePanel: cur }, (cur.selectedIndex ?? -1) + 1);
  }
  if (lowerCmd === 'troubleprev') {
    const cur = state.troublePanel?.isOpen ? state.troublePanel : openTroublePanel(state).troublePanel!;
    return jumpToTroubleItem({ ...state, troublePanel: cur }, (cur.selectedIndex ?? 0) - 1);
  }

  // :Trouble [arg]
  if (!arg) return openTroublePanel(state, 'all');
  if (arg === 'close') return closeTroublePanel(state);
  if (arg === 'toggle') return toggleTroublePanel(state);
  if (arg === 'next') {
    const cur = state.troublePanel?.isOpen ? state.troublePanel : openTroublePanel(state).troublePanel!;
    return jumpToTroubleItem({ ...state, troublePanel: cur }, (cur.selectedIndex ?? -1) + 1);
  }
  if (arg === 'prev') {
    const cur = state.troublePanel?.isOpen ? state.troublePanel : openTroublePanel(state).troublePanel!;
    return jumpToTroubleItem({ ...state, troublePanel: cur }, (cur.selectedIndex ?? 0) - 1);
  }
  if (isTroubleMode(arg)) return openTroublePanel(state, arg);
  if (arg === 'diag' || arg === 'workspace_diagnostics' || arg === 'document_diagnostics') {
    return openTroublePanel(state, 'diagnostics');
  }
  if (arg === 'qf') return openTroublePanel(state, 'quickfix');

  return {
    ...state,
    bell: true,
    commandMessage: msg('[Trouble] 알 수 없는 모드입니다: {mode}', { mode: rawArg.trim() }),
  };
}

function isTroubleMode(val: string): val is TroubleMode {
  return val === 'all' || val === 'diagnostics' || val === 'todo' || val === 'quickfix';
}
