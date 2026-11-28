/**
 * `=` (C 들여쓰기, src/vim-engine/cindent.ts) 를 실제 Neovim 결과로 고정합니다.
 *
 *   npm run fixtures:neovim-cindent
 *
 * 아래 SNIPPETS 와 시드 고정 난수로 만든 코드 조각마다 `nvim --headless -u NONE` (엔진 기본 옵션 ts=2 sw=2 et)
 * 에서 `gg=G` 를 실행해 test/fixtures/neovim-cindent-cases.json 으로 저장합니다.
 * test/cindentNeovim.test.ts 가 nvim 없이 이 값과 엔진을 비교합니다.
 */
import { runNeovimIsolated } from './neovimRunner';
import fs from 'fs';
import path from 'path';

interface Case {
  id: string;
  lines: string[];
}

// 손으로 고른 사례: 중괄호, 괄호 안 인자, 이어지는 줄, if 한 줄 본문, switch/case, 주석, 문자열 속 괄호,
// 레이블, else, 객체/배열 리터럴, 탭 들여쓰기, 최상위 함수 선언 등.
const SNIPPETS: Record<string, string> = {
  'jsx-paren': 'function App() {\nconst title = "Vim";\nreturn (\n<button>Click Me</button>\n);\n}',
  'if-else-braces': 'function f(a, b) {\nif (a) {\nreturn b;\n} else {\nreturn a;\n}\n}',
  'if-no-brace-top': 'if (x)\ny();\nz();',
  'if-no-brace-in-fn': 'function g() {\nif (x)\ny();\nz();\nwhile (a)\nb();\nfor (;;)\nc();\n}',
  'call-args': 'function h() {\nfoo(a,\nb,\nc);\nbar();\n}',
  'continuation': 'function h() {\nconst total = sum(a, b) +\n42;\nnext();\n}',
  'switch-case': 'switch (x) {\ncase 1:\na();\nbreak;\ncase 2: {\nb();\n}\ndefault:\nc();\n}',
  'switch-in-fn': "function s(x) {\nswitch (x) {\ncase 'a':\nreturn 1;\ndefault:\nreturn 2;\n}\n}",
  'comments': '// comment one\n// comment two\nint main() {\n// inner\n/* block\ncomment\n*/\n/*\n* star\n*/\nreturn 0;\n}',
  'object-literal': 'const o = {\na: 1,\nb: 2,\n};',
  'array-literal': 'const arr = [\n1,\n2,\n3,\n];',
  'nested-object': 'function k() {\nconst o = {\na: 1,\nb: { c: 2 },\n};\nreturn o;\n}',
  'string-brace': 'function m() {\nconst s = "{ not a brace";\nx();\n}',
  'label': 'label:\nfor (;;) {\nx();\n}',
  'do-while': 'function n() {\ndo {\nx();\n} while (y);\nz();\n}',
  'callback-in-call': 'foo(function() {\nx();\n});',
  'promise-chain': 'promise.then((r) => {\nlog(r);\n}).catch((e) => {\nerr(e);\n});',
  'class': 'class A {\nconstructor() {\nthis.x = 1;\n}\nmethod() {\nreturn this.x;\n}\n}',
  'tabs': '\tfunction tabbed() {\n\t\tif (a) {\n\t\t\t\tb();\n\t\t}\n\t}',
  'else-one-line': 'function e() {\nif (a) b();\nelse c();\nd();\n}',
  'ternary': 'function ternary() {\nconst v = cond ?\none :\ntwo;\nnext();\n}',
  'top-level-mix': 'const total = sum(a, b) + 42;\nif (total > 10) {\nlog("big", total);\n}\nreturn total;',
  'funcdecl-next-line': 'x = 1\nfoo()\nbar;',
  'decl-comma': 'int a,\nb;\nc;',
  'kr-params': 'void f()\nint a;\n{\n}',
  'multiline-condition': 'function q() {\nif (a &&\nb) {\nc();\n}\nd();\n}',
  'nested-calls': 'function r() {\nreturn foo(bar(1,\n2),\n3);\n}',
  'try-catch': 'async function load() {\ntry {\nawait fetch(url);\n} catch (e) {\nconsole.error(e);\n} finally {\ndone();\n}\n}',
  'export-object': "export default {\nname: 'x',\ndata() {\nreturn { a: 1 };\n},\n};",
  'dangling-if-else': 'function v() {\nif (a)\nif (b)\nc();\nelse\nd();\ne();\n}',
  'let-comma': 'function w() {\nlet a = 1,\nb = 2;\nc();\n}',
  'preprocessor': '#include <stdio.h>\nint main(void) {\n#ifdef X\nx();\n#endif\n}',
  'trailing-comment': 'function cm() {\nx(); // trailing\n// next comment\ny();\n}',
  'doc-comment': '/**\n * Doc comment\n * more\n */\nfunction doc() {\n}',
  'method-chain': 'function chain() {\nfoo\n.bar()\n.baz();\n}',
  'deep-nesting': 'function deep() {\nif (a) {\nif (b) {\nif (c) {\nd();\n}\n}\n}\n}',
  'return-object': 'function obj() {\nreturn {\na: 1,\nb: 2\n};\n}',
  'already-indented': '  indented line one\n    deeper (nested) item\n  back to one\nlast_word_here end',
  'prose': 'The quick brown fox. It jumps over\nthe lazy dog! Then it rests.\n\nAnother paragraph here.',
};

