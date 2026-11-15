import { VimEditorState } from './types';
import { buildVfsMap, getVfsFile } from './vfs';
import { msg } from './messages';

export function unescapeControlSeq(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\');
}

export function readFilesOrStdin(
  state: VimEditorState,
  fileArgs: string[],
  stdinLines: string[]
): { ok: true; lines: string[]; fileChunks: Array<{ name: string; lines: string[] }> } | { ok: false; error: string } {
  if (fileArgs.length === 0) {
    return { ok: true, lines: stdinLines, fileChunks: [{ name: '(stdin)', lines: stdinLines }] };
  }
  const vfs = buildVfsMap(state);
  const allLines: string[] = [];
  const fileChunks: Array<{ name: string; lines: string[] }> = [];

  for (const f of fileArgs) {
    if (f === '-') {
      allLines.push(...stdinLines);
      fileChunks.push({ name: '-', lines: stdinLines });
      continue;
    }
    const normalized = f.replace(/^\.\//, '');
    const found =
      vfs[f] ??
      vfs[normalized] ??
      getVfsFile(state.netrw?.files, f, state.virtualFiles) ??
      getVfsFile(state.netrw?.files, normalized, state.virtualFiles);
    if (!found) {
      return { ok: false, error: msg('{file}: 해당 파일이나 디렉터리가 없습니다', { file: f }) };
    }
    allLines.push(...found);
    fileChunks.push({ name: f, lines: found });
  }
  return { ok: true, lines: allLines, fileChunks };
}

// ---- 개별 내장 POSIX 유틸리티 에뮬레이터 ----

export function runEcho(args: string[]): { stdoutLines: string[]; exitCode: number } {
  let noNewline = false;
  let interpretEscapes = false;
  let idx = 0;
  while (idx < args.length && /^-[neE]+$/.test(args[idx])) {
    const f = args[idx];
    if (f.includes('n')) noNewline = true;
    if (f.includes('e')) interpretEscapes = true;
    if (f.includes('E')) interpretEscapes = false;
    idx++;
  }
  void noNewline;
  const joined = args.slice(idx).join(' ');
  const text = interpretEscapes ? unescapeControlSeq(joined) : joined;
  return { stdoutLines: text.split('\n'), exitCode: 0 };
}

export function runPrintf(args: string[]): { stdoutLines: string[]; exitCode: number } {
  if (args.length === 0) return { stdoutLines: [], exitCode: 0 };
  const fmt = unescapeControlSeq(args[0]);
  const params = args.slice(1);
  let pIdx = 0;
  const rendered = fmt.replace(/%(-?\d+)?([sdf%])/g, (_m, widthStr, spec) => {
    if (spec === '%') return '%';
    const rawVal = params[pIdx++] ?? '';
    let strVal = rawVal;
    if (spec === 'd') {
      const n = parseInt(rawVal, 10);
      strVal = Number.isNaN(n) ? '0' : String(n);
    } else if (spec === 'f') {
      const n = parseFloat(rawVal);
      strVal = Number.isNaN(n) ? '0.000000' : n.toFixed(6);
    }
    if (widthStr) {
      const w = parseInt(widthStr, 10);
      if (w > 0) return strVal.padStart(w, ' ');
      if (w < 0) return strVal.padEnd(-w, ' ');
    }
    return strVal;
  });
  const lines = rendered.endsWith('\n') ? rendered.slice(0, -1).split('\n') : rendered.split('\n');
  return { stdoutLines: lines, exitCode: 0 };
}

export function runSort(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  let reverse = false;
  let unique = false;
  let numeric = false;
  let ignoreCase = false;
  let ignoreLeading = false;
  let delimiter: string | null = null;
  let keySpec: { startField: number; endField: number; numeric: boolean; reverse: boolean } | null = null;
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-t' && i + 1 < args.length) {
      delimiter = args[++i];
      continue;
    }
    if (a.startsWith('-t') && a.length > 2) {
      delimiter = a.slice(2);
      continue;
    }
    if (a === '-k' && i + 1 < args.length) {
      keySpec = parseSortKeySpec(args[++i]);
      continue;
    }
    if (a.startsWith('-k') && a.length > 2) {
      keySpec = parseSortKeySpec(a.slice(2));
      continue;
    }
    if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
      for (const ch of a.slice(1)) {
        if (ch === 'r') reverse = true;
        else if (ch === 'u') unique = true;
        else if (ch === 'n' || ch === 'g') numeric = true;
        else if (ch === 'f' || ch === 'i') ignoreCase = true;
        else if (ch === 'b') ignoreLeading = true;
      }
      continue;
    }
    files.push(a);
  }

  const input = readFilesOrStdin(state, files, stdinLines);
  if (!input.ok) return { stdoutLines: [], exitCode: 2, stderr: input.error };

  const extractField = (line: string): string => {
    let target = line;
    if (keySpec) {
      const parts = delimiter !== null ? line.split(delimiter) : line.trim().split(/\s+/);
      const startIdx = Math.max(0, keySpec.startField - 1);
      const endIdx = Math.min(parts.length, keySpec.endField);
      target = parts.slice(startIdx, endIdx).join(delimiter ?? ' ');
    }
    if (ignoreLeading) target = target.trimStart();
    return target;
  };

  const useNum = numeric || (keySpec?.numeric ?? false);
  const isRev = keySpec?.reverse ? !reverse : reverse;

  const sorted = [...input.lines].sort((a, b) => {
    const ka = extractField(a);
    const kb = extractField(b);
    let cmp = 0;
    if (useNum) {
      const na = parseFloat(ka) || 0;
      const nb = parseFloat(kb) || 0;
      cmp = na - nb;
    }
    if (cmp === 0) {
      const sa = ignoreCase ? ka.toLowerCase() : ka;
      const sb = ignoreCase ? kb.toLowerCase() : kb;
      cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
    }
    return isRev ? -cmp : cmp;
  });

  if (!unique) return { stdoutLines: sorted, exitCode: 0 };

  const deduped: string[] = [];
  for (const line of sorted) {
    if (deduped.length === 0) {
      deduped.push(line);
      continue;
    }
    const prevKey = extractField(deduped[deduped.length - 1]);
    const curKey = extractField(line);
    const same = useNum
      ? (parseFloat(prevKey) || 0) === (parseFloat(curKey) || 0) &&
        (ignoreCase ? prevKey.toLowerCase() === curKey.toLowerCase() : prevKey === curKey)
      : ignoreCase
        ? prevKey.toLowerCase() === curKey.toLowerCase()
        : prevKey === curKey;
    if (!same) deduped.push(line);
  }
  return { stdoutLines: deduped, exitCode: 0 };
}

