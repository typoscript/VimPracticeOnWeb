import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { moveToFirstNonBlank } from './motions';
import { pushUndoSnapshot } from './operators';
import { buildVfsMap, getDirectoryListing, getVfsFile } from './vfs';
import { utf8ByteLength } from './visual';
import { msg } from './messages';

export interface ShellExecResult {
  ok: boolean;
  stdoutLines: string[];
  stderr?: string;
  exitCode: number;
  expandedCommand: string;
}

interface ParsedStage {
  args: string[];
  redirectFile?: string;
  redirectAppend?: boolean;
}

/**
 * 셸 명령어 내 %, #, ! 특수 문자를 Vim 규칙에 따라 확장합니다.
 * \%, \#, \! 는 리터럴 문자로 유지됩니다.
 */
export function expandShellCommand(
  state: VimEditorState,
  rawCmd: string
): { ok: true; command: string } | { ok: false; error: string } {
  let out = '';
  let i = 0;

  while (i < rawCmd.length) {
    const ch = rawCmd[i];
    if (ch === '\\' && i + 1 < rawCmd.length) {
      const next = rawCmd[i + 1];
      if (next === '%' || next === '#' || next === '!') {
        out += next;
        i += 2;
        continue;
      }
      out += ch + next;
      i += 2;
      continue;
    }

    if (ch === '%') {
      const filename = state.primaryFilename;
      if (!filename) {
        return {
          ok: false,
          error: msg('E499: \'%\' 또는 \'#\'에 대한 파일 이름이 비어 있습니다'),
        };
      }
      out += filename;
      i++;
      continue;
    }

    if (ch === '#') {
      const altBuf = state.alternateBufferId
        ? state.buffers?.find((b) => b.id === state.alternateBufferId)
        : undefined;
      const altName = altBuf?.name ?? state.secondaryFilename;
      if (!altName) {
        return {
          ok: false,
          error: msg('E194: 대체 파일 이름이 없습니다 (#)'),
        };
      }
      out += altName;
      i++;
      continue;
    }

    if (ch === '!') {
      if (!state.lastShellCommand) {
        return {
          ok: false,
          error: msg('E34: 이전 명령이 없습니다'),
        };
      }
      out += state.lastShellCommand;
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return { ok: true, command: out };
}

/**
 * 따옴표('...', "...")와 역슬래시를 존중하여 셸 파이프라인(|) 단계를 분리합니다.
 */
export function splitShellPipeline(command: string): string[] {
  const stages: string[] = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === '\\' && !inSingle && i + 1 < command.length) {
      cur += ch + command[i + 1];
      i++;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      cur += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      cur += ch;
      continue;
    }
    if (ch === '|' && !inSingle && !inDouble) {
      stages.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }

  if (cur.trim().length > 0 || stages.length > 0) {
    stages.push(cur.trim());
  }
  return stages.filter((s) => s.length > 0);
}

/**
 * 단일 셸 단계 문자열을 인자 배열과 리다이렉션 정보로 토큰화합니다.
 */
function tokenizeShellStage(stage: string): ParsedStage {
  const tokens: string[] = [];
  let cur = '';
  let hasToken = false;
  let inSingle = false;
  let inDouble = false;

  const flush = () => {
    if (hasToken) {
      tokens.push(cur);
      cur = '';
      hasToken = false;
    }
  };

  for (let i = 0; i < stage.length; i++) {
    const ch = stage[i];
    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        cur += ch;
      }
      hasToken = true;
      continue;
    }
    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      } else if (ch === '\\' && i + 1 < stage.length && /["\\$`]/.test(stage[i + 1])) {
        cur += stage[i + 1];
        i++;
      } else {
        cur += ch;
      }
      hasToken = true;
      continue;
    }

    if (ch === '\\' && i + 1 < stage.length) {
      cur += stage[i + 1];
      hasToken = true;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      hasToken = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      hasToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (ch === '>' && !hasToken) {
      flush();
      if (stage[i + 1] === '>') {
        tokens.push('>>');
        i++;
      } else {
        tokens.push('>');
      }
      continue;
    }
    cur += ch;
    hasToken = true;
  }
  flush();

  const args: string[] = [];
  let redirectFile: string | undefined;
  let redirectAppend = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if ((tok === '>' || tok === '>>') && i + 1 < tokens.length) {
      redirectAppend = tok === '>>';
      redirectFile = tokens[i + 1];
      i++;
      continue;
    }
    args.push(tok);
  }

  return { args, redirectFile, redirectAppend };
}

