/**
 * JS/TS 버퍼의 `=` (src/vim-engine/jsIndent.ts, tsIndent.ts) 를 실제 Neovim 결과로 고정합니다.
 *
 *   npm run fixtures:neovim-jsindent
 *
 * 아래 SNIPPETS 와 시드 고정 난수로 만든 코드 조각마다 `nvim --headless -u NONE` 에 Neovim 기본값인
 * `filetype plugin indent on` · `syntax on` 을 켜고 (엔진 기본 옵션 ts=2 sw=2 et) 'filetype' 을 정한 뒤 `gg=G` 를
 * 실행해 test/fixtures/neovim-jsindent-cases.json 으로 저장합니다. test/jsIndentNeovim.test.ts 가 nvim 없이 비교합니다.
 */
import { runNeovimIsolated } from './neovimRunner';
import fs from 'fs';
import path from 'path';

type Ft = 'typescript' | 'typescriptreact' | 'javascript' | 'javascriptreact';

interface Case {
  id: string;
  ft: Ft;
  lines: string[];
}

const SNIPPETS: Record<string, string> = {
  interface: 'interface User {\nid: number;\nname: string;\nemail?: string;\n}',
  'type-alias': 'type Point = {\nx: number;\ny: number;\n};\ntype Fn = (a: number) => void;',
  'object-literal': 'const o = {\na: 1,\nb: [\n1,\n2,\n],\nc: { d: 3 },\n};',
  'nested-object': 'const config = {\nserver: {\nport: 8080,\nhost: "localhost",\n},\nflags: [\n"a",\n"b",\n],\n};',
  'array-of-objects': 'const users = [\n{ id: 1, name: "a" },\n{\nid: 2,\nname: "b",\n},\n];',
  'function-block': 'function add(a: number, b: number): number {\nconst s = a + b;\nreturn s;\n}',
  'multiline-args': 'function f(a,\nb) {\nreturn a + b;\n}',
  'call-args': 'foo(a,\nb,\nc);\nbar();',
  'call-args-open': 'foo(\na,\nb\n);\nbar();',
  'arrow-block': 'const f = (x) => {\nreturn x * 2;\n};\nconst g = x =>\nx + 1;',
  'arrow-callback': 'items.forEach((item) => {\nconsole.log(item);\n});',
  'promise-chain': 'promise.then((r) => {\nlog(r);\n}).catch((e) => {\nerr(e);\n});',
  'method-chain': 'const r = list\n.filter((x) => x > 1)\n.map((x) => x * 2)\n.join(",");\nnext();',
  ternary: 'const v = cond\n? one\n: two;\nnext();',
  'ternary-trailing': 'const v = cond ?\none :\ntwo;\nnext();',
  'switch-case': 'switch (x) {\ncase 1:\na();\nbreak;\ncase 2: {\nb();\nbreak;\n}\ndefault:\nc();\n}',
  'switch-in-fn': "function s(x) {\nswitch (x) {\ncase 'a':\nreturn 1;\ndefault:\nreturn 2;\n}\n}",
  'if-else': 'if (a) {\nb();\n} else if (c) {\nd();\n} else {\ne();\n}',
  'if-no-brace': 'if (x)\ny();\nz();\nfor (const a of b)\nc(a);\nd();',
  'while-do': 'while (i < 10) {\ni++;\n}\ndo {\nj++;\n} while (j < 5);\nk();',
  'try-catch': 'async function load() {\ntry {\nawait fetch(url);\n} catch (e) {\nconsole.error(e);\n} finally {\ndone();\n}\n}',
  class: 'class A {\nprivate x = 1;\nconstructor(y: number) {\nthis.x = y;\n}\nget value(): number {\nreturn this.x;\n}\n}',
  'class-extends': 'export class B extends A implements I {\nstatic create() {\nreturn new B();\n}\n}',
  enum: 'enum Color {\nRed,\nGreen = "g",\nBlue,\n}',
  generics: 'function id<T>(x: T): T {\nreturn x;\n}\nconst m = new Map<string, number>();\nm.set("a", 1);',
  comments: '// top comment\nfunction c() {\n// inner\n/* block\ncomment */\n/**\n* doc\n*/\nreturn 0;\n}',
  'doc-comment': '/**\n * Adds numbers.\n * @param a first\n */\nexport function add(a, b) {\nreturn a + b;\n}',
  'trailing-comment': 'function t() {\nx(); // trailing {\n// next comment (\ny();\n}',
  'string-brackets': 'function m() {\nconst s = "{ not (a brace";\nconst t = \'[x\';\nx();\n}',
  'template-literal': 'const s = `hello ${name}`;\nconst t = `line1\nline2 {\nline3`;\nx();',
  'template-multi-sub': 'const html = `\n<div>\n${items.map((i) => `<li>${i}</li>`).join("")}\n</div>\n`;\nrender(html);',
  regex: 'const r = /ab{2}[(]/g;\nif (r.test(s)) {\nok();\n}',
  'import-export': "import {\nfoo,\nbar,\n} from './mod';\nexport {\nbaz,\n};",
  'export-default-object': "export default {\nname: 'x',\ndata() {\nreturn { a: 1 };\n},\n};",
  'async-await': 'async function run() {\nconst res = await fetch(url, {\nmethod: "POST",\nbody: data,\n});\nreturn res.json();\n}',
  'optional-chaining': 'const v = a?.b?.c ?? d;\nif (v) {\nuse(v);\n}',
  'continuation-ops': 'const total = a +\nb +\nc;\nconst ok = x &&\ny ||\nz;\nnext();',
  'let-comma': 'let a = 1,\nb = 2;\nc();',
  'var-multi': 'var a = 1,\nb = 2,\nc = 3;\nd();',
  'object-methods': 'const api = {\nget(url) {\nreturn fetch(url);\n},\npost: async (url, body) => {\nreturn fetch(url, { body });\n},\n};',
  'deep-nesting': 'function deep() {\nif (a) {\nif (b) {\nfor (;;) {\nd();\n}\n}\n}\n}',
  'return-object': 'function obj() {\nreturn {\na: 1,\nb: 2,\n};\n}',
  'already-indented': '  function f() {\n      return 1;\n  }\n    const x = 2;',
  'tabs-input': 'function f() {\n\tif (a) {\n\t\tb();\n\t}\n}',
  'blank-lines': 'function f() {\n\nconst a = 1;\n   \nreturn a;\n}',
  'jsx-return': 'function App() {\nconst title = "Vim";\nreturn (\n<div className="app">\n<h1>{title}</h1>\n<button onClick={() => go()}>Go</button>\n</div>\n);\n}',
  'jsx-oneline': 'function App() {\nconst title = "Vim";\n    return <button>Click Me</button>;\n}',
  'jsx-map': 'const List = ({ items }) => (\n<ul>\n{items.map((i) => (\n<li key={i}>{i}</li>\n))}\n</ul>\n);',
  sandbox:
    "interface User {\nid: number;\nname: string;\n}\n\nconst users: User[] = [\n{ id: 1, name: 'alice' },\n{ id: 2, name: 'bob' },\n];\n\nfunction findUser(id: number): User | undefined {\nreturn users.find((u) => u.id === id);\n}",
  'decorators': '@Component({\nselector: "app",\n})\nclass AppComponent {\n@Input() name: string;\n}',
  'namespace-declare': 'declare module "x" {\nexport function f(): void;\n}\nnamespace N {\nexport const a = 1;\n}',
  'union-type': 'type Shape =\n| { kind: "circle"; r: number }\n| { kind: "square"; s: number };\nlet s: Shape;',
  'for-of-loop': 'for (const [k, v] of Object.entries(o)) {\nconsole.log(k, v);\n}',
  'iife': '(function () {\nstart();\n})();\n(() => {\nrun();\n})();',
  'comma-first': 'const o = {\na: 1\n, b: 2\n, c: 3\n};',
  'closing-paren-alone': 'foo(\nbar,\nbaz\n)\nnext();',
  'sandbox-file':
    '// sandbox\n\ninterface User {\nid: number;\nname: string;\nrole: "admin" | "editor" | "viewer";\n}\n\nfunction greet(user: User): string {\nif (user.role === "admin") {\nreturn `Welcome, Administrator ${user.name}!`;\n}\nreturn `Hello, ${user.name}!`;\n}\n\nconst user: User = { id: 1, name: "Vim Master", role: "admin" };\nconsole.log(greet(user));',
  'api-file':
    'export const API_ENDPOINT = "https://api.example.com/v1";\n\nexport interface ApiResponse<T> {\nok: boolean;\ndata: T;\n}\n\nexport async function fetchUser(id: number): Promise<ApiResponse<string>> {\nconst url = `${API_ENDPOINT}/users/${id}`;\nreturn { ok: true, data: url };\n}',
  'jsx-apostrophe': "function Note() {\nreturn (\n<p>\nDon't stop (now)\n</p>\n);\n}\nnext();",
  'arrow-object-return': 'const mk = () => ({\na: 1,\nb: 2,\n});\nmk();',
  'express-handler': 'app.get("/", async (req, res) => {\nconst id = req.params.id;\nres.send(id);\n});\napp.listen(3000);',
  'multiline-condition': 'if (\na &&\nb\n) {\nc();\n}\nd();',
  'function-expression': 'const fn = function () {\nreturn 1;\n};\nfn();',
  'return-ternary': 'function pick(a) {\nreturn a\n? b\n: c;\n}',
  'generic-type-alias': 'type Res<T> = {\ndata: T;\nerror?: string;\n};\nconst r: Res<number> = { data: 1 };',
  'destructured-params': 'function f({\na,\nb,\n}) {\nreturn a + b;\n}',
  'typed-object-param': 'function f({ a, b }: {\na: number;\nb: string;\n}) {\nreturn a;\n}',
  'else-chain-nobrace': 'if (a)\nx();\nelse if (b)\ny();\nelse\nz();\nw();',
  'class-comments': 'class C {\n// field\nx = 1;\n/**\n * method\n */\nm() {\nreturn this.x;\n}\n}',
  'abstract-class': 'abstract class Shape {\nabstract area(): number;\ntoString(): string {\nreturn `${this.area()}`;\n}\n}',
  'interface-extends': 'interface Admin extends User {\nperms: string[];\nlevel: {\nread: boolean;\nwrite: boolean;\n};\n}',
  'nested-callbacks': 'setTimeout(() => {\nfs.readFile(p, (err, data) => {\nif (err) {\nthrow err;\n}\nuse(data);\n});\n}, 100);',
  'object-spread': 'const merged = {\n...a,\n...b,\nc: [\n...d,\n],\n};',
  'long-call-chain-args': 'const x = compute(\nfirst,\nsecond(\nthird,\n),\n);\ndone();',
  'string-concat': 'const msg = "a" +\n"b" +\n"c";\nlog(msg);',
  'reduce-callback': 'const sum = arr.reduce((acc, x) => {\nreturn acc + x;\n}, 0);\nlog(sum);',
  'switch-return-object': 'function r(s, a) {\nswitch (a.type) {\ncase "add":\nreturn {\n...s,\nn: s.n + 1,\n};\ndefault:\nreturn s;\n}\n}',
  'tsx-component':
    'export function Button({ label }: { label: string }) {\nconst [n, setN] = useState(0);\nreturn (\n<button onClick={() => setN(n + 1)}>\n{label} {n}\n</button>\n);\n}',
  'for-classic': 'for (let i = 0; i < n; i++) {\nif (i % 2) continue;\nsum += i;\n}\nlog(sum);',
  'object-comments': 'const o = {\n/* block (\ncomment */\na: 1,\n// line (\nb: [\n2,\n],\n};\nnext();',
  'object-regex-value': 'const rules = {\nid: /^[a-z{]+$/,\nname: /\\w+(/i,\n};\ncheck(rules);',
  'interface-comments': 'interface Opts {\n/** doc ( */\na: number;\n// b is [optional\nb?: string;\n}\nconst x = 1;',
  'regex-in-function': 'function m(s) {\nconst re = /[{(]/g;\nreturn s.replace(re, "");\n}\nm(x);',
  'chained-await': 'const data = await client\n.get("/a")\n.then((r) => r.json());\nuse(data);',
};

