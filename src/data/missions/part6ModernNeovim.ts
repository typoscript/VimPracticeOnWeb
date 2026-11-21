import { Mission } from '../../types/mission';
import { getGitHunks } from '../../vim-engine';

const keysOf = (s: string): string[] => [...s];

/**
 * Part 6: 현대 Neovim 실전 워크플로우 (레슨 101 ~ 112)
 * Telescope :LiveGrep, Neovim 0.11 LSP(grn/grr/gra/gO), Treesitter(daf/daa/cif/]f),
 * gitsigns.nvim(]h/:Gitsigns), Neovim Lua(:lua vim.opt) + 순정 고급 편집(U/Q),
 * flash.nvim(gs/dgs/cgs), oil.nvim(:Oil), harpoon.nvim(:HarpoonAdd/:HarpoonMenu),
 * mini.ai Next/Last 텍스트 객체(cin"/din(/cil"), trouble.nvim(:Trouble), 다중 커서(g Ctrl-n)
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
  {
    id: 107,
    title: '레슨 107: flash.nvim 화면 라벨 점프(gs) & 원격 범위 연산(dgs/cgs)',
    description:
      'j/k 나 단어 이동을 여러 번 누를 필요 없이, 화면 어디든 검색 문자 + 라벨 한 타로 순간이동하고 범위 삭제·수정까지 결합하는 flash.nvim 워크플로우를 마스터해 보세요.\n\n1) gs (화면 라벨 점프):\n   - gs 를 누른 뒤 가고 싶은 문자를 타이핑하면 일치 위치에 충돌 없는 홈로우 라벨이 즉시 표시됩니다.\n   - 라벨 키를 누르거나 Enter 로 가장 가까운 매치로 바로 점프합니다. (Ctrl-o 로 복귀 가능)\n\n2) dgs / cgs / ygs (원격 범위 연산):\n   - 커서 위치부터 Flash 타겟 직전까지 한 번에 삭제(dgs), 수정(cgs), 복사(ygs)합니다.\n\n미션:\n1. gs rem<Enter> 로 2번째 줄의 remove_me 로 즉시 점프한 뒤, dgs tar<Enter> 로 target 앞까지 한 방에 삭제하세요.\n2. gs old<Enter> 로 4번째 줄의 oldToken 으로 점프한 뒤, cgs ;<Enter> newToken<Esc> 로 토큰 이름을 교체하세요!',
    hint: 'gs rem<Enter> → dgs tar<Enter> → gs old<Enter> → cgs ;<Enter> newToken<Esc>',
    par: 35,
    primaryFilename: 'src/router.ts',
    initialLines: [
      'const first = "keep";',
      'const second = "remove_me target";',
      'function handler() {',
      '  return oldToken;',
      '}',
    ],
    targetLines: [
      'const first = "keep";',
      'const second = "target";',
      'function handler() {',
      '  return newToken;',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    optimalKeys: [
      'g',
      's',
      ...keysOf('rem'),
      'Enter',
      'd',
      'g',
      's',
      ...keysOf('tar'),
      'Enter',
      'g',
      's',
      ...keysOf('old'),
      'Enter',
      'c',
      'g',
      's',
      ';',
      'Enter',
      ...keysOf('newToken'),
      'Escape',
    ],
    checkComplete: (state) => {
      const target = [
        'const first = "keep";',
        'const second = "target";',
        'function handler() {',
        '  return newToken;',
        '}',
      ];
      return state.lines.length === target.length && state.lines.every((l, i) => l === target[i]);
    },
  },
  {
    id: 108,
    title: '레슨 108: oil.nvim 버퍼 기반 파일시스템 편집(:Oil · dd/cw/o · :w)',
    description:
      '파일 탐색기를 일반 Vim 버퍼처럼 다루는 oil.nvim(:Oil)으로 파일 삭제·이름 변경·신규 생성을 익숙한 Vim 편집 명령만으로 일괄 처리해 보세요.\n\n1) :Oil [경로]:\n   - 현재 파일이 속한 디렉터리 항목을 /001 utils/, /002 app.ts 형식의 편집 버퍼로 엽니다.\n   - Enter 로 파일·하위 폴더 열기, - 로 상위 폴더 이동, :q 로 원래 버퍼 복귀가 가능합니다.\n\n2) 버퍼 편집 후 :w 일괄 반영:\n   - dd 로 줄을 지우면 파일/폴더 삭제, 이름 부분을 cw/c$ 로 고치면 내용 보존 이름 변경, o 로 새 줄에 이름을 쓰면 신규 파일·폴더(끝에 /)가 생성되며 :w 시 VFS 에 반영됩니다.\n\n미션:\n1. :Oil<Enter> 로 proj 디렉터리 버퍼를 여세요.\n2. G dd 로 legacy.ts 를 삭제하고, fa c$ main.ts<Esc> 로 app.ts 를 main.ts 로 이름 변경하세요.\n3. o config.ts<Esc> 로 새 파일을 추가한 뒤 :w<Enter> 로 파일시스템에 일괄 반영하세요!',
    hint: ':Oil<Enter> → Gdd → fa c$ main.ts<Esc> → o config.ts<Esc> → :w<Enter>',
    par: 36,
    primaryFilename: 'proj/app.ts',
    initialLines: ['export const app = "v1";'],
    targetLines: ['/001 utils/', '/002 config.ts', '/003 main.ts'],
    initialVirtualFiles: {
      'proj/app.ts': ['export const app = "v1";'],
      'proj/legacy.ts': ['export const old = true;'],
      'proj/utils/helper.ts': ['export const help = 1;'],
    },
    initialCursor: { line: 0, col: 0 },
    optimalKeys: [
      ...keysOf(':Oil'),
      'Enter',
      'G',
      'd',
      'd',
      'f',
      'a',
      'c',
      '$',
      ...keysOf('main.ts'),
      'Escape',
      'o',
      ...keysOf('config.ts'),
      'Escape',
      ...keysOf(':w'),
      'Enter',
    ],
    checkComplete: (state) => {
      const vfs = state.virtualFiles ?? {};
      const renamedOk = vfs['proj/main.ts']?.[0] === 'export const app = "v1";' && !('proj/app.ts' in vfs);
      const deletedOk = !('proj/legacy.ts' in vfs);
      const createdOk = 'proj/config.ts' in vfs;
      return renamedOk && deletedOk && createdOk;
    },
  },
  {
    id: 109,
    title: '레슨 109: harpoon.nvim 파일 핀 & 원키 프로젝트 전환(:HarpoonAdd · :HarpoonMenu)',
    description:
      '수십 개 파일 중 지금 작업 중인 핵심 파일 2~4개만 슬롯(#1~#9)에 고정해 두고, 숫자 한 타로 번개처럼 오가는 harpoon.nvim 워크플로우를 익혀 보세요.\n\n1) :HarpoonAdd / :HarpoonRemove / :HarpoonClear:\n   - 현재 버퍼를 Harpoon 핀 슬롯에 순서대로 등록하거나 제거합니다.\n\n2) :HarpoonMenu & :Harpoon [1-9] / :HarpoonNext / :HarpoonPrev:\n   - :HarpoonMenu 팝업에서 숫자 키(1~9)를 누르면 해당 파일로 1타에 즉시 전환됩니다. (j/k 이동, J/K 순서 변경, d 삭제)\n\n미션:\n1. :HarpoonAdd<Enter> 로 현재 파일(workspace/api.ts)을 #1 슬롯에 고정하세요.\n2. :e workspace/db.ts<Enter> 로 이동한 뒤 :HarpoonAdd<Enter> 로 #2 슬롯에 고정하고, f" ci" prod-db<Esc> 로 호스트를 수정하세요.\n3. :HarpoonMenu<Enter> 를 열고 1 을 눌러 #1(workspace/api.ts)로 즉시 복귀한 뒤 f1 r2 로 버전을 "v2" 로 올리세요!',
    hint: ':HarpoonAdd<Enter> → :e workspace/db.ts<Enter> → :HarpoonAdd<Enter> → f" ci" prod-db<Esc> → :HarpoonMenu<Enter> → 1 → f1 r2',
    par: 78,
    primaryFilename: 'workspace/api.ts',
    initialLines: ['export const version = "v1";'],
    targetLines: ['export const version = "v2";'],
    initialVirtualFiles: {
      'workspace/api.ts': ['export const version = "v1";'],
      'workspace/db.ts': ['export const dbHost = "old-db";'],
    },
    initialCursor: { line: 0, col: 0 },
    optimalKeys: [
      ...keysOf(':HarpoonAdd'),
      'Enter',
      ...keysOf(':e workspace/db.ts'),
      'Enter',
      ...keysOf(':HarpoonAdd'),
      'Enter',
      'f',
      '"',
      'c',
      'i',
      '"',
      ...keysOf('prod-db'),
      'Escape',
      ...keysOf(':HarpoonMenu'),
      'Enter',
      '1',
      'f',
      '1',
      'r',
      '2',
    ],
    checkComplete: (state) => {
      const pinned = state.harpoonList ?? [];
      const hasBothPins = pinned.includes('workspace/api.ts') && pinned.includes('workspace/db.ts');
      const apiOk =
        state.primaryFilename === 'workspace/api.ts' &&
        state.lines[0] === 'export const version = "v2";';
      const dbBuf = state.buffers?.find((b) => b.name === 'workspace/db.ts');
      const dbLines = dbBuf?.lines ?? state.virtualFiles?.['workspace/db.ts'] ?? [];
      const dbOk = dbLines[0] === 'export const dbHost = "prod-db";';
      return hasBothPins && apiOk && dbOk;
    },
  },
  {
    id: 110,
    title: '레슨 110: mini.ai Next/Last 텍스트 객체(cin" · din( · cil") 원격 편집 마스터',
    description:
      '커서를 따옴표나 괄호 안으로 옮길 필요 없이, 버퍼의 다음(n: Next) 또는 이전(l: Last) 짝을 원격으로 겨냥해 즉시 삭제·수정·복사하는 mini.ai 텍스트 객체로 110강 대장정을 마무리해 보세요!\n\n1) Next 텍스트 객체 (in / an):\n   - cin" / din( / yan{ 처럼 i/a 뒤에 n 을 붙이면 커서 뒤(다음 줄 포함) 가장 가까운 짝을 찾아 바로 편집합니다.\n\n2) Last 텍스트 객체 (il / al):\n   - cil" / dil( 처럼 i/a 뒤에 l 을 붙이면 커서 앞쪽의 가장 가까운 이전 짝을 되돌아가며 바로 편집합니다.\n\n미션:\n1. 1번째 줄 맨 앞에서 cin" hello<Esc> 로 따옴표 밖에서 바로 "old_msg" 를 "hello" 로 바꾸세요.\n2. 줄을 내리지 않고 바로 din( 으로 2번째 줄 compute(bad_arg) 의 인자를 비우세요.\n3. G 로 마지막 줄 세미콜론 위치로 내려간 뒤 cil" fixed<Esc> 로 앞선 "old_prev" 를 "fixed" 로 교체해 110강을 완료하세요!',
    hint: 'cin" hello<Esc> → din( → G → cil" fixed<Esc>',
    par: 28,
    primaryFilename: 'src/miniAi.ts',
    initialLines: [
      'const greeting = "old_msg";',
      'const result = compute(bad_arg);',
      'const prev = "old_prev"; const next = "keep";',
    ],
    targetLines: [
      'const greeting = "hello";',
      'const result = compute();',
      'const prev = "fixed"; const next = "keep";',
    ],
    initialCursor: { line: 0, col: 0 },
    optimalKeys: [
      'c',
      'i',
      'n',
      '"',
      ...keysOf('hello'),
      'Escape',
      'd',
      'i',
      'n',
      '(',
      'G',
      'c',
      'i',
      'l',
      '"',
      ...keysOf('fixed'),
      'Escape',
    ],
    checkComplete: (state) => {
      const target = [
        'const greeting = "hello";',
        'const result = compute();',
        'const prev = "fixed"; const next = "keep";',
      ];
      return state.lines.length === target.length && state.lines.every((l, i) => l === target[i]);
    },
  },
  {
    id: 111,
    title: '레슨 111: trouble.nvim 프로젝트 진단·TODO 통합 허브(:Trouble todo · :TroubleNext)',
    description:
      '프로젝트 전체 파일에 흩어져 있는 TODO / FIXME 주석과 LSP 진단을 파일별 트리로 한눈에 모아 보여주는 trouble.nvim(:Trouble)으로 크로스 파일 이슈를 깔끔하게 청산해 보세요.\n\n1) :Trouble [all|diagnostics|todo|quickfix]:\n   - 하단에 파일별 트리 패널을 열고 모든 진단·TODO 항목을 수집합니다.\n\n2) :TroubleNext / :TroublePrev / :TroubleClose:\n   - 다음·이전 항목의 파일과 줄로 즉시 전환·점프하고 작업 후 패널을 닫습니다.\n\n미션:\n1. :Trouble todo<Enter> 로 프로젝트 전체 TODO/FIXME 트리를 여세요.\n2. 현재 파일(proj/api.ts)의 TODO 줄을 dd 로 지우고 f1 r2 로 "/v2/users" 로 바꾸세요.\n3. :TroubleNext<Enter> 로 proj/worker.ts 의 FIXME 로 점프해 dd 로 지우고 f1 r3 로 retries 를 3으로 올린 뒤 :TroubleClose<Enter> 와 Ctrl-^ 로 proj/api.ts 로 복귀하세요!',
    hint: ':Trouble todo<Enter> → dd f1 r2 → :TroubleNext<Enter> → dd f1 r3 → :TroubleClose<Enter> → Ctrl-^',
    par: 58,
    primaryFilename: 'proj/api.ts',
    initialLines: [
      '// TODO: switch endpoint to v2',
      'export const endpoint = "/v1/users";',
    ],
    targetLines: [
      'export const endpoint = "/v2/users";',
    ],
    initialVirtualFiles: {
      'proj/api.ts': [
        '// TODO: switch endpoint to v2',
        'export const endpoint = "/v1/users";',
      ],
      'proj/worker.ts': [
        '// FIXME: raise retry limit',
        'export const retries = 1;',
      ],
    },
    initialCursor: { line: 0, col: 0 },
    optimalKeys: [
      ...keysOf(':Trouble todo'),
      'Enter',
      'd',
      'd',
      'f',
      '1',
      'r',
      '2',
      ...keysOf(':TroubleNext'),
      'Enter',
      'd',
      'd',
      'f',
      '1',
      'r',
      '3',
      ...keysOf(':TroubleClose'),
      'Enter',
      'Ctrl-^',
    ],
    checkComplete: (state) => {
      const apiOk =
        state.primaryFilename === 'proj/api.ts' &&
        state.lines.length === 1 &&
        state.lines[0] === 'export const endpoint = "/v2/users";';
      const workerBuf = state.buffers?.find((b) => b.name === 'proj/worker.ts');
      const workerLines = workerBuf?.lines ?? state.virtualFiles?.['proj/worker.ts'] ?? [];
      const workerOk =
        workerLines.length === 1 && workerLines[0] === 'export const retries = 3;';
      const usedTrouble = state.troublePanel !== undefined && state.troublePanel !== null;
      return apiOk && workerOk && usedTrouble && !state.troublePanel?.isOpen;
    },
  },
  {
    id: 112,
    title: '레슨 112: vim-visual-multi 다중 커서 선택·건너뛰기·동시 치환(g Ctrl-n · Ctrl-x)',
    description:
      'VS Code 의 Ctrl-d 처럼 같은 단어를 하나씩 점진 선택하고, 필요 없는 위치는 건너뛰며(Ctrl-x) 여러 곳을 한 번에 동시 수정하는 다중 커서 워크플로우를 마스터해 보세요.\n\n1) g Ctrl-n (다중 커서 시작) & Ctrl-n (다음 매치 추가):\n   - 커서 아래 단어를 선택해 다중 커서 모드로 진입하고, Ctrl-n 을 누를 때마다 다음 동일 단어가 선택에 추가됩니다.\n\n2) Ctrl-x (현재 매치 건너뛰기) & c / i / a / d (동시 편집):\n   - 직전에 추가된 매치를 선택 해제하고 다음 매치로 건너뜁니다. c 를 누르면 모든 선택 영역이 동시에 지워지고 멀티 커서 입력 모드로 전환됩니다.\n\n미션:\n1. 1번째 줄의 첫 item 위에서 g Ctrl-n 을 눌러 다중 커서를 시작하고, Ctrl-n 을 두 번 눌러 3번째 item(const keep = item;)까지 선택하세요.\n2. Ctrl-x 를 눌러 keep 줄의 item 은 건너뛰고 마지막 줄의 item 을 선택하세요.\n3. c node<Esc> 로 선택된 3곳의 item 을 한 번에 node 로 동시 치환하세요!',
    hint: 'g Ctrl-n → Ctrl-n → Ctrl-n → Ctrl-x → c node<Esc>',
    par: 13,
    primaryFilename: 'src/multi.ts',
    initialLines: [
      'const item = load(item);',
      'const keep = item;',
      'const last = item;',
    ],
    targetLines: [
      'const node = load(node);',
      'const keep = item;',
      'const last = node;',
    ],
    initialCursor: { line: 0, col: 6 },
    optimalKeys: [
      'g',
      'Ctrl-n',
      'Ctrl-n',
      'Ctrl-n',
      'Ctrl-x',
      'c',
      ...keysOf('node'),
      'Escape',
    ],
    checkComplete: (state) => {
      const target = [
        'const node = load(node);',
        'const keep = item;',
        'const last = node;',
      ];
      return (
        !state.multiCursor?.isOpen &&
        state.lines.length === target.length &&
        state.lines.every((l, i) => l === target[i])
      );
    },
  },
  {
    id: 113,
    title: '레슨 113: undotree 시각적 분기 트리(:UndotreeToggle) & 브랜치 시간 여행(:undo N)',
    description:
      'Vim 의 실행 취소(Undo)는 단순한 일직선이 아니라 모든 과거 갈래를 보존하는 분기형 트리(Undo Tree)입니다. u 로 되돌린 뒤 새 편집을 해서 이전 작업이 사라진 것처럼 보여도 :UndotreeToggle 과 :undo N 으로 잃어버린 브랜치를 완벽히 되살릴 수 있습니다.\n\n1) :UndotreeToggle (:Undotree / :UndotreeShow / :UndotreeHide):\n   - 에디터 하단에 분기형 Undo 트리 그래프와 노드별 실시간 Diff 미리보기를 엽니다.\n\n2) :undo {seq} (또는 g- / g+):\n   - 다른 브랜치로 갈라져 나간 과거 시퀀스 번호(#N)로 즉시 시간 여행해 코드를 복구합니다.\n\n미션:\n1. 1번째 줄에서 f" ci" prod_secret<Esc> 로 토큰을 수정해 첫 번째 브랜치(#1)를 만드세요.\n2. u 로 되돌린 뒤 ci" broken_draft<Esc> 를 입력해 실수로 두 번째 브랜치(#2)로 덮어쓰세요.\n3. :UndotreeToggle<Enter> 로 분기 트리를 열어 확인한 뒤, :undo 1<Enter> 로 잃어버렸던 #1("prod_secret") 브랜치를 복구하고 :UndotreeHide<Enter> 로 패널을 닫으세요!',
    hint: 'f" ci" prod_secret<Esc> → u → ci" broken_draft<Esc> → :UndotreeToggle<Enter> → :undo 1<Enter> → :UndotreeHide<Enter>',
    par: 78,
    primaryFilename: 'src/token.ts',
    initialLines: ['export const token = "base";'],
    targetLines: ['export const token = "prod_secret";'],
    initialCursor: { line: 0, col: 0 },
    optimalKeys: [
      'f',
      '"',
      'c',
      'i',
      '"',
      ...keysOf('prod_secret'),
      'Escape',
      'u',
      'c',
      'i',
      '"',
      ...keysOf('broken_draft'),
      'Escape',
      ...keysOf(':UndotreeToggle'),
      'Enter',
      ...keysOf(':undo 1'),
      'Enter',
      ...keysOf(':UndotreeHide'),
      'Enter',
    ],
    checkComplete: (state) => {
      const nodeCount = Object.keys(state.undoTreeNodes ?? {}).length;
      return (
        state.lines.length === 1 &&
        state.lines[0] === 'export const token = "prod_secret";' &&
        nodeCount >= 3 &&
        state.undotreePanel === null
      );
    },
  },
  {
    id: 114,
    title: '레슨 114: yanky.nvim 복사 링 순환 붙여넣기(p + Ctrl-p/Ctrl-n · :Yanks)',
    description:
      '여러 단어를 연속으로 복사하거나 삭제하다가 이전에 복사했던 내용이 덮어씌워져 난감했던 경험이 있나요? yanky.nvim 의 Yank Ring 을 사용하면 p 로 붙여넣은 직후 Ctrl-p / Ctrl-n 만 눌러 이전 복사본들로 그 자리에서 즉시 교체할 수 있습니다.\n\n1) p / P 직후 Ctrl-p (이전 복사본) · Ctrl-n (다음 복사본):\n   - 모든 y / d / c 이력이 링 버퍼에 자동 보존되며, 붙여넣기 직후 Ctrl-p 를 누르면 방금 붙여넣은 텍스트가 직전 복사본으로 깔끔하게 교체됩니다.\n\n2) :Yanks (:YankyRingHistory):\n   - 전체 복사 히스토리 팝업을 열어 1~9 또는 Enter 로 원하는 항목을 골라 붙여넣을 수 있습니다.\n\n미션:\n1. 1번째 줄에서 f" yi" 로 "api.prod.local" 을 복사하세요.\n2. j yi" 로 2번째 줄의 "8080" 을 연달아 복사해 기본 클립보드를 덮어쓰세요.\n3. j f" 로 3번째 줄의 첫 따옴표(") 위로 이동해 p 로 붙여넣은 직후, Ctrl-p 를 눌러 이전에 복사했던 "api.prod.local" 로 제자리 교체하세요!',
    hint: 'f" yi" → j yi" → j f" p → Ctrl-p',
    par: 16,
    primaryFilename: 'src/deploy.ts',
    initialLines: [
      'const host = "api.prod.local";',
      'const port = "8080";',
      'const target = "";',
    ],
    targetLines: [
      'const host = "api.prod.local";',
      'const port = "8080";',
      'const target = "api.prod.local";',
    ],
    initialCursor: { line: 0, col: 0 },
    optimalKeys: [
      'f',
      '"',
      'y',
      'i',
      '"',
      'j',
      'y',
      'i',
      '"',
      'j',
      'f',
      '"',
      'p',
      'Ctrl+p',
    ],
    checkComplete: (state) => {
      const target = [
        'const host = "api.prod.local";',
        'const port = "8080";',
        'const target = "api.prod.local";',
      ];
      return (
        (state.yankHistory?.length ?? 0) >= 2 &&
        state.lines.length === target.length &&
        state.lines.every((l, i) => l === target[i])
      );
    },
  },
];
