/**
 * 실제 Neovim 과 엔진을 무작위 키 시퀀스로 비교하는 퍼저입니다.
 *
 *   npm run fuzz:neovim -- [--cases 1500] [--seed 1] [--out path.json]
 *
 * 시드 고정 난수로 짧은 Vim 명령 시퀀스를 만들어 `nvim --headless -u NONE` 한 프로세스에서 일괄 실행하고
 * (키는 실제 입력처럼 feedkeys 't'), 같은 시퀀스를 엔진 handleKey 에 넣어 버퍼·커서·무명 레지스터를 비교합니다.
 * 차이는 --out JSON 에 저장합니다. 고친 차이는 scripts/generateGoldenTests.ts 의 골든 케이스로 옮겨
 * CI(nvim 없음)에서도 회귀를 막으세요.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { configureVimEngine, handleKey } from '../src/vim-engine';
import type { VimEditorState } from '../src/vim-engine';

configureVimEngine({ devChecks: false, locale: 'en' });

// ---------------------------------------------------------------------------
// 난수 & 시퀀스 생성
// ---------------------------------------------------------------------------
class Rng {
  constructor(private state: number) {}
  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

const TEXTS: readonly string[] = [
  'const total = sum(a, b) + 42;\nif (total > 10) {\n  log("big", total);\n}\nreturn total;',
  'function greet(name) {\n  return "Hello, " + name;\n}\n\nconst x = [1, 2, 3];',
  'The quick brown fox. It jumps over\nthe lazy dog! Then it rests.\n\nAnother paragraph here.',
  '  indented line one\n    deeper (nested) item\n  back to one\nlast_word_here end',
  'alpha beta gamma\nfoo.bar(baz, "qux")\n{ key: \'value\', n: 7 }\n',
  '<div class="a"><span>text</span></div>\nplain 0x1f 007 -3 words',
];

const MOTIONS = ['h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E', 'ge', '0', '^', '$', 'g_', 'gg', 'G', '{', '}', '(', ')', '%', '+', '-', '|'];
// H/L/M·스크롤은 창 높이에 따라 달라 비교하지 않습니다 (headless nvim 창은 2줄).
const FIND_CHARS = ['a', 'e', 'o', 't', '(', ')', '"', ',', '.', ' ', '{', '}', 'x'];
const TEXT_OBJECTS = ['iw', 'aw', 'iW', 'aW', 'i"', 'a"', "i'", "a'", 'i(', 'a(', 'ib', 'i{', 'a{', 'iB', 'i[', 'a[', 'i<', 'a<', 'it', 'at', 'ip', 'ap', 'is', 'as'];
const OPERATORS = ['d', 'c', 'y', '>', '<', 'gU', 'gu', 'g~', '='];
const INSERT_TEXT = ['X', 'new', 'a b', '(', 'end;'];

function maybeCount(rng: Rng, p = 0.25): string {
  return rng.chance(p) ? String(2 + Math.floor(rng.next() * 3)) : '';
}

// 한 케이스 안에서 앞선 f/t·변경이 있었는지 (없으면 ; , . 가 Neovim 의 이전 케이스 상태를 이어받음)
let sawFind = false;
let sawChange = false;

function randomMotion(rng: Rng): string {
  if (rng.chance(0.2)) {
    sawFind = true;
    return rng.pick(['f', 't', 'F', 'T']) + rng.pick(FIND_CHARS);
  }
  if (sawFind && rng.chance(0.05)) return rng.pick([';', ',']);
  return rng.pick(MOTIONS);
}

/** 한 개의 완결된 Vim 명령 (Neovim 표기, 끝나면 NORMAL 모드). */
function randomCommand(rng: Rng): string {
  const cmd = randomCommandRaw(rng);
  if (!/^[0-9]*[hjklwbeWBE0^$|{}()%+-]$|^[0-9]*(ge|g_|gg|G)$|^[0-9]*[fFtT].$|^[;,]$|^u$|^<C-r>$/.test(cmd)) sawChange = true;
  return cmd;
}

