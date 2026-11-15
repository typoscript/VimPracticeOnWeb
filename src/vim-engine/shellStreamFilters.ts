import { VimEditorState } from './types';
import { utf8ByteLength } from './visualUtilities';
import { msg } from './messages';
import { readFilesOrStdin, unescapeControlSeq } from './shellBuiltins';

export function runSed(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  let quiet = false;
  const scripts: string[] = [];
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-n') {
      quiet = true;
      continue;
    }
    if (a === '-E' || a === '-r') continue;
    if (a === '-e' && i + 1 < args.length) {
      scripts.push(args[++i]);
      continue;
    }
    if (a.startsWith('-e') && a.length > 2) {
      scripts.push(a.slice(2));
      continue;
    }
    if (scripts.length === 0) {
      scripts.push(a);
    } else {
      files.push(a);
    }
  }

  if (scripts.length === 0) {
    return { stdoutLines: [], exitCode: 1, stderr: msg('sed: 스크립트가 필요합니다') };
  }

  const input = readFilesOrStdin(state, files, stdinLines);
  if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };

  const commands = scripts.flatMap((s) => s.split(';').map((p) => p.trim()).filter(Boolean));
  const out: string[] = [];
  const total = input.lines.length;

  for (let idx = 0; idx < total; idx++) {
    let line = input.lines[idx];
    let deleted = false;

    for (const rawCmd of commands) {
      let cmd = rawCmd;
      let addrMatch = true;

      // 단순 주소 파싱: N, $, /pat/, N,M
      const rangeAddr = cmd.match(/^(\d+|\$),(\d+|\$)(.*)$/);
      if (rangeAddr) {
        const sLine = rangeAddr[1] === '$' ? total : parseInt(rangeAddr[1], 10);
        const eLine = rangeAddr[2] === '$' ? total : parseInt(rangeAddr[2], 10);
        addrMatch = idx + 1 >= sLine && idx + 1 <= eLine;
        cmd = rangeAddr[3].trim();
      } else {
        const singleLineAddr = cmd.match(/^(\d+|\$)(.*)$/);
        if (singleLineAddr) {
          const target = singleLineAddr[1] === '$' ? total : parseInt(singleLineAddr[1], 10);
          addrMatch = idx + 1 === target;
          cmd = singleLineAddr[2].trim();
        } else if (cmd.startsWith('/')) {
          const patMatch = cmd.match(/^\/((?:\\.|[^/])*)\/(.*)$/);
          if (patMatch) {
            addrMatch = new RegExp(patMatch[1]).test(line);
            cmd = patMatch[2].trim();
          }
        }
      }

      if (!addrMatch) continue;

      if (cmd === 'd') {
        deleted = true;
        break;
      }
      if (cmd === 'p') {
        out.push(line);
        continue;
      }
      if (cmd.startsWith('s') && cmd.length >= 4) {
        const delim = cmd[1];
        const parts = splitSedDelimited(cmd.slice(2), delim);
        if (parts) {
          const [pat, repl, flags] = parts;
          const isGlobal = flags.includes('g');
          const isIgnoreCase = flags.includes('i') || flags.includes('I');
          const rx = new RegExp(pat, `${isGlobal ? 'g' : ''}${isIgnoreCase ? 'i' : ''}`);
          let didReplace = false;
          line = line.replace(rx, (...mArgs) => {
            didReplace = true;
            const full = mArgs[0];
            const groups = mArgs.slice(1, -2);
            return unescapeControlSeq(
              repl
                .replace(/\\&/g, '\0AMP\0')
                .replace(/&/g, full)
                .replace(/\0AMP\0/g, '&')
                .replace(/\\([0-9])/g, (_g, d) => {
                  const n = parseInt(d, 10);
                  return n === 0 ? full : (groups[n - 1] ?? '');
                })
            );
          });
          if (didReplace && flags.includes('p')) {
            out.push(line);
          }
        }
        continue;
      }
      if (cmd.startsWith('y') && cmd.length >= 4) {
        const delim = cmd[1];
        const parts = splitSedDelimited(cmd.slice(2), delim);
        if (parts) {
          const src = [...parts[0]];
          const dst = [...parts[1]];
          const map = new Map<string, string>();
          src.forEach((ch, ci) => map.set(ch, dst[ci] ?? ch));
          line = [...line].map((c) => map.get(c) ?? c).join('');
        }
      }
    }

    if (!deleted && !quiet) {
      out.push(...line.split('\n'));
    }
  }

  return { stdoutLines: out, exitCode: 0 };
}

