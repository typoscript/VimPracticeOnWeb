import { VimEditorState } from './types';
import { executeCommandLine } from './commandLine';
import { moveToLineStart, moveToLineEnd } from './motions';
import { syncRegisters } from './registers';
import { deleteVisualSelection, startVisualBlockInsert, getOrderedRange } from './visual';
import { pushUndoSnapshot } from './operators';
import { getOptions } from './setOptionsCore';
import { MAX_REMAP_DEPTH, isKeymapPrefix, parseKeySequence, resolveKeymapWithMeta, runKeymapTokens } from './keymapEngine';
import { jumpSnippetTabstop } from './snippetEngine';
import { ringBell, isFailedMotion, evaluateMotionWithCount, DispatchKeyFn } from './engineHelpers';

/**
 * SELECT / SELECT_LINE / SELECT_BLOCK 모드 키 입력 처리 (:help Select-mode)
 * - 방향키/Home/End: 선택 영역 확장
 * - Ctrl-g: 대응하는 VISUAL 모드로 전환
 * - Ctrl-o: 일회성 VISUAL 명령 실행 후 SELECT 모드 복귀
 * - Backspace / Delete: 선택 영역 삭제 후 INSERT 모드 진입
 * - 일반 출력 문자 / Enter / Tab: 선택 영역 삭제 후 INSERT 모드에서 즉시 입력
 */