function randomCommandRaw(rng: Rng): string {
  const r = rng.next();
  if (r < 0.28) return maybeCount(rng) + randomMotion(rng);
  if (r < 0.5) {
    const op = rng.pick(OPERATORS);
    const target = rng.chance(0.45) ? rng.pick(TEXT_OBJECTS) : randomMotion(rng);
    const insert = op === 'c' ? rng.pick(INSERT_TEXT) + '<Esc>' : '';
    return maybeCount(rng, 0.15) + op + target + insert;
  }
  if (r < 0.6) {
    const op = rng.pick(['dd', 'yy', 'cc', '>>', '<<', 'gUU', 'guu', 'g~~', '==']);
    const insert = op === 'cc' ? rng.pick(INSERT_TEXT) + '<Esc>' : '';
    return maybeCount(rng, 0.2) + op + insert;
  }
  if (r < 0.72) {
    const cmd = rng.pick(['x', 'X', 'J', 'gJ', '~', 'p', 'P', 'D', 'Y', 'r_', 's', 'S', 'C', '<C-a>', '<C-x>']);
    const insert = ['s', 'S', 'C'].includes(cmd) ? rng.pick(INSERT_TEXT) + '<Esc>' : '';
    return maybeCount(rng, 0.2) + cmd + insert;
  }
  if (r < 0.82) {
    return rng.pick(['i', 'a', 'I', 'A', 'o', 'O']) + rng.pick(INSERT_TEXT) + '<Esc>';
  }
  if (r < 0.92) {
    const vmode = rng.pick(['v', 'V', '<C-v>']);
    const moves = Array.from({ length: 1 + Math.floor(rng.next() * 2) }, () => randomMotion(rng)).join('');
    const action = rng.pick(['d', 'y', 'c', '>', '<', '~', 'U', 'u', 'J', 'r#']);
    const insert = action === 'c' ? rng.pick(INSERT_TEXT) + '<Esc>' : '';
    return vmode + moves + action + insert;
  }
  return sawChange ? rng.pick(['.', 'u', '<C-r>', 'u', '.']) : rng.pick(['u', '<C-r>']);
}

interface FuzzCase {
  id: string;
  text: string;
  cursor: { row: number; col: number };
  commands: string[];
}

function generateCases(count: number, seed: number): FuzzCase[] {
  const rng = new Rng(seed);
  const cases: FuzzCase[] = [];
  for (let i = 0; i < count; i++) {
    const text = rng.pick(TEXTS);
    const lines = text.split('\n');
    const row = Math.floor(rng.next() * lines.length);
    const col = Math.floor(rng.next() * Math.max(1, lines[row].length));
    const n = 1 + Math.floor(rng.next() * 4);
    sawFind = false;
    sawChange = false;
    cases.push({ id: `fz-${seed}-${i}`, text, cursor: { row, col }, commands: Array.from({ length: n }, () => randomCommand(rng)) });
  }
  return cases;
}

// ---------------------------------------------------------------------------
// 엔진 실행
// ---------------------------------------------------------------------------
import { toEngineKeys } from './neovimFuzzKeys';

interface Snapshot {
  lines: string[];
  cursor: { row: number; col: number };
  reg: string;
  regType: 'char' | 'line' | 'block';
  error?: string;
}

function runEngine(c: FuzzCase): Snapshot {
  let s: VimEditorState = { lines: c.text.split('\n'), cursor: { line: c.cursor.row, col: c.cursor.col }, mode: 'NORMAL' };
  try {
    for (const cmd of c.commands) for (const k of toEngineKeys(cmd)) s = handleKey(s, k);
  } catch (e) {
    return { lines: [], cursor: { row: -1, col: -1 }, reg: '', regType: 'char', error: String(e) };
  }
  const entry = s.registers?.['"'];
  const type = entry?.type === 'line' ? 'line' : entry?.type === 'block' ? 'block' : 'char';
  // Neovim 의 줄 단위 레지스터는 끝에 줄바꿈이 붙습니다.
  const reg = entry ? String(entry.content ?? '') + (type === 'line' ? '\n' : '') : '';
  return { lines: s.lines, cursor: { row: s.cursor.line, col: s.cursor.col }, reg, regType: entry ? type : 'char' };
}

