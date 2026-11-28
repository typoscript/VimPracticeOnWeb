/**
 * Vim script 문장 실행기: `let`·`const`·`unlet`·`lockvar`·`echo`·`execute`·`call` 한 줄과 Heredoc(`let x =<< END`) 파싱.
 * `vimscriptEngine.ts` 의 줄 실행 루프가 쓰며, `parseHeredocStart` 는 거기서 다시 export 합니다.
 */
import { VimEditorState, VimScriptValue } from './types';
import {
  EvalContext,
  VimScriptError,
  addValues,
  displayValue,
  evaluateVimScript,
  evaluateVimScriptList,
  isList,
  parseLValue,
  readLValue,
  toNumber,
  toVimString,
  unsetLValue,
  writeLValue,
} from './vimscriptEval';
import {
  appendRedirText,
  lockVariable,
  readVariable,
  unlockVariable,
} from './vimscriptValues';
import { msg } from './messages';
import type { ExRunner } from './vimscriptFunctions';

const HEREDOC_START_RE = /^(let|const)\s+([A-Za-z_][\w:]*)\s*=\s*<<\s*(?:(trim)\s+)?(\S+)\s*$/;

/** `:let var =<< [trim] END` 또는 `:const var =<< [trim] END` 시작 줄을 파싱합니다. */
export function parseHeredocStart(
  rawLine: string
): { keyword: 'let' | 'const'; varName: string; trim: boolean; marker: string } | null {
  const m = rawLine.trim().replace(/^:\s*/, '').match(HEREDOC_START_RE);
  if (!m) return null;
  return {
    keyword: m[1] as 'let' | 'const',
    varName: m[2],
    trim: m[3] === 'trim',
    marker: m[4],
  };
}

export function trimHeredocBody(rawLines: string[], trim: boolean): string[] {
  if (!trim) return rawLines;
  let minIndent = Infinity;
  for (const l of rawLines) {
    if (l.trim().length === 0) continue;
    const lead = l.match(/^[ \t]*/)?.[0].length ?? 0;
    if (lead < minIndent) minIndent = lead;
  }
  if (!Number.isFinite(minIndent) || minIndent === 0) return rawLines;
  return rawLines.map((l) => (l.length >= minIndent ? l.slice(minIndent) : l.trimStart()));
}

export function withoutBell(state: VimEditorState): VimEditorState {
  if (!state.bell) return state;
  const copy = { ...state };
  delete copy.bell;
  return copy;
}

/**
 * let / unlet / echo / echom / execute / call 을 실행합니다. 해당 명령이 아니면 false.
 * 실패하면 VimScriptError 를 던집니다.
 */
