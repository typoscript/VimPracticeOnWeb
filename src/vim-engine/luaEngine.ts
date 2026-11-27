import { VimEditorState } from './types';
import { getVfsFile } from './vfs';
import { ExRunner } from './vimscriptEngine';
import { msg } from './messages';
import { LuaTable, LuaValue, makeTable, isLuaTable, isLuaRef, isLuaTruthy, toLuaNumber, formatLuaValue, LuaToken, tokenizeLua } from './luaValues';
import { LuaRuntime, MAX_LUA_LOOP, readEnvVar, writeEnvVar, emitOutput, invokeLuaRef, readMember, writeMember } from './luaRuntime';
export { formatLuaValue } from './luaValues';

/**
 * Neovim Lua 미니 런타임 (:lua, :=expr, :luafile, :source init.lua)
 *
 * eval / Function 을 전혀 사용하지 않는 순수 TypeScript 토크나이저 + 재귀 하강 파서입니다.
 * 지원 API:
 * - vim.opt / vim.o / vim.bo / vim.wo (=, :append, :remove, :prepend, :get)
 * - vim.g / vim.b / vim.w / vim.t (vim.g.mapleader 포함)
 * - vim.keymap.set / vim.keymap.del (단일/다중 모드 테이블, silent/expr/buffer/nowait/remap)
 * - vim.cmd / vim.fn.* / vim.api.* (nvim_get_current_line, nvim_set_current_line,
 *   nvim_buf_get_lines, nvim_buf_set_lines, nvim_buf_line_count, nvim_buf_get_name,
 *   nvim_win_get_cursor, nvim_win_set_cursor, nvim_set_keymap, nvim_del_keymap, nvim_command)
 * - vim.inspect, vim.notify, print, vim.tbl_*, vim.split, vim.trim, vim.startswith/endswith
 * - local/전역 변수, 테이블, 산술/비교/논리/문자열 연결(..), if/elseif/else, for, ipairs/pairs, while
 */

// ---------------------------------------------------------------------------
// 재귀 하강 파서 + 인터프리터
// ---------------------------------------------------------------------------

class LuaInterpreter {
  private pos = 0;
  private loopCount = 0;

  constructor(private tokens: LuaToken[], private rt: LuaRuntime) {}