function splitSedDelimited(rest: string, delim: string): [string, string, string] | null {
  const segments: string[] = [];
  let cur = '';
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === '\\' && i + 1 < rest.length) {
      if (rest[i + 1] === delim) {
        cur += delim;
      } else {
        cur += ch + rest[i + 1];
      }
      i++;
      continue;
    }
    if (ch === delim) {
      segments.push(cur);
      cur = '';
      if (segments.length === 2) {
        return [segments[0], segments[1], rest.slice(i + 1)];
      }
      continue;
    }
    cur += ch;
  }
  return null;
}

export function runAwk(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  let fs: string | RegExp = /\s+/;
  let customFs = false;
  let program: string | null = null;
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-F' && i + 1 < args.length) {
      fs = unescapeControlSeq(args[++i]);
      customFs = true;
      continue;
    }
    if (a.startsWith('-F') && a.length > 2) {
      fs = unescapeControlSeq(a.slice(2));
      customFs = true;
      continue;
    }
    if (program === null) {
      program = a;
    } else {
      files.push(a);
    }
  }

  if (program === null) {
    return { stdoutLines: [], exitCode: 1, stderr: msg('awk: 프로그램이 필요합니다') };
  }

  const input = readFilesOrStdin(state, files, stdinLines);
  if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };

  const rules = parseAwkRules(program);
  const vars: Record<string, string | number> = { OFS: ' ', FS: customFs ? String(fs) : ' ' };
  const out: string[] = [];

  const evalExpr = (expr: string, fields: string[], nr: number): string | number => {
    const trimmed = expr.trim();
    if (!trimmed) return '';
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return unescapeControlSeq(trimmed.slice(1, -1));
    }
    if (/^\$-?\d+$/.test(trimmed)) {
      const idx = parseInt(trimmed.slice(1), 10);
      return idx === 0 ? fields[0] ?? '' : fields[idx] ?? '';
    }
    if (trimmed === 'NF') return Math.max(0, fields.length - 1);
    if (trimmed === 'NR') return nr;
    if (trimmed === 'OFS' || trimmed === 'FS') return vars[trimmed];
    if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (/^[a-zA-Z_]\w*$/.test(trimmed)) return vars[trimmed] ?? 0;

    // length(...) / toupper(...) / tolower(...)
    const fnMatch = trimmed.match(/^(length|toupper|tolower)\((.*)\)$/);
    if (fnMatch) {
      const argVal = String(evalExpr(fnMatch[2], fields, nr));
      if (fnMatch[1] === 'length') return argVal.length;
      if (fnMatch[1] === 'toupper') return argVal.toUpperCase();
      return argVal.toLowerCase();
    }

    // 산술 연산 + / - / * / /
    const mathMatch = trimmed.match(/^(.+?)\s*([+\-*/])\s*(.+)$/);
    if (mathMatch) {
      const l = evalExpr(mathMatch[1], fields, nr);
      const r = evalExpr(mathMatch[3], fields, nr);
      const ln = Number(l);
      const rn = Number(r);
      if (!Number.isNaN(ln) && !Number.isNaN(rn)) {
        if (mathMatch[2] === '+') return ln + rn;
        if (mathMatch[2] === '-') return ln - rn;
        if (mathMatch[2] === '*') return ln * rn;
        if (mathMatch[2] === '/') return rn === 0 ? 0 : ln / rn;
      }
      if (mathMatch[2] === '+') return String(l) + String(r);
    }

    // 문자열 이어붙이기 (공백 구분 표현식 예: NR ": " $0)
    const concatParts = splitAwkConcatParts(trimmed);
    if (concatParts.length > 1) {
      return concatParts.map((p) => String(evalExpr(p, fields, nr))).join('');
    }

    return trimmed;
  };

  const evalCond = (cond: string, fields: string[], nr: number): boolean => {
    const c = cond.trim();
    if (!c) return true;
    if (c.startsWith('/') && c.endsWith('/') && c.length >= 2) {
      return new RegExp(c.slice(1, -1)).test(fields[0] ?? '');
    }
    const regexOp = c.match(/^(.+?)\s*(!?~)\s*\/(.*)\/$/);
    if (regexOp) {
      const val = String(evalExpr(regexOp[1], fields, nr));
      const matched = new RegExp(regexOp[3]).test(val);
      return regexOp[2] === '!~' ? !matched : matched;
    }
    const cmp = c.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (cmp) {
      const l = evalExpr(cmp[1], fields, nr);
      const r = evalExpr(cmp[3], fields, nr);
      const ln = Number(l);
      const rn = Number(r);
      const bothNum = typeof l === 'number' || typeof r === 'number' || (!Number.isNaN(ln) && !Number.isNaN(rn) && String(l).trim() !== '' && String(r).trim() !== '');
      const a = bothNum ? ln : String(l);
      const b = bothNum ? rn : String(r);
      if (cmp[2] === '==') return a === b;
      if (cmp[2] === '!=') return a !== b;
      if (cmp[2] === '>') return a > b;
      if (cmp[2] === '<') return a < b;
      if (cmp[2] === '>=') return a >= b;
      if (cmp[2] === '<=') return a <= b;
    }
    const val = evalExpr(c, fields, nr);
    return Boolean(val) && val !== '0';
  };

  const execBlock = (body: string, fields: string[], nr: number) => {
    const stmts = splitAwkStatements(body);
    for (const stmt of stmts) {
      if (stmt.startsWith('print')) {
        const rest = stmt.slice(5).trim();
        if (!rest) {
          out.push(fields[0] ?? '');
        } else {
          const items = splitAwkCommaArgs(rest);
          out.push(items.map((it) => String(evalExpr(it, fields, nr))).join(String(vars.OFS)));
        }
        continue;
      }
      const inc = stmt.match(/^([a-zA-Z_]\w*)\+\+$/);
      if (inc) {
        vars[inc[1]] = (Number(vars[inc[1]]) || 0) + 1;
        continue;
      }
      const assignOp = stmt.match(/^([a-zA-Z_]\w*)\s*(\+=|-=|=)\s*(.+)$/);
      if (assignOp) {
        const [, vName, op, rhs] = assignOp;
        const rVal = evalExpr(rhs, fields, nr);
        if (op === '=') {
          vars[vName] = rVal;
          if (vName === 'FS') {
            fs = String(rVal);
            customFs = true;
          }
        } else if (op === '+=') {
          vars[vName] = (Number(vars[vName]) || 0) + (Number(rVal) || 0);
        } else if (op === '-=') {
          vars[vName] = (Number(vars[vName]) || 0) - (Number(rVal) || 0);
        }
      }
    }
  };

  for (const r of rules) {
    if (r.pattern === 'BEGIN') execBlock(r.action, [''], 0);
  }

  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    const nr = i + 1;
    const rawParts = customFs
      ? line.split(fs)
      : line.trim().length === 0
        ? []
        : line.trim().split(/\s+/);
    const fields = [line, ...rawParts];
    for (const r of rules) {
      if (r.pattern === 'BEGIN' || r.pattern === 'END') continue;
      if (evalCond(r.pattern, fields, nr)) {
        execBlock(r.action, fields, nr);
      }
    }
  }

  for (const r of rules) {
    if (r.pattern === 'END') execBlock(r.action, [''], input.lines.length);
  }

  return { stdoutLines: out, exitCode: 0 };
}

