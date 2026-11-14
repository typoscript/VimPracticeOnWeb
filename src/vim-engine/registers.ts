import { ClipboardRegister, RegisterEntry, VimEditorState } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { getOptions } from './setEngine';

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

  // 시스템 클립보드 ("+, "*) 연동 동기화
  if (reg === '+' || reg === '*') {
    newRegisters['+'] = { type: regType, content: clip.content };
    newRegisters['*'] = { type: regType, content: clip.content };
  }

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
    systemClipboard: (reg === '+' || reg === '*') ? clip.content : nextState.systemClipboard,
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

  // 시스템 클립보드 ("+, "*) 조회
  if (targetReg === '+' || targetReg === '*') {
    const content = state.systemClipboard ?? state.registers?.[targetReg]?.content;
    if (content !== undefined && content !== null) {
      const str = Array.isArray(content) ? content.join('') : content;
      const type = state.registers?.[targetReg]?.type === 'line' ? 'line' : 'text';
      return {
        type,
        content: str,
      };
    }
  }

  // 표현식 레지스터 ("=) 조회
  if (targetReg === '=') {
    const entry = state.registers?.['='];
    if (entry) {
      const content = Array.isArray(entry.content) ? entry.content.join('') : entry.content;
      return {
        type: 'text',
        content,
      };
    }
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

export interface PutOptions {
  /** ]p / [p: 현재 줄의 들여쓰기에 맞춰 줄 단위 텍스트의 들여쓰기를 재조정 */
  adjustIndent?: boolean;
  /** gp / gP: 붙여넣은 텍스트 바로 뒤(줄 단위는 다음 줄 첫 칸)로 커서를 이동 */
  leaveCursorAfter?: boolean;
}

function measureIndentCols(line: string, tabstop: number): number {
  let cols = 0;
  for (const ch of line) {
    if (ch === ' ') cols += 1;
    else if (ch === '\t') cols += tabstop - (cols % tabstop);
    else break;
  }
  return cols;
}

function formatIndentCols(cols: number, tabstop: number, expandtab: boolean): string {
  if (cols <= 0) return '';
  if (expandtab) return ' '.repeat(cols);
  const tabs = Math.floor(cols / tabstop);
  const spaces = cols % tabstop;
  return '\t'.repeat(tabs) + ' '.repeat(spaces);
}

function reindentBlockToLine(
  blockLines: string[],
  targetLineText: string,
  tabstop: number,
  expandtab: boolean
): string[] {
  const targetCols = measureIndentCols(targetLineText, tabstop);
  const firstCols = measureIndentCols(blockLines[0] ?? '', tabstop);
  const delta = targetCols - firstCols;

  return blockLines.map((l) => {
    if (l.trim().length === 0) return '';
    const wsMatch = l.match(/^[ \t]*/);
    const body = l.slice(wsMatch ? wsMatch[0].length : 0);
    const curCols = measureIndentCols(l, tabstop);
    const nextCols = Math.max(0, curCols + delta);
    return formatIndentCols(nextCols, tabstop, expandtab) + body;
  });
}

/**
 * 레지스터의 내용을 현재 커서 위치에 붙여넣습니다 (p: 뒤에, P: 앞에, ]p/[p/gp/gP 지원).
 */
export function putFromRegister(
  state: VimEditorState,
  reg?: string | null,
  isBefore = false,
  count = 1,
  options?: PutOptions
): VimEditorState {
  const rawClip = getRegisterContent(state, reg ?? state.activeRegister);
  if (!rawClip || rawClip.content === undefined || rawClip.content === null) {
    return {
      ...state,
      activeRegister: undefined,
      pendingKeys: undefined,
    };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const { line, col } = state.cursor;

  if (rawClip.type === 'line') {
    const baseLines = rawClip.content.split('\n');
    const adjustedUnit = options?.adjustIndent
      ? (() => {
          const opts = getOptions(state);
          return reindentBlockToLine(
            baseLines,
            state.lines[line] ?? '',
            opts.tabstop,
            opts.expandtab
          );
        })()
      : baseLines;

    const insertedLines: string[] = [];
    for (let i = 0; i < Math.max(1, count); i++) {
      insertedLines.push(...adjustedUnit);
    }

    const targetLine = isBefore ? line : line + 1;
    const nextLines = [
      ...state.lines.slice(0, targetLine),
      ...insertedLines,
      ...state.lines.slice(targetLine),
    ];

    if (options?.leaveCursorAfter) {
      const afterLine = Math.min(nextLines.length - 1, targetLine + insertedLines.length);
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        cursor: { line: afterLine, col: 0 },
        activeRegister: undefined,
        pendingKeys: undefined,
      };
    }

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

  // 문자/멀티라인 텍스트 붙여넣기
  const textContent = count > 1 ? rawClip.content.repeat(count) : rawClip.content;
  const currentLine = state.lines[line] ?? '';
  const insertCol = isBefore ? col : (currentLine.length === 0 ? 0 : col + 1);

  if (textContent.includes('\n')) {
    const before = currentLine.slice(0, insertCol);
    const after = currentLine.slice(insertCol);
    const parts = textContent.split('\n');
    const firstLine = before + parts[0];
    const lastLine = parts[parts.length - 1] + after;
    const middleLines = parts.slice(1, -1);
    const insertedLines = [firstLine, ...middleLines, lastLine];

    const nextLines = [
      ...state.lines.slice(0, line),
      ...insertedLines,
      ...state.lines.slice(line + 1),
    ];

    const nextCursor = options?.leaveCursorAfter
      ? clampCursor(
          nextLines,
          { line: line + parts.length - 1, col: parts[parts.length - 1].length },
          'NORMAL'
        )
      : { line, col: insertCol };

    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: nextCursor,
      activeRegister: undefined,
      pendingKeys: undefined,
    };
  }

  const newLine =
    currentLine.slice(0, insertCol) +
    textContent +
    currentLine.slice(insertCol);
  const nextLines = [...state.lines];
  nextLines[line] = newLine;

  const targetCol = options?.leaveCursorAfter
    ? insertCol + textContent.length
    : col + textContent.length;
  const newCol = clampCursor(nextLines, { line, col: targetCol }, 'NORMAL').col;

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

/**
 * 외부 시스템/OS 클립보드 텍스트를 "+ 및 "* 레지스터에 동기화합니다.
 */
export function setSystemClipboard(
  state: VimEditorState,
  text: string
): VimEditorState {
  const newRegisters = {
    ...(state.registers ?? {}),
    '+': { type: 'char' as const, content: text },
    '*': { type: 'char' as const, content: text },
  };
  return {
    ...state,
    systemClipboard: text,
    registers: newRegisters,
  };
}