  private peek(offset = 0): LuaToken {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private isOp(v: string): boolean {
    const t = this.peek();
    return t.type === 'op' && t.value === v;
  }

  private isKw(v: string): boolean {
    const t = this.peek();
    return t.type === 'ident' && t.value === v;
  }

  private expectOp(v: string): void {
    if (!this.isOp(v)) {
      throw new Error(msg('Lua 구문 오류: "{expected}" 이(가) 필요합니다', { expected: v }));
    }
    this.pos++;
  }

  private expectKw(v: string): void {
    if (!this.isKw(v)) {
      throw new Error(msg('Lua 구문 오류: "{expected}" 키워드가 필요합니다', { expected: v }));
    }
    this.pos++;
  }

  private expectIdent(): string {
    const t = this.peek();
    if (t.type !== 'ident') {
      throw new Error(msg('Lua 구문 오류: 식별자가 필요합니다'));
    }
    this.pos++;
    return String(t.value);
  }

  runBlock(stopKeywords: string[] = []): 'normal' | 'break' | 'return' {
    while (this.peek().type !== 'eof') {
      if (this.isOp(';')) {
        this.pos++;
        continue;
      }
      if (stopKeywords.some((kw) => this.isKw(kw))) {
        return 'normal';
      }
      const res = this.runStatement();
      if (res !== 'normal') return res;
    }
    return 'normal';
  }

  private skipBlock(stopKeywords: string[]): void {
    let depth = 0;
    while (this.peek().type !== 'eof') {
      if (depth === 0 && stopKeywords.some((kw) => this.isKw(kw))) return;
      if (this.isKw('if') || this.isKw('for') || this.isKw('while')) {
        depth++;
      } else if (this.isKw('end')) {
        if (depth === 0) return;
        depth--;
      }
      this.pos++;
    }
  }

  private runStatement(): 'normal' | 'break' | 'return' {
    if (this.isKw('local')) {
      this.pos++;
      const names = [this.expectIdent()];
      while (this.isOp(',')) {
        this.pos++;
        names.push(this.expectIdent());
      }
      const vals: LuaValue[] = [];
      if (this.isOp('=')) {
        this.pos++;
        vals.push(this.parseExpr());
        while (this.isOp(',')) {
          this.pos++;
          vals.push(this.parseExpr());
        }
      }
      names.forEach((n, idx) => writeEnvVar(this.rt, n, vals[idx] ?? null, true));
      return 'normal';
    }

    if (this.isKw('if')) {
      this.pos++;
      let taken = false;
      const cond = this.parseExpr();
      this.expectKw('then');
      if (isLuaTruthy(cond)) {
        taken = true;
        this.rt.scopes.push({});
        const res = this.runBlock(['elseif', 'else', 'end']);
        this.rt.scopes.pop();
        if (res !== 'normal') {
          this.skipBlock(['end']);
          if (this.isKw('end')) this.pos++;
          return res;
        }
      } else {
        this.skipBlock(['elseif', 'else', 'end']);
      }
      while (this.isKw('elseif')) {
        this.pos++;
        if (taken) {
          this.skipBlock(['elseif', 'else', 'end']);
        } else {
          const c2 = this.parseExpr();
          this.expectKw('then');
          if (isLuaTruthy(c2)) {
            taken = true;
            this.rt.scopes.push({});
            const res = this.runBlock(['elseif', 'else', 'end']);
            this.rt.scopes.pop();
            if (res !== 'normal') {
              this.skipBlock(['end']);
              if (this.isKw('end')) this.pos++;
              return res;
            }
          } else {
            this.skipBlock(['elseif', 'else', 'end']);
          }
        }
      }
      if (this.isKw('else')) {
        this.pos++;
        if (!taken) {
          this.rt.scopes.push({});
          const res = this.runBlock(['end']);
          this.rt.scopes.pop();
          if (res !== 'normal') {
            this.skipBlock(['end']);
            if (this.isKw('end')) this.pos++;
            return res;
          }
        } else {
          this.skipBlock(['end']);
        }
      }
      this.expectKw('end');
      return 'normal';
    }

    if (this.isKw('for')) {
      this.pos++;
      const firstVar = this.expectIdent();
      if (this.isOp('=')) {
        this.pos++;
        const start = toLuaNumber(this.parseExpr());
        this.expectOp(',');
        const stop = toLuaNumber(this.parseExpr());
        let step = 1;
        if (this.isOp(',')) {
          this.pos++;
          step = toLuaNumber(this.parseExpr());
        }
        this.expectKw('do');
        const bodyStart = this.pos;
        this.skipBlock(['end']);
        const bodyEnd = this.pos;
        this.expectKw('end');
        const afterLoop = this.pos;

        for (let i = start; step > 0 ? i <= stop : i >= stop; i += step) {
          if (++this.loopCount > MAX_LUA_LOOP) throw new Error(msg('Lua 오류: 반복 횟수 제한을 초과했습니다'));
          this.pos = bodyStart;
          this.rt.scopes.push({ [firstVar]: i });
          const res = this.runBlock(['end']);
          this.rt.scopes.pop();
          if (res === 'break') break;
          if (res === 'return') {
            this.pos = afterLoop;
            return 'return';
          }
          if (this.pos > bodyEnd) break;
        }
        this.pos = afterLoop;
        return 'normal';
      }

      // Generic for: for k, v in ipairs(t) / pairs(t) do ... end
      const vars = [firstVar];
      while (this.isOp(',')) {
        this.pos++;
        vars.push(this.expectIdent());
      }
      this.expectKw('in');
      const iterName = this.expectIdent();
      this.expectOp('(');
      const targetTbl = this.parseExpr();
      this.expectOp(')');
      this.expectKw('do');
      const bodyStart = this.pos;
      this.skipBlock(['end']);
      this.expectKw('end');
      const afterLoop = this.pos;

      const entries: Array<[LuaValue, LuaValue]> = [];
      if (isLuaTable(targetTbl)) {
        if (iterName === 'ipairs') {
          targetTbl.array.forEach((v, idx) => entries.push([idx + 1, v]));
        } else {
          targetTbl.array.forEach((v, idx) => entries.push([idx + 1, v]));
          for (const [k, v] of Object.entries(targetTbl.map)) entries.push([k, v]);
        }
      }

      for (const [k, v] of entries) {
        if (++this.loopCount > MAX_LUA_LOOP) throw new Error(msg('Lua 오류: 반복 횟수 제한을 초과했습니다'));
        this.pos = bodyStart;
        const scope: Record<string, LuaValue> = {};
        if (vars[0]) scope[vars[0]] = k;
        if (vars[1]) scope[vars[1]] = v;
        this.rt.scopes.push(scope);
        const res = this.runBlock(['end']);
        this.rt.scopes.pop();
        if (res === 'break') break;
        if (res === 'return') {
          this.pos = afterLoop;
          return 'return';
        }
      }
      this.pos = afterLoop;
      return 'normal';
    }

    if (this.isKw('while')) {
      this.pos++;
      const condStart = this.pos;
      this.skipBlock(['do']);
      this.expectKw('do');
      const bodyStart = this.pos;
      this.skipBlock(['end']);
      this.expectKw('end');
      const afterLoop = this.pos;

      for (;;) {
        if (++this.loopCount > MAX_LUA_LOOP) throw new Error(msg('Lua 오류: 반복 횟수 제한을 초과했습니다'));
        this.pos = condStart;
        const cond = this.parseExpr();
        if (!isLuaTruthy(cond)) break;
        this.pos = bodyStart;
        this.rt.scopes.push({});
        const res = this.runBlock(['end']);
        this.rt.scopes.pop();
        if (res === 'break') break;
        if (res === 'return') {
          this.pos = afterLoop;
          return 'return';
        }
      }
      this.pos = afterLoop;
      return 'normal';
    }

    if (this.isKw('break')) {
      this.pos++;
      return 'break';
    }
    if (this.isKw('return')) {
      this.pos++;
      if (this.peek().type !== 'eof' && !this.isKw('end') && !this.isKw('else') && !this.isKw('elseif') && !this.isOp(';')) {
        this.parseExpr();
      }
      return 'return';
    }

    // 대입 또는 함수/메서드 호출
    const startPos = this.pos;
    const lhs = this.parseLhsOrCall();
    if (this.isOp('=')) {
      this.pos++;
      const val = this.parseExpr();
      lhs.assign(val);
      return 'normal';
    }
    if (!lhs.wasCall) {
      throw new Error(msg('Lua 구문 오류: 유효하지 않은 문장입니다 (위치 {pos})', { pos: startPos }));
    }
    return 'normal';
  }

  private parseLhsOrCall(): { assign: (v: LuaValue) => void; wasCall: boolean } {
    const rootName = this.expectIdent();
    let curVal: LuaValue = readEnvVar(this.rt, rootName);
    let assignFn: ((v: LuaValue) => void) | null = (v) => writeEnvVar(this.rt, rootName, v, false);
    let wasCall = false;

    for (;;) {
      if (this.isOp('.')) {
        this.pos++;
        const prop = this.expectIdent();
        const parentObj = curVal;
        curVal = readMember(this.rt, parentObj, prop);
        assignFn = (v) => writeMember(this.rt, parentObj, prop, v);
        wasCall = false;
      } else if (this.isOp('[')) {
        this.pos++;
        const keyVal = this.parseExpr();
        this.expectOp(']');
        const parentObj = curVal;
        if (isLuaTable(parentObj)) {
          if (typeof keyVal === 'number' && Number.isInteger(keyVal) && keyVal >= 1) {
            curVal = parentObj.array[keyVal - 1] ?? null;
            assignFn = (v) => {
              parentObj.array[keyVal - 1] = v;
            };
          } else {
            const kStr = formatLuaValue(keyVal);
            curVal = parentObj.map[kStr] ?? null;
            assignFn = (v) => {
              parentObj.map[kStr] = v;
            };
          }
        } else {
          curVal = readMember(this.rt, parentObj, formatLuaValue(keyVal));
          assignFn = (v) => writeMember(this.rt, parentObj, formatLuaValue(keyVal), v);
        }
        wasCall = false;
      } else if (this.isOp(':')) {
        this.pos++;
        const method = this.expectIdent();
        const args = this.parseCallArgs();
        if (isLuaRef(curVal)) {
          curVal = invokeLuaRef(this.rt, `${curVal.path}.${method}`, args);
        } else if (typeof curVal === 'string') {
          curVal = invokeLuaRef(this.rt, `string.${method}`, [curVal, ...args]);
        } else {
          throw new Error(msg('Lua 오류: 메서드 호출 대상이 유효하지 않습니다: {method}', { method }));
        }
        assignFn = null;
        wasCall = true;
      } else if (this.isOp('(') || this.peek().type === 'str' || this.isOp('{')) {
        const args = this.parseCallArgs();
        if (!isLuaRef(curVal)) {
          throw new Error(msg('Lua 오류: 호출할 수 없는 값입니다: {v}', { v: formatLuaValue(curVal) }));
        }
        curVal = invokeLuaRef(this.rt, curVal.path, args);
        assignFn = null;
        wasCall = true;
      } else {
        break;
      }
    }

    return {
      wasCall,
      assign: (v) => {
        if (!assignFn) throw new Error(msg('Lua 구문 오류: 대입할 수 없는 좌변입니다'));
        assignFn(v);
      },
    };
  }

  private parseCallArgs(): LuaValue[] {
    if (this.peek().type === 'str') {
      const s = String(this.peek().value);
      this.pos++;
      return [s];
    }
    if (this.isOp('{')) {
      return [this.parseTable()];
    }
    this.expectOp('(');
    const args: LuaValue[] = [];
    if (!this.isOp(')')) {
      args.push(this.parseExpr());
      while (this.isOp(',')) {
        this.pos++;
        if (this.isOp(')')) break;
        args.push(this.parseExpr());
      }
    }
    this.expectOp(')');
    return args;
  }

  parseExpr(): LuaValue {
    return this.parseOr();
  }

  private parseOr(): LuaValue {
    let left = this.parseAnd();
    while (this.isKw('or')) {
      this.pos++;
      const right = this.parseAnd();
      left = isLuaTruthy(left) ? left : right;
    }
    return left;
  }

  private parseAnd(): LuaValue {
    let left = this.parseCompare();
    while (this.isKw('and')) {
      this.pos++;
      const right = this.parseCompare();
      left = isLuaTruthy(left) ? right : left;
    }
    return left;
  }

  private parseCompare(): LuaValue {
    let left = this.parseConcat();
    while (
      this.isOp('==') ||
      this.isOp('~=') ||
      this.isOp('<') ||
      this.isOp('<=') ||
      this.isOp('>') ||
      this.isOp('>=')
    ) {
      const op = String(this.peek().value);
      this.pos++;
      const right = this.parseConcat();
      if (op === '==') left = left === right;
      else if (op === '~=') left = left !== right;
      else if (op === '<') left = toLuaNumber(left) < toLuaNumber(right);
      else if (op === '<=') left = toLuaNumber(left) <= toLuaNumber(right);
      else if (op === '>') left = toLuaNumber(left) > toLuaNumber(right);
      else left = toLuaNumber(left) >= toLuaNumber(right);
    }
    return left;
  }

  private parseConcat(): LuaValue {
    let left = this.parseAdditive();
    while (this.isOp('..')) {
      this.pos++;
      const right = this.parseAdditive();
      left = formatLuaValue(left) + formatLuaValue(right);
    }
    return left;
  }

  private parseAdditive(): LuaValue {
    let left = this.parseMultiplicative();
    while (this.isOp('+') || this.isOp('-')) {
      const op = String(this.peek().value);
      this.pos++;
      const right = this.parseMultiplicative();
      left = op === '+' ? toLuaNumber(left) + toLuaNumber(right) : toLuaNumber(left) - toLuaNumber(right);
    }
    return left;
  }

  private parseMultiplicative(): LuaValue {
    let left = this.parseUnary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = String(this.peek().value);
      this.pos++;
      const right = this.parseUnary();
      const l = toLuaNumber(left);
      const r = toLuaNumber(right);
      if (op === '*') left = l * r;
      else if (op === '/') left = r === 0 ? NaN : l / r;
      else left = r === 0 ? NaN : l % r;
    }
    return left;
  }