/** 앞의 ft 가 이 조각에서 쓰이는 파일타입 (JSX 는 react 쪽에서도 확인). */
const TS_ONLY = new Set(['interface-comments', 'sandbox-file', 'api-file', 'generic-type-alias', 'typed-object-param', 'abstract-class', 'interface-extends', 'interface', 'type-alias', 'generics', 'enum', 'class', 'class-extends', 'sandbox', 'decorators', 'namespace-declare', 'union-type', 'function-block']);
const JSX = new Set(['jsx-return', 'jsx-oneline', 'jsx-map', 'jsx-apostrophe']);
const TSX_ONLY = new Set(['tsx-component']);

const FRAG = [
  'if (a) {', 'if (a)', '} else {', 'else', '} else if (b) {', '}', '};', '});', '})', ')', ');', '],', '];', 'x = 1;',
  'foo(a,', 'b,', 'c);', 'bar();', 'return x;', 'return {', 'a: 1,', 'b: 2', 'key: value,', 'const o = {', 'const arr = [',
  '1,', '2', 'switch (x) {', 'case 1:', 'default:', 'break;', 'do {', '} while (x);', 'while (x)', 'for (const x of xs) {',
  '// comment {', '// note', '/* block', '* star', '*/', '/** doc */', 'x(); // trail', 's = "{ (";', "c = '{';",
  'const t = `a ${b} {`;', 'r = /[{(]/;', 'function f(a, b) {', 'f(function () {', 'g((x) => {', 'items.map((x) => x * 2)',
  'total = a +', 'b +', 'c;', 'interface I {', 'id: number;', 'name?: string;', 'type T = {', 'class A {', 'constructor() {',
  'private x = 1;', 'async function g() {', 'await p;', 'let v = [', '[1, 2],', '{ a: 1 },', 'call(', 'arg', '.then((r) => r)',
  '.catch((e) => {', 'x = cond ?', 'one :', 'two;', '? one', ': two;', 'export default {', 'import { a } from "b";', 'try {',
  '} catch (e) {', '} finally {', 'const f = () => {', 'const g = (x) =>', 'x + 1;', 'enum E {', 'X,', 'Y', 'return (', '<div>',
  '</div>', '{', '(', '', '', '   ',
];
const WS = ['', '', '', '', ' ', '  ', '    ', '\t'];