function parseSortKeySpec(spec: string): { startField: number; endField: number; numeric: boolean; reverse: boolean } {
  const numeric = spec.includes('n') || spec.includes('g');
  const reverse = spec.includes('r');
  const [startPart, endPart] = spec.split(',');
  const startField = parseInt(startPart.replace(/\D/g, ''), 10) || 1;
  const endField = endPart ? parseInt(endPart.replace(/\D/g, ''), 10) || startField : startField;
  return { startField, endField, numeric, reverse };
}

export function runUniq(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  let countMode = false;
  let onlyDuplicates = false;
  let onlyUnique = false;
  let ignoreCase = false;
  const files: string[] = [];

  for (const a of args) {
    if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        if (ch === 'c') countMode = true;
        else if (ch === 'd') onlyDuplicates = true;
        else if (ch === 'u') onlyUnique = true;
        else if (ch === 'i') ignoreCase = true;
      }
    } else {
      files.push(a);
    }
  }

  const input = readFilesOrStdin(state, files, stdinLines);
  if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };
  if (input.lines.length === 0) return { stdoutLines: [], exitCode: 0 };

  const groups: Array<{ line: string; count: number }> = [];
  for (const line of input.lines) {
    const key = ignoreCase ? line.toLowerCase() : line;
    const last = groups[groups.length - 1];
    const lastKey = last ? (ignoreCase ? last.line.toLowerCase() : last.line) : null;
    if (last && lastKey === key) {
      last.count++;
    } else {
      groups.push({ line, count: 1 });
    }
  }

  const out: string[] = [];
  for (const g of groups) {
    if (onlyDuplicates && g.count < 2) continue;
    if (onlyUnique && g.count > 1) continue;
    out.push(countMode ? `${String(g.count).padStart(4, ' ')} ${g.line}` : g.line);
  }
  return { stdoutLines: out, exitCode: 0 };
}