  private parseUnary(): LuaValue {
    if (this.isKw('not')) {
      this.pos++;
      return !isLuaTruthy(this.parseUnary());
    }
    if (this.isOp('-')) {
      this.pos++;
      return -toLuaNumber(this.parseUnary());
    }
    if (this.isOp('#')) {
      this.pos++;
      const v = this.parseUnary();
      if (typeof v === 'string') return v.length;
      if (isLuaTable(v)) return v.array.length;
      return 0;
    }
    return this.parsePostfix();
  }

  private parsePostfix(): LuaValue {
    let val = this.parsePrimary();
    for (;;) {
      if (this.isOp('.')) {
        this.pos++;
        const prop = this.expectIdent();
        val = readMember(this.rt, val, prop);
      } else if (this.isOp('[')) {
        this.pos++;
        const keyVal = this.parseExpr();
        this.expectOp(']');
        if (isLuaTable(val)) {
          if (typeof keyVal === 'number' && Number.isInteger(keyVal) && keyVal >= 1) {
            val = val.array[keyVal - 1] ?? null;
          } else {
            val = val.map[formatLuaValue(keyVal)] ?? null;
          }
        } else {
          val = readMember(this.rt, val, formatLuaValue(keyVal));
        }
      } else if (this.isOp(':')) {
        this.pos++;
        const method = this.expectIdent();
        const args = this.parseCallArgs();
        if (isLuaRef(val)) {
          val = invokeLuaRef(this.rt, `${val.path}.${method}`, args);
        } else if (typeof val === 'string') {
          val = invokeLuaRef(this.rt, `string.${method}`, [val, ...args]);
        } else {
          throw new Error(msg('Lua 오류: 메서드 호출 대상이 유효하지 않습니다: {method}', { method }));
        }
      } else if (this.isOp('(') || this.peek().type === 'str' || this.isOp('{')) {
        const args = this.parseCallArgs();
        if (!isLuaRef(val)) {
          throw new Error(msg('Lua 오류: 호출할 수 없는 값입니다: {v}', { v: formatLuaValue(val) }));
        }
        val = invokeLuaRef(this.rt, val.path, args);
      } else {
        return val;
      }
    }
  }

