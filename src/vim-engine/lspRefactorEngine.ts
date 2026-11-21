import {
  LspCodeAction,
  LspHoverSymbol,
  QuickfixItem,
  VimEditorState,
} from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { msg } from './messages';
import { buildVfsMap } from './vfs';
import { setQuickfixList, openQuickfixWindow } from './quickfixEngine';
import { setLocationList, openLocationListWindow } from './locationListEngine';
import { getWordAtCursor } from './search';
import { ringBell } from './engineHelpers';

export interface LspDocumentSymbol {
  name: string;
  kind: string;
  line: number;
  col: number;
}

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const IDENT_CHAR_RE = /[A-Za-z0-9_$]/;

function isValidIdentifier(name: string): boolean {
  return IDENT_RE.test(name);
}

/** 한 줄 안에서 식별자 경계를 지키며 symbol 이 일치하는 모든 0-based 열 인덱스를 반환합니다. */
export function findWholeWordMatchesInLine(line: string, symbol: string): number[] {
  if (!symbol || !line) return [];
  const cols: number[] = [];
  let start = 0;
  while (start <= line.length - symbol.length) {
    const idx = line.indexOf(symbol, start);
    if (idx < 0) break;
    const before = idx > 0 ? line[idx - 1] : '';
    const after = idx + symbol.length < line.length ? line[idx + symbol.length] : '';
    if (!IDENT_CHAR_RE.test(before) && !IDENT_CHAR_RE.test(after)) {
      cols.push(idx);
    }
    start = idx + Math.max(1, symbol.length);
  }
  return cols;
}

function replaceWholeWordInLines(
  lines: string[],
  oldName: string,
  newName: string
): { lines: string[]; count: number } {
  let count = 0;
  const nextLines = lines.map((line) => {
    const matches = findWholeWordMatchesInLine(line, oldName);
    if (matches.length === 0) return line;
    count += matches.length;
    let out = '';
    let prev = 0;
    for (const col of matches) {
      out += line.slice(prev, col) + newName;
      prev = col + oldName.length;
    }
    out += line.slice(prev);
    return out;
  });
  return { lines: count > 0 ? nextLines : lines, count };
}

function countOccurrencesAcrossProject(
  state: VimEditorState,
  symbol: string
): { occurrenceCount: number; fileCount: number } {
  const vfs = buildVfsMap(state);
  const curName = state.primaryFilename || 'source.ts';
  if (!vfs[curName]) {
    vfs[curName] = state.lines;
  }
  let occurrenceCount = 0;
  let fileCount = 0;
  for (const [fname, fileLines] of Object.entries(vfs)) {
    if (fname.startsWith('Netrw')) continue;
    let fileHits = 0;
    for (const line of fileLines) {
      fileHits += findWholeWordMatchesInLine(line, symbol).length;
    }
    if (fileHits > 0) {
      occurrenceCount += fileHits;
      fileCount++;
    }
  }
  return { occurrenceCount, fileCount };
}

/**
 * Neovim 0.11 `grn` / `:LspRename [newName]`:
 * 인자 없이 호출하면 커서 아래 심볼에 대한 대화형 이름 변경 프롬프트를 열고,
 * 새 이름이 주어지면 즉시 다중 버퍼/VFS 전체에 일괄 적용합니다.
 */
export function openLspRename(
  state: VimEditorState,
  explicitNewName?: string
): VimEditorState {
  const curLine = state.lines[state.cursor.line] ?? '';
  const symbol = getWordAtCursor(curLine, state.cursor.col);
  if (!symbol || !isValidIdentifier(symbol)) {
    return {
      ...ringBell(state),
      lspHover: null,
      lspCodeActionMenu: null,
      commandMessage: msg('E349: 커서 위치에 식별자가 없습니다 (no identifier under cursor)'),
    };
  }

  if (explicitNewName !== undefined) {
    return applyLspRename(state, explicitNewName, symbol);
  }

  const { occurrenceCount, fileCount } = countOccurrencesAcrossProject(state, symbol);

  return {
    ...state,
    pendingKeys: undefined,
    lspHover: null,
    lspCodeActionMenu: null,
    lspRename: {
      isOpen: true,
      oldName: symbol,
      newName: symbol,
      line: state.cursor.line,
      col: state.cursor.col,
      occurrenceCount: Math.max(1, occurrenceCount),
      fileCount: Math.max(1, fileCount),
    },
    commandMessage: undefined,
  };
}