// ---------------------------------------------------------------------------
// Neovim 실행 (한 프로세스에서 일괄)
// ---------------------------------------------------------------------------
const LUA = `
local cases = vim.json.decode(io.open(_G.arg[1]):read("*a"))
-- 엔진 기본 옵션(setOptionsCore.ts)과 맞춥니다. 의도한 기본값 차이는 비교 대상이 아닙니다.
vim.cmd("set tabstop=2 shiftwidth=2 expandtab noautoindent nosmartindent nosmarttab nostartofline nrformats=bin,hex")
local results = {}
for _, c in ipairs(cases) do
  vim.cmd("enew!")
  -- 텍스트를 넣는 동작이 실행 취소 기록에 남지 않게 합니다.
  vim.bo.undolevels = -1
  vim.api.nvim_buf_set_lines(0, 0, -1, false, vim.split(c.text, "\\n", { plain = true }))
  vim.bo.undolevels = 1000
  for _, r in ipairs({ '"', '0', '1', '2', '3', '-', '/' }) do vim.fn.setreg(r, '') end
  vim.api.nvim_win_set_cursor(0, { c.cursor.row + 1, c.cursor.col })
  local ok, err = pcall(function()
    for _, cmd in ipairs(c.commands) do
      vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(cmd, true, false, true), "ntx", false)
      if vim.fn.mode() ~= "n" then
        vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("<Esc>", true, false, true), "ntx", false)
      end
    end
  end)
  local cur = vim.api.nvim_win_get_cursor(0)
  table.insert(results, {
    id = c.id,
    lines = vim.api.nvim_buf_get_lines(0, 0, -1, false),
    cursor = { row = cur[1] - 1, col = cur[2] },
    reg = vim.fn.getreg('"'),
    regType = (function() local t = vim.fn.getregtype('"'); if t == "V" then return "line" elseif t:sub(1, 1) == "\\22" then return "block" else return "char" end end)(),
    error = (not ok) and tostring(err) or nil,
  })
end
local f = io.open(_G.arg[2], "w"); f:write(vim.json.encode(results)); f:close()
os.exit(0)
`;

function runNeovim(cases: FuzzCase[]): Map<string, Snapshot> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nvimfuzz-'));
  const inFile = path.join(dir, 'in.json');
  const outFile = path.join(dir, 'out.json');
  const lua = path.join(dir, 'run.lua');
  fs.writeFileSync(inFile, JSON.stringify(cases));
  fs.writeFileSync(lua, LUA);
  try {
    execFileSync(process.env.NVIM_PATH ?? 'nvim', ['--headless', '-u', 'NONE', '-i', 'NONE', '-l', lua, inFile, outFile], {
      stdio: ['ignore', 'inherit', 'inherit'],
      maxBuffer: 1 << 28,
    });
    const out: Array<Snapshot & { id: string }> = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    return new Map(out.map((r) => [r.id, r]));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 비교
// ---------------------------------------------------------------------------
function diffKinds(a: Snapshot, b: Snapshot): string[] {
  const kinds: string[] = [];
  if (a.error) kinds.push('engine-error');
  if (JSON.stringify(a.lines) !== JSON.stringify(b.lines)) kinds.push('lines');
  if (a.cursor.row !== b.cursor.row || a.cursor.col !== b.cursor.col) kinds.push('cursor');
  if (a.reg !== b.reg || (a.reg !== '' && a.regType !== b.regType)) kinds.push('register');
  return kinds;
}

function main(): void {
  const args = process.argv.slice(2);
  const opt = (name: string, def: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : def;
  };
  const count = Number(opt('cases', '1500'));
  const seed = Number(opt('seed', '1'));
  const outPath = opt('out', path.join(os.tmpdir(), `neovim-fuzz-${seed}.json`));

  const cases = generateCases(count, seed);
  const nvim = runNeovim(cases);
  const mismatches = [];
  for (const c of cases) {
    const expected = nvim.get(c.id);
    if (!expected || expected.error) continue; // Neovim 쪽 오류(드묾)는 비교하지 않음
    const actual = runEngine(c);
    const kinds = diffKinds(actual, expected);
    if (kinds.length > 0) mismatches.push({ ...c, keys: c.commands.join(''), kinds, expected, actual });
  }
  // 짧은 재현부터 보기 좋게 정렬
  mismatches.sort((a, b) => a.keys.length - b.keys.length);
  fs.writeFileSync(outPath, JSON.stringify(mismatches, null, 2));
  const byKind: Record<string, number> = {};
  for (const m of mismatches) for (const k of m.kinds) byKind[k] = (byKind[k] ?? 0) + 1;
  console.log(`[neovim-fuzz] seed=${seed} cases=${cases.length} mismatches=${mismatches.length} ${JSON.stringify(byKind)}`);
  console.log(`[neovim-fuzz] details: ${outPath}`);
}

main();
