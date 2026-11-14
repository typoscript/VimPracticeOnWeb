import { QuickfixItem, VimEditorState } from './types';
import { buildVfsMap } from './vfs';
import { evaluateVimScript, isList, toVimString } from './vimscriptEval';
import { getOptions } from './setEngine';

export const DEFAULT_ERRORFORMAT =
  '%f:%l:%c:%m,%f:%l:%m,%f(%l\\,%c):%m';

type EfmField = 'f' | 'l' | 'c' | 't' | 'n' | 'm' | 'ignore';

interface CompiledEfmEntry {
  regex: RegExp;
  fields: EfmField[];
}

/**
 * 쉼표(,)로 구분된 Vim 'errorformat' 문자열을 개별 패턴 목록으로 분리합니다 (\, 이스케이프 보존).
 */
export function splitErrorformatEntries(efm: string): string[] {
  const entries: string[] = [];
  let cur = '';
  for (let i = 0; i < efm.length; i++) {
    const ch = efm[i];
    if (ch === '\\' && i + 1 < efm.length) {
      if (efm[i + 1] === ',') {
        cur += ',';
        i++;
        continue;
      }
      cur += ch + efm[i + 1];
      i++;
      continue;
    }
    if (ch === ',') {
      if (cur.length > 0) entries.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) entries.push(cur);
  return entries;
}

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 단일 Vim errorformat 패턴(%f, %l, %c, %t, %n, %m, %%, %\s 등)을 JS RegExp 로 컴파일합니다.
 */
export function compileErrorformatPattern(fmt: string): CompiledEfmEntry | null {
  if (!fmt.trim()) return null;

  let regexSrc = '^';
  const fields: EfmField[] = [];
  let i = 0;

  while (i < fmt.length) {
    const ch = fmt[i];
    if (ch === '%') {
      if (i + 1 >= fmt.length) break;
      const code = fmt[i + 1];
      if (code === '%') {
        regexSrc += '%';
        i += 2;
        continue;
      }
      if (code === 'f') {
        regexSrc += '(.+?)';
        fields.push('f');
        i += 2;
        continue;
      }
      if (code === 'l' || code === 'c' || code === 'n') {
        regexSrc += '(\\d+)';
        fields.push(code);
        i += 2;
        continue;
      }
      if (code === 't') {
        regexSrc += '([A-Za-z])';
        fields.push('t');
        i += 2;
        continue;
      }
      if (code === 'm') {
        regexSrc += '(.*)';
        fields.push('m');
        i += 2;
        continue;
      }
      if (code === 's') {
        regexSrc += '(.*?)';
        fields.push('ignore');
        i += 2;
        continue;
      }
      if (code === '.') {
        regexSrc += '.';
        i += 2;
        continue;
      }
      if (code === '*') {
        // %*[^...] 또는 %*\s
        if (fmt[i + 2] === '[' && fmt.indexOf(']', i + 3) !== -1) {
          const endBracket = fmt.indexOf(']', i + 3);
          const charClass = fmt.slice(i + 2, endBracket + 1);
          regexSrc += `(?:${charClass}+)`;
          i = endBracket + 1;
          continue;
        }
        regexSrc += '(?:\\S+)';
        i += 2;
        continue;
      }
      if (code === '\\' && i + 2 < fmt.length) {
        regexSrc += '\\' + fmt[i + 2];
        i += 3;
        continue;
      }
    }

    if (ch === ' ') {
      regexSrc += '\\s*';
      i++;
      continue;
    }

    regexSrc += escapeRegexLiteral(ch);
    i++;
  }

  regexSrc += '$';
  try {
    return { regex: new RegExp(regexSrc), fields };
  } catch {
    return null;
  }
}

function inferErrorType(typeChar: string | undefined, text: string): 'E' | 'W' | 'I' {
  if (typeChar) {
    const up = typeChar.toUpperCase();
    if (up === 'E') return 'E';
    if (up === 'W') return 'W';
    if (up === 'I' || up === 'N') return 'I';
  }
  if (/error|err\b|fatal/i.test(text)) return 'E';
  if (/warn/i.test(text)) return 'W';
  return 'I';
}

/**
 * 지정된 errorformat 규칙(미지정 시 Vim 기본 형식)에 따라 에러/매치 로그 줄을 QuickfixItem[] 으로 파싱합니다.
 */
export function parseLinesWithErrorformat(lines: string[], efm?: string): QuickfixItem[] {
  const effectiveEfm = efm && efm.trim().length > 0 ? efm : DEFAULT_ERRORFORMAT;
  const compiled = splitErrorformatEntries(effectiveEfm)
    .map(compileErrorformatPattern)
    .filter((x): x is CompiledEfmEntry => x !== null);

  const items: QuickfixItem[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    for (const entry of compiled) {
      const m = line.match(entry.regex);
      if (!m) continue;

      let filename = '';
      let lineNum = 1;
      let colNum = 1;
      let typeChar: string | undefined;
      let nr: number | undefined;
      let text = '';

      entry.fields.forEach((field, idx) => {
        const val = m[idx + 1] ?? '';
        switch (field) {
          case 'f':
            filename = val.trim();
            break;
          case 'l':
            lineNum = Math.max(1, parseInt(val, 10) || 1);
            break;
          case 'c':
            colNum = Math.max(1, parseInt(val, 10) || 1);
            break;
          case 't':
            typeChar = val;
            break;
          case 'n':
            nr = parseInt(val, 10);
            break;
          case 'm':
            text = val.trim();
            break;
          case 'ignore':
            break;
        }
      });

      if (!filename) continue;
      items.push({
        filename,
        line: lineNum,
        col: colNum,
        text: nr !== undefined && !text ? `E${nr}` : text,
        type: inferErrorType(typeChar, text),
      });
      break;
    }
  }

  return items;
}

/**
 * :cexpr / :cgetexpr / :caddexpr / :lexpr / :lgetexpr / :laddexpr 표현식을 평가해 문자열 배열로 변환합니다.
 */
export function evaluateErrorExprLines(
  state: VimEditorState,
  expr: string,
  callUserFn: (
    s: VimEditorState,
    name: string,
    args: any[]
  ) => { value: any; state: VimEditorState; error?: string }
): { ok: true; lines: string[]; state: VimEditorState } | { ok: false; error: string } {
  let currentState = state;
  const ctx = {
    state: currentState,
    callUserFunction: (c: { state: VimEditorState }, name: string, args: any[]) => {
      const r = callUserFn(c.state, name, args);
      c.state = r.state;
      if (r.error) throw new Error(r.error);
      return r.value;
    },
  };

  try {
    const val = evaluateVimScript(expr, ctx);
    currentState = ctx.state;
    if (isList(val)) {
      return {
        ok: true,
        lines: val.map((item) => toVimString(item)),
        state: currentState,
      };
    }
    const str = toVimString(val);
    return {
      ok: true,
      lines: str.length === 0 ? [] : str.split(/\r?\n/),
      state: currentState,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

interface ParsedGrepInvocation {
  ignoreCase: boolean;
  wholeWord: boolean;
  fixed: boolean;
  invert: boolean;
  pattern: string;
  fileTargets: string[];
}

function tokenizeGrepArgs(rawArgs: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let has = false;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < rawArgs.length; i++) {
    const ch = rawArgs[i];
    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < rawArgs.length) {
        cur += rawArgs[i + 1];
        i++;
      } else if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
      has = true;
      continue;
    }
    if (ch === '\\' && i + 1 < rawArgs.length) {
      cur += rawArgs[i + 1];
      has = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (has) {
        tokens.push(cur);
        cur = '';
        has = false;
      }
      continue;
    }
    cur += ch;
    has = true;
  }
  if (has) tokens.push(cur);
  return tokens;
}

export function parseGrepInvocation(rawArgs: string): ParsedGrepInvocation | null {
  const tokens = tokenizeGrepArgs(rawArgs.trim());
  if (tokens.length === 0) return null;

  let ignoreCase = false;
  let wholeWord = false;
  let fixed = false;
  let invert = false;
  let pattern: string | null = null;
  const fileTargets: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (pattern === null && t.startsWith('-') && t.length > 1) {
      if (t === '-e' && i + 1 < tokens.length) {
        pattern = tokens[++i];
        continue;
      }
      for (const ch of t.slice(1)) {
        if (ch === 'i') ignoreCase = true;
        else if (ch === 'w') wholeWord = true;
        else if (ch === 'F') fixed = true;
        else if (ch === 'v') invert = true;
      }
      continue;
    }
    if (pattern === null) {
      pattern = t;
    } else {
      fileTargets.push(t);
    }
  }

  if (pattern === null || pattern.length === 0) return null;
  return { ignoreCase, wholeWord, fixed, invert, pattern, fileTargets };
}

