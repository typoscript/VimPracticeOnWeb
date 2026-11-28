/**
 * 실제 Neovim 과 엔진을 무작위 키 시퀀스로 비교하는 퍼저입니다.
 *
 *   npm run fuzz:neovim -- [--cases 1500] [--seed 1] [--profile basic|wide] [--out path.json]
 *
 * `--profile wide` 는 블록 비주얼 I/A/c/r/>, 태그·꺾쇠 객체, gJ·gv·gi·g;, 입력 모드 Ctrl-r/Ctrl-w/Ctrl-u/Ctrl-t/Ctrl-d,
 * :normal 변형, R, xp·ddp, 그리고 케이스마다 옵션 묶음(ai, sol, ww=h,l, nows, sw=4 …, scripts/neovimFuzzWide.ts)을 더합니다.
 * 기본 프로필(basic)은 예전과 같은 난수열을 써서 seed 별 결과가 그대로입니다.
 *
 * 시드 고정 난수로 짧은 Vim 명령 시퀀스를 만들어 `nvim --headless -u NONE` 한 프로세스에서 일괄 실행하고
 * (키는 실제 입력처럼 feedkeys 't'), 같은 시퀀스를 엔진 handleKey 에 넣어 버퍼·커서·무명 레지스터를 비교합니다.
 * 차이는 --out JSON 에 저장합니다. 고친 차이는 scripts/generateGoldenTests.ts 의 골든 케이스로 옮겨
 * CI(nvim 없음)에서도 회귀를 막으세요.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { configureVimEngine, executeCommandLine, handleKey, registerEntryText } from '../src/vim-engine';
import type { VimEditorState } from '../src/vim-engine';
import { WIDE_OPTION_SETS, WIDE_TEXTS, randomWideCommand } from './neovimFuzzWide';
import type { WideContext } from './neovimFuzzWide';

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
// '=' 는 nvim -u NONE 처럼 C 들여쓰기(cindent, src/vim-engine/cindent.ts)로 다시 들여씁니다.
const OPERATORS = ['d', 'c', 'y', '>', '<', '=', 'gU', 'gu', 'g~'];

// 확장 명령 (Ex·입력 모드 편집 키·검색·이름 있는 레지스터·마크·매크로)
const EX_COMMANDS = [
  ':s/a/X/<CR>', ':s/\\w\\+/W/g<CR>', ':%s/e/E/g<CR>', ':2,3d<CR>', ':g/a/d<CR>', ':v/e/d<CR>',
  ':norm A;<CR>', ':%norm I# <CR>', ':m0<CR>', ':t.<CR>', ':2<CR>', ':$<CR>', ':><CR>', ':2,3j<CR>',
  ':%s/\\(\\w\\+\\) \\(\\w\\+\\)/\\2 \\1/<CR>', ':sort<CR>', ':2,$y<CR>', ':1,2>><CR>',
  ':pu<CR>', ':pu!<CR>', ':0pu<CR>', ':pu a<CR>',
];
const INSERT_EDITS = ['foo<C-w>', 'a b c<C-w><C-w>', 'xyz<BS><BS>', 'one two<C-u>', 'q<C-o>0', 'w<C-o>$!'];
const SEARCHES = ['/total<CR>', '/a<CR>', '?e<CR>', '/x\\|y<CR>', '*', '#', '2/a<CR>'];
const INSERT_TEXT = ['X', 'new', 'a b', '(', 'end;'];

function maybeCount(rng: Rng, p = 0.25): string {
  return rng.chance(p) ? String(2 + Math.floor(rng.next() * 3)) : '';
}

// 한 케이스 안에서 앞선 f/t·변경이 있었는지 (없으면 ; , . 가 Neovim 의 이전 케이스 상태를 이어받음)
let sawFind = false;
let sawChange = false;
let sawSearch = false;
let sawMark = false;
let sawMacro = false;
let profile: 'basic' | 'wide' = 'basic';
const wideCtx: WideContext = { sawVisual: false, sawInsert: false, sawChange: false };

function randomExtendedCommand(rng: Rng): string {
  const r = rng.next();
  if (r < 0.25) return rng.pick(EX_COMMANDS);
  if (r < 0.45) return rng.pick(['i', 'a', 'A', 'o', 'I']) + rng.pick(INSERT_EDITS) + '<Esc>';
  if (r < 0.62) {
    if (sawSearch && rng.chance(0.4)) return rng.pick(['n', 'N', '2n']);
    sawSearch = true;
    return rng.pick(SEARCHES);
  }
  if (r < 0.82) {
    if (sawMark && rng.chance(0.4)) return rng.pick(["'a", '`a', "d'a", 'y`a']);
    const cmd = rng.pick(['"ayiw', '"ayy', '"ap', '"aP', '"_dd', '"Ayiw', 'ma', '"ayw"bdw"ap']);
    if (cmd === 'ma') sawMark = true;
    return cmd;
  }
  if (sawMacro && rng.chance(0.5)) return rng.pick(['@a', '2@a']);
  sawMacro = true;
  return rng.pick(['qaxq', 'qaA!<Esc>jq', 'qadwjq', 'qa0~jq']);
}

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
  if (profile === 'wide' && rng.chance(0.35)) {
    wideCtx.sawChange = sawChange;
    return randomWideCommand(rng, wideCtx);
  }
  if (rng.chance(0.3)) return randomExtendedCommand(rng);
  const r = rng.next();
  if (r < 0.28) return maybeCount(rng) + randomMotion(rng);
  if (r < 0.5) {
    const op = rng.pick(OPERATORS);
    const target = rng.chance(0.45) ? rng.pick(TEXT_OBJECTS) : randomMotion(rng);
    const insert = op === 'c' ? rng.pick(INSERT_TEXT) + '<Esc>' : '';
    return maybeCount(rng, 0.15) + op + target + insert;
  }
  if (r < 0.6) {
    const op = rng.pick(['dd', 'yy', 'cc', '>>', '<<', '==', 'gUU', 'guu', 'g~~']);
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
    const action = rng.pick(['d', 'y', 'c', '>', '<', '=', '~', 'U', 'u', 'J', 'r#']);
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
  /** `:set` 인자 (wide 프로필). 엔진과 nvim 에 똑같이 적용합니다. */
  options?: string;
}

