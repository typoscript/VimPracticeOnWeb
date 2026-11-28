/**
 * `:registers` / `:display` 목록 출력 (레지스터 상태를 읽기만 하는 순수 포맷터).
 * `registers.ts` 가 다시 export 합니다.
 */
import { ClipboardRegister, RegisterEntry, VimEditorState } from './types';
import { registerEntryText, toPrintableRegisterText } from './registerText';

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