function parseAwkRules(program: string): Array<{ pattern: string; action: string }> {
  const rules: Array<{ pattern: string; action: string }> = [];
  let i = 0;
  let pattern = '';

  while (i < program.length) {
    const ch = program[i];
    if (ch === '{') {
      let depth = 1;
      let j = i + 1;
      let inDouble = false;
      while (j < program.length && depth > 0) {
        if (program[j] === '"' && program[j - 1] !== '\\') inDouble = !inDouble;
        else if (!inDouble) {
          if (program[j] === '{') depth++;
          else if (program[j] === '}') depth--;
        }
        j++;
      }
      const action = program.slice(i + 1, j - 1).trim();
      rules.push({ pattern: pattern.trim(), action });
      pattern = '';
      i = j;
      continue;
    }
    pattern += ch;
    i++;
  }
  if (pattern.trim().length > 0) {
    rules.push({ pattern: pattern.trim(), action: 'print $0' });
  }
  return rules;
}

function splitAwkStatements(body: string): string[] {
  const res: string[] = [];
  let cur = '';
  let inDouble = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"' && body[i - 1] !== '\\') inDouble = !inDouble;
    if ((ch === ';' || ch === '\n') && !inDouble) {
      if (cur.trim()) res.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) res.push(cur.trim());
  return res;
}