function randomCases(count: number, seed: number, ft: Ft): Case[] {
  let state = seed;
  const next = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)];
  return Array.from({ length: count }, (_, i) => {
    const n = 3 + Math.floor(next() * 12);
    const lines = Array.from({ length: n }, () => {
      const f = pick(FRAG);
      return f === '' ? '' : pick(WS) + f;
    });
    return { id: `random-${ft}-${seed}-${i}`, ft, lines };
  });
}

const LUA = `
local cases = vim.json.decode(io.open(_G.arg[1]):read("*a"))
vim.cmd("filetype plugin indent on")
vim.cmd("syntax on")
local out = {}
for _, c in ipairs(cases) do
  vim.cmd("enew!")
  vim.api.nvim_buf_set_lines(0, 0, -1, false, c.lines)
  vim.cmd("setlocal filetype=" .. c.ft)
  vim.cmd("set tabstop=2 shiftwidth=2 expandtab nostartofline")
  vim.cmd("setlocal tabstop=2 shiftwidth=2 expandtab")
  vim.cmd("silent normal! gg=G")
  table.insert(out, { id = c.id, expected = vim.api.nvim_buf_get_lines(0, 0, -1, false), indentexpr = vim.bo.indentexpr })
end
local f = io.open(_G.arg[2], "w"); f:write(vim.json.encode(out)); f:close()
os.exit(0)
`;