export function runGrep(
  args: string[],
  stdinLines: string[],
  state: VimEditorState,
  defaultMode: 'basic' | 'extended' | 'fixed' = 'basic'
): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  let ignoreCase = false;
  let invert = false;
  let countOnly = false;
  let lineNumbers = false;
  let wholeWord = false;
  let onlyMatching = false;
  let filesWithMatches = false;
  let fixed = defaultMode === 'fixed';
  let extended = defaultMode === 'extended';
  const patterns: string[] = [];
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-e' && i + 1 < args.length) {
      patterns.push(args[++i]);
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        if (ch === 'i') ignoreCase = true;
        else if (ch === 'v') invert = true;
        else if (ch === 'c') countOnly = true;
        else if (ch === 'n') lineNumbers = true;
        else if (ch === 'w') wholeWord = true;
        else if (ch === 'o') onlyMatching = true;
        else if (ch === 'l') filesWithMatches = true;
        else if (ch === 'F') fixed = true;
        else if (ch === 'E') extended = true;
      }
      continue;
    }
    if (patterns.length === 0) {
      patterns.push(a);
    } else {
      files.push(a);
    }
  }

  void extended;
  if (patterns.length === 0) {
    return { stdoutLines: [], exitCode: 2, stderr: msg('grep: 검색 패턴이 필요합니다') };
  }

  const compiled: RegExp[] = [];
  try {
    for (const pat of patterns) {
      const escaped = fixed ? pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pat;
      const body = wholeWord ? `\\b(?:${escaped})\\b` : escaped;
      compiled.push(new RegExp(body, ignoreCase ? 'gi' : 'g'));
    }
  } catch (err) {
    return { stdoutLines: [], exitCode: 2, stderr: `grep: invalid pattern (${String(err)})` };
  }

  const input = readFilesOrStdin(state, files, stdinLines);
  if (!input.ok) return { stdoutLines: [], exitCode: 2, stderr: input.error };

  const multiFile = input.fileChunks.length > 1;
  const out: string[] = [];
  let totalMatches = 0;

  for (const chunk of input.fileChunks) {
    let chunkCount = 0;
    for (let idx = 0; idx < chunk.lines.length; idx++) {
      const line = chunk.lines[idx];
      let matched = false;
      const oMatches: string[] = [];
      for (const rx of compiled) {
        rx.lastIndex = 0;
        if (onlyMatching && !invert) {
          let m: RegExpExecArray | null;
          while ((m = rx.exec(line)) !== null) {
            oMatches.push(m[0]);
            matched = true;
            if (m[0].length === 0) rx.lastIndex++;
          }
        } else if (rx.test(line)) {
          matched = true;
          break;
        }
      }

      const pass = invert ? !matched : matched;
      if (!pass) continue;

      chunkCount++;
      totalMatches++;
      if (filesWithMatches) {
        out.push(chunk.name);
        break;
      }
      if (countOnly) continue;

      const prefix = `${multiFile ? `${chunk.name}:` : ''}${lineNumbers ? `${idx + 1}:` : ''}`;
      if (onlyMatching && !invert) {
        for (const om of oMatches) out.push(`${prefix}${om}`);
      } else {
        out.push(`${prefix}${line}`);
      }
    }
    if (countOnly) {
      out.push(`${multiFile ? `${chunk.name}:` : ''}${chunkCount}`);
    }
  }

  return { stdoutLines: out, exitCode: totalMatches > 0 ? 0 : 1 };
}

function parseFieldRangeList(spec: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const part of spec.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const dash = trimmed.indexOf('-');
    if (dash === -1) {
      const n = parseInt(trimmed, 10);
      if (!Number.isNaN(n) && n >= 1) ranges.push([n, n]);
    } else {
      const left = trimmed.slice(0, dash);
      const right = trimmed.slice(dash + 1);
      const start = left ? Math.max(1, parseInt(left, 10) || 1) : 1;
      const end = right ? Math.max(start, parseInt(right, 10) || start) : Number.MAX_SAFE_INTEGER;
      ranges.push([start, end]);
    }
  }
  return ranges;
}

function isInFieldRanges(oneBasedIdx: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([s, e]) => oneBasedIdx >= s && oneBasedIdx <= e);
}