export function handleSelectModeKey(
  state: VimEditorState,
  key: string,
  dispatchKey: DispatchKeyFn,
  macroDepth = 0
): VimEditorState {
  const visualEquiv: 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK' =
    state.mode === 'SELECT_LINE'
      ? 'VISUAL_LINE'
      : state.mode === 'SELECT_BLOCK'
        ? 'VISUAL_BLOCK'
        : 'VISUAL';

  const snap = state.visualAnchor
    ? {
        mode: visualEquiv,
        anchor: { ...state.visualAnchor },
        cursor: { ...state.cursor },
      }
    : state.lastVisualSelection;

  if (key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c' || key === 'ctrl-c') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      visualBlockEndOfLine: undefined,
      selectVisualOneShot: undefined,
      pendingKeys: undefined,
      pendingKeymapPrefix: undefined,
      activeRegister: undefined,
      snippetSession: state.snippetSession ? null : state.snippetSession,
      lastVisualSelection: snap,
    };
  }

  // LuaSnip 스타일 활성 스니펫 세션 중 Tab / Shift-Tab 으로 다음·이전 플레이스홀더 점프
  if (state.snippetSession && (key === 'Tab' || key === 'Shift-Tab' || key === '<S-Tab>')) {
    const jumped = jumpSnippetTabstop(state, key === 'Tab' ? 'next' : 'prev');
    if (jumped) return jumped;
  }

  // Ctrl-g: 대응하는 VISUAL 모드로 전환
  if (key === 'Ctrl-g' || key === 'Ctrl+g' || key === 'ctrl-g' || key === '<C-g>') {
    return {
      ...state,
      mode: visualEquiv,
      selectVisualOneShot: undefined,
      pendingKeys: undefined,
    };
  }

  // Ctrl-o: 일회성 VISUAL 명령 실행 후 SELECT 복귀
  if (key === 'Ctrl-o' || key === 'Ctrl+o' || key === 'ctrl-o' || key === '<C-o>') {
    return {
      ...state,
      mode: visualEquiv,
      selectVisualOneShot: true,
      pendingKeys: undefined,
    };
  }

  // Select 모드 커스텀 키매핑 (:smap/:snoremap 우선, :vmap/:vnoremap 폴백)
  if (!state.keymapsDisabled && !state.pendingKeys && macroDepth <= MAX_REMAP_DEPTH) {
    const leaderKey = state.leaderKey || ' ';
    const prefix = state.pendingKeymapPrefix ?? '';
    const runSelectEx = (s: VimEditorState, cmd: string) =>
      executeCommandLine(s, cmd, (st, k) => dispatchKey(st, k, false, 0));
    const runSelectResolved = (
      baseState: VimEditorState,
      res: NonNullable<ReturnType<typeof resolveKeymapWithMeta>>
    ) =>
      runKeymapTokens(
        baseState,
        res,
        macroDepth,
        (runState, rhs, _isNoremap, nextDepth) => {
          const tokens = parseKeySequence(rhs, leaderKey);
          let s: VimEditorState = runState;
          for (const tok of tokens) {
            s = dispatchKey(s, tok, false, nextDepth);
            if (s.bell) break;
          }
          return s;
        },
        runSelectEx
      );

    if (prefix && key === 'Timeout') {
      const prevRes = resolveKeymapWithMeta(state, 's', prefix) ?? resolveKeymapWithMeta(state, 'v', prefix);
      if (prevRes) {
        return runSelectResolved({ ...state, pendingKeymapPrefix: undefined }, prevRes);
      }
      return { ...state, pendingKeymapPrefix: undefined };
    }

    const candidate = prefix + key;
    const exactRes = resolveKeymapWithMeta(state, 's', candidate) ?? resolveKeymapWithMeta(state, 'v', candidate);
    const hasLonger = isKeymapPrefix(state, 's', candidate) || isKeymapPrefix(state, 'v', candidate);
    if (exactRes && (!hasLonger || exactRes.nowait)) {
      return runSelectResolved({ ...state, pendingKeymapPrefix: undefined }, exactRes);
    }
    if (hasLonger) {
      return { ...state, pendingKeymapPrefix: candidate };
    }
    if (prefix) {
      const prevRes = resolveKeymapWithMeta(state, 's', prefix) ?? resolveKeymapWithMeta(state, 'v', prefix);
      if (prevRes) {
        const afterPrev = runSelectResolved({ ...state, pendingKeymapPrefix: undefined }, prevRes);
        return dispatchKey(afterPrev, key, false, macroDepth);
      }
      let s: VimEditorState = { ...state, pendingKeymapPrefix: undefined };
      for (const ch of prefix) {
        s = dispatchKey(s, ch, false, macroDepth);
      }
      return dispatchKey(s, key, false, macroDepth);
    }
  }

  // 방향키 / Home / End: 선택 영역 확장
  if (
    key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'ArrowUp' ||
    key === 'ArrowDown'
  ) {
    const motionCursor = evaluateMotionWithCount(
      state.lines,
      state.cursor,
      key,
      1,
      state.folds,
      getOptions(state).whichwrap
    );
    if (!motionCursor || isFailedMotion(key, state.cursor, motionCursor)) {
      return ringBell(state);
    }
    return {
      ...state,
      cursor: motionCursor,
      pendingKeys: undefined,
    };
  }
  if (key === 'Home') {
    return { ...state, cursor: moveToLineStart(state.lines, state.cursor), pendingKeys: undefined };
  }
  if (key === 'End') {
    return { ...state, cursor: moveToLineEnd(state.lines, state.cursor), pendingKeys: undefined };
  }

  const deleteSelectionAndEnterInsert = (): VimEditorState => {
    const asVisual: VimEditorState = { ...state, mode: visualEquiv };
    if (state.mode === 'SELECT_BLOCK') {
      const started = startVisualBlockInsert(asVisual, 'c', 1);
      return { ...started, lastVisualSelection: snap };
    }
    if (state.mode === 'SELECT_LINE' && state.visualAnchor) {
      const stateWithUndo = pushUndoSnapshot(state);
      const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
      const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
      const deletedContent = state.lines.slice(minLine, maxLine + 1).join('\n');
      const nextLines = [
        ...state.lines.slice(0, minLine),
        '',
        ...state.lines.slice(maxLine + 1),
      ];
      const withDel: VimEditorState = {
        ...stateWithUndo,
        lines: nextLines,
        cursor: { line: minLine, col: 0 },
        mode: 'INSERT',
        visualAnchor: undefined,
        visualBlockEndOfLine: undefined,
        clipboard: { type: 'line', content: deletedContent },
        pendingKeys: undefined,
      };
      return {
        ...syncRegisters(state, withDel, false),
        mode: 'INSERT',
        lastVisualSelection: snap,
      };
    }
    const anchor = state.visualAnchor ?? state.cursor;
    const ordered = getOrderedRange(anchor, state.cursor);
    const delRes = deleteVisualSelection(asVisual);
    const insertLine = Math.min(ordered.start.line, delRes.lines.length - 1);
    const insertCol = Math.min(ordered.start.col, (delRes.lines[insertLine] ?? '').length);
    const synced = syncRegisters(state, delRes, false);
    return {
      ...synced,
      mode: 'INSERT',
      cursor: { line: insertLine, col: insertCol },
      visualAnchor: undefined,
      visualBlockEndOfLine: undefined,
      lastVisualSelection: snap,
    };
  };

  // Backspace / Delete: 선택 영역 삭제 후 INSERT 모드 진입
  if (key === 'Backspace' || key === 'Delete') {
    return deleteSelectionAndEnterInsert();
  }

  // 출력 가능 문자 / Enter / Tab: 선택 영역 삭제 후 INSERT 모드에서 즉시 입력
  if (key.length === 1 || key === 'Enter' || key === 'Tab') {
    const inInsert = deleteSelectionAndEnterInsert();
    return dispatchKey(inInsert, key, false, macroDepth);
  }

  return state;
}