function splitAwkCommaArgs(expr: string): string[] {
  const res: string[] = [];
  let cur = '';
  let inDouble = false;
  let parenDepth = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '"' && expr[i - 1] !== '\\') inDouble = !inDouble;
    else if (!inDouble) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      else if (ch === ',' && parenDepth === 0) {
        res.push(cur.trim());
        cur = '';
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim()) res.push(cur.trim());
  return res;
}

function splitAwkConcatParts(expr: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let inDouble = false;
  let parenDepth = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '"' && expr[i - 1] !== '\\') inDouble = !inDouble;
    else if (!inDouble) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      else if (/\s/.test(ch) && parenDepth === 0) {
        if (cur.trim()) {
          parts.push(cur.trim());
          cur = '';
        }
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

export function runHeadOrTail(
  kind: 'head' | 'tail',
  args: string[],
  stdinLines: string[],
  state: VimEditorState
): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  let countSpec = '10';
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-n' && i + 1 < args.length) {
      countSpec = args[++i];
      continue;
    }
    if (a.startsWith('-n') && a.length > 2) {
      countSpec = a.slice(2);
      continue;
    }
    if (/^-[+-]?\d+$/.test(a)) {
      countSpec = a.slice(1);
      continue;
    }
    files.push(a);
  }

  const input = readFilesOrStdin(state, files, stdinLines);
  if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };

  const lines = input.lines;
  const n = parseInt(countSpec, 10);
  if (Number.isNaN(n)) return { stdoutLines: [], exitCode: 1, stderr: msg('{cmd}: 잘못된 줄 수입니다: {val}', { cmd: kind, val: countSpec }) };

  if (kind === 'head') {
    if (countSpec.startsWith('-')) {
      return { stdoutLines: lines.slice(0, Math.max(0, lines.length + n)), exitCode: 0 };
    }
    return { stdoutLines: lines.slice(0, Math.max(0, n)), exitCode: 0 };
  }

  if (countSpec.startsWith('+')) {
    return { stdoutLines: lines.slice(Math.max(0, n - 1)), exitCode: 0 };
  }
  if (n === 0) return { stdoutLines: [], exitCode: 0 };
  return { stdoutLines: lines.slice(-Math.abs(n)), exitCode: 0 };
}

export function runWc(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  let showL = false;
  let showW = false;
  let showC = false;
  const files: string[] = [];

  for (const a of args) {
    if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        if (ch === 'l') showL = true;
        else if (ch === 'w') showW = true;
        else if (ch === 'c' || ch === 'm') showC = true;
      }
    } else {
      files.push(a);
    }
  }

  if (!showL && !showW && !showC) {
    showL = showW = showC = true;
  }

  const input = readFilesOrStdin(state, files, stdinLines);
  if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };

  const lineCount = input.lines.length;
  const text = input.lines.join('\n') + (input.lines.length > 0 ? '\n' : '');
  const wordCount = input.lines.reduce((acc, l) => {
    const trimmed = l.trim();
    return acc + (trimmed ? trimmed.split(/\s+/).length : 0);
  }, 0);
  const byteCount = utf8ByteLength(text);

  const cols: number[] = [];
  if (showL) cols.push(lineCount);
  if (showW) cols.push(wordCount);
  if (showC) cols.push(byteCount);

  if (cols.length === 1) {
    return { stdoutLines: [String(cols[0])], exitCode: 0 };
  }
  return { stdoutLines: [cols.map((c) => String(c).padStart(4, ' ')).join(' ')], exitCode: 0 };
}

