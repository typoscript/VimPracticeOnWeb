import { VimEditorState } from './types';
import { getParagraphObjectRange } from './textObjects';
import {
  scrollToCenter,
  scrollToTop,
  scrollToBottom,
  handleHorizontalViewportKey,
} from './viewport';
import {
  foldClose,
  foldOpen,
  foldToggle,
  foldCloseAll,
  foldOpenAll,
  createFold,
  deleteFoldAtCursor,
  deleteAllFoldsAtCursor,
  eliminateAllFolds,
  detectFoldBlocks,
  jumpToNextFold,
  jumpToPrevFold,
} from './folding';
import {
  startSpellSuggest,
  addSpellGoodWord,
  addSpellWrongWord,
  undoSpellGoodWord,
  undoSpellWrongWord,
} from './spellEngine';
import { ringBell } from './engineHelpers';

/**
 * NORMAL 모드 z 접두 키 시퀀스(폴딩 zc/zo/za/zM/zR/zf/zd/zD/zE/zj/zk, 뷰포트 정렬 zz/zt/zb/zh/zl/zH/zL/ze/zs, 맞춤법 z=/zg/zw)를 처리합니다.
 * 해당 없으면 null을 반환합니다.
 */
export function handleNormalZPrefix(
  state: VimEditorState,
  key: string,
  parsedOperator?: string,
  parsedCount1?: number
): VimEditorState | null {
  // zfip / zfap / zfi{ / zfa{ 텍스트 객체 수동 폴드 생성 (startsWith('zf') 보다 먼저 검사)
  if (state.pendingKeys === 'zfa' || state.pendingKeys === 'zfi') {
    const isInner = state.pendingKeys === 'zfi';
    if (key === 'p') {
      const range = getParagraphObjectRange(state.lines, state.cursor.line, isInner ? 'ip' : 'ap', 1);
      if (range) {
        return createFold(state, range.startLine, range.endLine);
      }
      return ringBell({ ...state, pendingKeys: undefined });
    }
    if (key === '{' || key === '}' || key === 'B') {
      const detected = detectFoldBlocks(
        state.lines,
        state.options?.foldmethod,
        state.options?.shiftwidth,
        state.options?.foldexpr,
        state,
        state.options?.foldmarker
      );
      const found = detected.find((b) => b.startRow <= state.cursor.line && state.cursor.line <= b.endRow);
      if (found) {
        return createFold(state, found.startRow, found.endRow);
      }
      return ringBell({ ...state, pendingKeys: undefined });
    }
    return { ...state, bell: true, pendingKeys: undefined };
  }

  // zf{motion}: 수동 폴드 생성 모션 처리
  if (state.pendingKeys?.startsWith('zf')) {
    const rawCountStr = state.pendingKeys.slice(2);
    if (/^[0-9]$/.test(key) && (rawCountStr.length > 0 || key !== '0')) {
      return { ...state, pendingKeys: state.pendingKeys + key };
    }

    const count = parseInt(rawCountStr || '1', 10);
    const curLine = state.cursor.line;

    if (key === 'j' || key === 'ArrowDown') {
      return createFold(state, curLine, curLine + count);
    }
    if (key === 'k' || key === 'ArrowUp') {
      return createFold(state, curLine - count, curLine);
    }
    if (key === 'G') {
      return createFold(state, curLine, state.lines.length - 1);
    }
    if (key === 'g' && state.pendingKeys === 'zf') {
      return { ...state, pendingKeys: 'zfg' };
    }
    if (key === 'g' && state.pendingKeys === 'zfg') {
      return createFold(state, 0, curLine);
    }
    if (key === '_' || key === 'Enter') {
      return createFold(state, curLine, curLine + count - 1);
    }
    if (key === 'a' || key === 'i') {
      return { ...state, pendingKeys: `zf${key}` };
    }
    return { ...state, bell: true, pendingKeys: undefined };
  }

  // zu{g|G|w|W}: 맞춤법 사용자 등록 취소 (zug / zuw)
  if (state.pendingKeys === 'zu') {
    if (key === 'g' || key === 'G') {
      return { ...undoSpellGoodWord(state), pendingKeys: undefined };
    }
    if (key === 'w' || key === 'W') {
      return { ...undoSpellWrongWord(state), pendingKeys: undefined };
    }
    return { ...state, pendingKeys: undefined };
  }

  // zz, zt, zb, zh/zl/zH/zL/ze/zs: 뷰포트 정렬 및 zc, zo, za, zM, zR, zd, zD, zE, zf: 코드 폴딩
  if (state.pendingKeys === 'z' || parsedOperator === 'z') {
    const horiz = handleHorizontalViewportKey(state, key, parsedCount1 ?? 1);
    if (horiz) return horiz;
    if (key === 'z') return scrollToCenter(state);
    if (key === 't') return scrollToTop(state);
    if (key === 'b') return scrollToBottom(state);
    if (key === 'c') return foldClose(state);
    if (key === 'o') return foldOpen(state);
    if (key === 'a') return foldToggle(state);
    if (key === 'M') return foldCloseAll(state);
    if (key === 'R') return foldOpenAll(state);
    if (key === 'd') return deleteFoldAtCursor(state);
    if (key === 'D') return deleteAllFoldsAtCursor(state);
    if (key === 'E') return eliminateAllFolds(state);
    if (key === 'j') return jumpToNextFold(state, parsedCount1 ?? 1);
    if (key === 'k') return jumpToPrevFold(state, parsedCount1 ?? 1);
    if (key === 'f') return { ...state, pendingKeys: 'zf' };
    if (key === 'u') return { ...state, pendingKeys: 'zu' };
    if (key === '=') return { ...startSpellSuggest(state), pendingKeys: undefined };
    if (key === 'g' || key === 'G') return { ...addSpellGoodWord(state), pendingKeys: undefined };
    if (key === 'w' || key === 'W') return { ...addSpellWrongWord(state), pendingKeys: undefined };
    return { ...state, pendingKeys: undefined };
  }

  return null;
}
