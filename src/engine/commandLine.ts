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
      commandMessage: undefined,
    };
  }

  // 2. 줄 번호 이동: ':[숫자]', ': [숫자]', 또는 '[숫자]' (예: ':10', ': 10', '5')
  const lineNumMatch = trimmed.match(/^:?\s*([0-9]+)$/);
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
      commandMessage: `${targetLine + 1}번째 줄로 이동했습니다.`,
    };
  }

  // 3. 전체 버퍼 치환: ':%s/old/new/g', ':%s /old/new/g' 또는 ':%s/old/new/'
  const globalSubMatch = trimmed.match(/^:?\s*%s\s*\/([^\/]*)\/([^\/]*)\/?([gi]*)$/);
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
        commandMessage: '치환할 대상 패턴(oldText)이 비어 있습니다.',
      };
    }

    const isGlobal = flags.includes('g');
    const isIgnoreCase = flags.includes('i');
    let regFlags = '';
    if (isGlobal) regFlags += 'g';
    if (isIgnoreCase) regFlags += 'i';

    const regex = new RegExp(escapeRegExp(oldText), regFlags);
    let totalSubCount = 0;
    const nextLines = state.lines.map((line) => {
      const matches = line.match(new RegExp(escapeRegExp(oldText), regFlags.includes('g') ? regFlags : regFlags + 'g'));
      if (matches) {
        totalSubCount += matches.length;
      }
      return line.replace(regex, newText);
    });

    if (totalSubCount === 0) {
      return {
        ...state,
        mode: 'NORMAL',
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: `E486: 패턴을 찾을 수 없습니다: ${oldText}`,
      };
    }

    const stateWithSnapshot = pushUndoSnapshot(state);
    const nextCursor = clampCursor(nextLines, state.cursor, 'NORMAL');

    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: nextCursor,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `전체 문서에서 ${totalSubCount}개 항목을 치환했습니다.`,
      lastChangeKeys: [':', trimmed, 'Enter'],
    };
  }

  // 4. 현재 줄 치환: ':s/old/new/g', ':s /old/new/g' 또는 ':s/old/new/'
  const currentSubMatch = trimmed.match(/^:?\s*s\s*\/([^\/]*)\/([^\/]*)\/?([gi]*)$/);
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
        commandMessage: '치환할 대상 패턴(oldText)이 비어 있습니다.',
      };
    }

    const isGlobal = flags.includes('g');
    const isIgnoreCase = flags.includes('i');
    let regFlags = '';
    if (isGlobal) regFlags += 'g';
    if (isIgnoreCase) regFlags += 'i';

    const regex = new RegExp(escapeRegExp(oldText), regFlags);
    const currentLine = state.lines[state.cursor.line] ?? '';
    const matches = currentLine.match(new RegExp(escapeRegExp(oldText), regFlags.includes('g') ? regFlags : regFlags + 'g'));
    const subCount = matches ? matches.length : 0;

    if (subCount === 0) {
      return {
        ...state,
        mode: 'NORMAL',
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: `E486: 현재 줄에서 패턴을 찾을 수 없습니다: ${oldText}`,
      };
    }

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
      commandMessage: `현재 줄에서 ${subCount}개 항목을 치환했습니다.`,
      lastChangeKeys: [':', trimmed, 'Enter'],
    };
  }

  // 5. 유용한 보조 명령어: :w (저장), :q (종료), :help (도움말)
  const cleanCmd = trimmed.replace(/^:/, '').trim().toLowerCase();
  if (cleanCmd === 'w' || cleanCmd === 'write') {
    return {
      ...state,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: '[가상 저장 완료] 변경사항이 안전하게 메모리에 저장되었습니다.',
    };
  }

  if (cleanCmd === 'q' || cleanCmd === 'quit') {
    return {
      ...state,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: 'VimPracticeOnWeb은 웹 환경입니다. 연습 코스를 계속 진행하세요!',
    };
  }

  if (cleanCmd === 'h' || cleanCmd === 'help') {
    return {
      ...state,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: '지원 명령어: :[줄번호] (이동), :%s/이전/새문자/g (전체 치환), :s/이전/새문자/g (줄 치환), :w (저장)',
    };
  }

  // 6. 알 수 없는 명령어는 에러 메시지와 함께 NORMAL 모드로 복귀
  return {
    ...state,
    mode: 'NORMAL',
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `E492: 지원하지 않는 에디터 명령어입니다: ${trimmed}`,
  };
}
