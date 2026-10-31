import { VimEditorState } from '../types/vim';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { escapeRegExp } from './search';

/**
 * COMMAND 모드(:)에서 입력된 명령어를 파싱하고 실행합니다.
 */
export function executeCommandLine(
  state: VimEditorState,
  commandStr: string
): VimEditorState {
  const trimmed = commandStr.trim();

  // 1. 빈 명령인 경우 NORMAL 모드로 복귀
  if (trimmed.length === 0) {
    return {
      ...state,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 2. 줄 번호 이동: ':[숫자]' 또는 '[숫자]' (예: ':10', '5')
  const lineNumMatch = trimmed.match(/^:?([0-9]+)$/);
  if (lineNumMatch) {
    const lineNum = parseInt(lineNumMatch[1], 10);
    // 1-indexed 줄 번호를 0-indexed로 변환
    const targetLine = Math.max(0, Math.min(lineNum - 1, state.lines.length - 1));
    const nextCursor = clampCursor(
      state.lines,
      { line: targetLine, col: state.cursor.col },
      'NORMAL'
    );

    return {
      ...state,
      mode: 'NORMAL',
      cursor: nextCursor,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 3. 전체 버퍼 치환: ':%s/old/new/g' 또는 ':%s/old/new/'
  const globalSubMatch = trimmed.match(/^:?%s\/([^\/]*)\/([^\/]*)\/?([gi]*)$/);
  if (globalSubMatch) {
    const oldText = globalSubMatch[1];
    const newText = globalSubMatch[2];
    const flags = globalSubMatch[3] ?? '';

    if (oldText.length === 0) {
      return {
        ...state,
        mode: 'NORMAL',
        commandBuffer: undefined,
        commandType: undefined,
      };
    }

    const isGlobal = flags.includes('g');
    const isIgnoreCase = flags.includes('i');
    let regFlags = '';
    if (isGlobal) regFlags += 'g';
    if (isIgnoreCase) regFlags += 'i';

    const regex = new RegExp(escapeRegExp(oldText), regFlags);
    const stateWithSnapshot = pushUndoSnapshot(state);

    const nextLines = state.lines.map((line) => line.replace(regex, newText));
    const nextCursor = clampCursor(nextLines, state.cursor, 'NORMAL');

    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: nextCursor,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
      lastChangeKeys: [':', trimmed, 'Enter'],
    };
  }

  // 4. 현재 줄 치환: ':s/old/new/g' 또는 ':s/old/new/'
  const currentSubMatch = trimmed.match(/^:?s\/([^\/]*)\/([^\/]*)\/?([gi]*)$/);
  if (currentSubMatch) {
    const oldText = currentSubMatch[1];
    const newText = currentSubMatch[2];
    const flags = currentSubMatch[3] ?? '';

    if (oldText.length === 0) {
      return {
        ...state,
        mode: 'NORMAL',
        commandBuffer: undefined,
        commandType: undefined,
      };
    }

    const isGlobal = flags.includes('g');
    const isIgnoreCase = flags.includes('i');
    let regFlags = '';
    if (isGlobal) regFlags += 'g';
    if (isIgnoreCase) regFlags += 'i';

    const regex = new RegExp(escapeRegExp(oldText), regFlags);
    const currentLine = state.lines[state.cursor.line] ?? '';
    const newLine = currentLine.replace(regex, newText);

    const stateWithSnapshot = pushUndoSnapshot(state);
    const nextLines = [...state.lines];
    nextLines[state.cursor.line] = newLine;
    const nextCursor = clampCursor(nextLines, state.cursor, 'NORMAL');

    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: nextCursor,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
      lastChangeKeys: [':', trimmed, 'Enter'],
    };
  }

  // 알 수 없는 명령어는 안전하게 NORMAL 모드로 복귀
  return {
    ...state,
    mode: 'NORMAL',
    commandBuffer: undefined,
    commandType: undefined,
  };
}