/**
 * 심볼 이름 변경을 현재 버퍼·열린 버퍼·분할 창·VFS·LSP 심볼 테이블에 일괄 적용합니다.
 */
export function applyLspRename(
  state: VimEditorState,
  rawNewName: string,
  explicitOldName?: string
): VimEditorState {
  const oldName = explicitOldName ?? state.lspRename?.oldName;
  const newName = rawNewName.trim();
  if (!oldName) return { ...state, lspRename: null, pendingKeys: undefined };

  if (!newName || !isValidIdentifier(newName)) {
    return {
      ...ringBell(state),
      lspRename: null,
      commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token: rawNewName }),
    };
  }

  if (newName === oldName) {
    return {
      ...state,
      lspRename: null,
      pendingKeys: undefined,
      commandMessage: msg('LSP: 이름이 변경되지 않았습니다'),
    };
  }

  const withUndo = pushUndoSnapshot(state);
  const touchedFiles = new Set<string>();
  let totalCount = 0;

  const curFilename = state.primaryFilename || 'source.ts';
  const curRes = replaceWholeWordInLines(state.lines, oldName, newName);
  if (curRes.count > 0) {
    totalCount += curRes.count;
    touchedFiles.add(curFilename);
  }

  // 열린 버퍼 일괄 갱신
  const nextBuffers = state.buffers
    ? state.buffers.map((buf) => {
        if (buf.id === state.currentBufferId) {
          return {
            ...buf,
            lines: curRes.lines,
            isModified: buf.isModified || curRes.count > 0,
          };
        }
        const bRes = replaceWholeWordInLines(buf.lines, oldName, newName);
        if (bRes.count > 0) {
          if (!touchedFiles.has(buf.name)) {
            totalCount += bRes.count;
            touchedFiles.add(buf.name);
          }
          return {
            ...buf,
            lines: bRes.lines,
            cursor: clampCursor(bRes.lines, buf.cursor, 'NORMAL'),
            isModified: true,
          };
        }
        return buf;
      })
    : undefined;

  // 분할 창 일괄 갱신
  const nextSplitPanes = state.splitPanes
    ? state.splitPanes.map((pane, idx) => {
        if (idx === (state.activePaneIndex ?? 0)) {
          return {
            ...pane,
            lines: curRes.lines,
            cursor: clampCursor(curRes.lines, pane.cursor, pane.mode),
          };
        }
        const pRes = replaceWholeWordInLines(pane.lines, oldName, newName);
        if (pRes.count > 0) {
          if (!touchedFiles.has(pane.filename)) {
            totalCount += pRes.count;
            touchedFiles.add(pane.filename);
          }
          return {
            ...pane,
            lines: pRes.lines,
            cursor: clampCursor(pRes.lines, pane.cursor, pane.mode),
          };
        }
        return pane;
      })
    : undefined;

  // VFS 가상 파일 일괄 갱신
  let nextVirtualFiles = state.virtualFiles ? { ...state.virtualFiles } : undefined;
  const vfsSource = buildVfsMap(state);
  for (const [fname, flines] of Object.entries(vfsSource)) {
    if (fname.startsWith('Netrw')) continue;
    if (fname === curFilename) {
      if (nextVirtualFiles && curRes.count > 0) {
        nextVirtualFiles[fname] = [...curRes.lines];
      }
      continue;
    }
    const fRes = replaceWholeWordInLines(flines, oldName, newName);
    if (fRes.count > 0) {
      if (!touchedFiles.has(fname)) {
        totalCount += fRes.count;
        touchedFiles.add(fname);
      }
      if (!nextVirtualFiles) nextVirtualFiles = {};
      nextVirtualFiles[fname] = fRes.lines;
    }
  }

  // lspSymbols 키/시그니처 동기화
  let nextLspSymbols = state.lspSymbols;
  if (state.lspSymbols && state.lspSymbols[oldName]) {
    const oldSym: LspHoverSymbol = state.lspSymbols[oldName];
    const updatedSym: LspHoverSymbol = {
      ...oldSym,
      symbol: newName,
      signature: replaceWholeWordInLines([oldSym.signature], oldName, newName).lines[0],
    };
    const copied = { ...state.lspSymbols };
    delete copied[oldName];
    copied[newName] = updatedSym;
    nextLspSymbols = copied;
  }

  const nextCursor = clampCursor(curRes.lines, state.cursor, 'NORMAL');

  return {
    ...withUndo,
    lines: curRes.lines,
    cursor: nextCursor,
    buffers: nextBuffers,
    splitPanes: nextSplitPanes,
    virtualFiles: nextVirtualFiles,
    lspSymbols: nextLspSymbols,
    lspRename: null,
    lspHover: null,
    pendingKeys: undefined,
    commandMessage: msg('[LSP] "{oldName}" → "{newName}" ({count}개 위치, {files}개 파일 변경)', {
      oldName,
      newName,
      count: totalCount,
      files: touchedFiles.size,
    }),
  };
}

