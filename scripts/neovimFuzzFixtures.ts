/**
 * Neovim 비교 퍼저로 찾아 고친 차이를 실제 Neovim 결과로 고정합니다.
 *
 *   npx tsx scripts/neovimFuzzFixtures.ts
 *
 * 아래 CASES 를 `nvim --headless -u NONE` (엔진 기본 옵션: ts=2 sw=2 et noai nosol) 에서 실행해
 * test/fixtures/neovim-fuzz-findings.json 으로 저장합니다. test/neovimFuzzFindings.test.ts 가 nvim 없이 이 값과 비교합니다.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

interface Case {
  id: string;
  text: string;
  cursor: { row: number; col: number };
  keys: string;
}

const T1 = 'const total = sum(a, b) + 42;\nif (total > 10) {\n  log("big", total);\n}\nreturn total;';
const T2 = 'alpha beta gamma\nfoo.bar(baz, "qux")\n{ key: \'value\', n: 7 }\n';
const T3 = '  indented line one\n    deeper (nested) item\n  back to one\nlast_word_here end';
const T4 = 'ab cd\nef\n\ngh';
const T5 = '  ab cd\nef\n\ngh';
const T6 = 'a\n  \nb\n\nc';
const T7 = 'a b\nc d\ne f\ng h';

const CASES: Case[] = [
  // >> / << / >{motion}: nostartofline 이면 열을 유지
  { id: 'shift-keeps-col', text: T1, cursor: { row: 2, col: 7 }, keys: '>>' },
  { id: 'shift-left-keeps-col', text: T3, cursor: { row: 1, col: 18 }, keys: '<<' },
  { id: 'shift-motion-keeps-col', text: T1, cursor: { row: 0, col: 16 }, keys: '>}' },
  { id: 'shift-up-top-line', text: T1, cursor: { row: 2, col: 0 }, keys: '>k' },
  { id: 'shift-left-clamps', text: T3, cursor: { row: 2, col: 11 }, keys: '<0' },
  // { } : count 초과는 실패, 공백만 있는 줄은 경계가 아님
  { id: 'para-count-overflow-back', text: T3, cursor: { row: 2, col: 8 }, keys: '3{' },
  { id: 'para-count-overflow-fwd', text: T7, cursor: { row: 1, col: 0 }, keys: '4}' },
  { id: 'para-whitespace-not-boundary', text: T6, cursor: { row: 0, col: 0 }, keys: '}' },
  { id: 'para-back-whitespace', text: T6, cursor: { row: 2, col: 0 }, keys: '{' },
  // d} / y} / c} : 배타적 모션이 다음 줄 첫 칸에서 끝나는 규칙
  { id: 'd-para-charwise', text: T4, cursor: { row: 0, col: 3 }, keys: 'd}' },
  { id: 'd-para-linewise-at-indent', text: T5, cursor: { row: 0, col: 2 }, keys: 'd}' },
  { id: 'y-para-charwise', text: T4, cursor: { row: 0, col: 3 }, keys: 'y}' },
  { id: 'c-para-charwise', text: T4, cursor: { row: 0, col: 3 }, keys: 'c}X<Esc>' },
  { id: 'd-para-to-end', text: 'ab\ncd', cursor: { row: 0, col: 0 }, keys: 'd}' },
  { id: 'd-para-back-mid', text: 'ab\n\ncd ef\ngh', cursor: { row: 3, col: 1 }, keys: 'd{' },
  { id: 'd-para-end-not-col0', text: T2, cursor: { row: 2, col: 19 }, keys: 'd}' },
  // :help ]] — 연산자와 함께면 열 0 의 } 아래에서 멈춤, 줄 단위 삭제 규칙(op_delete)
  { id: 'd-section-stops-below-brace', text: '{\n  a\n}\n\n{\n  b\n}', cursor: { row: 0, col: 0 }, keys: 'd]]' },
  { id: 'd-para-whole-lines-linewise', text: 'ab\ncd', cursor: { row: 0, col: 0 }, keys: 'd}' },
  // 줄 단위 삭제 후 열 유지 (nostartofline)
  { id: 'dG-keeps-col', text: T3, cursor: { row: 1, col: 9 }, keys: 'dG' },
  { id: 'dk-keeps-col', text: T3, cursor: { row: 1, col: 9 }, keys: 'dk' },
  { id: 'dgg-keeps-col', text: T3, cursor: { row: 1, col: 9 }, keys: 'dgg' },
  // 대소문자 연산자: 범위·실패
  { id: 'gU-caret-exclusive', text: 'Another paragraph here.', cursor: { row: 0, col: 1 }, keys: 'gU^' },
  { id: 'gU-find-fails', text: 'abc def', cursor: { row: 0, col: 1 }, keys: 'gUfx' },
  { id: 'gu-till-back-fails', text: 'abc def', cursor: { row: 0, col: 5 }, keys: 'guTo' },
  { id: 'gU-find', text: 'abc def', cursor: { row: 0, col: 0 }, keys: 'gUfe' },
  { id: 'gu-brace-to-start', text: T3, cursor: { row: 3, col: 6 }, keys: 'gu{' },
  { id: 'gU-percent', text: T2, cursor: { row: 1, col: 7 }, keys: 'gU%' },
  // 없는 텍스트 객체는 실패 (INSERT 로 들어가지 않음), 빈 줄의 ciw 는 성공
  { id: 'ca-paren-missing', text: 'plain 0x1f 007', cursor: { row: 0, col: 4 }, keys: 'ca(new<Esc>' },
  { id: 'ci-quote-missing', text: 'plain 0x1f 007', cursor: { row: 0, col: 4 }, keys: 'ci"new<Esc>' },
  { id: 'ciw-empty-line', text: '', cursor: { row: 0, col: 0 }, keys: 'ciwbar<Esc>' },
  // {count}d$ / c$ / y$, 마지막 줄의 {count}dd / yy
  { id: 'count-d-dollar', text: T7, cursor: { row: 0, col: 2 }, keys: '3d$' },
  { id: 'count-c-dollar', text: T7, cursor: { row: 0, col: 2 }, keys: '3c$X<Esc>' },
  { id: 'count-y-dollar', text: T7, cursor: { row: 0, col: 2 }, keys: '2y$' },
  { id: 'count-dd-last-line', text: 'a b\nc d', cursor: { row: 1, col: 0 }, keys: '2dd' },
  { id: 'count-yy-last-line', text: 'a b\nc d', cursor: { row: 1, col: 0 }, keys: '4yy' },
  // Insert Ctrl-r 로 줄 단위 레지스터를 넣으면 줄바꿈까지 들어감
  { id: 'insert-ctrl-r-linewise-O', text: 'one\ntwo', cursor: { row: 0, col: 0 }, keys: '"ayyO<C-r>a<Esc>' },
  { id: 'insert-ctrl-r-linewise-A', text: 'one\ntwo', cursor: { row: 1, col: 1 }, keys: '"ayyjA <C-r>a<Esc>' },
  { id: 'insert-ctrl-r-linewise-then-type', text: 'one\ntwo', cursor: { row: 0, col: 0 }, keys: 'yyjO<C-r>"X<Esc>' },
];

const LUA = `
local cases = vim.json.decode(io.open(_G.arg[1]):read("*a"))
vim.cmd("set tabstop=2 shiftwidth=2 expandtab noautoindent nosmartindent nosmarttab nostartofline nrformats=bin,hex")
local out = {}
for _, c in ipairs(cases) do
  vim.cmd("enew!")
  vim.bo.undolevels = -1
  vim.api.nvim_buf_set_lines(0, 0, -1, false, vim.split(c.text, "\\n", { plain = true }))
  vim.bo.undolevels = 1000
  for _, r in ipairs({ '"', '0', '1', '-' }) do vim.fn.setreg(r, '') end
  vim.api.nvim_win_set_cursor(0, { c.cursor.row + 1, c.cursor.col })
  vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(c.keys, true, false, true), "ntx", false)
  local cur = vim.api.nvim_win_get_cursor(0)
  local t = vim.fn.getregtype('"')
  table.insert(out, {
    id = c.id, text = c.text, cursor = c.cursor, keys = c.keys,
    expected = {
      lines = vim.api.nvim_buf_get_lines(0, 0, -1, false),
      cursor = { row = cur[1] - 1, col = cur[2] },
      reg = vim.fn.getreg('"'),
      regType = t == "V" and "line" or (t:sub(1, 1) == "\\22" and "block" or "char"),
      mode = vim.fn.mode(),
    },
  })
end
local f = io.open(_G.arg[2], "w"); f:write(vim.json.encode(out)); f:close()
os.exit(0)
`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nvimfix-'));
const inFile = path.join(dir, 'in.json');
const outFile = path.join(dir, 'out.json');
const lua = path.join(dir, 'run.lua');
fs.writeFileSync(inFile, JSON.stringify(CASES));
fs.writeFileSync(lua, LUA);
execFileSync(process.env.NVIM_PATH ?? 'nvim', ['--headless', '-u', 'NONE', '-i', 'NONE', '-l', lua, inFile, outFile], { stdio: 'inherit' });
const results = JSON.parse(fs.readFileSync(outFile, 'utf8'));
fs.rmSync(dir, { recursive: true, force: true });
const target = path.resolve('test/fixtures/neovim-fuzz-findings.json');
fs.writeFileSync(target, JSON.stringify(results, null, 2) + '\n');
console.log(`[neovim-fuzz-fixtures] ${results.length} cases -> ${target}`);