function generateCases(count: number, seed: number): FuzzCase[] {
  const rng = new Rng(seed);
  const cases: FuzzCase[] = [];
  const texts = profile === 'wide' ? [...TEXTS, ...WIDE_TEXTS] : TEXTS;
  for (let i = 0; i < count; i++) {
    const text = rng.pick(texts);
    const options = profile === 'wide' && rng.chance(0.5) ? rng.pick(WIDE_OPTION_SETS) : undefined;
    const lines = text.split('\n');
    const row = Math.floor(rng.next() * lines.length);
    const col = Math.floor(rng.next() * Math.max(1, lines[row].length));
    const n = 1 + Math.floor(rng.next() * 4);
    sawFind = false;
    sawChange = false;
    sawSearch = false;
    sawMark = false;
    sawMacro = false;
    Object.assign(wideCtx, { sawVisual: false, sawInsert: false, sawChange: false });
    const id = profile === 'wide' ? `fzw-${seed}-${i}` : `fz-${seed}-${i}`;
    cases.push({ id, text, cursor: { row, col }, commands: Array.from({ length: n }, () => randomCommand(rng)), ...(options ? { options } : {}) });
  }
  return cases;
}

// ---------------------------------------------------------------------------
// 엔진 실행
// ---------------------------------------------------------------------------
import { toEngineKeys } from './neovimFuzzKeys';
import { runNeovimIsolated } from './neovimRunner';

interface Snapshot {
  lines: string[];
  cursor: { row: number; col: number };
  reg: string;
  regType: 'char' | 'line' | 'block';
  error?: string;
  steps?: StepSnapshot[];
}

function runEngine(c: FuzzCase): Snapshot {
  // Neovim 쪽과 같게 '.' 를 아무 일도 하지 않는 i<Esc> 로 시작합니다 (이전 케이스의 변경이 새지 않도록).
  let s: VimEditorState = { lines: c.text.split('\n'), cursor: { line: c.cursor.row, col: c.cursor.col }, mode: 'NORMAL', lastChangeKeys: ['i', 'Escape'] };
  const steps: StepSnapshot[] = [];
  try {
    if (c.options) s = { ...executeCommandLine(s, `set ${c.options}`, handleKey), commandMessage: undefined };
    for (const cmd of c.commands) {
      for (const k of toEngineKeys(cmd)) s = handleKey(s, k);
      // 생성기가 [count] 뒤에 0 모션을 붙이면 '20' 처럼 count 만 남는데, Neovim 은 feedkeys('x') 가 끝날 때 남은 count 를 버립니다.
      if (s.mode === 'NORMAL' && s.pendingKeys && /^[1-9][0-9]*$/.test(s.pendingKeys)) s = { ...s, pendingKeys: undefined };
      // Neovim 쪽과 같게, 명령이 끝났는데 NORMAL 이 아니면 Esc 를 누릅니다.
      if (s.mode !== 'NORMAL') s = handleKey(s, 'Escape');
      steps.push({ lines: s.lines, cursor: { row: s.cursor.line, col: s.cursor.col }, reg: regText(s) });
    }
  } catch (e) {
    return { lines: [], cursor: { row: -1, col: -1 }, reg: '', regType: 'char', error: String(e) };
  }
  const entry = s.registers?.['"'];
  const type = entry?.type === 'line' ? 'line' : entry?.type === 'block' ? 'block' : 'char';
  return { lines: s.lines, cursor: { row: s.cursor.line, col: s.cursor.col }, reg: regText(s), regType: entry ? type : 'char', steps };
}

/** Neovim 의 줄 단위 레지스터는 끝에 줄바꿈이 붙습니다. 녹화한 매크로는 Vim 처럼 실제 키 바이트(ESC = \x1b)로 비교합니다. */
function regText(s: VimEditorState): string {
  const entry = s.registers?.['"'];
  return entry ? registerEntryText(entry) + (entry.type === 'line' ? '\n' : '') : '';
}