  private parseTable(): LuaTable {
    this.expectOp('{');
    const array: LuaValue[] = [];
    const map: Record<string, LuaValue> = {};
    while (!this.isOp('}') && this.peek().type !== 'eof') {
      if (this.peek().type === 'ident' && this.peek(1).type === 'op' && this.peek(1).value === '=') {
        const k = this.expectIdent();
        this.pos++;
        map[k] = this.parseExpr();
      } else if (this.isOp('[')) {
        this.pos++;
        const k = this.parseExpr();
        this.expectOp(']');
        this.expectOp('=');
        map[formatLuaValue(k)] = this.parseExpr();
      } else {
        array.push(this.parseExpr());
      }
      if (this.isOp(',') || this.isOp(';')) {
        this.pos++;
      } else {
        break;
      }
    }
    this.expectOp('}');
    return makeTable(array, map);
  }

  private parsePrimary(): LuaValue {
    const t = this.peek();
    if (t.type === 'num' || t.type === 'str') {
      this.pos++;
      return t.value;
    }
    if (t.type === 'ident') {
      if (t.value === 'true') {
        this.pos++;
        return true;
      }
      if (t.value === 'false') {
        this.pos++;
        return false;
      }
      if (t.value === 'nil') {
        this.pos++;
        return null;
      }
      this.pos++;
      return readEnvVar(this.rt, String(t.value));
    }
    if (this.isOp('{')) {
      return this.parseTable();
    }
    if (this.isOp('(')) {
      this.pos++;
      const v = this.parseExpr();
      this.expectOp(')');
      return v;
    }
    throw new Error(msg('Lua 구문 오류: 예상치 못한 토큰입니다: {tok}', { tok: String(t.value) || 'EOF' }));
  }
}

