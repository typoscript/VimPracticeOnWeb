/**
 * Neovim Lua 미니 런타임: 값 타입·변환·토크나이저 (luaEngine.ts 에서 분리)
 */
import { VimScriptValue } from './types';
import { formatValue, isDict, isList } from './vimscriptValues';
import { msg } from './messages';

export interface LuaTable {
  __luaTable: true;
  array: LuaValue[];
  map: Record<string, LuaValue>;
}

export interface LuaRef {
  __luaRef: true;
  path: string;
}

export type LuaValue = null | boolean | number | string | LuaTable | LuaRef;

export function makeTable(array: LuaValue[] = [], map: Record<string, LuaValue> = {}): LuaTable {
  return { __luaTable: true, array, map };
}

export function makeRef(path: string): LuaRef {
  return { __luaRef: true, path };
}

export function isLuaTable(v: LuaValue): v is LuaTable {
  return typeof v === 'object' && v !== null && '__luaTable' in v;
}

export function isLuaRef(v: LuaValue): v is LuaRef {
  return typeof v === 'object' && v !== null && '__luaRef' in v;
}

export function isLuaTruthy(v: LuaValue): boolean {
  return v !== null && v !== false;
}

export function toLuaNumber(v: LuaValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  throw new Error(msg('Lua 오류: 숫자가 필요합니다: {v}', { v: formatLuaValue(v) }));
}

export function formatLuaValue(v: LuaValue, inspect = false): string {
  if (v === null) return 'nil';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return inspect ? JSON.stringify(v) : v;
  if (isLuaRef(v)) return `<${v.path}>`;
  const parts: string[] = [];
  for (const item of v.array) {
    parts.push(formatLuaValue(item, true));
  }
  for (const [k, val] of Object.entries(v.map)) {
    const keyStr = /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `[${JSON.stringify(k)}]`;
    parts.push(`${keyStr} = ${formatLuaValue(val, true)}`);
  }
  return `{ ${parts.join(', ')} }`;
}

export function luaToVimScript(v: LuaValue): VimScriptValue {
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (isLuaTable(v)) {
    if (Object.keys(v.map).length === 0) {
      return v.array.map(luaToVimScript);
    }
    const items: Record<string, VimScriptValue> = {};
    v.array.forEach((item, idx) => {
      items[String(idx + 1)] = luaToVimScript(item);
    });
    for (const [k, val] of Object.entries(v.map)) {
      items[k] = luaToVimScript(val);
    }
    return { kind: 'dict', items };
  }
  return formatLuaValue(v);
}

export function vimScriptToLua(v: VimScriptValue): LuaValue {
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (isList(v)) return makeTable(v.map(vimScriptToLua));
  if (isDict(v)) {
    const map: Record<string, LuaValue> = {};
    for (const [k, val] of Object.entries(v.items)) {
      map[k] = vimScriptToLua(val);
    }
    return makeTable([], map);
  }
  return formatValue(v);
}

export function toVimLiteral(v: LuaValue): string {
  return formatValue(luaToVimScript(v));
}

// ---------------------------------------------------------------------------
// 토크나이저
// ---------------------------------------------------------------------------

export type LuaTokenType = 'num' | 'str' | 'ident' | 'op' | 'eof';

export interface LuaToken {
  type: LuaTokenType;
  value: string | number;
}

export const LUA_MULTI_OPS = ['..', '==', '~=', '<=', '>='];

export function tokenizeLua(src: string): LuaToken[] {
  const tokens: LuaToken[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // 주석: --[[ ... ]] 또는 -- ...
    if (ch === '-' && src[i + 1] === '-') {
      if (src.startsWith('--[[', i)) {
        const end = src.indexOf(']]', i + 4);
        i = end === -1 ? src.length : end + 2;
      } else {
        const nl = src.indexOf('\n', i + 2);
        i = nl === -1 ? src.length : nl + 1;
      }
      continue;
    }

    // 긴 문자열 [[ ... ]]
    if (ch === '[' && src[i + 1] === '[') {
      let start = i + 2;
      if (src[start] === '\n') start++;
      const end = src.indexOf(']]', start);
      if (end === -1) throw new Error(msg('Lua 오류: 닫히지 않은 [[ 문자열입니다'));
      tokens.push({ type: 'str', value: src.slice(start, end) });
      i = end + 2;
      continue;
    }

    // 일반 문자열 '...' / "..."
    if (ch === '"' || ch === "'") {
      let out = '';
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const esc = src[j + 1];
          out += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === 'r' ? '\r' : esc;
          j += 2;
        } else {
          out += src[j++];
        }
      }
      if (j >= src.length) throw new Error(msg('Lua 오류: 닫히지 않은 문자열입니다'));
      tokens.push({ type: 'str', value: out });
      i = j + 1;
      continue;
    }

    // 숫자
    const num = src.slice(i).match(/^(0[xX][0-9a-fA-F]+|\d+\.\d+(?:[eE][+-]?\d+)?|\d+)/);
    if (num) {
      const raw = num[1];
      const val = raw.toLowerCase().startsWith('0x') ? parseInt(raw, 16) : parseFloat(raw);
      tokens.push({ type: 'num', value: val });
      i += raw.length;
      continue;
    }

    // 식별자 / 키워드
    const id = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (id) {
      tokens.push({ type: 'ident', value: id[0] });
      i += id[0].length;
      continue;
    }

    // 2글자 연산자
    const multi = LUA_MULTI_OPS.find((op) => src.startsWith(op, i));
    if (multi) {
      tokens.push({ type: 'op', value: multi });
      i += multi.length;
      continue;
    }

    // 단일 기호
    if ('+-*/%#=<>(){}[].:,;'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    throw new Error(msg('Lua 오류: 알 수 없는 토큰입니다: {tok}', { tok: ch }));
  }

  tokens.push({ type: 'eof', value: '' });
  return tokens;
}
