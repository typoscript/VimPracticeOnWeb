import { VimEditorState } from './types';
import { syncRegisters } from './registers';
import { moveFind, executeFindOperator } from './findChar';
import {
  executeTextObjectOperator,
  TextObjectType,
  executeIndentObjectOperator,
  IndentObjectType,
  executeParagraphObjectOperator,
  ParagraphObjectType,
} from './textObjects';
import {
  executeDeleteSurround,
  executeChangeSurround,
  executeYouSurround,
  executeLineSurround,
} from './surroundEngine';
import { applyAbolishCoerce } from './abolishEngine';
import { findGitConflictAtLine, chooseGitConflict } from './gitConflictEngine';
import { setMark, jumpToMark, executeMarkOperator, isValidMarkJumpChar } from './marks';
import { indentLines, formatIndentLines, formatIndentRange } from './lineOperators';
import {
  ringBell,
  findShiftRange,
  RunHandleKeyFn,
  ParsedPending,
} from './engineHelpers';
import { PrefixStepResult } from './normalGPrefix';

/**
 * 순정 vim-surround 대기 상태(ds{char}, cs{old}{new}, ys{motion}{char}, yss{char}) 및
 * vim-abolish 케이스 변환 대기 상태(cr{s|c|m|u|-|.})를 처리합니다.
 */
export function handleNormalSurroundPending(
  state: VimEditorState,
  key: string,
  isReplayingDot = false
): VimEditorState | null {
  // 0) vim-abolish Coercion (crs, crc, crm, cru, cr-, cr., crt)
  if (state.pendingKeys === 'c' && key === 'r') {
    return { ...state, pendingKeys: 'cr' };
  }
  if (state.pendingKeys === 'cr') {
    return applyAbolishCoerce(state, key, isReplayingDot);
  }

  // 0-b) git-conflict.nvim 머지 충돌 선택 (co: ours, ct: theirs, cb: both, c0: none)
  // 커서가 유효한 머지 충돌 블록(<<<<<<< ... ======= ... >>>>>>>) 안에 있을 때만 동작해 순정 Vim ct/cb/c0 과 완전 공존
  if (
    state.pendingKeys === 'c' &&
    (key === 'o' || key === 't' || key === 'b' || key === '0') &&
    findGitConflictAtLine(state.lines, state.cursor.line)
  ) {
    const choice =
      key === 'o' ? 'ours' : key === 't' ? 'theirs' : key === 'b' ? 'both' : 'none';
    return chooseGitConflict(state, choice, isReplayingDot);
  }

  // 1) Delete Surround (ds{char})
  if (state.pendingKeys === 'd' && key === 's') {
    return { ...state, pendingKeys: 'ds' };
  }
  if (state.pendingKeys === 'ds') {
    return executeDeleteSurround(state, key);
  }

  // 2) Change Surround (cs{old}{new})
  if (state.pendingKeys === 'c' && key === 's') {
    return { ...state, pendingKeys: 'cs' };
  }
  if (state.pendingKeys === 'cs') {
    return { ...state, pendingKeys: 'cs' + key };
  }
  if (state.pendingKeys?.startsWith('cs') && state.pendingKeys.length === 3) {
    return executeChangeSurround(state, state.pendingKeys[2], key);
  }

  // 3) You Surround / Line Surround (ys{motion}{char}, yss{char})
  if (state.pendingKeys === 'y' && key === 's') {
    return { ...state, pendingKeys: 'ys' };
  }
  if (state.pendingKeys === 'ys') {
    if (key === 's' || key === '_') {
      return { ...state, pendingKeys: 'yss' };
    }
    if (key === 'i' || key === 'a' || key === '$' || key === 'e' || key === 'w') {
      return { ...state, pendingKeys: 'ys' + key };
    }
    return { ...state, pendingKeys: undefined };
  }
  if (state.pendingKeys === 'yss') {
    return executeLineSurround(state, key);
  }
  if (state.pendingKeys === 'ysi' || state.pendingKeys === 'ysa') {
    return { ...state, pendingKeys: state.pendingKeys + key };
  }
  if (
    state.pendingKeys?.startsWith('ys') &&
    state.pendingKeys.length >= 3 &&
    state.pendingKeys !== 'yss'
  ) {
    return executeYouSurround(state, state.pendingKeys.slice(2), key);
  }

  return null;
}

