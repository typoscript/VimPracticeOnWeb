import { VimEditorState } from './types';
import { getOptions } from './setOptionsCore';
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
  startSurroundTagPrompt,
} from './surroundEngine';
import { applyAbolishCoerce } from './abolishEngine';
import { findGitConflictAtLine, chooseGitConflict } from './gitConflictEngine';
import { setMark, jumpToMark, isValidMarkJumpChar } from './marks';
import { executeMarkMotionOperator } from './markOperator';
import { indentLines, formatIndentLines, formatIndentRange } from './lineOperators';
import {
  ringBell,
  findShiftRange,
  findOperatorRangeByYank,
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
    // 새 대상 < / t 는 태그 이름 입력 프롬프트 (cst<p>, cs"<em>)
    if (key === '<' || key === 't') {
      return startSurroundTagPrompt(state, 'cs', state.pendingKeys[2], key);
    }
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
    if (key === '<' || key === 't') return startSurroundTagPrompt(state, 'yss', '', key);
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
    if (key === '<' || key === 't') {
      return startSurroundTagPrompt(state, 'ys', state.pendingKeys.slice(2), key);
    }
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
      const res = executeMarkMotionOperator(state, op, key, quote === "'");
      const synced = syncRegisters(state, res, op === 'y', true);
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
 * ={motion} 의 줄 범위. 같은 모션의 y 로 구하고, 빈 범위(커서 줄의 `0` 등)는 커서 줄 하나입니다.
 * 모션이 실패(bell)하면 null.
 */
function equalMotionRange(
  state: VimEditorState,
  motionKeys: string[],
  count: number,
  runHandleKey: RunHandleKeyFn
): { startLine: number; endLine: number; opStart: { line: number; col: number } } | null {
  const range = findOperatorRangeByYank(state, motionKeys, count, runHandleKey);
  // y 는 커서를 연산 범위 시작(oap->start)에 두므로 그 위치가 `=` 의 실행 취소 커서입니다.
  if (range) return { startLine: range.start.line, endLine: range.end.line, opStart: range.cursor };
  // 커서가 움직이지 않아도 성공하는 모션만 빈 범위(커서 줄)로 봅니다 (0, ^, |, t/T 바로 옆 글자, 마크).
  if (!'0^|tT`\''.includes(motionKeys[0])) return null;
  let probe: VimEditorState = { ...state, mode: 'NORMAL', pendingKeys: undefined, visualAnchor: undefined, bell: false };
  for (const k of [...(count > 1 ? String(count).split('') : []), 'y', ...motionKeys]) {
    probe = runHandleKey(probe, k);
    if (probe.bell) return null;
  }
  if (probe.mode !== 'NORMAL' || probe.pendingKeys || probe.lines !== state.lines) return null;
  return { startLine: state.cursor.line, endLine: state.cursor.line, opStart: { ...probe.cursor } };
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
      { ...state, cursor: { line: range.startLine, col: range.startCol }, pendingKeys: undefined },
      range.endLine - range.startLine + 1,
      dir === '>' ? 'in' : 'out',
      // Vim op_shift 의 beginline(BL_SOL) / do_pending_operator 의 old_col: 연산 전 기억한 열. `|` 는 curswant 를 count-1 로 정합니다.
      !prefix && key === '|' ? count - 1 : (state.curswant ?? state.cursor.col)
    );
    const keys = [...(state.pendingKeys ?? '').split(''), key];
    // $ 와 g_ 는 Vim 에서 curswant 를 '줄 끝'(MAXCOL)으로 두므로, 'nostartofline' 이면 들여쓰기 뒤 커서가 줄 끝으로 갑니다.
    const toLineEnd = (key === '$' || (prefix === 'g' && key === '_')) && !getOptions(state).startofline && !res.bell;
    const shifted = toLineEnd
      ? { ...res, cursor: { line: res.cursor.line, col: Math.max(0, (res.lines[res.cursor.line] ?? '').length - 1) } }
      : res;
    return {
      handled: true,
      state: { ...shifted, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : keys },
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

  // ={motion} / [count]== : C 들여쓰기 (Vim cindent, cindent.ts)
  const equalMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?=([1-9][0-9]*)?([gfFtT'`\[\]])?$/);
  if (equalMatch) {
    const [, c1, c2, prefix] = equalMatch;
    const count = (c1 ? parseInt(c1, 10) : 1) * (c2 ? parseInt(c2, 10) : 1);
    const keys = [...(state.pendingKeys ?? '').split(''), key];
    if (!prefix && key === '=') {
      const res = formatIndentLines(state, count);
      return { handled: true, state: { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : keys } };
    }
    if (!prefix && (/^[1-9]$/.test(key) || (key === '0' && c2))) {
      return { handled: true, state: { ...state, pendingKeys: state.pendingKeys + key } };
    }
    // =i{ / =ap 등 텍스트 객체는 텍스트 객체 대기 상태가, 2타 모션(gg, f{char} 등)은 다음 키가 처리합니다.
    if (!prefix && (key === 'i' || key === 'a' || "gfFtT'`[]".includes(key))) {
      return { handled: true, state: { ...state, pendingKeys: state.pendingKeys + key } };
    }
    if (key === 'Escape') return { handled: true, state: { ...state, pendingKeys: undefined } };
    // 모션 범위는 같은 모션의 y 로 구합니다 (exclusive/linewise 규칙과 실패 시 bell 이 Vim 과 같음).
    const range = equalMotionRange(state, prefix ? [prefix, key] : [key], count, runHandleKey);
    if (!range) return { handled: true, state: ringBell(state) };
    // `$`·`g_`·`|` 는 Vim 처럼 기억한 열(curswant)을 바꿉니다.
    const toEol = (!prefix && key === '$') || (prefix === 'g' && key === '_');
    const keepCol = toEol ? Number.MAX_SAFE_INTEGER : !prefix && key === '|' ? count - 1 : undefined;
    const res = formatIndentRange(state, range.startLine, range.endLine, keepCol, range.opStart);
    return { handled: true, state: { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : keys } };
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