/**
 * `--seed N --count N --out file.json` 을 주면 SNIPPETS 없이 그 시드의 무작위 조각만 만들어 따로 저장합니다
 * (고정 픽스처를 바꾸지 않고 더 넓게 비교해 볼 때).
 */
function cliArg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const cases: Case[] = [];
  const seedArg = cliArg('seed');
  if (seedArg !== undefined) {
    const seed = Number(seedArg);
    const count = Number(cliArg('count') ?? 300);
    cases.push(...randomCases(count, seed, 'typescript'), ...randomCases(count, seed + 1, 'javascript'));
  } else for (const [id, text] of Object.entries(SNIPPETS)) {
    const lines = text.split('\n');
    const fts: Ft[] = TSX_ONLY.has(id) ? ['typescriptreact'] : TS_ONLY.has(id) ? ['typescript'] : ['typescript', 'javascript'];
    if (JSX.has(id)) fts.push('typescriptreact', 'javascriptreact');
    for (const ft of fts) cases.push({ id: `${id}-${ft}`, ft, lines });
  }
  if (seedArg === undefined) cases.push(...randomCases(250, 21, 'typescript'), ...randomCases(250, 22, 'javascript'));
  const raw = await runNeovimIsolated<Case, { id: string; expected: string[]; indentexpr: string }>(LUA, cases);
  raw.forEach((r, i) => {
    if (!r.indentexpr) throw new Error(`no indentexpr for ${cases[i].id}`);
  });
  const results = cases.map((c, i) => ({ id: c.id, ft: c.ft, lines: c.lines, expected: raw[i].expected }));
  const target = path.resolve(cliArg('out') ?? 'test/fixtures/neovim-jsindent-cases.json');
  fs.writeFileSync(target, JSON.stringify(results, null, 1) + '\n');
  console.log(`[neovim-jsindent-fixtures] ${results.length} cases -> ${target}`);
}

void main();