export function runScriptCommand(ctx: EvalContext, line: string, runEx: ExRunner): boolean {
  const word = line.match(/^(\w+)(!?)/);
  if (!word) return false;
  const cmd = word[1];
  const rest = line.slice(word[0].length).trim();

  if (cmd === 'let' || cmd === 'const') {
    const parts = splitLet(rest);
    if (!parts) throw new VimScriptError(msg('E15: 잘못된 :let 구문입니다: {line}', { line }));
    if (cmd === 'const' && parts.op !== '=') {
      throw new VimScriptError(msg('E15: :const 에는 = 만 쓸 수 있습니다: {line}', { line }));
    }
    const value = evaluateVimScript(parts.expr, ctx);
    if (parts.target.startsWith('[')) {
      if (parts.op !== '=') throw new VimScriptError(msg('E15: 리스트 풀기에는 = 만 쓸 수 있습니다: {line}', { line }));
      const assignedNames = assignTargets(ctx, parts.target, value);
      if (cmd === 'const') {
        for (const n of assignedNames) lockVariable(ctx, n, 'const');
      }
    } else {
      const lv = parseLValue(parts.target, ctx);
      writeLValue(ctx, lv, parts.op === '=' ? value : combine(readLValue(ctx, lv), parts.op, value));
      if (cmd === 'const' && lv.path.length === 0) {
        lockVariable(ctx, lv.base, 'const');
      }
    }
    return true;
  }

  if (cmd === 'lockv' || cmd === 'lockvar' || cmd === 'unlo' || cmd === 'unlockvar') {
    const isLock = cmd === 'lockv' || cmd === 'lockvar';
    const argBody = rest.replace(/^\d+\s+/, '').trim();
    const targets = splitTargets(argBody);
    if (targets.length === 0) {
      throw new VimScriptError(msg('E471: 인자가 필요합니다'));
    }
    for (const target of targets) {
      readVariable(ctx, target);
      if (isLock) lockVariable(ctx, target, 'lock');
      else unlockVariable(ctx, target);
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
    const text = evaluateVimScriptList(rest, ctx).map(displayValue).join(' ');
    const isHistory = cmd === 'echom' || cmd === 'echomsg';
    const nextHistory = isHistory
      ? [...(ctx.state.messageHistory ?? []), text].slice(-200)
      : ctx.state.messageHistory;
    let nextState: VimEditorState = { ...ctx.state, commandMessage: text, messageHistory: nextHistory };
    if (nextState.redirSession) nextState = appendRedirText(nextState, text);
    ctx.state = nextState;
    return true;
  }

  if (cmd === 'echon') {
    const text = evaluateVimScriptList(rest, ctx).map(displayValue).join('');
    const combined = `${ctx.state.commandMessage ?? ''}${text}`;
    let nextState: VimEditorState = { ...ctx.state, commandMessage: combined };
    if (nextState.redirSession) nextState = appendRedirText(nextState, text, true);
    ctx.state = nextState;
    return true;
  }

  if (cmd === 'echoe' || cmd === 'echoerr') {
    const text = evaluateVimScriptList(rest, ctx).map(displayValue).join(' ');
    const nextHistory = [...(ctx.state.messageHistory ?? []), text].slice(-200);
    let nextState: VimEditorState = { ...ctx.state, commandMessage: text, messageHistory: nextHistory };
    if (nextState.redirSession) nextState = appendRedirText(nextState, text);
    ctx.state = nextState;
    throw new VimScriptError(text);
  }

  if (cmd === 'echoh' || cmd === 'echohl') {
    ctx.state = { ...ctx.state, lastEchoHl: rest.trim() || 'None' };
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
    const trimmedRest = rest.trim();
    const isValidCall =
      /^[\w:#]+\s*\(.*\)$/.test(trimmedRest) ||
      (/\)\s*$/.test(trimmedRest) && (trimmedRest.includes('->') || /^[\w:#.]+\s*\(/.test(trimmedRest)));
    if (!isValidCall) throw new VimScriptError(msg('E129: 함수 이름이 필요합니다: {rest}', { rest }));
    evaluateVimScript(trimmedRest, ctx);
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

/** 대입 대상 하나 또는 리스트 풀기([a, b] / [a, b; rest])에 값을 씁니다. (:let, :const, :for 공용) */
export function assignTargets(ctx: EvalContext, target: string, value: VimScriptValue): string[] {
  const t = target.trim();
  if (!t.startsWith('[')) {
    const lv = parseLValue(t, ctx);
    writeLValue(ctx, lv, value);
    return lv.path.length === 0 ? [lv.base] : [];
  }
  if (!t.endsWith(']')) throw new VimScriptError(msg('E475: 잘못된 대입 대상입니다: {target}', { target }));
  if (!isList(value)) throw new VimScriptError(msg('E714: 리스트 풀기에는 리스트가 필요합니다'));
  const [namesPart, restName] = t.slice(1, -1).split(';').map((x) => x.trim());
  const names = namesPart.split(',').map((n) => n.trim()).filter((n) => n.length > 0);
  if (value.length < names.length) throw new VimScriptError(msg('E688: 리스트 항목보다 대상이 더 많습니다'));
  if (value.length > names.length && !restName) throw new VimScriptError(msg('E687: 리스트 항목보다 대상이 더 적습니다'));
  const assigned: string[] = [];
  names.forEach((n, i) => {
    const lv = parseLValue(n, ctx);
    writeLValue(ctx, lv, value[i]);
    if (lv.path.length === 0) assigned.push(lv.base);
  });
  if (restName) {
    const lv = parseLValue(restName, ctx);
    writeLValue(ctx, lv, value.slice(names.length));
    if (lv.path.length === 0) assigned.push(lv.base);
  }
  return assigned;
}