function unescapeControlSeq(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\');
}

function readFilesOrStdin(
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

function runEcho(args: string[]): { stdoutLines: string[]; exitCode: number } {
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

function runPrintf(args: string[]): { stdoutLines: string[]; exitCode: number } {
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

function runSort(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
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

function runUniq(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
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

function runGrep(
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

function runCut(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
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

function runTr(args: string[], stdinLines: string[]): { stdoutLines: string[]; exitCode: number; stderr?: string } {
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

function runSed(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
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

function runAwk(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
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

function runHeadOrTail(
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

function runWc(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
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

function runNl(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
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

function runColumn(args: string[], stdinLines: string[], state: VimEditorState): { stdoutLines: string[]; exitCode: number; stderr?: string } {
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

function runJq(args: string[], stdinLines: string[]): { stdoutLines: string[]; exitCode: number; stderr?: string } {
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

function executeSingleStage(
  stage: ParsedStage,
  stdinLines: string[],
  state: VimEditorState
): { stdoutLines: string[]; exitCode: number; stderr?: string } {
  const [cmd, ...args] = stage.args;
  if (!cmd) return { stdoutLines: stdinLines, exitCode: 0 };

  switch (cmd) {
    case 'echo':
      return runEcho(args);
    case 'printf':
      return runPrintf(args);
    case 'true':
      return { stdoutLines: [], exitCode: 0 };
    case 'false':
      return { stdoutLines: [], exitCode: 1 };
    case 'pwd':
      return { stdoutLines: ['/workspace'], exitCode: 0 };
    case 'whoami':
      return { stdoutLines: ['vimuser'], exitCode: 0 };
    case 'uname':
      return { stdoutLines: [args.includes('-a') ? 'VimOS 1.0 virtual x86_64' : 'VimOS'], exitCode: 0 };
    case 'date':
      return { stdoutLines: ['2026-01-01 00:00:00 UTC'], exitCode: 0 };
    case 'basename': {
      const p = args[0] ?? '';
      return { stdoutLines: [p.split('/').filter(Boolean).pop() ?? p], exitCode: 0 };
    }
    case 'dirname': {
      const p = args[0] ?? '';
      const idx = p.lastIndexOf('/');
      return { stdoutLines: [idx <= 0 ? (idx === 0 ? '/' : '.') : p.slice(0, idx)], exitCode: 0 };
    }
    case 'ls': {
      const target = (args.filter((a) => !a.startsWith('-'))[0] ?? '').replace(/^\/+|\/+$/g, '');
      const vfs = buildVfsMap(state);
      const listing = getDirectoryListing(vfs, target);
      const entries = [...listing.dirs.map((d) => `${d}/`), ...listing.files];
      return { stdoutLines: entries, exitCode: 0 };
    }
    case 'cat': {
      let showNumbers = false;
      const files: string[] = [];
      for (const a of args) {
        if (a === '-n') showNumbers = true;
        else files.push(a);
      }
      const input = readFilesOrStdin(state, files, stdinLines);
      if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };
      const lines = showNumbers
        ? input.lines.map((l, idx) => `${String(idx + 1).padStart(6, ' ')}\t${l}`)
        : [...input.lines];
      return { stdoutLines: lines, exitCode: 0 };
    }
    case 'sort':
      return runSort(args, stdinLines, state);
    case 'uniq':
      return runUniq(args, stdinLines, state);
    case 'grep':
    case 'egrep':
    case 'fgrep':
      return runGrep(
        args,
        stdinLines,
        state,
        cmd === 'egrep' ? 'extended' : cmd === 'fgrep' ? 'fixed' : 'basic'
      );
    case 'cut':
      return runCut(args, stdinLines, state);
    case 'tr':
      return runTr(args, stdinLines);
    case 'sed':
      return runSed(args, stdinLines, state);
    case 'awk':
      return runAwk(args, stdinLines, state);
    case 'head':
      return runHeadOrTail('head', args, stdinLines, state);
    case 'tail':
      return runHeadOrTail('tail', args, stdinLines, state);
    case 'wc':
      return runWc(args, stdinLines, state);
    case 'nl':
      return runNl(args, stdinLines, state);
    case 'tac': {
      const input = readFilesOrStdin(state, args, stdinLines);
      if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };
      return { stdoutLines: [...input.lines].reverse(), exitCode: 0 };
    }
    case 'rev': {
      const input = readFilesOrStdin(state, args, stdinLines);
      if (!input.ok) return { stdoutLines: [], exitCode: 1, stderr: input.error };
      return { stdoutLines: input.lines.map((l) => [...l].reverse().join('')), exitCode: 0 };
    }
    case 'column':
      return runColumn(args, stdinLines, state);
    case 'jq':
      return runJq(args, stdinLines);
    default:
      return {
        stdoutLines: [],
        exitCode: 127,
        stderr: msg('{cmd}: 명령어를 찾을 수 없습니다', { cmd }),
      };
  }
}

/**
 * 가상 POSIX 셸 파이프라인을 실행하고 표준 출력 줄 배열을 반환합니다.
 */
export function runShellPipeline(
  state: VimEditorState,
  rawCmd: string,
  stdinLines: string[] = []
): ShellExecResult {
  const trimmedCmd = rawCmd.trim();
  if (!trimmedCmd) {
    return {
      ok: false,
      stdoutLines: [],
      exitCode: 1,
      stderr: msg('E471: 인수가 필요합니다'),
      expandedCommand: '',
    };
  }

  const expanded = expandShellCommand(state, trimmedCmd);
  if (!expanded.ok) {
    return {
      ok: false,
      stdoutLines: [],
      exitCode: 1,
      stderr: expanded.error,
      expandedCommand: trimmedCmd,
    };
  }

  const stageStrings = splitShellPipeline(expanded.command);
  if (stageStrings.length === 0) {
    return {
      ok: false,
      stdoutLines: [],
      exitCode: 1,
      stderr: msg('E471: 인수가 필요합니다'),
      expandedCommand: expanded.command,
    };
  }

  let currentLines = [...stdinLines];
  let lastExit = 0;

  for (const sStr of stageStrings) {
    const parsed = tokenizeShellStage(sStr);
    if (parsed.args.length === 0) continue;
    const res = executeSingleStage(parsed, currentLines, state);
    if (res.exitCode >= 2) {
      return {
        ok: false,
        stdoutLines: [],
        exitCode: res.exitCode,
        stderr: res.stderr,
        expandedCommand: expanded.command,
      };
    }
    currentLines = res.stdoutLines;
    lastExit = res.exitCode;
  }

  return {
    ok: true,
    stdoutLines: currentLines,
    exitCode: lastExit,
    expandedCommand: expanded.command,
  };
}

function exitCmdMode(state: VimEditorState, message?: string, bell = false): VimEditorState {
  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    filterOperatorKeys: undefined,
    commandMessage: message,
    bell: bell || undefined,
  };
}

/**
 * `:!{cmd}` — 버퍼 수정 없이 가상 셸 명령을 실행하고 결과를 상태바에 표시합니다.
 */
export function executeShellCommand(state: VimEditorState, rawCmd: string): VimEditorState {
  const res = runShellPipeline(state, rawCmd, []);
  if (!res.ok) {
    return exitCmdMode(state, res.stderr || msg('셸 실행 실패 (exit {code})', { code: res.exitCode }), true);
  }
  const outputPreview = res.stdoutLines.length > 0 ? res.stdoutLines.join(' | ') : msg('(출력 없음, exit {code})', { code: res.exitCode });
  return exitCmdMode(
    { ...state, lastShellCommand: res.expandedCommand },
    outputPreview,
    res.exitCode !== 0
  );
}

/**
 * `:[range]!{cmd}` — 지정 줄 범위를 stdin 으로 파이프 필터링하여 stdout 으로 교체합니다.
 */
export function executeFilterRange(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  rawCmd: string
): VimEditorState {
  const start = Math.max(0, Math.min(range.startLine, state.lines.length - 1));
  const end = Math.max(start, Math.min(range.endLine, state.lines.length - 1));
  const inputSlice = state.lines.slice(start, end + 1);

  const res = runShellPipeline(state, rawCmd, inputSlice);
  if (!res.ok) {
    return exitCmdMode(state, res.stderr || msg('필터 실행 오류 (exit {code})', { code: res.exitCode }), true);
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const replacedSlice = res.stdoutLines;
  let newLines = [
    ...state.lines.slice(0, start),
    ...replacedSlice,
    ...state.lines.slice(end + 1),
  ];
  if (newLines.length === 0) {
    newLines = [''];
  }

  const targetLine = Math.min(start, newLines.length - 1);
  const nextCursor = moveToFirstNonBlank(newLines, { line: targetLine, col: 0 });
  const filteredCount = end - start + 1;

  return exitCmdMode(
    {
      ...stateWithUndo,
      lines: newLines,
      cursor: clampCursor(newLines, nextCursor, 'NORMAL'),
      lastShellCommand: res.expandedCommand,
    },
    msg('{count}개 줄 필터링 완료 (!{cmd})', { count: filteredCount, cmd: res.expandedCommand }),
    false
  );
}

/**
 * `:[range]r[ead] !{cmd}` — 가상 셸 명령의 표준 출력을 지정 줄 아래에 삽입합니다.
 */
export function executeReadShell(
  state: VimEditorState,
  insertAfterLine: number,
  rawCmd: string
): VimEditorState {
  const res = runShellPipeline(state, rawCmd, []);
  if (!res.ok) {
    return exitCmdMode(state, res.stderr || msg('E484: 셸 명령을 실행할 수 없습니다: {cmd}', { cmd: rawCmd }), true);
  }

  const insertIndex = Math.max(0, Math.min(state.lines.length, insertAfterLine + 1));
  if (res.stdoutLines.length === 0) {
    return exitCmdMode(
      { ...state, lastShellCommand: res.expandedCommand },
      msg('!{cmd} 출력 없음 (0줄 삽입)', { cmd: res.expandedCommand }),
      false
    );
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const newLines = [
    ...state.lines.slice(0, insertIndex),
    ...res.stdoutLines,
    ...state.lines.slice(insertIndex),
  ];
  const targetLine = Math.min(insertIndex, newLines.length - 1);
  const nextCursor = moveToFirstNonBlank(newLines, { line: targetLine, col: 0 });

  return exitCmdMode(
    {
      ...stateWithUndo,
      lines: newLines,
      cursor: clampCursor(newLines, nextCursor, 'NORMAL'),
      lastShellCommand: res.expandedCommand,
    },
    msg('"!{cmd}" {count}줄 읽음', { cmd: res.expandedCommand, count: res.stdoutLines.length }),
    false
  );
}

/**
 * `:[range]w[rite] !{cmd}` — 버퍼(또는 지정 범위) 내용을 stdin 으로 셸 명령에 전달합니다.
 */
export function executeWriteShell(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  rawCmd: string
): VimEditorState {
  const start = Math.max(0, Math.min(range.startLine, state.lines.length - 1));
  const end = Math.max(start, Math.min(range.endLine, state.lines.length - 1));
  const inputSlice = state.lines.slice(start, end + 1);

  const res = runShellPipeline(state, rawCmd, inputSlice);
  if (!res.ok) {
    return exitCmdMode(state, res.stderr || msg('셸 파이프 실패: {cmd}', { cmd: rawCmd }), true);
  }

  const outputPreview = res.stdoutLines.length > 0 ? res.stdoutLines.join(' | ') : msg('(출력 없음, exit {code})', { code: res.exitCode });
  return exitCmdMode(
    { ...state, lastShellCommand: res.expandedCommand },
    outputPreview,
    res.exitCode !== 0
  );
}