export function runNl(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  let bodyStyle: 'a' | 't' = 't';
  let start = 1;
  let sep = '\t';
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-ba' || (a === '-b' && args[i + 1] === 'a')) {
      bodyStyle = 'a';
      if (a === '-b') i++;
      continue;
    }
    if (a === '-bt' || (a === '-b' && args[i + 1] === 't')) {
      bodyStyle = 't';
      if (a === '-b') i++;
      continue;
    }
    if (a === '-v' && i + 1 < args.length) {
      start = parseInt(args[++i], 10) || 1;
      continue;
    }
    if (a === '-s' && i + 1 < args.length) {
      sep = args[++i];
      continue;
    }
    files.push(a);
  }

  const input = readFilesOrStdin(state, files, stdinLines);
  if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };

  let num = start;
  const out = input.lines.map((line) => {
    if (bodyStyle === 't' && line.trim().length === 0) {
      return `       ${line}`;
    }
    return `${String(num++).padStart(6, ' ')}${sep}${line}`;
  });
  return { stdoutLines: out, exitCode: 0 };
}

export function runColumn(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  let table = false;
  let sep: string | null = null;
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-t') {
      table = true;
      continue;
    }
    if (a === '-s' && i + 1 < args.length) {
      sep = args[++i];
      continue;
    }
    if (a.startsWith('-s') && a.length > 2) {
      sep = a.slice(2);
      continue;
    }
    files.push(a);
  }

  const input = readFilesOrStdin(state, files, stdinLines);
  if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };
  if (!table) return { stdoutLines: [...input.lines], exitCode: 0 };

  const rows = input.lines.map((l) => {
    if (sep !== null) return l.split(sep).map((c) => c.trim());
    const t = l.trim();
    return t ? t.split(/\s+/) : [];
  });
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const widths = new Array(colCount).fill(0);
  for (const r of rows) {
    for (let c = 0; c < r.length; c++) {
      widths[c] = Math.max(widths[c], r[c].length);
    }
  }
  const out = rows.map((r) =>
    r.length === 0
      ? ''
      : r
          .map((cell, ci) => (ci === r.length - 1 ? cell : cell.padEnd(widths[ci] + 2, ' ')))
          .join('')
  );
  return { stdoutLines: out, exitCode: 0 };
}

export function runJq(args: string[], stdinLines: string[]): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  let raw = false;
  let filter = '.';
  for (const a of args) {
    if (a === '-r') raw = true;
    else if (!a.startsWith('-')) filter = a;
  }

  try {
    let val: unknown = JSON.parse(stdinLines.join('\n'));
    if (filter === 'keys' && val && typeof val === 'object') {
      val = Object.keys(val as Record<string, unknown>).sort();
    } else if (filter === 'length') {
      val = Array.isArray(val) || typeof val === 'string'
        ? val.length
        : val && typeof val === 'object'
          ? Object.keys(val).length
          : 0;
    } else if (filter !== '.' && filter.startsWith('.')) {
      const segs = filter.slice(1).split('.').filter(Boolean);
      for (const seg of segs) {
        if (val === null || val === undefined) break;
        const arrMatch = seg.match(/^(.*?)\[(\d+)\]$/);
        if (arrMatch) {
          if (arrMatch[1]) val = (val as Record<string, unknown>)[arrMatch[1]];
          val = Array.isArray(val) ? val[parseInt(arrMatch[2], 10)] : undefined;
        } else {
          val = (val as Record<string, unknown>)[seg];
        }
      }
    }

    if (raw && typeof val === 'string') {
      return { stdoutLines: val.split('\n'), exitCode: 0 };
    }
    const formatted = JSON.stringify(val, null, 2);
    return { stdoutLines: (formatted ?? 'null').split('\n'), exitCode: 0 };
  } catch (err) {
    return { stdoutLines: [], exitCode: 5, stderr: `jq: parse error (${String(err)})` };
  }
}
