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

  // 명명된 레지스터("a~"z, "A~"Z 등)에 저장
  if (reg && reg !== '"' && reg !== '_') {
    const isAppend = /^[A-Z]$/.test(reg);
    const targetKey = isAppend ? reg.toLowerCase() : reg;
    const existing = newRegisters[targetKey];

    if (isAppend && existing) {
      const existingContent = Array.isArray(existing.content) ? existing.content.join('') : existing.content;
      if (existing.type === 'line' && regType === 'line') {
        newRegisters[targetKey] = {
          type: 'line',
          content: `${existingContent}\n${clip.content}`,
        };
      } else if (existing.type === 'char' && regType === 'char') {
        newRegisters[targetKey] = {
          type: 'char',
          content: `${existingContent}${clip.content}`,
        };
      } else {
        // 라인과 텍스트 혼합 누적 시 개행으로 구분하여 라인 타입으로 승격
        newRegisters[targetKey] = {
          type: 'line',
          content: `${existingContent}\n${clip.content}`,
        };
      }
    } else {
      newRegisters[targetKey] = {
        type: regType,
        content: clip.content,
      };
    }
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

  // 특수 읽기 전용 레지스터 (%: 현재 파일명, /: 마지막 검색어)
  if (targetReg === '%') {
    return {
      type: 'text',
      content: state.primaryFilename ?? 'practice.txt',
    };
  }
  if (targetReg === '/') {
    return {
      type: 'text',
      content: state.lastSearchQuery ?? '',
    };
  }

  // 특정 명명된 레지스터 지정 시 ("a~"z 및 "A~"Z 동일 참조)
  if (targetReg && targetReg !== '"') {
    const regKey = /^[A-Z]$/.test(targetReg) ? targetReg.toLowerCase() : targetReg;
    const entry = state.registers?.[regKey];
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

  if (!clip || clip.content === undefined || clip.content === null) {
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
    const insertedLines = clip.content.split('\n');
    const nextLines = [
      ...state.lines.slice(0, targetLine),
      ...insertedLines,
      ...state.lines.slice(targetLine),
    ];
    const firstLine = insertedLines[0] ?? '';
    const firstNonWs = firstLine.search(/\S/);
    const targetCol = firstNonWs !== -1 ? firstNonWs : 0;
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: { line: targetLine, col: targetCol },
      activeRegister: undefined,
      pendingKeys: undefined,
    };
  }

  // 인라인 / 멀티라인 문자열(text) 붙여넣기
  const currentLine = state.lines[line] ?? '';
  const insertCol = isBefore ? col : (currentLine.length === 0 ? 0 : col + 1);

  if (clip.content.includes('\n')) {
    const before = currentLine.slice(0, insertCol);
    const after = currentLine.slice(insertCol);
    const parts = clip.content.split('\n');
    const firstLine = before + parts[0];
    const lastLine = parts[parts.length - 1] + after;
    const middleLines = parts.slice(1, -1);
    const insertedLines = [firstLine, ...middleLines, lastLine];

    const nextLines = [
      ...state.lines.slice(0, line),
      ...insertedLines,
      ...state.lines.slice(line + 1),
    ];

    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: { line, col: insertCol },
      activeRegister: undefined,
      pendingKeys: undefined,
    };
  }

  const newLine =
    currentLine.slice(0, insertCol) +
    clip.content +
    currentLine.slice(insertCol);
  const nextLines = [...state.lines];
  nextLines[line] = newLine;

  const newCol = Math.min(
    getMaxCol(newLine, 'NORMAL'),
    col + clip.content.length
  );

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: { line, col: newCol },
    activeRegister: undefined,
    pendingKeys: undefined,
  };
}
