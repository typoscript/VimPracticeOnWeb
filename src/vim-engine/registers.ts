import { ClipboardRegister, RegisterEntry, VimEditorState } from './types';
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
 * 매크로 키 배열을 Vim 표준 표기 문자열로 변환합니다. (예: ['A', ';', 'Escape'] -> "A;<Esc>")
 */
export function formatMacroKeysToString(keys: string[]): string {
  return keys
    .map((k) => {
      if (k === 'Escape') return '<Esc>';
      if (k === 'Enter') return '<CR>';
      if (k === ' ') return ' ';
      if (k === 'Tab') return '<Tab>';
      if (k === 'Backspace') return '<BS>';
      if (k.startsWith('Ctrl-')) return `<C-${k.slice(5)}>`;
      return k;
    })
    .join('');
}

/**
 * 텍스트 문자열(예: "A;<Esc>j" 또는 "ciwbar^[")을 Vim 매크로 실행 키 배열로 파싱합니다.
 */
export function parseMacroStringToKeys(text: string): string[] {
  const keys: string[] = [];
  let i = 0;
  while (i < text.length) {
    // 1. ASCII escape / ^[
    if (text[i] === '\x1b') {
      keys.push('Escape');
      i++;
      continue;
    }
    if (text[i] === '^' && i + 1 < text.length && text[i + 1] === '[') {
      keys.push('Escape');
      i += 2;
      continue;
    }

    // 2. <...> 표기법 (<Esc>, <CR>, <Space>, <Tab>, <BS>, <C-x>, <Ctrl-x>)
    if (text[i] === '<') {
      const end = text.indexOf('>', i);
      if (end !== -1) {
        const tag = text.slice(i + 1, end).toLowerCase();
        if (tag === 'esc' || tag === 'escape') {
          keys.push('Escape');
          i = end + 1;
          continue;
        }
        if (tag === 'cr' || tag === 'enter') {
          keys.push('Enter');
          i = end + 1;
          continue;
        }
        if (tag === 'space') {
          keys.push(' ');
          i = end + 1;
          continue;
        }
        if (tag === 'tab') {
          keys.push('Tab');
          i = end + 1;
          continue;
        }
        if (tag === 'bs' || tag === 'backspace') {
          keys.push('Backspace');
          i = end + 1;
          continue;
        }
        if (tag.startsWith('c-') || tag.startsWith('ctrl-')) {
          const char = tag.slice(tag.indexOf('-') + 1);
          keys.push(`Ctrl-${char}`);
          i = end + 1;
          continue;
        }
      }
    }

    // 3. 개행/탭 리터럴
    if (text[i] === '\r' || text[i] === '\n') {
      keys.push('Enter');
      i++;
      continue;
    }
    if (text[i] === '\t') {
      keys.push('Tab');
      i++;
      continue;
    }

    keys.push(text[i]);
    i++;
  }
  return keys;
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
    const content = Array.isArray(entry.content)
      ? (entry.type === 'macro' ? formatMacroKeysToString(entry.content) : entry.content.join(''))
      : entry.content;
    return {
      type: entry.type === 'line' ? 'line' : 'text',
      content,
    };
  }

  // 기본 무명 레지스터("") 또는 clipboard
  if (state.registers?.['"']) {
    const entry = state.registers['"'];
    const content = Array.isArray(entry.content)
      ? (entry.type === 'macro' ? formatMacroKeysToString(entry.content) : entry.content.join(''))
      : entry.content;
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
  isBefore = false,
  count = 1
): VimEditorState {
  const rawClip = getRegisterContent(state, reg ?? state.activeRegister);
  // [count]p: 내용을 count 번 이어 붙여 한 번에 넣습니다 (실행 취소 1회, 여러 줄 레지스터도 a b a b 순서)
  const clip =
    rawClip && count > 1
      ? {
          ...rawClip,
          content:
            rawClip.type === 'line'
              ? Array.from({ length: count }, () => rawClip.content).join('\n')
              : rawClip.content.repeat(count),
        }
      : rawClip;

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

/**
 * 레지스터 내용을 순정 Vim :registers / :reg 형식으로 포맷팅합니다.
 */
export function formatRegisters(state: VimEditorState, filterArg?: string): string {
  interface RegDisplay {
    name: string;
    type: 'l' | 'c' | 'b' | 'm';
    content: string;
  }

  const list: RegDisplay[] = [];

  // 1. "" (무명 기본 레지스터)
  const unnamedEntry = state.registers?.['"'];
  if (unnamedEntry && unnamedEntry.content) {
    const rawContent = Array.isArray(unnamedEntry.content) ? unnamedEntry.content.join('') : unnamedEntry.content;
    if (rawContent) {
      list.push({
        name: '"',
        type: unnamedEntry.type === 'line' ? 'l' : 'c',
        content: rawContent,
      });
    }
  } else if (state.clipboard?.content) {
    list.push({
      name: '"',
      type: state.clipboard.type === 'line' ? 'l' : 'c',
      content: state.clipboard.content,
    });
  }

  // 2. "0 ~ "9 (숫자 레지스터)
  for (let i = 0; i <= 9; i++) {
    const key = String(i);
    const entry = state.registers?.[key];
    if (entry && entry.content) {
      const rawContent = Array.isArray(entry.content) ? entry.content.join('') : entry.content;
      if (rawContent) {
        list.push({
          name: key,
          type: entry.type === 'line' ? 'l' : 'c',
          content: rawContent,
        });
      }
    }
  }

  // 3. "- (작은 삭제 레지스터)
  const smallDel = state.registers?.['-'];
  if (smallDel && smallDel.content) {
    const rawContent = Array.isArray(smallDel.content) ? smallDel.content.join('') : smallDel.content;
    if (rawContent) {
      list.push({
        name: '-',
        type: smallDel.type === 'line' ? 'l' : 'c',
        content: rawContent,
      });
    }
  }

  // 4. "a ~ "z (명명된 레지스터 및 매크로)
  const alphaKeys = 'abcdefghijklmnopqrstuvwxyz'.split('');
  for (const k of alphaKeys) {
    const entry = state.registers?.[k];
    if (entry && entry.content) {
      const isMacro = entry.type === 'macro';
      let rawContent = '';
      if (Array.isArray(entry.content)) {
        if (isMacro) {
          rawContent = entry.content
            .map((tok) => {
              if (tok === 'Escape') return '<Esc>';
              if (tok === 'Enter') return '<CR>';
              return tok;
            })
            .join('');
        } else {
          rawContent = entry.content.join('');
        }
      } else {
        rawContent = entry.content;
      }

      if (rawContent) {
        list.push({
          name: k,
          type: isMacro ? 'm' : (entry.type === 'line' ? 'l' : 'c'),
          content: rawContent,
        });
      }
    }
  }

  // 5. "% (현재 파일명)
  if (state.primaryFilename) {
    list.push({
      name: '%',
      type: 'c',
      content: state.primaryFilename,
    });
  }

  // 6. ": (마지막 실행된 Ex 명령)
  if (state.commandHistory && state.commandHistory.length > 0) {
    const lastCmd = state.commandHistory[state.commandHistory.length - 1];
    if (lastCmd) {
      list.push({
        name: ':',
        type: 'c',
        content: lastCmd,
      });
    }
  }

  // 7. "/ (마지막 검색어)
  if (state.lastSearchQuery) {
    list.push({
      name: '/',
      type: 'c',
      content: state.lastSearchQuery,
    });
  }

  // 필터링 적용 (예: :reg a b 0 ")
  let filtered = list;
  if (filterArg && filterArg.trim().length > 0) {
    const cleaned = filterArg.replace(/[\s"]/g, '');
    const targetSet = new Set(cleaned.split(''));
    if (filterArg.includes('"')) {
      targetSet.add('"');
    }
    filtered = list.filter((item) => targetSet.has(item.name));
  }

  const header = '--- Registers ---';
  if (filtered.length === 0) {
    return header;
  }

  const lines = filtered.map((item) => {
    const singleLinePreview = item.content.replace(/\r?\n/g, '^J');
    return `"${item.name}   ${item.type}   ${singleLinePreview}`;
  });

  return [header, ...lines].join('\n');
}