interface StepSnapshot {
  lines: string[];
  cursor: { row: number; col: number };
  reg: string;
}

/** 처음으로 상태가 달라진 명령의 번호 (없으면 -1). */
function firstDivergence(a: StepSnapshot[] = [], b: StepSnapshot[] = []): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (JSON.stringify(a[i].lines) !== JSON.stringify(b[i].lines) || a[i].cursor.row !== b[i].cursor.row || a[i].cursor.col !== b[i].cursor.col || a[i].reg !== b[i].reg) return i;
  }
  return -1;
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
  if c.options then vim.cmd("set " .. c.options) end
  -- '.' 는 지울 수 없으므로 아무 일도 하지 않는 i<Esc> 로 맞춥니다 (엔진도 같게 시작).
  vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("i<Esc>", true, false, true), "ntx", false)
  -- 텍스트를 넣는 동작이 실행 취소 기록에 남지 않게 합니다.
  vim.bo.undolevels = -1
  -- keepjumps: 텍스트를 넣은 것이 변경 목록(g;)·'. 마크에 남지 않게 합니다.
  _G.fuzz_lines = vim.split(c.text, "\\n", { plain = true })
  vim.cmd("keepjumps lua vim.api.nvim_buf_set_lines(0, 0, -1, false, _G.fuzz_lines)")
  vim.bo.undolevels = 1000
  -- 레지스터는 비우지 않습니다: 케이스마다 새 nvim 이라 '한 번도 안 쓴' 상태이고, setreg('') 는 '빈 값으로 설정됨'이 되어 엔진과 달라집니다.
  vim.fn.histdel("search")
  vim.api.nvim_win_set_cursor(0, { c.cursor.row + 1, c.cursor.col })
  local steps = {}
  local function snap()
    local cur = vim.api.nvim_win_get_cursor(0)
    return { lines = vim.api.nvim_buf_get_lines(0, 0, -1, false), cursor = { row = cur[1] - 1, col = cur[2] }, reg = vim.fn.getreg('"') }
  end
  local ok, err = pcall(function()
    for _, cmd in ipairs(c.commands) do
      vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(cmd, true, false, true), "ntx", false)
      if vim.fn.mode() ~= "n" then
        vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("<Esc>", true, false, true), "ntx", false)
      end
      table.insert(steps, snap())
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
    steps = steps,
  })
end
local f = io.open(_G.arg[2], "w"); f:write(vim.json.encode(results)); f:close()
os.exit(0)
`;

async function runNeovim(cases: FuzzCase[]): Promise<Map<string, Snapshot>> {
  // 케이스마다 새 nvim 프로세스 (이전 케이스의 레지스터·반복 상태가 새지 않게, scripts/neovimRunner.ts)
  const out = await runNeovimIsolated<FuzzCase, Snapshot & { id: string }>(LUA, cases);
  return new Map(out.map((r) => [r.id, r]));
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (name: string, def: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : def;
  };
  const count = Number(opt('cases', '1500'));
  const seed = Number(opt('seed', '1'));
  profile = opt('profile', 'basic') === 'wide' ? 'wide' : 'basic';
  const outPath = opt('out', path.join(os.tmpdir(), `neovim-fuzz-${profile === 'wide' ? 'wide-' : ''}${seed}.json`));

  const cases = generateCases(count, seed);
  const nvim = await runNeovim(cases);
  const mismatches = [];
  for (const c of cases) {
    const expected = nvim.get(c.id);
    if (!expected || expected.error) continue; // Neovim 쪽 오류(드묾)는 비교하지 않음
    const actual = runEngine(c);
    const kinds = diffKinds(actual, expected);
    if (kinds.length > 0) {
      const at = firstDivergence(actual.steps, expected.steps);
      const before = at > 0 ? expected.steps?.[at - 1] : { lines: c.text.split('\n'), cursor: c.cursor, reg: '' };
      mismatches.push({
        ...c,
        keys: c.commands.join(''),
        kinds,
        // 처음 달라진 명령과 그 직전 상태 — 이 명령 하나만으로 재현됩니다.
        culprit: at >= 0 ? { command: c.commands[at], before, expected: expected.steps?.[at], actual: actual.steps?.[at] } : null,
        expected: { ...expected, steps: undefined },
        actual: { ...actual, steps: undefined },
      });
    }
  }
  // 짧은 재현부터 보기 좋게 정렬
  mismatches.sort((a, b) => a.keys.length - b.keys.length);
  fs.writeFileSync(outPath, JSON.stringify(mismatches, null, 2));
  const byKind: Record<string, number> = {};
  for (const m of mismatches) for (const k of m.kinds) byKind[k] = (byKind[k] ?? 0) + 1;
  console.log(`[neovim-fuzz] profile=${profile} seed=${seed} cases=${cases.length} mismatches=${mismatches.length} ${JSON.stringify(byKind)}`);
  console.log(`[neovim-fuzz] details: ${outPath}`);
}

void main();