/**
 * 마크 연산자(d'a, c`a)·단독 마크 점프('a, `a)·마크 설정(m{a-zA-Z})을 처리합니다.
 */
export function handleNormalMarkPending(
  state: VimEditorState,
  key: string,
  operator: string | undefined,
  isReplayingDot: boolean
): VimEditorState | null {
  const markOpMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([dcyv])(['`])$/);
  if (markOpMatch) {
    const op = markOpMatch[2] as 'd' | 'c' | 'y' | 'v';
    const quote = markOpMatch[3] as "'" | '`';
    if (isValidMarkJumpChar(key)) {
      const res = executeMarkOperator(state, op, key, quote === "'");
      const synced = syncRegisters(state, res, op === 'y');
      if (op === 'c') {
        return {
          ...synced,
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : [op, quote, key],
        };
      }
      if (op === 'd') {
        return {
          ...synced,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : [op, quote, key],
        };
      }
      return synced;
    }
    return { ...state, pendingKeys: undefined };
  }

  const standaloneMarkMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?(['`])$/);
  if (standaloneMarkMatch) {
    const quote = standaloneMarkMatch[2];
    if (isValidMarkJumpChar(key)) {
      return jumpToMark(state, key, quote === "'");
    }
    return { ...state, pendingKeys: undefined };
  }

  if (state.pendingKeys === 'm' || operator === 'm') {
    if (/^[a-zA-Z]$/.test(key)) {
      return setMark(state, key);
    }
    return { ...state, pendingKeys: undefined };
  }

  return null;
}

/**
 * 셸 필터(!{motion}/!!), 들여쓰기(>{motion}/<<), 자동 정렬(={motion}/==) 대기 상태를 처리합니다.
 */
export function handleNormalFilterShiftEqualPending(
  state: VimEditorState,
  key: string,
  parsed: ParsedPending,
  isReplayingDot: boolean,
  runHandleKey: RunHandleKeyFn
): PrefixStepResult | null {
  // !{motion} / !! : 셸 파이프 필터 연산자
  const filterMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?!([1-9][0-9]*)?([iagfFtT'`\[\]])?$/);
  if (filterMatch) {
    const [, c1, c2, prefix] = filterMatch;
    if (!prefix && key === '!') {
      const count = (c1 ? parseInt(c1, 10) : 1) * (c2 ? parseInt(c2, 10) : 1);
      const endLine = Math.min(state.lines.length - 1, state.cursor.line + count - 1);
      const delta = endLine - state.cursor.line;
      const cmdBuffer = delta > 0 ? `.,.+${delta}!` : '.!';
      return {
        handled: true,
        state: {
          ...state,
          mode: 'COMMAND',
          commandType: ':',
          commandBuffer: cmdBuffer,
          pendingKeys: undefined,
          commandMessage: undefined,
          filterOperatorKeys: [...(state.pendingKeys ?? '').split(''), '!'],
        },
      };
    }
    if (!prefix && (/^[1-9]$/.test(key) || (key === '0' && c2))) {
      return { handled: true, state: { ...state, pendingKeys: state.pendingKeys + key } };
    }
    if (!prefix && "iagfFtT'`[]".includes(key)) {
      return { handled: true, state: { ...state, pendingKeys: state.pendingKeys + key } };
    }
    const count = (c1 ? parseInt(c1, 10) : 1) * (c2 ? parseInt(c2, 10) : 1);
    const range = findShiftRange(state, prefix ? [prefix, key] : [key], count, runHandleKey);
    if (!range) return { handled: true, state: ringBell(state) };
    const delta = range.endLine - range.startLine;
    const cmdBuffer =
      delta > 0
        ? range.endLine === state.lines.length - 1
          ? '.,$!'
          : `.,.+${delta}!`
        : '.!';
    return {
      handled: true,
      state: {
        ...state,
        mode: 'COMMAND',
        commandType: ':',
        commandBuffer: cmdBuffer,
        cursor: { line: range.startLine, col: 0 },
        pendingKeys: undefined,
        commandMessage: undefined,
        filterOperatorKeys: [...(state.pendingKeys ?? '').split(''), key],
      },
    };
  }

  // >{motion} / <{motion} / >{텍스트 객체} (mini.ai >in{ / <al( 포함)
  const shiftMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([<>])([1-9][0-9]*)?([ia][nl]|[iagfFtT'`\[\]])?$/);
  if (shiftMatch && key !== shiftMatch[2]) {
    const [, c1, dir, c2, prefix] = shiftMatch;
    if (!prefix && (/^[1-9]$/.test(key) || (key === '0' && c2))) {
      return { handled: true, state: { ...state, pendingKeys: state.pendingKeys + key } };
    }
    if (!prefix && "iagfFtT'`[]".includes(key)) {
      return { handled: true, state: { ...state, pendingKeys: state.pendingKeys + key } };
    }
    if ((prefix === 'i' || prefix === 'a') && (key === 'n' || key === 'l')) {
      return { handled: true, state: { ...state, pendingKeys: state.pendingKeys + key } };
    }
    const count = (c1 ? parseInt(c1, 10) : 1) * (c2 ? parseInt(c2, 10) : 1);
    const range = findShiftRange(state, prefix ? [...prefix.split(''), key] : [key], count, runHandleKey);
    if (!range) return { handled: true, state: ringBell(state) };
    const res = indentLines(
      { ...state, cursor: { line: range.startLine, col: 0 }, pendingKeys: undefined },
      range.endLine - range.startLine + 1,
      dir === '>' ? 'in' : 'out',
      state.cursor.col
    );
    const keys = [...(state.pendingKeys ?? '').split(''), key];
    return {
      handled: true,
      state: { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : keys },
    };
  }

  if (parsed.operator === '>') {
    if (key === '>') {
      const res = indentLines(state, parsed.totalCount, 'in');
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '>', '>'] : ['>', '>'];
      return {
        handled: true,
        state: { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys },
      };
    }
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }
  if (parsed.operator === '<') {
    if (key === '<') {
      const res = indentLines(state, parsed.totalCount, 'out');
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '<', '<'] : ['<', '<'];
      return {
        handled: true,
        state: { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys },
      };
    }
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  // =g 대기 상태 (예: =gg 또는 1=gg)
  if (state.pendingKeys?.endsWith('=g')) {
    if (key === 'g') {
      const res = formatIndentRange(state, 0, state.cursor.line);
      return {
        handled: true,
        state: { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['=', 'g', 'g'] },
      };
    }
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  if (parsed.operator === '=') {
    if (key === '=') {
      const res = formatIndentLines(state, parsed.totalCount);
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '=', '='] : ['=', '='];
      return {
        handled: true,
        state: { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys },
      };
    }
    if (key === 'G') {
      const res = formatIndentRange(state, state.cursor.line, state.lines.length - 1);
      return {
        handled: true,
        state: { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['=', 'G'] },
      };
    }
    if (key === 'g') {
      return {
        handled: true,
        state: {
          ...state,
          pendingKeys: (parsed.count1 ? String(parsed.count1) : '') + '=g',
        },
      };
    }
    if (key === 'j') {
      const endLine = Math.min(state.lines.length - 1, state.cursor.line + parsed.totalCount);
      const res = formatIndentRange(state, state.cursor.line, endLine);
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '=', 'j'] : ['=', 'j'];
      return {
        handled: true,
        state: { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys },
      };
    }
    if (key === 'k') {
      const startLine = Math.max(0, state.cursor.line - parsed.totalCount);
      const res = formatIndentRange(state, startLine, state.cursor.line);
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '=', 'k'] : ['=', 'k'];
      return {
        handled: true,
        state: { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys },
      };
    }
    if (key === 'i' || key === 'a') {
      return {
        handled: true,
        state: {
          ...state,
          pendingKeys: (parsed.count1 ? String(parsed.count1) : '') + '=' + key,
        },
      };
    }
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  return null;
}

/**
 * 텍스트 객체([count][op][i|a]...)와 문자 탐색(f/t/F/T 및 연산자 결합) 대기 상태를 처리합니다.
 */
export function handleNormalTextObjectAndFindPending(
  state: VimEditorState,
  key: string,
  isReplayingDot: boolean
): PrefixStepResult | null {
  // 1-a. mini.ai 스타일 Next/Last 텍스트 객체 대기 상태 (din", cin(, yil{, =in{, gUin" 등)
  const miniAiPendingMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([dcyv=]|g[uU~?])([1-9][0-9]*)?([ia])([nl])$/);
  if (miniAiPendingMatch) {
    const count =
      (miniAiPendingMatch[1] ? parseInt(miniAiPendingMatch[1], 10) : 1) *
      (miniAiPendingMatch[3] ? parseInt(miniAiPendingMatch[3], 10) : 1);
    const op = miniAiPendingMatch[2] as 'd' | 'c' | 'y' | 'v' | '=' | 'gu' | 'gU' | 'g~' | 'g?';
    const modifier = miniAiPendingMatch[4] as 'i' | 'a';
    const scope = miniAiPendingMatch[5] as 'n' | 'l';
    const validMiniTargets = ['"', "'", '`', '(', ')', '[', ']', '{', '}', 'b', 'B', '<', '>'];
    if (validMiniTargets.includes(key)) {
      let targetChar = key;
      if (key === 'b' || key === ')') targetChar = '(';
      else if (key === 'B' || key === '}') targetChar = '{';
      else if (key === ']') targetChar = '[';
      else if (key === '>') targetChar = '<';
      const objType: TextObjectType = `${modifier}${scope}${targetChar}` as TextObjectType;
      const res = executeTextObjectOperator(state, op, objType, count);
      const synced = syncRegisters(state, res, op === 'y');
      const opSeq = op.length > 1 ? op.split('') : [op];
      const opKeys = count > 1 ? [String(count), ...opSeq, modifier, scope, key] : [...opSeq, modifier, scope, key];
      if (op === 'c' && synced.mode === 'INSERT') {
        return {
          handled: true,
          state: {
            ...synced,
            currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys,
          },
        };
      }
      if (!synced.bell && (op === 'd' || op === '=' || op === 'gu' || op === 'gU' || op === 'g~')) {
        return {
          handled: true,
          state: {
            ...synced,
            lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys,
          },
        };
      }
      return { handled: true, state: synced };
    }
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  // 1. 텍스트 객체 대기 상태 (diw, cai, dap, =i{, gUai 등)
  const textObjPendingMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([dcyv=]|g[uU~?])([1-9][0-9]*)?([ia])$/);
  if (textObjPendingMatch) {
    if (key === 'n' || key === 'l') {
      return {
        handled: true,
        state: { ...state, pendingKeys: (state.pendingKeys ?? '') + key },
      };
    }
    const count =
      (textObjPendingMatch[1] ? parseInt(textObjPendingMatch[1], 10) : 1) *
      (textObjPendingMatch[3] ? parseInt(textObjPendingMatch[3], 10) : 1);
    const op = textObjPendingMatch[2] as 'd' | 'c' | 'y' | 'v' | '=' | 'gu' | 'gU' | 'g~' | 'g?';
    const modifier = textObjPendingMatch[4] as 'i' | 'a';

    const finalizeOpResult = (res: VimEditorState) => {
      const synced = syncRegisters(state, res, op === 'y');
      const opKeys = count > 1 ? [String(count), op, modifier, key] : [op, modifier, key];
      if (op === 'c') {
        return {
          ...synced,
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys,
        };
      }
      if (op === 'd' || op === '=' || op === 'gu' || op === 'gU' || op === 'g~') {
        return {
          ...synced,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys,
        };
      }
      return synced;
    };

    if (key === 'i' || key === 'I' || key === 'p') {
      const res =
        key === 'p'
          ? executeParagraphObjectOperator(state, op, `${modifier}p` as ParagraphObjectType, count)
          : executeIndentObjectOperator(state, op, `${modifier}${key}` as IndentObjectType, count);
      if (!res) return { handled: true, state: ringBell(state) };
      return { handled: true, state: finalizeOpResult(res) };
    }

    const validTargets = ['w', 'W', '"', "'", '`', '(', ')', '[', ']', '{', '}', 'b', 'B', 't', 's', '<', '>', 'f', 'c', 'a'];
    if (validTargets.includes(key)) {
      let targetChar = key;
      if (key === 'b' || key === ')') targetChar = '(';
      else if (key === 'B' || key === '}') targetChar = '{';
      else if (key === ']') targetChar = '[';
      else if (key === '>') targetChar = '<';

      const objType: TextObjectType = `${modifier}${targetChar}` as TextObjectType;
      const res = executeTextObjectOperator(state, op, objType, count);
      return { handled: true, state: finalizeOpResult(res) };
    }

    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  // 2. 연산자 + 문자 탐색 대기 상태 (df, dt, dF, dT, cf, ct, cF, cT, yf, yt, yF, yT)
  const findOpMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([dcy])([0-9]*)([ftFT])$/);
  if (findOpMatch) {
    const c1 = findOpMatch[1] ? parseInt(findOpMatch[1], 10) : 1;
    const op = findOpMatch[2] as 'd' | 'c' | 'y';
    const c2 = findOpMatch[3] && findOpMatch[3].length > 0 ? parseInt(findOpMatch[3], 10) : 1;
    const motion = findOpMatch[4] as 'f' | 't' | 'F' | 'T';
    const totalCount = c1 * c2;

    if (key.length === 1) {
      if (!moveFind(state.lines, state.cursor, motion, key, totalCount)) {
        return {
          handled: true,
          state: { ...ringBell(state), lastCharSearch: { type: motion, char: key } },
        };
      }
      const res = executeFindOperator(state, op, motion, key, totalCount);
      const synced = syncRegisters(
        state,
        { ...res, lastCharSearch: { type: motion, char: key } },
        op === 'y'
      );
      if (op === 'c') {
        return {
          handled: true,
          state: {
            ...synced,
            currentChangeKeys: isReplayingDot ? state.currentChangeKeys : [op, motion, key],
          },
        };
      }
      if (op === 'd') {
        return {
          handled: true,
          state: {
            ...synced,
            lastChangeKeys: isReplayingDot ? state.lastChangeKeys : [op, motion, key],
          },
        };
      }
      return { handled: true, state: synced };
    }
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  // 3. 단독 문자 탐색 대기 상태 (f, t, F, T)
  const findMotionMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([ftFT])$/);
  if (findMotionMatch) {
    const count = findMotionMatch[1] ? parseInt(findMotionMatch[1], 10) : 1;
    const motion = findMotionMatch[2] as 'f' | 't' | 'F' | 'T';

    if (key.length === 1) {
      const nextPos = moveFind(state.lines, state.cursor, motion, key, count);
      return {
        handled: true,
        state: {
          ...(nextPos ? state : ringBell(state)),
          cursor: nextPos ?? state.cursor,
          lastCharSearch: { type: motion, char: key },
          pendingKeys: undefined,
        },
      };
    }
    return { handled: true, state: { ...state, pendingKeys: undefined } };
  }

  return null;
}
