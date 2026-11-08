import { FunctionDraft, UserFunction, VimEditorState, VimScriptValue } from './types';
import { compileVimRegex } from './vimRegex';
import {
  EvalContext,
  VimScriptError,
  addValues,
  displayValue,
  evaluateVimScript,
  evaluateVimScriptList,
  formatValue,
  isList,
  isTruthy,
  parseLValue,
  readLValue,
  toNumber,
  toVimString,
  unsetLValue,
  writeLValue,
} from './vimscriptEval';
import { pushUndoSnapshot } from './operators';
import { msg } from './messages';

/**
 * Vim script 함수 엔진 (:function, :endfunction, :delfunction, :call, :let, :unlet, :echo, :execute)
 *
 * - 커맨드라인에서 `:function! Name(a, b)` 를 입력하면 실제 Vim처럼 본문 입력 모드(functionDraft)로 들어가고,
 *   이어서 입력하는 줄이 본문에 쌓이다가 `endfunction` 에서 확정됩니다. (.vimrc 소싱 시에는 여러 줄을 한 번에 정의)
 * - 본문 문법: let / unlet / echo / execute / call / return / if·elseif·else·endif / while·endwhile /
 *   for·endfor (for x in list, for [a, b] in pairs) / break·continue
 *   그 밖의 줄은 일반 Ex 명령(:normal, :s, :g ...)으로 실행됩니다.
 * - `:[range]call F()` 는 range 속성이 없으면 범위의 줄마다(커서를 그 줄 첫 칸에 두고) 호출하고,
 *   range 속성이 있으면 한 번만 호출합니다. 두 경우 모두 a:firstline / a:lastline 이 설정됩니다.
 *
 * 이 모듈은 commandLine.ts에 의존하지 않으며, Ex 명령 실행은 호출부가 넘겨주는 runner가 담당합니다.
 */

export type ExRunner = (state: VimEditorState, command: string) => VimEditorState;

/** Vim의 'maxfuncdepth' 기본값 */
const MAX_FUNC_DEPTH = 100;
/** while 무한 루프 방지 */
const MAX_LOOP_ITERATIONS = 10000;

const FUNC_HEADER = /^fu(?:n(?:c(?:t(?:i(?:o(?:n)?)?)?)?)?)?(!?)(?:\s+(.*))?$/;
const END_FUNC = /^endf(?:u(?:n(?:c(?:t(?:i(?:o(?:n)?)?)?)?)?)?)?$/;
const DEL_FUNC = /^delf(?:u(?:n(?:c(?:t(?:i(?:o(?:n)?)?)?)?)?)?)?(!?)\s+(\S+)$/;

function finish(state: VimEditorState, commandMessage?: string, bell = false): VimEditorState {
  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage,
    ...(bell ? { bell: true } : {}),
  };
}

function withoutBell(state: VimEditorState): VimEditorState {
  if (!state.bell) return state;
  const copy = { ...state };
  delete copy.bell;
  return copy;
}

function signature(fn: UserFunction): string {
  const params = [...fn.params, ...(fn.varargs ? ['...'] : [])].join(', ');
  return `function ${fn.name}(${params})${fn.range ? ' range' : ''}${fn.abort ? ' abort' : ''}`;
}

// ---------------------------------------------------------------------------
// 정의 (:function / :endfunction / :delfunction)
// ---------------------------------------------------------------------------

type Header = Omit<UserFunction, 'body'>;

