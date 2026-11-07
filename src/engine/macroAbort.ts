import { VimEditorState } from '../types/vim';

/**
 * 매크로 실행 중단(Abort) 판정
 *
 * 실제 Vim은 매크로 재생 중 모션이 실패하면(마지막 줄에서 j, 찾는 문자가 없는 f, 검색 실패 등)
 * 벨을 울리고 남은 매크로 키와 반복 횟수를 모두 버립니다. 재귀 매크로(qa...@aq)가
 * 파일 끝에서 멈추는 것도 이 동작 덕분입니다.
 *
 * 엔진에는 별도 에러 신호가 없으므로, 키 적용 전후 상태를 비교하여 실패를 판정합니다.
 */

/** 이동하지 못하면 실패로 간주되는 단일 키 모션 */
const FAILABLE_MOTIONS = new Set(['h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E', ';', ',']);

/** 다음 키 하나를 대상 문자로 받는 문자 탐색 모션 */
const CHAR_SEARCH_PREFIX = /^\d*[fFtT]$/;

/** 검색 실패 메시지 (E486) */
const SEARCH_FAILED = /^E486/;

/** 키를 적용하기 전 상태가 "새 명령의 시작(카운트만 대기 중)"인지 여부 */
function isCommandStart(state: VimEditorState): boolean {
  return !state.pendingKeys || /^\d+$/.test(state.pendingKeys);
}

function cursorUnchanged(prev: VimEditorState, next: VimEditorState): boolean {
  return prev.cursor.line === next.cursor.line && prev.cursor.col === next.cursor.col;
}

/**
 * `key`를 적용하여 `prev` → `next`가 되었을 때, 이것이 매크로를 중단시키는 실패인지 판정합니다.
 */
export function isMacroKeyFailure(prev: VimEditorState, next: VimEditorState, key: string): boolean {
  if (prev.mode === 'NORMAL' && next.mode === 'NORMAL' && !next.pendingKeys) {
    // 1. 단일 키 모션이 커서를 전혀 움직이지 못한 경우 (마지막 줄의 j, 줄 시작의 h 등)
    if (FAILABLE_MOTIONS.has(key) && isCommandStart(prev) && cursorUnchanged(prev, next)) {
      return true;
    }
    // 2. f/F/t/T{char} 대상 문자를 찾지 못한 경우
    if (prev.pendingKeys && CHAR_SEARCH_PREFIX.test(prev.pendingKeys) && cursorUnchanged(prev, next)) {
      return true;
    }
    // 3. n/N 재검색 실패
    if ((key === 'n' || key === 'N') && isCommandStart(prev) && SEARCH_FAILED.test(next.commandMessage ?? '')) {
      return true;
    }
  }

  // 4. /pattern<Enter>, ?pattern<Enter> 검색 실패
  if (prev.mode === 'SEARCH' && key === 'Enter' && SEARCH_FAILED.test(next.commandMessage ?? '')) {
    return true;
  }

  return false;
}