export function runCut(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  let delim = '\t';
  let fieldsSpec: string | null = null;
  let charsSpec: string | null = null;
  let complement = false;
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--complement') {
      complement = true;
      continue;
    }
    if (a === '-d' && i + 1 < args.length) {
      delim = args[++i];
      continue;
    }
    if (a.startsWith('-d') && a.length > 2) {
      delim = a.slice(2);
      continue;
    }
    if (a === '-f' && i + 1 < args.length) {
      fieldsSpec = args[++i];
      continue;
    }
    if (a.startsWith('-f') && a.length > 2) {
      fieldsSpec = a.slice(2);
      continue;
    }
    if (a === '-c' && i + 1 < args.length) {
      charsSpec = args[++i];
      continue;
    }
    if (a.startsWith('-c') && a.length > 2) {
      charsSpec = a.slice(2);
      continue;
    }
    files.push(a);
  }

  if (!fieldsSpec && !charsSpec) {
    return { stdoutLines: [], exitCode: 1, stderr: msg('cut: -f 또는 -c 옵션이 필요합니다') };
  }

  const input = readFilesOrStdin(state, files, stdinLines);
  if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };

  const out: string[] = [];
  if (charsSpec) {
    const ranges = parseFieldRangeList(charsSpec);
    for (const line of input.lines) {
      const chars = [...line];
      const picked = chars.filter((_c, idx) => {
        const hit = isInFieldRanges(idx + 1, ranges);
        return complement ? !hit : hit;
      });
      out.push(picked.join(''));
    }
    return { stdoutLines: out, exitCode: 0 };
  }

  const ranges = parseFieldRangeList(fieldsSpec!);
  for (const line of input.lines) {
    if (!line.includes(delim)) {
      out.push(line);
      continue;
    }
    const parts = line.split(delim);
    const picked = parts.filter((_p, idx) => {
      const hit = isInFieldRanges(idx + 1, ranges);
      return complement ? !hit : hit;
    });
    out.push(picked.join(delim));
  }
  return { stdoutLines: out, exitCode: 0 };
}

function expandTrSet(spec: string): string[] {
  const unescaped = spec
    .replace(/\[:lower:\]/g, 'a-z')
    .replace(/\[:upper:\]/g, 'A-Z')
    .replace(/\[:digit:\]/g, '0-9')
    .replace(/\[:alpha:\]/g, 'a-zA-Z')
    .replace(/\[:alnum:\]/g, 'a-zA-Z0-9')
    .replace(/\[:space:\]/g, ' \t\n\r');
  const parsed = unescapeControlSeq(unescaped);
  const chars = [...parsed];
  const result: string[] = [];

  for (let i = 0; i < chars.length; i++) {
    if (i + 2 < chars.length && chars[i + 1] === '-') {
      const start = chars[i].codePointAt(0)!;
      const end = chars[i + 2].codePointAt(0)!;
      if (start <= end) {
        for (let code = start; code <= end; code++) {
          result.push(String.fromCodePoint(code));
        }
        i += 2;
        continue;
      }
    }
    result.push(chars[i]);
  }
  return result;
}

export function runTr(args: string[], stdinLines: string[]): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  let deleteMode = false;
  let squeezeMode = false;
  const sets: string[] = [];

  for (const a of args) {
    if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        if (ch === 'd') deleteMode = true;
        else if (ch === 's') squeezeMode = true;
      }
    } else {
      sets.push(a);
    }
  }

  if (sets.length === 0) {
    return { stdoutLines: [], exitCode: 1, stderr: msg('tr: 피연산자가 누락되었습니다') };
  }

  const set1 = expandTrSet(sets[0]);
  const set1Lookup = new Set(set1);
  const text = stdinLines.join('\n');

  if (deleteMode) {
    const outChars = [...text].filter((c) => !set1Lookup.has(c));
    return { stdoutLines: outChars.join('').split('\n'), exitCode: 0 };
  }

  if (sets.length < 2 && squeezeMode) {
    let out = '';
    let prev = '';
    for (const c of text) {
      if (set1Lookup.has(c) && c === prev) continue;
      out += c;
      prev = c;
    }
    return { stdoutLines: out.split('\n'), exitCode: 0 };
  }

  if (sets.length < 2) {
    return { stdoutLines: [], exitCode: 1, stderr: msg('tr: 대상 문자 집합이 필요합니다') };
  }

  const set2 = expandTrSet(sets[1]);
  const map = new Map<string, string>();
  for (let i = 0; i < set1.length; i++) {
    const target = set2[Math.min(i, Math.max(0, set2.length - 1))] ?? set1[i];
    map.set(set1[i], target);
  }

  let transformed = '';
  for (const c of text) {
    transformed += map.get(c) ?? c;
  }

  if (squeezeMode) {
    const set2Lookup = new Set(set2);
    let squeezed = '';
    let prev = '';
    for (const c of transformed) {
      if (set2Lookup.has(c) && c === prev) continue;
      squeezed += c;
      prev = c;
    }
    transformed = squeezed;
  }

  return { stdoutLines: transformed.split('\n'), exitCode: 0 };
}