export function cancelLspRename(state: VimEditorState): VimEditorState {
  if (!state.lspRename?.isOpen) return state;
  return {
    ...state,
    lspRename: null,
    pendingKeys: undefined,
    commandMessage: msg('LSP: 이름 변경이 취소되었습니다'),
  };
}

/**
 * LSP Rename 프롬프트가 열려 있을 때 키 입력을 처리합니다.
 */
export function handleLspRenameKey(state: VimEditorState, key: string): VimEditorState {
  const rename = state.lspRename;
  if (!rename?.isOpen) return state;

  if (key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c' || key === '<C-c>') {
    return cancelLspRename(state);
  }
  if (key === 'Enter' || key === '<CR>' || key === '\r' || key === '\n') {
    return applyLspRename(state, rename.newName, rename.oldName);
  }
  if (key === 'Backspace' || key === 'Ctrl-h' || key === 'Ctrl+h') {
    return {
      ...state,
      lspRename: { ...rename, newName: rename.newName.slice(0, -1) },
    };
  }
  if (key === 'Ctrl-u' || key === 'Ctrl+u') {
    return {
      ...state,
      lspRename: { ...rename, newName: '' },
    };
  }
  if (key === 'Ctrl-w' || key === 'Ctrl+w') {
    const trimmed = rename.newName.replace(/[A-Za-z0-9_$]+$|[^A-Za-z0-9_$]+$/, '');
    return {
      ...state,
      lspRename: { ...rename, newName: trimmed },
    };
  }
  if (key.length === 1 && !key.startsWith('<')) {
    return {
      ...state,
      lspRename: { ...rename, newName: rename.newName + key },
    };
  }
  return state;
}

/**
 * Neovim 0.11 `grr` / `:LspReferences [symbol]`:
 * 프로젝트 전체에서 심볼 참조를 수집하여 Quickfix 리스트를 채우고 창을 엽니다.
 */
export function findLspReferences(
  state: VimEditorState,
  explicitSymbol?: string
): VimEditorState {
  const curLine = state.lines[state.cursor.line] ?? '';
  const symbol = explicitSymbol?.trim() || getWordAtCursor(curLine, state.cursor.col);
  if (!symbol || !isValidIdentifier(symbol)) {
    return {
      ...ringBell(state),
      lspHover: null,
      commandMessage: msg('E349: 커서 위치에 식별자가 없습니다 (no identifier under cursor)'),
    };
  }

  const curFilename = state.primaryFilename || 'source.ts';
  const vfs = buildVfsMap(state);
  if (!vfs[curFilename]) {
    vfs[curFilename] = [...state.lines];
  }

  const orderedFiles = [
    curFilename,
    ...Object.keys(vfs)
      .filter((f) => f !== curFilename && !f.startsWith('Netrw'))
      .sort(),
  ];

  const items: QuickfixItem[] = [];
  const matchedFiles = new Set<string>();

  for (const filename of orderedFiles) {
    const fileLines = vfs[filename] ?? [];
    for (let i = 0; i < fileLines.length; i++) {
      const cols = findWholeWordMatchesInLine(fileLines[i], symbol);
      for (const col of cols) {
        matchedFiles.add(filename);
        items.push({
          filename,
          line: i + 1,
          col: col + 1,
          text: fileLines[i].trim(),
          type: 'I',
        });
      }
    }
  }

  if (items.length === 0) {
    return {
      ...ringBell(state),
      lspHover: null,
      commandMessage: msg('LSP: "{symbol}" 참조를 찾을 수 없습니다', { symbol }),
    };
  }

  const withList = setQuickfixList({ ...state, lspHover: null, pendingKeys: undefined }, items, false);
  const currentHitIdx = items.findIndex(
    (it) => it.filename === curFilename && it.line === state.cursor.line + 1
  );
  const adjustedQf =
    withList.quickfix && currentHitIdx >= 0
      ? { ...withList.quickfix, currentIndex: currentHitIdx }
      : withList.quickfix;

  const opened = openQuickfixWindow({ ...withList, quickfix: adjustedQf });
  return {
    ...opened,
    commandMessage: msg('[LSP] "{symbol}" 참조 {count}개 ({files}개 파일)', {
      symbol,
      count: items.length,
      files: matchedFiles.size,
    }),
  };
}