/** `Name(a, b, ...) range abort` 를 해석합니다. 실패하면 에러 메시지 문자열을 반환합니다. */
function parseFunctionHeader(rest: string): Header | string {
  const m = rest.match(/^([A-Za-z_:][\w:#]*)\s*\(([^)]*)\)\s*(.*)$/);
  if (!m) return msg('E124: 함수 정의 뒤에 ( 가 필요합니다: {rest}', { rest });

  const name = m[1].replace(/^g:/, '');
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(name) && !/^s:\w+$/.test(name)) {
    return msg('E128: 함수 이름은 대문자 또는 "s:" 로 시작해야 합니다: {v}', { v: m[1] });
  }

  const rawParams = m[2].split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  let varargs = false;
  const params: string[] = [];
  for (let i = 0; i < rawParams.length; i++) {
    const p = rawParams[i];
    if (p === '...') {
      if (i !== rawParams.length - 1) return msg('E125: 잘못된 인자입니다: ...');
      varargs = true;
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p)) {
      return msg('E125: 잘못된 인자입니다: {p}', { p });
    } else if (params.includes(p)) {
      return msg('E853: 중복된 인자 이름입니다: {p}', { p });
    } else {
      params.push(p);
    }
  }

  let range = false;
  let abort = false;
  for (const word of m[3].split(/\s+/).filter((w) => w.length > 0)) {
    if (word === 'range') range = true;
    else if (word === 'abort') abort = true;
    else if (word !== 'dict' && word !== 'closure') return msg('E488: 불필요한 문자가 있습니다: {word}', { word });
  }

  return { name, params, varargs, range, abort };
}

function formatFunctionList(state: VimEditorState): string {
  const fns = Object.values(state.userFunctions ?? {}).sort((a, b) => a.name.localeCompare(b.name));
  if (fns.length === 0) return msg('사용자 정의 함수가 없습니다.');
  return fns.map(signature).join('\n');
}

function formatFunctionBody(fn: UserFunction): string {
  return [
    `   ${signature(fn)}`,
    ...fn.body.map((l, i) => `${String(i + 1).padStart(3)}  ${l}`),
    '   endfunction',
  ].join('\n');
}

/** 함수를 등록합니다. (기존 함수가 있고 overwrite가 아니면 E122) */
function registerFunction(state: VimEditorState, fn: UserFunction, overwrite: boolean): VimEditorState | string {
  if (state.userFunctions?.[fn.name] && !overwrite) {
    return msg('E122: 함수 {name} 이(가) 이미 있습니다. 덮어쓰려면 ! 를 붙이세요', { name: fn.name });
  }
  return { ...state, userFunctions: { ...(state.userFunctions ?? {}), [fn.name]: fn } };
}

/** 커맨드라인 본문 입력 중(functionDraft)에 한 줄을 받습니다. endfunction 이면 함수를 확정합니다. */
export function appendFunctionDraftLine(state: VimEditorState, line: string): VimEditorState {
  const draft = state.functionDraft;
  if (!draft) return state;

  if (END_FUNC.test(line.trim())) {
    const { overwrite, ...fn } = draft;
    const registered = registerFunction({ ...state, functionDraft: undefined }, fn, overwrite);
    if (typeof registered === 'string') return finish({ ...state, functionDraft: undefined }, registered, true);
    return finish(registered, msg('[함수 정의] {v} ({bodyCount}줄)', { v: signature(fn), bodyCount: fn.body.length }));
  }

  const nextDraft: FunctionDraft = { ...draft, body: [...draft.body, line.replace(/^\s*:?/, '')] };
  return {
    ...state,
    mode: 'COMMAND',
    commandType: ':',
    commandBuffer: '',
    functionDraft: nextDraft,
    commandMessage: draftMessage(nextDraft),
  };
}

function draftMessage(draft: FunctionDraft): string {
  return msg('함수 {name} 본문 입력 중 ({bodyCount}줄) · endfunction 으로 끝내기, Esc 취소', { name: draft.name, bodyCount: draft.body.length });
}

/** 본문 입력을 취소합니다. (Esc) */
export function cancelFunctionDraft(state: VimEditorState): VimEditorState {
  return finish({ ...state, functionDraft: undefined }, msg('함수 {v} 정의를 취소했습니다.', { v: state.functionDraft?.name ?? '' }));
}

/** .vimrc 소싱처럼 헤더와 본문을 한 번에 받아 함수를 정의합니다. */
export function defineFunctionFromLines(state: VimEditorState, headerLine: string, body: string[]): VimEditorState {
  const m = headerLine.trim().match(FUNC_HEADER);
  const header = m?.[2] ? parseFunctionHeader(m[2].trim()) : msg('E124: 함수 정의가 올바르지 않습니다: {headerLine}', { headerLine });
  if (typeof header === 'string') return finish(state, header, true);
  const registered = registerFunction(state, { ...header, body }, m?.[1] === '!');
  return typeof registered === 'string' ? finish(state, registered, true) : registered;
}

/** 소싱 시 함수 정의 블록의 시작/끝 줄인지 판별합니다. */
export function isFunctionHeaderLine(line: string): boolean {
  const m = line.trim().match(FUNC_HEADER);
  return !!m && !!m[2] && m[2].includes('(');
}
export function isEndFunctionLine(line: string): boolean {
  return END_FUNC.test(line.trim());
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

interface CallResult {
  state: VimEditorState;
  value: VimScriptValue;
  error?: string;
}

/** 사용자 함수를 호출합니다. 실패하면 error 에 메시지를 담아 돌려줍니다. */
export function callUserFunction(
  state: VimEditorState,
  name: string,
  args: VimScriptValue[],
  runEx: ExRunner,
  depth = 0,
  firstline = state.cursor.line + 1,
  lastline = state.cursor.line + 1
): CallResult {
  const fn = state.userFunctions?.[name];
  if (!fn) return { state, value: 0, error: msg('E117: 알 수 없는 함수입니다: {name}', { name }) };
  if (depth >= MAX_FUNC_DEPTH) {
    return { state, value: 0, error: msg('E132: 함수 호출 깊이가 \'maxfuncdepth\'({MAX_FUNC_DEPTH})를 넘었습니다', { MAX_FUNC_DEPTH }) };
  }
  if (args.length < fn.params.length) return { state, value: 0, error: msg('E119: 함수의 인자가 부족합니다: {name}', { name }) };
  if (args.length > fn.params.length && !fn.varargs) {
    return { state, value: 0, error: msg('E118: 함수의 인자가 너무 많습니다: {name}', { name }) };
  }

  const extra = args.slice(fn.params.length);
  const aArgs: Record<string, VimScriptValue> = { firstline, lastline, '0': extra.length, '000': extra };
  fn.params.forEach((p, i) => (aArgs[p] = args[i]));
  extra.forEach((v, i) => (aArgs[String(i + 1)] = v));

  const ctx: EvalContext = {
    state,
    locals: {},
    args: aArgs,
    callUserFunction: (c, n, a) => {
      const r = callUserFunction(c.state, n, a, runEx, depth + 1);
      c.state = r.state;
      if (r.error) throw new VimScriptError(r.error);
      return r.value;
    },
  };

  return runFunctionBody(fn, ctx, runEx);
}

type BlockFrame =
  | { type: 'if'; active: boolean; taken: boolean }
  | { type: 'while'; start: number; active: boolean; continued: boolean }
  | { type: 'for'; start: number; active: boolean; continued: boolean; items: VimScriptValue[]; index: number; target: string }
  | {
      type: 'try';
      active: boolean;
      tryActive: boolean;
      hasError: boolean;
      exception?: string;
      caught: boolean;
      inFinally: boolean;
      hasFinally: boolean;
      pendingReturn?: VimScriptValue;
    };

type LoopFrame = Extract<BlockFrame, { type: 'while' | 'for' }>;

function runFunctionBody(fn: UserFunction, ctx: EvalContext, runEx: ExRunner): CallResult {
  return runScriptLines(fn.body, ctx, runEx, fn.abort);
}

/**
 * Vim script 줄 목록을 실행합니다 (함수 본문, 스크립트 블록).
 * if/while/for/try-catch-finally/return/break/continue 및 Ex 명령을 지원합니다.
 */
export function runScriptLines(
  lines: string[],
  ctx: EvalContext,
  runEx: ExRunner,
  abort = false
): { state: VimEditorState; value: VimScriptValue; error?: string } {
  const stack: BlockFrame[] = [];
  const executing = () => stack.every((f) => f.active);
  let firstError: string | undefined;
  let iterations = 0;

  for (let pc = 0; pc < lines.length; pc++) {
    const line = lines[pc].trim().replace(/^:\s*/, '');
    if (line.length === 0 || line.startsWith('"')) continue;
    const word = line.match(/^(\w+)/)?.[1] ?? '';
    const rest = line.slice(word.length).trim();

    try {
      // 1. 제어 구문 (실행 중이 아니어도 블록 짝을 맞추기 위해 항상 해석)
      if (word === 'if') {
        const active = executing() && isTruthy(evaluateVimScript(rest, ctx));
        stack.push({ type: 'if', active, taken: active || !executing() });
        continue;
      }
      if (word === 'elseif' || word === 'elsei') {
        const top = stack[stack.length - 1];
        if (top?.type !== 'if') throw new VimScriptError(msg('E582: :if 없이 :elseif 가 사용되었습니다'));
        const parentActive = stack.slice(0, -1).every((f) => f.active);
        if (parentActive && !top.taken) {
          top.active = isTruthy(evaluateVimScript(rest, ctx));
          top.taken = top.active;
        } else {
          top.active = false;
        }
        continue;
      }
      if (word === 'else' || word === 'el') {
        const top = stack[stack.length - 1];
        if (top?.type !== 'if') throw new VimScriptError(msg('E581: :if 없이 :else 가 사용되었습니다'));
        const parentActive = stack.slice(0, -1).every((f) => f.active);
        top.active = parentActive && !top.taken;
        top.taken = true;
        continue;
      }
      if (word === 'endif' || word === 'en') {
        if (stack[stack.length - 1]?.type !== 'if') throw new VimScriptError(msg('E580: :if 없이 :endif 가 사용되었습니다'));
        stack.pop();
        continue;
      }
      if (word === 'while' || word === 'wh') {
        const active = executing() && isTruthy(evaluateVimScript(rest, ctx));
        stack.push({ type: 'while', start: pc, active, continued: false });
        continue;
      }
      if (word === 'endwhile' || word === 'endw') {
        const top = stack.pop();
        if (top?.type !== 'while') throw new VimScriptError(msg('E588: :while 없이 :endwhile 이 사용되었습니다'));
        if (top.active || top.continued) {
          if (++iterations > MAX_LOOP_ITERATIONS) throw new VimScriptError(msg('E169: while 반복이 너무 많습니다'));
          pc = top.start - 1; // while 줄을 다시 평가
        }
        continue;
      }
      if (word === 'for') {
        const m = rest.match(/^(.+?)\s+in\s+(.+)$/);
        if (!m) throw new VimScriptError(msg('E690: :for 뒤에 "in" 이 없습니다: {line}', { line }));
        let items: VimScriptValue[] = [];
        if (executing()) {
          const value = evaluateVimScript(m[2], ctx);
          if (!isList(value)) throw new VimScriptError(msg('E714: :for 에는 리스트가 필요합니다'));
          items = value;
        }
        const frame: BlockFrame = { type: 'for', start: pc, active: items.length > 0, continued: false, items, index: 0, target: m[1].trim() };
        stack.push(frame);
        if (frame.active) assignTargets(ctx, frame.target, items[0]);
        continue;
      }
      if (word === 'endfor' || word === 'endfo') {
        const top = stack[stack.length - 1];
        if (top?.type !== 'for') throw new VimScriptError(msg('E588: :for 없이 :endfor 가 사용되었습니다'));
        const parentActive = stack.slice(0, -1).every((f) => f.active);
        // 본문을 끝까지 실행했거나 continue 로 왔으면 다음 항목으로, break 로 왔으면 종료
        if (parentActive && (top.active || top.continued) && top.index + 1 < top.items.length) {
          if (++iterations > MAX_LOOP_ITERATIONS) throw new VimScriptError(msg('E169: for 반복이 너무 많습니다'));
          top.index++;
          top.active = true;
          top.continued = false;
          assignTargets(ctx, top.target, top.items[top.index]);
          pc = top.start; // 본문 첫 줄로
          continue;
        }
        stack.pop();
        continue;
      }
      if (word === 'break' || word === 'brea' || word === 'continue' || word === 'con') {
        if (!executing()) continue;
        const idx = stack.map((f) => f.type !== 'if' && f.type !== 'try').lastIndexOf(true);
        if (idx < 0) throw new VimScriptError(msg('E587: :while/:for 없이 :{word} 가 사용되었습니다', { word }));
        const loop = stack[idx] as LoopFrame;
        loop.active = false;
        loop.continued = word.startsWith('con');
        for (let i = idx + 1; i < stack.length; i++) stack[i].active = false;
        continue;
      }
      if (word === 'try') {
        const isParentActive = executing();
        stack.push({
          type: 'try',
          active: isParentActive,
          tryActive: isParentActive,
          hasError: false,
          caught: false,
          inFinally: false,
          hasFinally: false,
        });
        continue;
      }
      if (word === 'catch' || word === 'cat') {
        const top = stack[stack.length - 1];
        if (top?.type !== 'try') throw new VimScriptError(msg('E601: :try 없이 :catch 가 사용되었습니다'));
        if (top.inFinally) throw new VimScriptError(msg('E602: :finally 뒤에 :catch 가 올 수 없습니다'));

        if (top.tryActive && top.hasError && !top.caught) {
          let matches = true;
          if (rest.length > 0) {
            let pat = rest;
            if (pat.startsWith('/') && pat.endsWith('/') && pat.length >= 2) {
              pat = pat.slice(1, -1);
            }
            const re = compileVimRegex(pat);
            matches = re.test(top.exception ?? '');
          }
          if (matches) {
            top.caught = true;
            top.active = true;
            ctx.vvars = { ...(ctx.vvars ?? {}), exception: top.exception ?? '' };
          } else {
            top.active = false;
          }
        } else {
          top.active = false;
        }
        continue;
      }
      if (word === 'finally' || word === 'fin') {
        const top = stack[stack.length - 1];
        if (top?.type !== 'try') throw new VimScriptError(msg('E606: :try 없이 :finally 가 사용되었습니다'));
        top.inFinally = true;
        top.hasFinally = true;
        top.active = top.tryActive;
        continue;
      }
      if (word === 'endtry' || word === 'endt') {
        const top = stack.pop();
        if (top?.type !== 'try') throw new VimScriptError(msg('E607: :try 없이 :endtry 가 사용되었습니다'));
        if (top.tryActive && top.hasError && !top.caught) {
          throw new VimScriptError(top.exception ?? msg('E605: 예외가 처리되지 않았습니다: {v}', { v: '' }));
        }
        if (top.pendingReturn !== undefined) {
          return { state: ctx.state, value: top.pendingReturn, error: firstError };
        }
        continue;
      }
      if (word === 'throw' || word === 'th') {
        if (!executing()) continue;
        const val = rest.length > 0 ? evaluateVimScript(rest, ctx) : '';
        const excStr = typeof val === 'string' ? val : formatValue(val);
        ctx.vvars = { ...(ctx.vvars ?? {}), exception: excStr };
        throw new VimScriptError(excStr);
      }

      if (!executing()) continue;

      // 2. return
      if (word === 'return' || word === 'retu') {
        const value = rest.length > 0 ? evaluateVimScript(rest, ctx) : 0;
        const tryIdx = stack.map((f) => f.type === 'try').lastIndexOf(true);
        if (tryIdx >= 0) {
          const tryFrame = stack[tryIdx] as Extract<BlockFrame, { type: 'try' }>;
          tryFrame.pendingReturn = value;
          tryFrame.active = false;
          continue;
        }
        return { state: ctx.state, value, error: firstError };
      }

      // 3. 일반 명령 (let, echo, call, execute 및 Ex 명령)
      if (!runScriptCommand(ctx, line, runEx)) {
        const next = runEx(withoutBell(ctx.state), line);
        ctx.state = next;
        if (next.bell) throw new VimScriptError(next.commandMessage ?? msg('E492: 명령 실행에 실패했습니다: {line}', { line }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const tryIdx = stack.map((f) => f.type === 'try').lastIndexOf(true);
      if (tryIdx >= 0 && (stack[tryIdx] as Extract<BlockFrame, { type: 'try' }>).active && !(stack[tryIdx] as Extract<BlockFrame, { type: 'try' }>).inFinally) {
        const tryFrame = stack[tryIdx] as Extract<BlockFrame, { type: 'try' }>;
        tryFrame.hasError = true;
        tryFrame.exception = message;
        tryFrame.active = false;
        ctx.vvars = { ...(ctx.vvars ?? {}), exception: message };
        continue;
      }
      firstError = firstError ?? message;
      ctx.state = { ...withoutBell(ctx.state), commandMessage: message };
      if (abort) return { state: ctx.state, value: -1, error: firstError };
    }
  }

  if (stack.length > 0) {
    const last = stack[stack.length - 1];
    const missing =
      last.type === 'if'
        ? msg('E171: :endif 가 없습니다')
        : last.type === 'try'
        ? msg('E171: :endtry 가 없습니다')
        : last.type === 'for'
        ? msg('E170: :endfor 가 없습니다')
        : msg('E170: :endwhile 이 없습니다');
    return { state: ctx.state, value: 0, error: firstError ?? missing };
  }
  return { state: ctx.state, value: 0, error: firstError };
}

/**
 * let / unlet / echo / echom / execute / call 을 실행합니다. 해당 명령이 아니면 false.
 * 실패하면 VimScriptError 를 던집니다.
 */
function runScriptCommand(ctx: EvalContext, line: string, runEx: ExRunner): boolean {
  const word = line.match(/^(\w+)(!?)/);
  if (!word) return false;
  const cmd = word[1];
  const rest = line.slice(word[0].length).trim();

  if (cmd === 'let') {
    const parts = splitLet(rest);
    if (!parts) throw new VimScriptError(msg('E15: 잘못된 :let 구문입니다: {line}', { line }));
    const value = evaluateVimScript(parts.expr, ctx);
    if (parts.target.startsWith('[')) {
      if (parts.op !== '=') throw new VimScriptError(msg('E15: 리스트 풀기에는 = 만 쓸 수 있습니다: {line}', { line }));
      assignTargets(ctx, parts.target, value);
    } else {
      const lv = parseLValue(parts.target, ctx);
      writeLValue(ctx, lv, parts.op === '=' ? value : combine(readLValue(ctx, lv), parts.op, value));
    }
    return true;
  }

  if (cmd === 'unl' || cmd === 'unlet') {
    for (const target of splitTargets(rest)) {
      unsetLValue(ctx, parseLValue(target, ctx), word[2] === '!');
    }
    return true;
  }

  if (cmd === 'ec' || cmd === 'echo' || cmd === 'echom' || cmd === 'echomsg') {
    const values = evaluateVimScriptList(rest, ctx);
    ctx.state = { ...ctx.state, commandMessage: values.map(displayValue).join(' ') };
    return true;
  }

  if (cmd === 'exe' || cmd === 'execute') {
    const command = evaluateVimScriptList(rest, ctx).map(toVimString).join(' ');
    const next = runEx(withoutBell(ctx.state), command.replace(/^\s*:/, ''));
    ctx.state = next;
    if (next.bell) throw new VimScriptError(next.commandMessage ?? msg('E492: 명령 실행에 실패했습니다: {command}', { command }));
    return true;
  }

  if (cmd === 'cal' || cmd === 'call') {
    if (!/^[\w:#]+\s*\(.*\)$/.test(rest)) throw new VimScriptError(msg('E129: 함수 이름이 필요합니다: {rest}', { rest }));
    evaluateVimScript(rest, ctx);
    return true;
  }

  return false;
}

/** :let 의 대입 연산자를 찾아 대상·연산자·표현식으로 나눕니다. (괄호·따옴표 안의 = 는 무시) */
function splitLet(rest: string): { target: string; op: string; expr: string } | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '(' || ch === '{') depth++;
    else if (ch === ']' || ch === ')' || ch === '}') depth--;
    else if (depth === 0) {
      const op = ['..=', '.=', '+=', '-=', '='].find((o) => rest.startsWith(o, i));
      if (!op) continue;
      if (op === '=' && (rest[i + 1] === '=' || rest[i + 1] === '~')) return null;
      const target = rest.slice(0, i).trim();
      const expr = rest.slice(i + op.length).trim();
      return target && expr ? { target, op, expr } : null;
    }
  }
  return null;
}

/** :unlet 대상 목록을 공백으로 나눕니다. (괄호 안의 공백은 유지) */
function splitTargets(rest: string): string[] {
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  for (const ch of rest) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** += -= .= ..= 복합 대입 */
function combine(current: VimScriptValue, op: string, value: VimScriptValue): VimScriptValue {
  if (op === '+=') return addValues(current, value);
  if (op === '-=') return toNumber(current) - toNumber(value);
  return toVimString(current) + toVimString(value);
}

/** 대입 대상 하나 또는 리스트 풀기([a, b] / [a, b; rest])에 값을 씁니다. (:let, :for 공용) */
function assignTargets(ctx: EvalContext, target: string, value: VimScriptValue): void {
  const t = target.trim();
  if (!t.startsWith('[')) {
    writeLValue(ctx, parseLValue(t, ctx), value);
    return;
  }
  if (!t.endsWith(']')) throw new VimScriptError(msg('E475: 잘못된 대입 대상입니다: {target}', { target }));
  if (!isList(value)) throw new VimScriptError(msg('E714: 리스트 풀기에는 리스트가 필요합니다'));
  const [namesPart, restName] = t.slice(1, -1).split(';').map((x) => x.trim());
  const names = namesPart.split(',').map((n) => n.trim()).filter((n) => n.length > 0);
  if (value.length < names.length) throw new VimScriptError(msg('E688: 리스트 항목보다 대상이 더 많습니다'));
  if (value.length > names.length && !restName) throw new VimScriptError(msg('E687: 리스트 항목보다 대상이 더 적습니다'));
  names.forEach((n, i) => writeLValue(ctx, parseLValue(n, ctx), value[i]));
  if (restName) writeLValue(ctx, parseLValue(restName, ctx), value.slice(names.length));
}

/** 함수 밖(커맨드라인·.vimrc)에서 사용하는 평가 컨텍스트 */
function topLevelContext(state: VimEditorState, runEx: ExRunner, firstline?: number, lastline?: number): EvalContext {
  return {
    state,
    callUserFunction: (c, n, a) => {
      const r = callUserFunction(c.state, n, a, runEx, 0, firstline, lastline);
      c.state = r.state;
      if (r.error) throw new VimScriptError(r.error);
      return r.value;
    },
  };
}

/**
 * 커맨드라인 명령 중 함수·변수 관련 명령을 실행합니다. 해당하지 않으면 null.
 * (:function, :endfunction, :delfunction, :let, :unlet, :echo, :execute — :call 은 executeCallCommand)
 */
export function executeScriptCommandLine(state: VimEditorState, commandLine: string, runEx: ExRunner): VimEditorState | null {
  const line = commandLine.replace(/^:\s*/, '').trim();

  if (END_FUNC.test(line)) {
    return finish(state, msg('E193: :endfunction 이 함수 안에 있지 않습니다'), true);
  }

  const del = line.match(DEL_FUNC);
  if (del) {
    const name = del[2].replace(/^g:/, '').replace(/\(\)$/, '');
    if (!state.userFunctions?.[name]) {
      return del[1] === '!' ? finish(state) : finish(state, msg('E130: 알 수 없는 함수입니다: {name}', { name }), true);
    }
    const next = { ...state.userFunctions };
    delete next[name];
    return finish({ ...state, userFunctions: next }, msg('[함수 삭제] {name}', { name }));
  }

  const fu = line.match(FUNC_HEADER);
  if (fu) {
    const rest = (fu[2] ?? '').trim();
    if (rest.length === 0) return finish(state, formatFunctionList(state));
    if (!rest.includes('(')) {
      const fn = state.userFunctions?.[rest.replace(/^g:/, '')];
      return fn ? finish(state, formatFunctionBody(fn)) : finish(state, msg('E123: 정의되지 않은 함수입니다: {rest}', { rest }), true);
    }
    const header = parseFunctionHeader(rest);
    if (typeof header === 'string') return finish(state, header, true);
    const overwrite = fu[1] === '!';
    if (state.userFunctions?.[header.name] && !overwrite) {
      return finish(state, msg('E122: 함수 {name} 이(가) 이미 있습니다. 덮어쓰려면 ! 를 붙이세요', { name: header.name }), true);
    }
    const draft: FunctionDraft = { ...header, body: [], overwrite };
    return {
      ...state,
      mode: 'COMMAND',
      commandType: ':',
      commandBuffer: '',
      functionDraft: draft,
      commandMessage: draftMessage(draft),
    };
  }

  if (/^(catch|cat)(\s|$)/.test(line)) {
    return finish(state, msg('E601: :try 없이 :catch 가 사용되었습니다'), true);
  }
  if (/^(finally|fin)(\s|$)/.test(line)) {
    return finish(state, msg('E606: :try 없이 :finally 가 사용되었습니다'), true);
  }
  if (/^(endtry|endt)(\s|$)/.test(line)) {
    return finish(state, msg('E607: :try 없이 :endtry 가 사용되었습니다'), true);
  }
  if (/^(throw|th)(\s|$)/.test(line)) {
    const ctx = topLevelContext(state, runEx);
    const rest = line.replace(/^(throw|th)\s*/, '');
    let excStr = '';
    try {
      const val = rest.length > 0 ? evaluateVimScript(rest, ctx) : '';
      excStr = typeof val === 'string' ? val : formatValue(val);
    } catch (e) {
      excStr = e instanceof Error ? e.message : String(e);
    }
    return finish(state, msg('E605: 예외가 처리되지 않았습니다: {v}', { v: excStr }), true);
  }
  if (/^try(\s|$)/.test(line)) {
    return finish(state, msg('E171: :endtry 가 없습니다'), true);
  }
  if (/^(else|el)(\s|$)/.test(line)) {
    return finish(state, msg('E581: :if 없이 :else 가 사용되었습니다'), true);
  }
  if (/^(elseif|elsei)(\s|$)/.test(line)) {
    return finish(state, msg('E582: :if 없이 :elseif 가 사용되었습니다'), true);
  }
  if (/^(endif|en)(\s|$)/.test(line)) {
    return finish(state, msg('E580: :if 없이 :endif 가 사용되었습니다'), true);
  }
  if (/^if(\s|$)/.test(line)) {
    return finish(state, msg('E171: :endif 가 없습니다'), true);
  }
  if (/^(endwhile|endw)(\s|$)/.test(line)) {
    return finish(state, msg('E588: :while 없이 :endwhile 이 사용되었습니다'), true);
  }
  if (/^(endfor|endfo)(\s|$)/.test(line)) {
    return finish(state, msg('E588: :for 없이 :endfor 가 사용되었습니다'), true);
  }
  if (/^while(\s|$)/.test(line)) {
    return finish(state, msg('E170: :endwhile 이 없습니다'), true);
  }
  if (/^for(\s|$)/.test(line)) {
    return finish(state, msg('E170: :endfor 가 없습니다'), true);
  }
  if (/^(break|brea|continue|con)(\s|$)/.test(line)) {
    const word = line.match(/^(\w+)/)?.[1] ?? '';
    return finish(state, msg('E587: :while/:for 없이 :{word} 가 사용되었습니다', { word }), true);
  }

  // let mapleader 는 기존 리더 키 설정 경로에서 처리
  if (/^let\s+(g:)?mapleader\b/.test(line)) return null;
  if (!/^(let|unl|unlet|ec|echo|echom|echomsg|exe|execute)(!?)(\s|$)/.test(line)) return null;

  const ctx = topLevelContext(state, runEx);
  try {
    runScriptCommand(ctx, line, runEx);
  } catch (err) {
    return finish(ctx.state, err instanceof Error ? err.message : String(err), true);
  }
  const keepMessage = /^(ec|echo|echom|echomsg|exe|execute)\b/.test(line);
  return finish(ctx.state, keepMessage ? ctx.state.commandMessage : undefined);
}

/**
 * :[range]call Name(args)
 * @param range 0-based 범위 (생략하면 현재 줄)
 */
export function executeCallCommand(
  state: VimEditorState,
  expression: string,
  range: { startLine: number; endLine: number } | null,
  runEx: ExRunner
): VimEditorState {
  const m = expression.trim().match(/^(?:g:)?([\w:#]+)\s*\((.*)\)$/);
  if (!m) return finish(state, msg('E129: 함수 이름이 필요합니다: {expression}', { expression }), true);
  const name = m[1];

  const fn = state.userFunctions?.[name];
  const start = range?.startLine ?? state.cursor.line;
  const end = range?.endLine ?? state.cursor.line;
  // 사용자 함수이면서 range 속성이 없으면 줄마다 호출, 그 외(range 함수·내장 함수)는 한 번만 호출
  const perLine = !!fn && !fn.range && !!range;
  const targets = perLine ? Array.from({ length: end - start + 1 }, (_, i) => start + i) : [start];

  let cur = state;
  for (const lineIdx of targets) {
    const positioned: VimEditorState =
      perLine || (fn?.range && range) ? { ...cur, cursor: { line: lineIdx, col: 0 } } : cur;
    const ctx = topLevelContext(positioned, runEx, start + 1, end + 1);
    try {
      evaluateVimScript(expression, ctx);
      cur = ctx.state;
    } catch (err) {
      return finish(ctx.state, err instanceof Error ? err.message : String(err), true);
    }
  }

  // 실제 Vim처럼 :call 하나가 만든 모든 변경(setline, :normal, :s ...)을 한 번의 실행 취소 단위로 묶습니다.
  if (cur.lines.join('\n') !== state.lines.join('\n')) {
    cur = overlayChanges(pushUndoSnapshot(state), state, cur);
  }
  return finish(cur, cur.commandMessage !== state.commandMessage ? cur.commandMessage : undefined);
}

/**
 * 다중 제어문 줄(또는 파이프로 연결된 복합 스크립트 블록)을 최상위에서 실행합니다.
 */
export function executeScriptBlock(
  state: VimEditorState,
  lines: string[],
  runEx: ExRunner
): VimEditorState {
  const ctx = topLevelContext(state, runEx);
  const res = runScriptLines(lines, ctx, runEx);
  if (res.error) {
    return finish(res.state, res.error, true);
  }
  let finalState = res.state;
  if (finalState.lines.join('\n') !== state.lines.join('\n')) {
    finalState = overlayChanges(pushUndoSnapshot(state), state, finalState);
  }
  return finish(finalState, finalState.commandMessage);
}

/** 실행 취소·변경 이력 필드 (:call 의 한 번의 실행 취소 단위를 만들 때 base 의 값을 유지) */
const UNDO_HISTORY_FIELDS = new Set<keyof VimEditorState>([
  'undoStack', 'redoStack', 'undoTreeNodes', 'currentUndoSeq', 'maxUndoSeq',
  'undoTimeHistory', 'undoTimeIndex', 'changeList', 'changeIndex',
]);

/** base 위에 before → after 에서 바뀐 필드만 덮어씁니다. (실행 취소 이력 필드는 base 의 값을 유지) */
function overlayChanges(base: VimEditorState, before: VimEditorState, after: VimEditorState): VimEditorState {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(after) as (keyof VimEditorState)[]) {
    if (!UNDO_HISTORY_FIELDS.has(key) && after[key] !== before[key]) result[key] = after[key];
  }
  return result as unknown as VimEditorState;
}
