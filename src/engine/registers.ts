import { ClipboardRegister, RegisterEntry, VimEditorState } from '../types/vim';
import { getMaxCol } from './cursor';
import { pushUndoSnapshot } from './operators';

/**
 * 연산(d, y, c, x 등) 완료 후 activeRegister에 따라 registers와 clipboard를 동기화합니다.
 */
export function syncRegisters(
  prevState: VimEditorState,
  nextState: VimEditorState,
  isYank: boolean
): VimEditorState {
  const reg = prevState.activeRegister;

  // 1. 블랙홀 레지스터 ("_):
  // 삭제나 복사 내용이 레지스터나 클립보드에 절대 저장되지 않음 (직전 클립보드 원형 보존)
  if (reg === '_') {
    return {
      ...nextState,
      clipboard: prevState.clipboard,
      activeRegister: undefined,
    };
  }

  const clip = nextState.clipboard;
  if (!clip) {
    return {
      ...nextState,
      activeRegister: undefined,
    };
  }

  const regType: 'char' | 'line' = clip.type === 'line' ? 'line' : 'char';
  const newRegisters: Record<string, RegisterEntry> = { ...(prevState.registers ?? {}) };

  // 명명된 레지스터("a~"z 등)에 저장
  if (reg && reg !== '"' && reg !== '_') {
    newRegisters[reg] = {
      type: regType,
      content: clip.content,
    };
  }

  // 기본 무명 레지스터("")는 항상 동기화
  newRegisters['"'] = {
    type: regType,
    content: clip.content,
  };

  // 복사(Yank) 연산인 경우 전용 "0 레지스터에도 저장
  if (isYank) {
    newRegisters['0'] = {
      type: regType,
      content: clip.content,
    };
  }

  return {
    ...nextState,
    registers: newRegisters,
    activeRegister: undefined,
  };
}

/**
 * 지정된 레지스터(또는 state.activeRegister, 기본 무명 레지스터)의 클립보드 데이터를 조회합니다.
 */
export function getRegisterContent(
  state: VimEditorState,
  reg?: string | null
): ClipboardRegister | null {
  const targetReg = reg !== undefined ? reg : state.activeRegister;

  // 블랙홀 레지스터는 항상 빈 내용
  if (targetReg === '_') {
    return null;
  }

  // 특정 명명된 레지스터 지정 시
  if (targetReg && targetReg !== '"') {
    const entry = state.registers?.[targetReg];
    if (!entry) return null;
    const content = Array.isArray(entry.content) ? entry.content.join('') : entry.content;
    return {
      type: entry.type === 'line' ? 'line' : 'text',
      content,
    };
  }

  // 기본 무명 레지스터("") 또는 clipboard
  if (state.registers?.['"']) {
    const entry = state.registers['"'];
    const content = Array.isArray(entry.content) ? entry.content.join('') : entry.content;
    return {
      type: entry.type === 'line' ? 'line' : 'text',
      content,
    };
  }

  return state.clipboard ?? null;
}

/**
 * 레지스터의 내용을 현재 커서 위치에 붙여넣습니다 (p: 뒤에, P: 앞에).
 */
export function putFromRegister(
  state: VimEditorState,
  reg?: string | null,
  isBefore = false
): VimEditorState {
  const clip = getRegisterContent(state, reg ?? state.activeRegister);

  if (!clip || !clip.content) {
    return {
      ...state,
      activeRegister: undefined,
      pendingKeys: undefined,
    };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const { line, col } = state.cursor;

  if (clip.type === 'line') {
    const targetLine = isBefore ? line : line + 1;
    const nextLines = [
      ...state.lines.slice(0, targetLine),
      clip.content,
      ...state.lines.slice(targetLine),
    ];
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: { line: targetLine, col: 0 },
      activeRegister: undefined,
      pendingKeys: undefined,
    };
  }

  // 인라인 문자열(text) 붙여넣기
  const currentLine = state.lines[line] ?? '';
  const insertCol = isBefore ? col : (currentLine.length === 0 ? 0 : col + 1);
  const newLine =
    currentLine.slice(0, insertCol) +
    clip.content +
    currentLine.slice(insertCol);
  const nextLines = [...state.lines];
  nextLines[line] = newLine;

  const newCol = Math.min(
    getMaxCol(newLine, 'NORMAL'),
    insertCol + Math.max(0, clip.content.length - 1)
  );

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: { line, col: newCol },
    activeRegister: undefined,
    pendingKeys: undefined,
  };
}