// ---------------------------------------------------------------------------
// 공개 진입점
// ---------------------------------------------------------------------------

/**
 * `:lua {code}` Lua 코드 청크를 실행합니다.
 */
export function executeLuaChunk(
  state: VimEditorState,
  code: string,
  runEx: ExRunner
): VimEditorState {
  const trimmed = code.trim();
  if (!trimmed) return state;

  const rt: LuaRuntime = {
    state,
    runEx,
    outputs: [],
    scopes: [{}],
    globals: {},
  };

  try {
    const tokens = tokenizeLua(trimmed);
    const interp = new LuaInterpreter(tokens, rt);
    interp.runBlock();
    return {
      ...rt.state,
      ...(rt.outputs.length > 0 ? { commandMessage: rt.outputs.join('\n') } : {}),
    };
  } catch (err) {
    return {
      ...rt.state,
      bell: true,
      commandMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * `:= {expr}` (Neovim 단축 표현식 평가 출력)
 */
export function executeLuaPrintExpr(
  state: VimEditorState,
  expr: string,
  runEx: ExRunner
): VimEditorState {
  const trimmed = expr.trim();
  if (!trimmed) return state;

  const rt: LuaRuntime = {
    state,
    runEx,
    outputs: [],
    scopes: [{}],
    globals: {},
  };

  try {
    const tokens = tokenizeLua(trimmed);
    const interp = new LuaInterpreter(tokens, rt);
    const val = interp.parseExpr();
    emitOutput(rt, formatLuaValue(val, true));
    return rt.state;
  } catch (err) {
    return {
      ...rt.state,
      bell: true,
      commandMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * `:luafile {file}` 또는 `:source init.lua` 로 Lua 스크립트 파일을 실행합니다.
 */
export function executeLuaFile(
  state: VimEditorState,
  targetFile: string,
  runEx: ExRunner
): VimEditorState {
  const target = targetFile.trim();
  let linesToRun: string[] | null = null;
  let sourceName = target || '%';

  if (target === '%' || target === '' || target === state.primaryFilename) {
    linesToRun = [...state.lines];
    sourceName = state.primaryFilename ?? '%';
  } else {
    const foundBuf = state.buffers?.find((b) => b.name === target || b.name.endsWith(target));
    if (foundBuf) {
      linesToRun = [...foundBuf.lines];
      sourceName = foundBuf.name;
    } else {
      const vfsLines = getVfsFile(state.netrw?.files, target, state.virtualFiles);
      if (vfsLines) {
        linesToRun = [...vfsLines];
        sourceName = target;
      }
    }
  }

  if (!linesToRun) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('E484: 파일을 열 수 없습니다: "{target}"', { target }),
    };
  }

  const res = executeLuaChunk(state, linesToRun.join('\n'), runEx);
  if (res.bell) return res;
  return {
    ...res,
    commandMessage: res.commandMessage ?? msg('[Lua] "{sourceName}" 실행 완료', { sourceName }),
  };
}
