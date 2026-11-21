import { Mission } from '../../types/mission';
import { getGitHunks } from '../../vim-engine';

const keysOf = (s: string): string[] => [...s];

/**
 * Part 6: 현대 Neovim 실전 워크플로우 (레슨 101 ~ 106)
 * Telescope :LiveGrep, Neovim 0.11 LSP(grn/grr/gra/gO), Treesitter(daf/daa/cif/]f),
 * gitsigns.nvim(]h/:Gitsigns), Neovim Lua(:lua vim.opt) + 순정 고급 편집(U/Q)
 */
export const MISSIONS_PART6: Mission[] = [
  {
    id: 101,
    title: '레슨 101: Telescope :LiveGrep 본문 검색 & Ctrl-q 퀵픽스 일괄 치환',
    description:
      '현대 Neovim 의 핵심 플러그인 Telescope 처럼 프로젝트 전체 파일 본문을 정규식으로 실시간 검색(:LiveGrep)하고, 검색 결과를 Ctrl-q 로 퀵픽스 리스트에 보내 :cdo 로 여러 파일을 한 번에 리팩토링해 보세요.\n\n1) :LiveGrep [패턴] (:Rg [패턴]):\n   - 가상 파일 시스템 전체를 실시간 검색하며 우측 미리보기로 매치 줄을 확인합니다.\n   - 팝업에서 Ctrl-q 를 누르면 모든 검색 결과가 퀵픽스 리스트로 전송되고 하단 창이 열립니다.\n\n2) :cdo 일괄 치환 + Ctrl-^:\n   - :cdo s/legacy/prod/g 로 퀵픽스에 담긴 모든 파일의 URL 을 한 방에 변경한 뒤 Ctrl-^ 로 원래 파일(src/api.ts)로 돌아옵니다.\n\n미션:\n1. :LiveGrep legacy<Enter> 를 실행해 두 파일의 legacy URL 을 검색하세요.\n2. 팝업에서 Ctrl-q 를 눌러 퀵픽스 리스트로 보내세요.\n3. :cdo s/legacy/prod/g<Enter> 로 모든 파일의 legacy 를 prod 로 바꾼 뒤 Ctrl-^ 로 src/api.ts 로 복귀하세요!',
    hint: ':LiveGrep legacy<Enter> → Ctrl-q → :cdo s/legacy/prod/g<Enter> → Ctrl-^',
    par: 44,
    primaryFilename: 'src/api.ts',
    initialLines: [
      'export const apiUrl = "https://legacy.example.com";',
      'export const retry = 3;',
    ],
    targetLines: [
      'export const apiUrl = "https://prod.example.com";',
      'export const retry = 3;',
    ],
    initialVirtualFiles: {
      'src/api.ts': [
        'export const apiUrl = "https://legacy.example.com";',
        'export const retry = 3;',
      ],
      'src/auth.ts': [
        'export const authUrl = "https://legacy.example.com/auth";',
      ],
    },
    initialCursor: { line: 0, col: 0 },
    optimalKeys: [
      ...keysOf(':LiveGrep legacy'),
      'Enter',
      'Ctrl-q',
      ...keysOf(':cdo s/legacy/prod/g'),
      'Enter',
      'Ctrl-^',
    ],
    checkComplete: (state) => {
      const apiDone = state.lines[0]?.includes('https://prod.example.com') ?? false;
      const authBuf = state.buffers?.find((b) => b.name === 'src/auth.ts');
      const authLines = authBuf?.lines ?? state.virtualFiles?.['src/auth.ts'] ?? [];
      const authDone = authLines.some((l) => l.includes('https://prod.example.com/auth'));
      const hasQf = (state.quickfix?.items.length ?? 0) >= 2;
      return apiDone && authDone && hasQf;
    },
  },
  {
    id: 102,
    title: '레슨 102: Neovim 0.11 LSP 리팩토링 — gra 코드 액션 & grn 다중 파일 이름 변경',
    description:
      'Neovim 0.11 기본 LSP 키바인딩인 gra(코드 액션 팝업)와 grn(프로젝트 전체 심볼 이름 변경)으로 코드를 안전하게 리팩토링해 보세요.\n\n1) gra (LSP Code Action):\n   - 커서 줄에서 사용할 수 있는 리팩토링/자동 수정을 플로팅 팝업으로 띄웁니다.\n   - var 선언 줄에서 gra 를 누르고 1 을 선택하면 즉시 const 선언으로 변환됩니다.\n\n2) grn (LSP Rename):\n   - 심볼 위에서 grn 을 누르면 인라인 이름 변경 프롬프트가 열립니다.\n   - Ctrl-u 로 기존 이름을 지우고 새 이름을 입력한 뒤 Enter 를 누르면 현재 버퍼와 다른 파일(src/app.ts)의 참조까지 한 번에 바뀝니다.\n\n미션:\n1. 1번째 줄의 var 위에서 gra 를 누른 뒤 1 을 눌러 const 로 변환하세요.\n2. w 로 oldCount 위로 이동해 grn 을 열고 Ctrl-u 후 totalCount<Enter> 로 모든 파일의 심볼 이름을 변경하세요!',
    hint: 'gra → 1 (var→const) → w → grn → Ctrl-u → totalCount<Enter>',
    par: 20,
    primaryFilename: 'src/counter.ts',
    initialLines: [
      'var oldCount = 1;',
      'export function next() {',
      '  return oldCount + 1;',
      '}',
    ],
    targetLines: [
      'const totalCount = 1;',
      'export function next() {',
      '  return totalCount + 1;',
      '}',
    ],
    initialVirtualFiles: {
      'src/counter.ts': [
        'var oldCount = 1;',
        'export function next() {',
        '  return oldCount + 1;',
        '}',
      ],
      'src/app.ts': [
        'import { next } from "./counter";',
        'const n = oldCount;',
      ],
    },
    initialCursor: { line: 0, col: 0 },
    optimalKeys: [
      'g',
      'r',
      'a',
      '1',
      'w',
      'g',
      'r',
      'n',
      'Ctrl-u',
      ...keysOf('totalCount'),
      'Enter',
    ],
    checkComplete: (state) => {
      const target = [
        'const totalCount = 1;',
        'export function next() {',
        '  return totalCount + 1;',
        '}',
      ];
      const bufOk =
        state.lines.length === target.length && state.lines.every((l, i) => l === target[i]);
      const vfsOk = (state.virtualFiles?.['src/app.ts'] ?? []).some((l) =>
        l.includes('totalCount')
      );
      return bufOk && vfsOk;
    },
  },
  {
    id: 103,
    title: '레슨 103: Neovim 0.11 LSP 탐색 — gO 문서 심볼 아웃라인 & grr 참조 검색',
    description:
      '큰 소스 파일에서 함수 목록을 한눈에 보고 점프하는 gO(문서 심볼 아웃라인 → 로케이션 리스트)와, 심볼이 프로젝트 어디서 쓰이는지 찾는 grr(참조 검색 → 퀵픽스)을 결합해 보세요.\n\n1) gO (Document Symbols):\n   - 현재 버퍼의 함수·클래스·타입 심볼을 로케이션 리스트(:lopen)로 열어 :lnext / :lprev 로 즉시 이동합니다.\n\n2) grr (Find References):\n   - 커서 아래 식별자의 모든 참조를 프로젝트 전체에서 수집해 퀵픽스 리스트(:copen)로 띄웁니다.\n\n미션:\n1. gO 를 눌러 문서 심볼 아웃라인을 열고 :lne<Enter> 로 startServer 함수로 점프하세요.\n2. j 로 loadConfig 위로 내려간 뒤 grr 로 프로젝트 전체 참조를 수집하세요.\n3. cw readConfig<Esc> 로 startServer 내부의 호출을 readConfig 로 수정하세요!',
    hint: 'gO → :lne<Enter> → j → grr → cw readConfig<Esc>',
    par: 27,
    primaryFilename: 'src/server.ts',
    initialLines: [
      'function initEnv() {',
      '  return loadConfig();',
      '}',
      'function startServer() {',
      '  return loadConfig();',
      '}',
    ],
    targetLines: [
      'function initEnv() {',
      '  return loadConfig();',
      '}',
      'function startServer() {',
      '  return readConfig();',
      '}',
    ],
    initialVirtualFiles: {
      'src/server.ts': [
        'function initEnv() {',
        '  return loadConfig();',
        '}',
        'function startServer() {',
        '  return loadConfig();',
        '}',
      ],
      'src/worker.ts': ['const cfg = loadConfig();'],
    },
    initialCursor: { line: 0, col: 0 },
    optimalKeys: [
      'g',
      'O',
      ...keysOf(':lne'),
      'Enter',
      'j',
      'g',
      'r',
      'r',
      'c',
      'w',
      ...keysOf('readConfig'),
      'Escape',
    ],
    checkComplete: (state) => {
      const hasOutline = (state.locationList?.items.length ?? 0) >= 2;
      const hasRefs = (state.quickfix?.items.length ?? 0) >= 3;
      const updated = state.lines[4] === '  return readConfig();';
      return hasOutline && hasRefs && updated;
    },
  },
  {
    id: 104,
    title: '레슨 104: Treesitter 구조적 텍스트 객체(daf/daa/cif) & 함수 점프(]f/[f)',
    description:
      '줄 번호나 괄호 개수를 셀 필요 없이 코드의 구조(함수·클래스·인자) 단위로 바로 편집하는 Treesitter 텍스트 객체와 함수 점프 모션을 마스터해 보세요.\n\n1) 함수 텍스트 객체 (af / if) & 함수 점프 (]f / [f):\n   - daf 는 함수 선언부터 닫는 중괄호까지 통째로 삭제하고, cif 는 함수 본문 내부만 비우고 들여쓰기를 유지한 채 INSERT 모드로 들어갑니다.\n   - ]f / [f 는 다음·이전 함수 시작으로 즉시 이동합니다.\n\n2) 인자 텍스트 객체 (aa / ia):\n   - daa 는 불필요한 매개변수를 앞뒤 쉼표까지 깔끔하게 정리하며 삭제합니다.\n\n미션:\n1. 1번째 줄의 deprecated() 함수를 daf 로 통째로 삭제하세요.\n2. f, w 로 unusedArg 로 이동한 뒤 daa 로 인자와 쉼표를 함께 제거하세요.\n3. ]f 로 status() 함수로 점프한 뒤 cif 로 본문을 return "ok"; 로 교체하세요!',
    hint: 'daf → f, w → daa → ]f → cif → return "ok";<Esc>',
    par: 30,
    primaryFilename: 'src/math.ts',
    initialLines: [
      'function deprecated() {',
      '  return 0;',
      '}',
      'function greet(name, unusedArg) {',
      '  return name;',
      '}',
      'function status() {',
      '  return "todo";',
      '}',
    ],
    targetLines: [
      'function greet(name) {',
      '  return name;',
      '}',
      'function status() {',
      '  return "ok";',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    optimalKeys: [
      'd',
      'a',
      'f',
      'f',
      ',',
      'w',
      'd',
      'a',
      'a',
      ']',
      'f',
      'c',
      'i',
      'f',
      ...keysOf('return "ok";'),
      'Escape',
    ],
    checkComplete: (state) => {
      const target = [
        'function greet(name) {',
        '  return name;',
        '}',
        'function status() {',
        '  return "ok";',
        '}',
      ];
      return state.lines.length === target.length && state.lines.every((l, i) => l === target[i]);
    },
  },
  {
    id: 105,
    title: '레슨 105: gitsigns.nvim Git Hunk 탐색(]h/[h), 리셋 & 스테이징(:Gitsigns)',
    description:
      '실무 Neovim 환경에서 변경된 코드(Git Hunk)를 거터 마커(+, ~, _)로 즉시 확인하고, 실수로 바꾼 변경점만 골라 되돌리거나 의도한 변경점만 스테이징하는 gitsigns.nvim 워크플로우를 익혀 보세요.\n\n1) ]h / [h (Hunk 이동):\n   - 다음·이전 Git 변경 블록(Hunk)으로 한 번에 점프합니다.\n\n2) :Gitsigns reset_hunk / stage_hunk / preview_hunk:\n   - :Gitsigns reset_hunk 는 커서가 놓인 Hunk 만 Git 원본(HEAD)으로 되돌립니다. (u 로 복원 가능)\n   - :Gitsigns stage_hunk 는 현재 Hunk 를 스테이징해 변경 마커를 확정합니다.\n\n미션:\n1. ]h 로 첫 번째 변경 Hunk(port = 9999)로 이동한 뒤 :Gitsigns reset_hunk<Enter> 로 원래 포트(8080)로 되돌리세요.\n2. ]h 로 두 번째 변경 Hunk(ready = true)로 이동한 뒤 :Gitsigns stage_hunk<Enter> 로 스테이징해 미스테이징 Hunk 를 0개로 만드세요!',
    hint: ']h → :Gitsigns reset_hunk<Enter> → ]h → :Gitsigns stage_hunk<Enter>',
    par: 52,
    primaryFilename: 'src/config.ts',
    initialGitBaseLines: [
      'export const app = "vim";',
      'export const port = 8080;',
      'export const host = "localhost";',
      'export const ready = false;',
    ],
    initialLines: [
      'export const app = "vim";',
      'export const port = 9999;',
      'export const host = "localhost";',
      'export const ready = true;',
    ],
    targetLines: [
      'export const app = "vim";',
      'export const port = 8080;',
      'export const host = "localhost";',
      'export const ready = true;',
    ],
    initialCursor: { line: 0, col: 0 },
    optimalKeys: [
      ']',
      'h',
      ...keysOf(':Gitsigns reset_hunk'),
      'Enter',
      ']',
      'h',
      ...keysOf(':Gitsigns stage_hunk'),
      'Enter',
    ],
    checkComplete: (state) => {
      const target = [
        'export const app = "vim";',
        'export const port = 8080;',
        'export const host = "localhost";',
        'export const ready = true;',
      ];
      const linesOk =
        state.lines.length === target.length && state.lines.every((l, i) => l === target[i]);
      return linesOk && getGitHunks(state).length === 0;
    },
  },
  {
    id: 106,
    title: '레슨 106: Neovim Lua 설정(:lua vim.opt) & 순정 고급 편집(U 줄 복원 · Q 매크로)',
    description:
      '현대 Neovim 설정 언어인 Lua(:lua vim.opt.*)로 옵션을 즉시 제어하고, 한 줄의 여러 실수를 원상태로 되돌리는 U(줄 단위 실행 취소)와 마지막 매크로를 단 한 타로 반복하는 Neovim 기본 Q 를 결합해 보세요.\n\n1) :lua vim.opt.*:\n   - :lua vim.opt.shiftwidth = 4 처럼 init.lua 스타일 문법으로 옵션을 설정할 수 있습니다.\n\n2) U (줄 단위 Undo) & [count]Q (Neovim 매크로 반복):\n   - U 는 현재 줄에서 여러 번 고친 편집을 원래 줄로 한 번에 되돌립니다.\n   - qa...q 로 매크로를 녹화한 뒤 2Q 를 누르면 마지막 녹화·재생한 매크로를 2회 즉시 반복합니다.\n\n미션:\n1. :lua vim.opt.shiftwidth = 4<Enter> 로 들여쓰기 폭을 4로 설정하세요.\n2. 1번째 줄에서 x x 로 글자를 지운 뒤 U 를 눌러 원문(keep_this_line)을 복원하세요.\n3. j 로 내려가 qa A;<Esc> j q 로 세미콜론 추가 매크로를 녹화하고 2Q 로 나머지 두 줄까지 일괄 완료하세요!',
    hint: ':lua vim.opt.shiftwidth = 4<Enter> → x x U → j qa A;<Esc> j q → 2Q',
    par: 45,
    primaryFilename: 'init.lua',
    initialLines: ['keep_this_line', 'item_a', 'item_b', 'item_c'],
    targetLines: ['keep_this_line', 'item_a;', 'item_b;', 'item_c;'],
    initialCursor: { line: 0, col: 0 },
    optimalKeys: [
      ...keysOf(':lua vim.opt.shiftwidth = 4'),
      'Enter',
      'x',
      'x',
      'U',
      'j',
      'q',
      'a',
      'A',
      ';',
      'Escape',
      'j',
      'q',
      '2',
      'Q',
    ],
    checkComplete: (state) => {
      const target = ['keep_this_line', 'item_a;', 'item_b;', 'item_c;'];
      const linesOk =
        state.lines.length === target.length && state.lines.every((l, i) => l === target[i]);
      return linesOk && state.options?.shiftwidth === 4;
    },
  },
];