const FRAG = [
  'if (a) {', 'if (a)', '} else {', 'else', '} else if (b) {', '}', '};', '});', ')', ');', 'x = 1;', 'foo(a,', 'b,', 'c);',
  'bar();', 'return x;', 'return {', 'a: 1,', 'b: 2', 'key: value,', 'const o = {', 'const arr = [', '1,', '2', '];', ']',
  'switch (x) {', 'case 1:', 'case 2: y();', 'default:', 'break;', 'do {', '} while (x);', 'while (x)', 'while (x);', 'for (;;)',
  'for (i = 0; i < n; i++) {', 'label:', '// comment {', '// note', '/* block', '* star', '*/', '/* one */', 'x(); // trail',
  's = "{ (";', "c = '{';", "s = 'a{b';", '#define X 1', '#if Y', '#endif', 'function f(a, b) {', 'f(function() {', 'g(x => {',
  'total = a +', 'b +', 'c;', 'int a,', 'z;', 'class A {', 'public:', 'private:', 'void m()', '{', '(', 'a && b', '|| c)',
  'x = cond ?', 'one :', 'two;', '.then(r => r)', '.catch(e);', 'try {', '} catch (e) {', '} finally {', 'async function g() {',
  'await p;', 'let v = [', '[1, 2],', '{ a: 1 },', 'call(', 'arg', 'end \\', 'more', 'A::A() :', 'x(0)', 'enum E {', 'X,', 'Y',
  'struct S s = {', 'if (a) b(); else c();', 'else x();', '} while (0);', 'do', 'x++;', '', '', '   ',
];
const WS = ['', '', '', ' ', '  ', '    ', '\t', '\t\t', '      ', '  \t'];

function randomCases(count: number, seed: number): Case[] {
  let state = seed;
  const next = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)];
  return Array.from({ length: count }, (_, i) => {
    const n = 3 + Math.floor(next() * 12);
    const lines = Array.from({ length: n }, () => {
      const f = pick(FRAG);
      return f === '' ? '' : pick(WS) + f;
    });
    return { id: `random-${seed}-${i}`, lines };
  });
}

const LUA = `
local cases = vim.json.decode(io.open(_G.arg[1]):read("*a"))
vim.cmd("set tabstop=2 shiftwidth=2 expandtab noautoindent nosmartindent nosmarttab nostartofline")
local out = {}
for _, c in ipairs(cases) do
  vim.cmd("enew!")
  vim.api.nvim_buf_set_lines(0, 0, -1, false, c.lines)
  vim.cmd("normal! gg=G")
  table.insert(out, { id = c.id, expected = vim.api.nvim_buf_get_lines(0, 0, -1, false) })
end
local f = io.open(_G.arg[2], "w"); f:write(vim.json.encode(out)); f:close()
os.exit(0)
`;

async function main(): Promise<void> {
  const cases: Case[] = [
    ...Object.entries(SNIPPETS).map(([id, text]) => ({ id, lines: text.split('\n') })),
    ...randomCases(300, 11),
  ];
  const raw = await runNeovimIsolated<Case, { id: string; expected: string[] }>(LUA, cases);
  const results = cases.map((c, i) => ({ id: c.id, lines: c.lines, expected: raw[i].expected }));
  const target = path.resolve('test/fixtures/neovim-cindent-cases.json');
  fs.writeFileSync(target, JSON.stringify(results, null, 1) + '\n');
  console.log(`[neovim-cindent-fixtures] ${results.length} cases -> ${target}`);
}

void main();