/**
 * VFS(워크스페이스 파일 + 열린 버퍼)에서 `:grep` / `:lgrep` 검색을 수행하고
 * `errorformat` 으로 파싱된 QuickfixItem[] 목록을 반환합니다.
 */
export function runVfsGrep(
  state: VimEditorState,
  rawArgs: string
): { ok: true; items: QuickfixItem[]; pattern: string } | { ok: false; error: string } {
  const parsed = parseGrepInvocation(rawArgs);
  if (!parsed) {
    return { ok: false, error: 'E471: Argument required' };
  }

  const opts = getOptions(state);
  const vfs = buildVfsMap(state);
  const effectiveIgnoreCase = parsed.ignoreCase || Boolean(opts.ignorecase);

  let rx: RegExp;
  try {
    const body = parsed.fixed
      ? parsed.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : parsed.pattern;
    const bounded = parsed.wholeWord ? `\\b(?:${body})\\b` : body;
    rx = new RegExp(bounded, effectiveIgnoreCase ? 'i' : '');
  } catch (err) {
    return { ok: false, error: `E486: Invalid pattern: ${parsed.pattern} (${String(err)})` };
  }

  const targets: Array<{ name: string; lines: string[]; bufferId?: number }> = [];
  const allEntries = Object.entries(vfs);

  if (
    parsed.fileTargets.length === 0 ||
    parsed.fileTargets.includes('*') ||
    parsed.fileTargets.includes('**') ||
    parsed.fileTargets.includes('.')
  ) {
    if (allEntries.length > 0) {
      for (const [name, lines] of allEntries) {
        const buf = state.buffers?.find((b) => b.name === name);
        targets.push({ name, lines, bufferId: buf?.id });
      }
    } else {
      targets.push({
        name: state.primaryFilename || '[No Name]',
        lines: state.lines,
        bufferId: state.currentBufferId,
      });
    }
  } else {
    for (const req of parsed.fileTargets) {
      if (req === '%') {
        targets.push({
          name: state.primaryFilename || '[No Name]',
          lines: state.lines,
          bufferId: state.currentBufferId,
        });
      } else if (req === '#') {
        const alt = state.alternateBufferId
          ? state.buffers?.find((b) => b.id === state.alternateBufferId)
          : undefined;
        if (alt) {
          targets.push({ name: alt.name, lines: alt.lines, bufferId: alt.id });
        } else if (state.secondaryFilename && state.secondaryLines) {
          targets.push({ name: state.secondaryFilename, lines: state.secondaryLines });
        }
      } else {
        const norm = req.replace(/^\.\//, '');
        const lines = vfs[req] ?? vfs[norm];
        if (lines) {
          const buf = state.buffers?.find((b) => b.name === req || b.name === norm);
          targets.push({ name: vfs[req] ? req : norm, lines, bufferId: buf?.id });
        }
      }
    }
  }

  const rawMatchedLines: string[] = [];
  const bufferIdByFile = new Map<string, number | undefined>();

  for (const t of targets) {
    bufferIdByFile.set(t.name, t.bufferId);
    for (let idx = 0; idx < t.lines.length; idx++) {
      const lineStr = t.lines[idx] ?? '';
      const m = lineStr.match(rx);
      const hit = parsed.invert ? !m : Boolean(m);
      if (!hit) continue;
      const col = m && m.index !== undefined ? m.index + 1 : 1;
      rawMatchedLines.push(`${t.name}:${idx + 1}:${col}:${lineStr.trim()}`);
    }
  }

  const parsedItems = parseLinesWithErrorformat(rawMatchedLines, DEFAULT_ERRORFORMAT).map((it) => ({
    ...it,
    bufferId: bufferIdByFile.get(it.filename),
  }));

  return { ok: true, items: parsedItems, pattern: parsed.pattern };
}
