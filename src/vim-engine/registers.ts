import { ClipboardRegister, RegisterEntry, VimEditorState } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { getOptions } from './setEngine';
import { registerEntryText, toPrintableRegisterText } from './registerText';

export {
  macroKeysToRegisterText,
  macroKeyToRegisterText,
  registerTextToKeys,
  registerEntryText,
  controlCharDisplay,
  isControlChar,
  toPrintableRegisterText,
} from './registerText';

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
  // Vim op_delete: 빈 범위(`d0` 를 0열에서, 마지막 빈 줄의 `vd`·`vc`)는 지울 것이 없어 레지스터를 건드리지 않습니다 (복사 `y0` 는 "" 를 씀).
  if (clip && !isYank && clip.type !== 'line' && clip.content === '') {
    return {
      ...nextState,
      clipboard: prevState.clipboard,
      activeRegister: undefined,
    };
  }
  if (!clip) {
    return {
      ...nextState,
      activeRegister: undefined,
    };
  }

  const regType: 'char' | 'line' | 'block' =
    clip.type === 'line' ? 'line' : clip.type === 'block' ? 'block' : 'char';
  const blockWidthProp = regType === 'block' && clip.blockWidth !== undefined
    ? { blockWidth: clip.blockWidth }
    : {};
  const newRegisters: Record<string, RegisterEntry> = { ...(prevState.registers ?? {}) };

  // 명명된 레지스터("a~"z, "A~"Z 등)에 저장
  if (reg && reg !== '"' && reg !== '_') {
    const isAppend = /^[A-Z]$/.test(reg);
    const targetKey = isAppend ? reg.toLowerCase() : reg;
    const existing = newRegisters[targetKey];

    if (isAppend && existing) {
      // 녹화한 매크로는 Vim 에서 문자 단위 텍스트입니다 ("A 로 이어 붙이면 실제 키 바이트 `A!\x1bj` 뒤에 붙음).
      const existingType = existing.type === 'macro' ? 'char' : existing.type;
      const existingContent = registerEntryText(existing);
      if (existingType === 'line' && regType === 'line') {
        newRegisters[targetKey] = {
          type: 'line',
          content: `${existingContent}\n${clip.content}`,
        };
      } else if (existingType === 'block' && regType === 'block') {
        const mergedContent = `${existingContent}\n${clip.content}`;
        const mergedWidth = Math.max(
          existing.blockWidth ?? 0,
          clip.blockWidth ?? 0,
          ...mergedContent.split('\n').map((l) => l.length)
        );
        newRegisters[targetKey] = {
          type: 'block',
          content: mergedContent,
          blockWidth: mergedWidth,
        };
      } else if (existingType === 'char' && regType === 'char') {
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
        ...blockWidthProp,
      };
    }
  }

  // 기본 무명 레지스터("")는 마지막으로 쓴 레지스터를 가리킵니다 ("Ayiw 뒤에는 이어 붙인 전체 내용).
  const namedKey = reg && /^[a-zA-Z]$/.test(reg) ? reg.toLowerCase() : null;
  newRegisters['"'] = namedKey && newRegisters[namedKey]
    ? { ...newRegisters[namedKey] }
    : {
        type: regType,
        content: clip.content,
        ...blockWidthProp,
      };

  // 시스템 클립보드 ("+, "*) 연동 동기화
  if (reg === '+' || reg === '*') {
    newRegisters['+'] = { type: regType, content: clip.content, ...blockWidthProp };
    newRegisters['*'] = { type: regType, content: clip.content, ...blockWidthProp };
  }

  // Vim :help quote0 / quote1 — 이름 있는 레지스터를 지정한 복사·삭제는 "0 / "1 을 바꾸지 않습니다.
  if (namedKey) {
    // 번호 레지스터는 그대로 둡니다.
  } else if (isYank) {
    newRegisters['0'] = {
      type: regType,
      content: clip.content,
      ...blockWidthProp,
    };
  } else {
    // 삭제/변경(d, c, x, s, D, C 등) 연산:
    // 1) 줄 단위(line)이거나 개행(\n)을 포함하는 다중 줄 삭제는 "1 ~ "9 번호 레지스터를 시프트하여 "1 에 기록
    const isMultiOrLineDelete = regType === 'line' || clip.content.includes('\n');
    if (isMultiOrLineDelete) {
      for (let i = 9; i >= 2; i--) {
        const prevEntry = newRegisters[String(i - 1)];
        if (prevEntry) {
          newRegisters[String(i)] = prevEntry;
        }
      }
      newRegisters['1'] = {
        type: regType,
        content: clip.content,
        ...blockWidthProp,
      };
    } else if ((!reg || reg === '"') && clip.content.length > 0) {
      // 2) 명명된 레지스터 지정이 없는 1줄 미만 소규모 삭제는 "- (small delete register)에 기록
      newRegisters['-'] = {
        type: 'char',
        content: clip.content,
      };
    }
  }

  return {
    ...nextState,
    registers: newRegisters,
    unnamedRegisterLink: namedKey ?? undefined,
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

  // 특수 읽기 전용 레지스터 (%: 현재 파일명, #: 대안 파일명, /: 마지막 검색어)
  if (targetReg === '%') {
    return {
      type: 'text',
      content: state.primaryFilename ?? 'practice.txt',
    };
  }
  if (targetReg === '#') {
    const altBuffer =
      state.alternateBufferId !== undefined
        ? state.buffers?.find((b) => b.id === state.alternateBufferId)
        : undefined;
    const altName = altBuffer?.name ?? state.secondaryFilename;
    return altName ? { type: 'text', content: altName } : null;
  }
  if (targetReg === '/') {
    return {
      type: 'text',
      content: state.lastSearchQuery ?? '',
    };
  }
  if (targetReg === '.') {
    return state.lastInsertedText
      ? { type: 'text', content: state.lastInsertedText }
      : null;
  }
  if (targetReg === ':') {
    const lastCmd = state.commandHistory?.[state.commandHistory.length - 1];
    return lastCmd ? { type: 'text', content: lastCmd } : null;
  }

  // 시스템 클립보드 ("+, "*) 조회
  if (targetReg === '+' || targetReg === '*') {
    const entry = state.registers?.[targetReg];
    const content = state.systemClipboard ?? entry?.content;
    if (content !== undefined && content !== null) {
      const str = Array.isArray(content) ? content.join('') : content;
      const type: ClipboardRegister['type'] =
        entry?.type === 'line' ? 'line' : entry?.type === 'block' ? 'block' : 'text';
      return {
        type,
        content: str,
        ...(type === 'block' && entry?.blockWidth !== undefined ? { blockWidth: entry.blockWidth } : {}),
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
    const content = registerEntryText(entry);
    const type: ClipboardRegister['type'] =
      entry.type === 'line' ? 'line' : entry.type === 'block' ? 'block' : 'text';
    return {
      type,
      content,
      ...(type === 'block' && entry.blockWidth !== undefined ? { blockWidth: entry.blockWidth } : {}),
    };
  }

  // 기본 무명 레지스터("") 또는 clipboard
  if (state.registers?.['"']) {
    const entry = state.registers['"'];
    const content = registerEntryText(entry);
    const type: ClipboardRegister['type'] =
      entry.type === 'line' ? 'line' : entry.type === 'block' ? 'block' : 'text';
    return {
      type,
      content,
      ...(type === 'block' && entry.blockWidth !== undefined ? { blockWidth: entry.blockWidth } : {}),
    };
  }

  return state.clipboard ?? null;
}

export interface PutOptions {
  /** ]p / [p: 현재 줄의 들여쓰기에 맞춰 줄 단위 텍스트의 들여쓰기를 재조정 (charwise도 줄 단위로 강제 전환) */
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
  const firstNonEmpty = blockLines.find((l) => l.trim().length > 0) ?? blockLines[0] ?? '';
  const firstCols = measureIndentCols(firstNonEmpty, tabstop);
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

    const bracketMarks = {
      start: { row: targetLine, col: 0 },
      end: { row: targetLine + insertedLines.length - 1, col: 0 },
    };

    if (options?.leaveCursorAfter) {
      const afterLine = Math.min(nextLines.length - 1, targetLine + insertedLines.length);
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        cursor: { line: afterLine, col: 0 },
        lastBracketMarks: bracketMarks,
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
      lastBracketMarks: bracketMarks,
      activeRegister: undefined,
      pendingKeys: undefined,
    };
  }

  if (rawClip.type === 'block') {
    const blockLines = rawClip.content.split('\n');
    const blockWidth =
      rawClip.blockWidth ?? Math.max(0, ...blockLines.map((l) => l.length));
    const repeatCount = Math.max(1, count);
    const currentLine = state.lines[line] ?? '';
    const insertCol = isBefore ? col : (currentLine.length === 0 ? 0 : col + 1);

    const nextLines = [...state.lines];
    for (let i = 0; i < blockLines.length; i++) {
      const rowIdx = line + i;
      while (rowIdx >= nextLines.length) {
        nextLines.push('');
      }
      const existingLine = nextLines[rowIdx];
      const seg = blockLines[i];
      if (seg.length === 0 && existingLine.length <= insertCol) {
        continue;
      }
      const paddedPrefix =
        existingLine.length < insertCol
          ? existingLine.padEnd(insertCol, ' ')
          : existingLine.slice(0, insertCol);
      const suffix = existingLine.slice(insertCol);
      const paddedUnit = seg.padEnd(blockWidth, ' ');
      const inserted =
        suffix.length > 0
          ? paddedUnit.repeat(repeatCount)
          : repeatCount > 1
            ? paddedUnit.repeat(repeatCount - 1) + seg
            : seg;
      nextLines[rowIdx] = paddedPrefix + inserted + suffix;
    }

    const endRow = line + blockLines.length - 1;
    const totalAddedWidth = blockWidth * repeatCount;
    const nextCursor = options?.leaveCursorAfter
      ? clampCursor(nextLines, { line: endRow, col: insertCol + totalAddedWidth }, 'NORMAL')
      : clampCursor(nextLines, { line, col: insertCol }, 'NORMAL');

    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: nextCursor,
      lastBracketMarks: {
        start: { row: line, col: insertCol },
        end: { row: endRow, col: Math.max(insertCol, insertCol + totalAddedWidth - 1) },
      },
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
      : clampCursor(nextLines, { line, col: insertCol }, 'NORMAL');

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

  // Vim: p/P 후 커서는 붙여넣은 텍스트의 마지막 글자 (P 는 col 위치에 넣으므로 col+len-1)
  const targetCol = options?.leaveCursorAfter
    ? insertCol + textContent.length
    : insertCol + textContent.length - 1;
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

  const toDisplayType = (t?: RegisterEntry['type'] | ClipboardRegister['type']): 'l' | 'c' | 'b' | 'm' =>
    t === 'line' ? 'l' : t === 'block' ? 'b' : t === 'macro' ? 'm' : 'c';

  // 1. "" (무명 기본 레지스터)
  const unnamedEntry = state.registers?.['"'];
  if (unnamedEntry && unnamedEntry.content) {
    const rawContent = Array.isArray(unnamedEntry.content) ? unnamedEntry.content.join('') : unnamedEntry.content;
    if (rawContent) {
      list.push({
        name: '"',
        type: toDisplayType(unnamedEntry.type),
        content: rawContent,
      });
    }
  } else if (state.clipboard?.content) {
    list.push({
      name: '"',
      type: toDisplayType(state.clipboard.type),
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
          type: toDisplayType(entry.type),
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
        type: toDisplayType(smallDel.type),
        content: rawContent,
      });
    }
  }

  // 4. "a ~ "z (명명된 레지스터 및 매크로)
  const alphaKeys = 'abcdefghijklmnopqrstuvwxyz'.split('');
  for (const k of alphaKeys) {
    const entry = state.registers?.[k];
    if (entry && entry.content) {
      const rawContent = registerEntryText(entry);

      if (rawContent) {
        list.push({
          name: k,
          type: toDisplayType(entry.type),
          content: rawContent,
        });
      }
    }
  }

  // 5. ". (마지막 Insert 텍스트), "% (현재 파일명), "# (대안 파일명), ": (마지막 Ex 명령), "/ (마지막 검색어), "= (표현식)
  if (state.lastInsertedText) {
    list.push({
      name: '.',
      type: 'c',
      content: state.lastInsertedText,
    });
  }

  if (state.primaryFilename) {
    list.push({
      name: '%',
      type: 'c',
      content: state.primaryFilename,
    });
  }

  const altBuffer =
    state.alternateBufferId !== undefined
      ? state.buffers?.find((b) => b.id === state.alternateBufferId)
      : undefined;
  const altName = altBuffer?.name ?? state.secondaryFilename;
  if (altName) {
    list.push({
      name: '#',
      type: 'c',
      content: altName,
    });
  }

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

  if (state.lastSearchQuery) {
    list.push({
      name: '/',
      type: 'c',
      content: state.lastSearchQuery,
    });
  }

  const exprEntry = state.registers?.['='];
  if (exprEntry && exprEntry.content) {
    const rawContent = Array.isArray(exprEntry.content) ? exprEntry.content.join('') : exprEntry.content;
    if (rawContent) {
      list.push({
        name: '=',
        type: 'c',
        content: rawContent,
      });
    }
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
    // Vim 처럼 제어 글자는 `^[`·`^M`·`<80>` 으로, 줄바꿈은 `^J` 로 보여 줍니다.
    const singleLinePreview = toPrintableRegisterText(item.content);
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