/**
 * 현재 커서 줄에서 적용 가능한 사용자 정의 + 자동 추론 코드 액션을 수집합니다.
 */
export function collectCodeActionsAtCursor(state: VimEditorState): LspCodeAction[] {
  const lineIdx = state.cursor.line;
  const lineText = state.lines[lineIdx] ?? '';
  const lineDiags = (state.lspDiagnostics ?? []).filter((d) => d.line === lineIdx);
  const lineDiagIds = new Set(lineDiags.map((d) => d.id));

  const actions: LspCodeAction[] = [];
  const seenTitles = new Set<string>();
  const pushUnique = (action: LspCodeAction) => {
    if (seenTitles.has(action.title)) return;
    seenTitles.add(action.title);
    actions.push(action);
  };

  // 1. 미션/버퍼에 명시적으로 등록된 커스텀 코드 액션
  for (const act of state.lspCodeActions ?? []) {
    const matchesDiag = act.diagnosticId ? lineDiagIds.has(act.diagnosticId) : false;
    const matchesLine = act.line !== undefined ? act.line === lineIdx : !act.diagnosticId;
    if (matchesDiag || matchesLine) {
      pushUnique(act);
    }
  }

  // 2. 진단(Diagnostic) 기반 자동 Quick Fix
  for (const diag of lineDiags) {
    const slice = lineText.slice(diag.col, diag.endCol);
    // 문자열 숫자 리터럴("8080" -> 8080)
    const quotedNum = slice.match(/^(['"])(\d+(?:\.\d+)?)\1$/);
    if (quotedNum) {
      pushUnique({
        id: `auto-unquote-${diag.id}`,
        title: `Convert ${slice} to number ${quotedNum[2]}`,
        kind: 'quickfix',
        diagnosticId: diag.id,
        edits: [
          {
            line: lineIdx,
            newText: lineText.slice(0, diag.col) + quotedNum[2] + lineText.slice(diag.endCol),
          },
        ],
      });
    }
    // 미사용 변수(TS6133 / unused)
    if (diag.code === 'TS6133' || /never read|unused/i.test(diag.message)) {
      pushUnique({
        id: `auto-remove-unused-${diag.id}`,
        title: `Remove unused declaration on line ${lineIdx + 1}`,
        kind: 'quickfix',
        diagnosticId: diag.id,
        edits: [{ line: lineIdx, newText: null }],
      });
      if (slice && IDENT_RE.test(slice) && !slice.startsWith('_')) {
        pushUnique({
          id: `auto-prefix-underscore-${diag.id}`,
          title: `Prefix '${slice}' with '_'`,
          kind: 'quickfix',
          diagnosticId: diag.id,
          edits: [
            {
              line: lineIdx,
              newText: lineText.slice(0, diag.col) + `_${slice}` + lineText.slice(diag.endCol),
            },
          ],
        });
      }
    }
  }

  // 3. 코드 패턴 기반 자동 리팩터링 액션
  if (/^\s*var\s+/.test(lineText)) {
    pushUnique({
      id: `auto-var-const-${lineIdx}`,
      title: "Convert 'var' to 'const'",
      kind: 'refactor',
      edits: [{ line: lineIdx, newText: lineText.replace(/^(\s*)var(\s+)/, '$1const$2') }],
    });
  } else if (/^\s*let\s+/.test(lineText)) {
    pushUnique({
      id: `auto-let-const-${lineIdx}`,
      title: "Convert 'let' to 'const'",
      kind: 'refactor',
      edits: [{ line: lineIdx, newText: lineText.replace(/^(\s*)let(\s+)/, '$1const$2') }],
    });
  }

  if (/(?<![=!<>])==(?!=)/.test(lineText) || /(?<![=!<>])!=(?!=)/.test(lineText)) {
    const fixed = lineText
      .replace(/(?<![=!<>])==(?!=)/g, '===')
      .replace(/(?<![=!<>])!=(?!=)/g, '!==');
    pushUnique({
      id: `auto-strict-eq-${lineIdx}`,
      title: 'Use strict equality (=== / !==)',
      kind: 'quickfix',
      edits: [{ line: lineIdx, newText: fixed }],
    });
  }

  if (/^\s*console\.log\s*\(/.test(lineText)) {
    pushUnique({
      id: `auto-remove-console-${lineIdx}`,
      title: 'Remove console.log statement',
      kind: 'quickfix',
      edits: [{ line: lineIdx, newText: null }],
    });
  }

  if (/[ \t]+$/.test(lineText)) {
    pushUnique({
      id: `auto-trim-ws-${lineIdx}`,
      title: 'Trim trailing whitespace',
      kind: 'source',
      edits: [{ line: lineIdx, newText: lineText.replace(/[ \t]+$/, '') }],
    });
  }

  return actions;
}

/**
 * Neovim 0.11 `gra` / `:LspCodeAction`:
 * 커서 위치에서 사용 가능한 코드 액션 선택 팝업을 엽니다.
 */
export function openLspCodeActionMenu(state: VimEditorState): VimEditorState {
  const actions = collectCodeActionsAtCursor(state);
  if (actions.length === 0) {
    return {
      ...ringBell(state),
      lspHover: null,
      lspCodeActionMenu: null,
      commandMessage: msg('LSP: 현재 위치에서 사용할 수 있는 코드 액션이 없습니다'),
    };
  }

  return {
    ...state,
    pendingKeys: undefined,
    lspHover: null,
    lspRename: null,
    lspCodeActionMenu: {
      isOpen: true,
      line: state.cursor.line,
      col: state.cursor.col,
      selectedIndex: 0,
      actions,
    },
    commandMessage: undefined,
  };
}

export function closeLspCodeActionMenu(state: VimEditorState): VimEditorState {
  if (!state.lspCodeActionMenu?.isOpen) return state;
  return {
    ...state,
    lspCodeActionMenu: null,
    pendingKeys: undefined,
  };
}

/**
 * 선택된 인덱스의 LSP 코드 액션을 적용합니다 (단일 Undo 지원).
 */
export function applyLspCodeAction(state: VimEditorState, index: number): VimEditorState {
  const menu = state.lspCodeActionMenu;
  if (!menu?.isOpen) return state;
  const action = menu.actions[index];
  if (!action) return closeLspCodeActionMenu(state);

  const withUndo = pushUndoSnapshot(state);
  const nextLines = [...state.lines];

  // 줄 삭제 시 인덱스가 밀리지 않도록 큰 줄 번호부터 내림차순 적용
  const sortedEdits = [...action.edits].sort((a, b) => b.line - a.line);
  for (const edit of sortedEdits) {
    if (edit.line < 0 || edit.line >= nextLines.length) continue;
    if (edit.newText === null) {
      nextLines.splice(edit.line, 1);
    } else {
      nextLines[edit.line] = edit.newText;
    }
  }
  if (nextLines.length === 0) nextLines.push('');

  const nextCursor = clampCursor(nextLines, state.cursor, 'NORMAL');
  return {
    ...withUndo,
    lines: nextLines,
    cursor: nextCursor,
    lspCodeActionMenu: null,
    pendingKeys: undefined,
    commandMessage: msg('[LSP] 코드 액션 적용: {title}', { title: action.title }),
  };
}

/**
 * LSP 코드 액션 팝업이 열려 있을 때 키 입력을 처리합니다 (j/k, 1~9, Enter, Esc/q).
 */
export function handleLspCodeActionKey(state: VimEditorState, key: string): VimEditorState {
  const menu = state.lspCodeActionMenu;
  if (!menu?.isOpen) return state;

  if (key === 'Escape' || key === 'q' || key === 'Ctrl-c' || key === 'Ctrl+c') {
    return closeLspCodeActionMenu(state);
  }
  if (key === 'Enter' || key === '<CR>' || key === '\r' || key === '\n') {
    return applyLspCodeAction(state, menu.selectedIndex);
  }
  if (key === 'j' || key === 'ArrowDown' || key === 'Ctrl-j' || key === 'Ctrl-n') {
    const nextIdx = (menu.selectedIndex + 1) % menu.actions.length;
    return { ...state, lspCodeActionMenu: { ...menu, selectedIndex: nextIdx } };
  }
  if (key === 'k' || key === 'ArrowUp' || key === 'Ctrl-k' || key === 'Ctrl-p') {
    const nextIdx = (menu.selectedIndex - 1 + menu.actions.length) % menu.actions.length;
    return { ...state, lspCodeActionMenu: { ...menu, selectedIndex: nextIdx } };
  }
  if (/^[1-9]$/.test(key)) {
    const idx = parseInt(key, 10) - 1;
    if (idx < menu.actions.length) {
      return applyLspCodeAction(state, idx);
    }
    return ringBell(state);
  }
  return state;
}

/**
 * 현재 버퍼에서 문서 심볼 아웃라인(함수·클래스·타입·변수·메서드·마크다운 헤딩)을 추출합니다.
 */
export function extractDocumentSymbols(lines: string[]): LspDocumentSymbol[] {
  const symbols: LspDocumentSymbol[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    // Markdown heading
    const mdMatch = raw.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (mdMatch) {
      symbols.push({ name: mdMatch[2], kind: 'heading', line: i, col: 0 });
      continue;
    }

    // JS/TS/Rust/Go/Python/Vim function
    const fnMatch = trimmed.match(
      /^(?:export\s+)?(?:default\s+)?(?:pub\s+)?(?:async\s+)?(?:function|fn|func|def|function!?)\s+(?:\([^)]*\)\s+)?([A-Za-z_$][A-Za-z0-9_$]*)/
    );
    if (fnMatch) {
      symbols.push({
        name: fnMatch[1],
        kind: 'function',
        line: i,
        col: Math.max(0, raw.indexOf(fnMatch[1])),
      });
      continue;
    }

    // class / interface / type / enum / struct
    const typeMatch = trimmed.match(
      /^(?:export\s+)?(?:default\s+)?(?:pub\s+)?(class|interface|type|enum|struct)\s+([A-Za-z_$][A-Za-z0-9_$]*)/
    );
    if (typeMatch) {
      symbols.push({
        name: typeMatch[2],
        kind: typeMatch[1],
        line: i,
        col: Math.max(0, raw.indexOf(typeMatch[2])),
      });
      continue;
    }

    // const / let / var (화살표 함수는 function, 나머지는 const/var)
    const varMatch = trimmed.match(
      /^(?:export\s+)?(const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]+)?=\s*(.*)$/
    );
    if (varMatch) {
      const isArrow = /^(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/.test(varMatch[3]);
      symbols.push({
        name: varMatch[2],
        kind: isArrow ? 'function' : varMatch[1],
        line: i,
        col: Math.max(0, raw.indexOf(varMatch[2])),
      });
      continue;
    }

    // Class method (들여쓰기된 메서드 정의: `  fetchUser(id: string) {`)
    const methodMatch = raw.match(
      /^[ \t]+(?:public\s+|private\s+|protected\s+|static\s+|async\s+|readonly\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*(?::[^{]+)?\{/
    );
    if (
      methodMatch &&
      !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(methodMatch[1])
    ) {
      symbols.push({
        name: methodMatch[1],
        kind: 'method',
        line: i,
        col: Math.max(0, raw.indexOf(methodMatch[1])),
      });
    }
  }
  return symbols;
}

/**
 * Neovim 0.11 `gO` / `:LspSymbols`:
 * 현재 버퍼의 문서 심볼 아웃라인을 로케이션 리스트에 채우고 `:lopen` 창을 엽니다.
 */
export function openLspDocumentSymbols(state: VimEditorState): VimEditorState {
  const symbols = extractDocumentSymbols(state.lines);
  if (symbols.length === 0) {
    return {
      ...ringBell(state),
      lspHover: null,
      commandMessage: msg('LSP: 현재 문서에 심볼이 없습니다'),
    };
  }

  const filename = state.primaryFilename || 'source.ts';
  const items: QuickfixItem[] = symbols.map((sym) => ({
    filename,
    line: sym.line + 1,
    col: sym.col + 1,
    text: `[${sym.kind}] ${sym.name}`,
    type: 'I',
  }));

  const withLoc = setLocationList({ ...state, lspHover: null, pendingKeys: undefined }, items, false);
  const opened = openLocationListWindow(withLoc);
  return {
    ...opened,
    commandMessage: msg('[LSP] 문서 심볼 {count}개 (:lopen)', { count: symbols.length }),
  };
}
