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
  // 커서 규칙: 비주얼 연산·줄 단위 대소문자·복사·Ex 명령 뒤
  { id: 'visual-u-cursor-start', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 12 }, keys: 'VjU' },
  { id: 'visual-shift-keeps-col', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 1 }, keys: 'Vw>' },
  { id: 'visual-yank-col0', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 7 }, keys: 'Vjy' },
  { id: 'guu-first-nonblank', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 6 }, keys: 'guu' },
  { id: 'count-guu-keeps-col', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 6 }, keys: '2guu' },
  { id: 'case-op-undo-cursor', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 8 }, keys: 'vt g~u' },
  { id: 'yiw-cursor-start', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 12 }, keys: 'yiw' },
  { id: 'yaw-cursor-start', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 12 }, keys: 'yaw' },
  // [count]J, 문장 count 초과
  { id: 'count-J-joins-count-lines', text: 'a\nb\nc\nd\ne', cursor: { row: 0, col: 0 }, keys: '3J' },
  { id: 'count-J-past-end', text: 'a\nb\nc', cursor: { row: 0, col: 0 }, keys: '5J' },
  { id: 'sentence-count-overflow', text: 'One. Two. Three.', cursor: { row: 0, col: 5 }, keys: '5)' },
  { id: 'sentence-count-ok', text: 'One. Two. Three.', cursor: { row: 0, col: 10 }, keys: '2(' },
  // Ex 명령
  { id: 'g-delete-register', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 5 }, keys: ':g/a/d<CR>' },
  { id: 'v-delete-register', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 5 }, keys: ':v/e/d<CR>' },
  { id: 'sort-byte-order', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 0 }, keys: ':sort<CR>gg' },
  { id: 's-cursor-first-nonblank', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 9 }, keys: ':s/a/X/<CR>' },
  { id: 'percent-s-cursor-last-line', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 9 }, keys: ':%s/e/E/g<CR>' },
  { id: 't-keeps-col', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 9 }, keys: ':t.<CR>' },
  { id: 'm-keeps-col', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 3 }, keys: ':m$<CR>' },
  // 입력 모드 Ctrl-u / Ctrl-w 는 입력 시작에서 한 번 멈춤
  { id: 'insert-ctrl-u-stops-at-start', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 4 }, keys: 'A one two<C-u><Esc>' },
  { id: 'insert-ctrl-u-twice', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 4 }, keys: 'A one two<C-u><C-u><Esc>' },
  { id: 'insert-ctrl-w-twice', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 10 }, keys: 'afoo<C-w><C-w><Esc>' },
  // 검색: 커서 다음부터, [count]
  { id: 'search-skips-cursor-match', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 0 }, keys: '/a<CR>' },
  { id: 'search-count', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 0 }, keys: '2/a<CR>' },
  { id: 'search-count-lines', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 0 }, keys: '3/e<CR>' },
  // curswant: 세로 이동은 처음 열을 기억, $ 는 줄 끝을 기억, 다른 명령은 다시 정함
  { id: 'curswant-jjj', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: 'jjj' },
  { id: 'curswant-jjjk', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: 'jjjk' },
  { id: 'curswant-dollar', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: '$jjj' },
  { id: 'curswant-G', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: 'jG' },
  { id: 'curswant-gg', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 5, col: 12 }, keys: 'kkkgg' },
  { id: 'curswant-failed-l-keeps', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: 'jljjj' },
  { id: 'curswant-x-resets', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: 'jxjj' },
  { id: 'curswant-zz-keeps', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: 'jzzjj' },
  // 카운트가 붙은 줄 명령, 레지스터, P
  { id: 'count-dd-partial', text: 'a1 b1\n  a2 b2\na3 b3\na4 b4\na5 b5', cursor: { row: 3, col: 0 }, keys: '3dd' },
  { id: 'count-D-linewise', text: 'a1 b1\n  a2 b2\na3 b3\na4 b4\na5 b5', cursor: { row: 0, col: 0 }, keys: '3D' },
  { id: 'count-D-charwise', text: 'a1 b1\n  a2 b2\na3 b3\na4 b4\na5 b5', cursor: { row: 0, col: 3 }, keys: '3D' },
  { id: 'count-C-last-line-fails', text: 'a1 b1\n  a2 b2\na3 b3\na4 b4\na5 b5', cursor: { row: 4, col: 0 }, keys: '3CX<Esc>' },
  { id: 'count-cc-last-line-fails', text: 'a1 b1\n  a2 b2\na3 b3\na4 b4\na5 b5', cursor: { row: 4, col: 0 }, keys: '2ccX<Esc>' },
  { id: 'register-append-unnamed', text: 'a1 b1\n  a2 b2\na3 b3\na4 b4\na5 b5', cursor: { row: 0, col: 0 }, keys: '"ayiw"Ayiw' },
  { id: 'P-cursor-last-char', text: 'ab cd ef', cursor: { row: 0, col: 0 }, keys: 'yiwP' },
  { id: 'P-count-cursor', text: 'ab cd ef', cursor: { row: 0, col: 0 }, keys: 'yiw2P' },
  // F / T 는 배타적, y 후 커서는 범위 시작
  { id: 'yF-exclusive', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'yF(' },
  { id: 'yT-exclusive', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'yTo' },
  { id: 'dF-exclusive', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'dF(' },
  { id: 'dT-exclusive', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'dTg' },
  { id: 'y0-cursor', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'y0' },
  { id: 'gU-g-underscore', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'gUg_' },
  { id: 'gU-ge', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'gUge' },
  { id: 'g-delete-cursor-first-nonblank', text: '  keep\nzap a\n    stay here', cursor: { row: 0, col: 3 }, keys: ':g/a/d<CR>' },
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
