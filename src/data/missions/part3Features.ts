import { Mission } from '../../types/mission';
import { ensureBuffers } from '../../vim-engine';

export const MISSIONS_PART3: Mission[] = [
  {
    id: 41,
    title: '레슨 41: 순정 ctags 심볼 점프(Ctrl+])와 태그 스택 복귀(Ctrl+t)로 프로젝트 코드 탐색하기',
    description: 'Vim은 외부 플러그인 없이도 순정 ctags 시스템을 통해 함수와 변수 정의부로 빛의 속도로 점프할 수 있습니다. NORMAL 모드에서 식별자(함수명, 변수명) 위에 커서를 두고 Ctrl+](또는 :tag <이름>)를 누르면 정의부가 선언된 파일과 라인으로 버퍼를 전환하며 즉시 이동합니다. 코드 분석을 마친 뒤 Ctrl+t(또는 :pop)를 누르면 태그 스택(Tag Stack)을 거슬러 올라가 원래 호출했던 코드 위치로 정확하게 복귀합니다.',
    hint: 'fa 로 호출 중인 add 함수 위로 커서를 이동한 뒤 Ctrl-](또는 :tag add)를 눌러 정의부(src/utils.ts)로 점프하세요. 정의부를 확인한 뒤 Ctrl-t(또는 :pop)를 눌러 원래 파일(app.ts)로 복귀하면 미션이 완료됩니다.',
    par: 6,
    optimalKeys: ['f', 'a', 'Ctrl-]', 'Ctrl-t'],
    primaryFilename: 'app.ts',
    initialLines: [
      'import { add } from "./utils";',
      '',
      'function calculate() {',
      '  const sum = add(10, 20);',
      '  return sum;',
      '}',
    ],
    targetLines: [
      'import { add } from "./utils";',
      '',
      'function calculate() {',
      '  const sum = add(10, 20);',
      '  return sum;',
      '}',
    ],
    initialCursor: { line: 3, col: 2 },
    checkComplete: (state) => {
      const isReturnedToApp = state.primaryFilename === 'app.ts';
      const hasVisitedUtils = Boolean(
        state.buffers?.some((b) => b.name === 'src/utils.ts')
      );
      const isTagStackCleared = (state.tagStack?.length ?? 0) === 0;

      return (
        state.mode === 'NORMAL' &&
        isReturnedToApp &&
        hasVisitedUtils &&
        isTagStackCleared
      );
    },
  },
  {
    id: 42,
    title: '레슨 42: 순정 diffsplit과 ]c, do로 코드 변경점 비교 및 버그 패치 병합하기',
    description: 'Vim은 별도의 외부 도구 없이도 내장된 순정 diff 모드로 두 파일 간의 차이점을 시각적으로 비교하고 즉시 병합할 수 있습니다. :diffsplit <파일명>(또는 :vert diffsplit)을 실행하면 화면이 세로로 분할되며 변경점(Diff Hunk)이 하이라이트됩니다. ]c와 [c를 눌러 변경점 사이를 초고속으로 점프할 수 있고, do(diffobtain)를 누르면 상대 창의 패치 코드를 현재 버퍼로 가져와 단 1초 만에 병합할 수 있습니다.',
    hint: ']c를 눌러 첫 번째 버그 라인으로 이동한 뒤 do를 입력해 patch.ts의 올바른 코드를 가져오세요. 다시 ]c로 다음 변경점으로 이동해 do를 누르면 모든 차이점이 해결되어 미션이 완료됩니다!',
    par: 8,
    optimalKeys: [']', 'c', 'd', 'o', ']', 'c', 'd', 'o'],
    primaryFilename: 'checkout.ts',
    secondaryFilename: 'patch.ts',
    initialSplit: 'vertical',
    initialDiffMode: true,
    initialLines: [
      'function calculateCartTotal(cart: CartItem[]) {',
      '  let subtotal = 0;',
      '  for (const item of cart) {',
      '    subtotal += item.price; // [BUG] quantity is missing',
      '  }',
      '  const discount = subtotal * 0.05; // [BUG] old 5% discount rate',
      '  return subtotal - discount;',
      '}',
    ],
    secondaryLines: [
      'function calculateCartTotal(cart: CartItem[]) {',
      '  let subtotal = 0;',
      '  for (const item of cart) {',
      '    subtotal += item.price * item.quantity; // [FIX] quantity applied',
      '  }',
      '  const discount = subtotal * 0.15; // [FIX] new 15% promo discount rate',
      '  return subtotal - discount;',
      '}',
    ],
    targetLines: [
      'function calculateCartTotal(cart: CartItem[]) {',
      '  let subtotal = 0;',
      '  for (const item of cart) {',
      '    subtotal += item.price * item.quantity; // [FIX] quantity applied',
      '  }',
      '  const discount = subtotal * 0.15; // [FIX] new 15% promo discount rate',
      '  return subtotal - discount;',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = [
        'function calculateCartTotal(cart: CartItem[]) {',
        '  let subtotal = 0;',
        '  for (const item of cart) {',
        '    subtotal += item.price * item.quantity; // [FIX] quantity applied',
        '  }',
        '  const discount = subtotal * 0.15; // [FIX] new 15% promo discount rate',
        '  return subtotal - discount;',
        '}',
      ];
      if (state.lines.length !== target.length) return false;
      return state.lines.every((line, idx) => line === target[idx]);
    },
  },
  {
    id: 43,
    title: '레슨 43: 순정 경로 완성(Ctrl+x Ctrl+f) & 전체 라인 복제(Ctrl+x Ctrl+l)',
    description: 'Vim의 INSERT 모드에서는 Ctrl+x를 눌러 특수 자동완성 서브모드(^X mode)로 진입할 수 있습니다. 1) 파일 경로 완성: 따옴표 뒤에서 Ctrl+x Ctrl+f를 누르면 프로젝트/VFS 내 파일 경로 목록이 팝업되며, Ctrl+n/Ctrl+p로 순환 선택할 수 있습니다. 2) 전체 라인 완성: 줄 머리에서 키워드를 친 뒤 Ctrl+x Ctrl+l을 누르면 버퍼 내 다른 줄들과 대조하여 일치하는 전체 라인을 단번에 복제 완성합니다.',
    hint: 'A로 줄 끝 입력 모드로 진입한 뒤 Ctrl-x Ctrl-f를 누르고 Ctrl-n으로 utils.ts를 선택하세요. 따옴표와 세미콜론("; )을 닫고 Esc를 누른 뒤, 2j로 아래 줄로 내려가 A 후 Ctrl-x Ctrl-l을 입력해 adminSettings 전체 라인을 복제하면 완료됩니다.',
    par: 15,
    optimalKeys: [
      'A',
      'Ctrl-x',
      'Ctrl-f',
      'Ctrl-n',
      '"',
      ';',
      'Escape',
      '2',
      'j',
      'A',
      'Ctrl-x',
      'Ctrl-l',
      'Escape',
    ],
    primaryFilename: 'app.ts',
    initialLines: [
      'import { add } from "./src/',
      'export const adminSettings = { theme: "dark", autoSave: true };',
      'export const ',
    ],
    targetLines: [
      'import { add } from "./src/utils.ts";',
      'export const adminSettings = { theme: "dark", autoSave: true };',
      'export const adminSettings = { theme: "dark", autoSave: true };',
    ],
    initialCursor: { line: 0, col: 26 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = [
        'import { add } from "./src/utils.ts";',
        'export const adminSettings = { theme: "dark", autoSave: true };',
        'export const adminSettings = { theme: "dark", autoSave: true };',
      ];
      if (state.lines.length !== target.length) return false;
      return state.lines.every((line, idx) => line === target[idx]);
    },
  },
  {
    id: 44,
    title: '레슨 44: 순정 Vim Undo Tree 시간 여행(g-, g+)과 과거 브랜치 복구하기',
    description: '일반적인 에디터는 실행 취소(u) 후 새로운 편집을 시작하면 이전의 redo 기록이 영구히 소실됩니다. 반면 순정 Vim은 모든 변경사항을 "트리(Tree)" 구조로 보존하므로 어떤 브랜치의 과거 코드도 절대 잃어버리지 않습니다! 1) 벽시계 절대 시간 역순 이동: g-를 누르면 다른 브랜치에 묻힌 과거의 완벽한 코드 상태로 시간 여행합니다. 2) 시간 순방향 이동: g+를 누르면 다시 최신 상태로 돌아옵니다. 3) :undolist로 갈라진 브랜치 잎(leaf) 목록을 확인하고, :earlier / :later로 시간 및 파일 저장 단위 복귀도 가능합니다.',
    hint: '과거 브랜치에 작성해 두었던 calculateTax 함수가 u 후 다른 코드를 입력하면서 사라진 상태입니다. NORMAL 모드에서 g-를 입력하여 과거 브랜치의 코드를 단숨에 복원하세요! (또는 :earlier 1)',
    par: 2,
    optimalKeys: ['g', '-'],
    primaryFilename: 'taxService.ts',
    initialLines: [
      '// TODO: implement tax calculation later',
    ],
    targetLines: [
      'export function calculateTax(amount: number): number {',
      '  return amount * 0.1;',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    initialCurrentUndoSeq: 2,
    initialMaxUndoSeq: 2,
    initialUndoTimeHistory: [0, 1, 2],
    initialUndoTimeIndex: 2,
    initialUndoTreeNodes: {
      0: {
        seq: 0,
        parentSeq: null,
        timestamp: 1000,
        lines: ['// Initial template'],
        cursor: { line: 0, col: 0 },
      },
      1: {
        seq: 1,
        parentSeq: 0,
        timestamp: 2000,
        lines: [
          'export function calculateTax(amount: number): number {',
          '  return amount * 0.1;',
          '}',
        ],
        cursor: { line: 0, col: 0 },
      },
      2: {
        seq: 2,
        parentSeq: 0,
        timestamp: 3000,
        lines: ['// TODO: implement tax calculation later'],
        cursor: { line: 0, col: 0 },
      },
    },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = [
        'export function calculateTax(amount: number): number {',
        '  return amount * 0.1;',
        '}',
      ];
      if (state.lines.length !== target.length) return false;
      return state.lines.every((line, idx) => line === target[idx]);
    },
  },
  {
    id: 45,
    title: '레슨 45: 순정 대소문자 변환(gU, gu, g~ + 텍스트 객체/모션)으로 변수명 리팩토링하기',
    description: 'Vim에서는 단어를 일일이 지우고 다시 치지 않아도, 대소문자 변환 연산자(gU, gu, g~)를 모션이나 텍스트 객체(iw, $)와 조합해 순식간에 표기법을 바꿀 수 있습니다. 1) 단어 대문자화: gUiw를 누르면 커서 위치의 단어가 상수형 대문자로 변환됩니다. 2) 단어 소문자화: guiw를 누르면 소문자로 변환됩니다. 3) 줄 끝까지 변환: gU$를 누르면 현재 위치부터 줄 끝까지 대문자가 됩니다. 4) 비주얼 모드: 영역 선택 후 U(대문자), u(소문자), ~(반전)를 누르면 선택 범위 전체가 즉시 변환됩니다.',
    hint: '첫 번째 줄의 maxRetryCount 위에서 gUiw를 입력해 MAXRETRYCOUNT 상수로 만들고, j로 내려가 gu$로 api_key_secret 줄을 소문자로 정리하세요.',
    par: 8,
    optimalKeys: ['g', 'U', 'i', 'w', 'j', 'g', 'u', '$'],
    primaryFilename: 'constants.ts',
    initialLines: [
      'export const maxRetryCount = 5;',
      'export const API_KEY_SECRET = "production_key";',
    ],
    targetLines: [
      'export const MAXRETRYCOUNT = 5;',
      'export const api_key_secret = "production_key";',
    ],
    initialCursor: { line: 0, col: 15 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = [
        'export const MAXRETRYCOUNT = 5;',
        'export const api_key_secret = "production_key";',
      ];
      if (state.lines.length !== target.length) return false;
      return state.lines.every((line, idx) => line === target[idx]);
    },
  },
  {
    id: 46,
    title: '레슨 46: 린터/컴파일러 로그를 퀵픽스로 읽어와 점프하기 (:cfile, :cn, :cp)',
    description: 'CI 빌드나 linter, TypeScript 컴파일러(tsc)가 출력한 에러 로그 파일을 Vim 퀵픽스로 불러오면, 각 소스 코드 파일의 에러 라인과 컬럼으로 즉시 점프하며 디버깅할 수 있습니다. 1) :cfile build.log: 파일의 에러 줄 목록(filename:line:col)을 퀵픽스로 로드하고 첫 번째 에러 위치로 바로 이동합니다. 2) :cn / :cp: 다음 및 이전 에러 위치로 점프합니다. 3) :copen: 퀵픽스 목록 창을 열어 전체 에러를 한눈에 확인합니다.',
    hint: ':cfile build.log 를 입력해 에러 위치로 바로 점프한 뒤, cw로 잘못된 변수명을 정상 변수명(result)으로 교체하세요.',
    par: 26,
    optimalKeys: [
      ':', 'c', 'f', 'i', 'l', 'e', ' ', 'b', 'u', 'i', 'l', 'd', '.', 'l', 'o', 'g', 'Enter',
      'c', 'w', 'r', 'e', 's', 'u', 'l', 't', 'Escape',
    ],
    primaryFilename: 'calc.ts',
    secondaryFilename: 'build.log',
    initialLines: [
      'export function calculateTotal(items: number[]): number {',
      '  const reslt = items.reduce((a, b) => a + b, 0);',
      '  return reslt;',
      '}',
    ],
    secondaryLines: [
      'calc.ts:2:9: error TS2304: Cannot find name "reslt". Did you mean "result"?',
    ],
    targetLines: [
      'export function calculateTotal(items: number[]): number {',
      '  const result = items.reduce((a, b) => a + b, 0);',
      '  return reslt;',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = [
        'export function calculateTotal(items: number[]): number {',
        '  const result = items.reduce((a, b) => a + b, 0);',
        '  return reslt;',
        '}',
      ];
      if (state.lines.length !== target.length) return false;
      return state.lines.every((line, idx) => line === target[idx]);
    },
  },
  {
    id: 47,
    title: '레슨 47: 순정 코드 폴딩(za, zo, zM, zR)으로 대형 파일 탐색 및 특정 함수 리팩토링하기',
    description:
      '대형 코드베이스에서는 수백 줄의 함수들로 인해 원하는 코드를 찾기 어렵습니다. Vim의 순정 폴딩(Folding) 기능을 활용하면 블록 단위로 코드를 접고 펼치며 고속으로 탐색할 수 있습니다.\n\n1) zM: 버퍼 내의 모든 함수/중괄호 블록을 일괄 접습니다.\n2) za: 커서 위치의 접힌 블록을 펼치거나(zo), 열린 블록을 다시 접습니다(zc).\n3) zR: 버퍼 내의 모든 접힌 블록을 일괄 펼칩니다.\n\n미션: zM으로 모든 함수를 접은 뒤 calculateTotal 함수 블록으로 이동하여 za로 펼치고, discount 변수를 5로 수정한 다음 zM으로 다시 모든 블록을 접어 완료하세요.',
    hint: 'zM을 눌러 모든 블록을 접은 뒤, 3j로 calculateTotal 함수 줄로 이동하여 za를 눌러 펼치세요. j f0 r5 로 discount = 0을 discount = 5로 수정한 뒤, zM을 눌러 다시 모두 접으면 완료됩니다.',
    par: 13,
    optimalKeys: ['z', 'M', '3', 'j', 'z', 'a', 'j', 'f', '0', 'r', '5', 'z', 'M'],
    primaryFilename: 'cart.ts',
    initialLines: [
      'function validateCart() {',
      '  const valid = true;',
      '  checkInventory();',
      '  return valid;',
      '}',
      'function calculateTotal() {',
      '  const discount = 0;',
      '  const tax = 10;',
      '  return 100 - discount;',
      '}',
      'function printInvoice() {',
      '  const sent = true;',
      '  notifyUser();',
      '  return sent;',
      '}',
    ],
    targetLines: [
      'function validateCart() {',
      '  const valid = true;',
      '  checkInventory();',
      '  return valid;',
      '}',
      'function calculateTotal() {',
      '  const discount = 5;',
      '  const tax = 10;',
      '  return 100 - discount;',
      '}',
      'function printInvoice() {',
      '  const sent = true;',
      '  notifyUser();',
      '  return sent;',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const isModifiedCorrectly =
        state.lines.length === 15 && state.lines[6] === '  const discount = 5;';
      const allClosed =
        !!state.folds &&
        state.folds.length > 0 &&
        state.folds.every((f) => f.closed);
      return isModifiedCorrectly && allClosed;
    },
  },
  {
    id: 48,
    title: '레슨 48: 대화형 치환(:%s/old/new/gc)으로 안전하게 변수 선별 치환하기',
    description:
      '전체 일괄 치환(:%s/old/new/g)을 실행하면 의도치 않게 다른 라이브러리 속성이나 주석의 단어까지 모두 바뀌어 버그가 발생할 수 있습니다.\n\nVim에서는 c 플래그(:%s/old/new/gc)를 지정하여 각 일치 항목마다 치환 여부를 직접 결정하는 순정 대화형 확인(Confirm) 모드를 제공합니다.\n\n1) y: 현재 매칭을 새 문자열로 치환하고 다음 매칭으로 이동합니다.\n2) n: 현재 매칭을 건너뛰고(치환 안 함) 다음 매칭으로 이동합니다.\n3) a: 현재 매칭 및 남은 모든 매칭을 한 번에 일괄 치환합니다.\n4) q: 치환 작업을 즉시 중단하고 빠져나옵니다.\n\n미션: :%s/status/state/gc 명령을 실행하여 status 변수는 state로 치환(y)하고, HTTP 응답 속성(res.status)은 건너뛰어(n) 안전하게 리팩토링을 완료하세요.',
    hint: ':%s/status/state/gc 를 입력하고 Enter를 누르면 대화형 확인 프롬프트가 열립니다. 첫 번째 매칭에서 y, 두 번째 매칭(res.status)에서 n, 세 번째 매칭에서 y를 차례대로 누르세요.',
    par: 23,
    optimalKeys: [
      ':', '%', 's', '/', 's', 't', 'a', 't', 'u', 's', '/', 's', 't', 'a', 't', 'e', '/', 'g', 'c', 'Enter',
      'y', 'n', 'y',
    ],
    primaryFilename: 'handler.ts',
    initialLines: [
      'let status = "pending";',
      'if (res.status === 200) {',
      '  status = "success";',
      '}',
    ],
    targetLines: [
      'let state = "pending";',
      'if (res.status === 200) {',
      '  state = "success";',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      if (state.confirmSubstitute) return false;
      const target = [
        'let state = "pending";',
        'if (res.status === 200) {',
        '  state = "success";',
        '}',
      ];
      if (state.lines.length !== target.length) return false;
      return state.lines.every((line, idx) => line === target[idx]);
    },
  },
  {
    id: 49,
    title: '레슨 49: 윈도우 로컬 로케이션 리스트(:lvimgrep, :lopen, :lne)로 현재 창 진단 및 수정하기',
    description:
      '퀵픽스(:vimgrep, :copen)가 에디터 전역(Global)의 에러 목록이라면, 로케이션 리스트(Location List: :lvimgrep, :lopen)는 현재 창에만 독립적으로 귀속되는 윈도우 로컬 목록입니다.\n\n분할 화면이나 다중 파일 작업 시 각 창마다 서로 다른 에러/검색 결과를 유지할 때 유용합니다.\n\n1) :lvimgrep /FIXME/ %: 현재 파일(%) 내에서 FIXME를 검색하여 로케이션 리스트를 생성하고 첫 번째 항목으로 이동합니다.\n2) :lopen: 현재 창의 로케이션 리스트 창을 엽니다.\n3) :lne / :lp: 다음/이전 매칭 위치로 이동합니다.\n4) :lcl: 로케이션 리스트 창을 닫습니다.\n\n미션: :lvimgrep /FIXME/ % 명령으로 파일 내 2개의 FIXME 주석 위치를 로케이션 리스트에 등록한 후, 첫 번째 매칭을 cwDONE<Esc>로 수정하고 :lne 로 두 번째 위치로 이동하여 . (점 반복)으로 수정한 뒤 완료하세요.',
    hint: ':lvimgrep /FIXME/ % 를 실행하면 첫 번째 FIXME 위치로 자동 점프합니다. cwDONE<Esc> 로 수정한 뒤, :lne 로 두 번째 위치로 점프하여 . (점 반복)을 누르면 완료됩니다.',
    par: 33,
    optimalKeys: [
      ':', 'l', 'v', 'i', 'm', 'g', 'r', 'e', 'p', ' ', '/', 'F', 'I', 'X', 'M', 'E', '/', ' ', '%', 'Enter',
      'c', 'w', 'D', 'O', 'N', 'E', 'Escape',
      ':', 'l', 'n', 'e', 'Enter',
      '.',
    ],
    primaryFilename: 'order.ts',
    initialLines: [
      'export function processOrder(order: Order) {',
      '  // FIXME: validate user balance',
      '  deductBalance(order.userId, order.amount);',
      '  // FIXME: send push notification',
      '  return { success: true };',
      '}',
    ],
    targetLines: [
      'export function processOrder(order: Order) {',
      '  // DONE: validate user balance',
      '  deductBalance(order.userId, order.amount);',
      '  // DONE: send push notification',
      '  return { success: true };',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = [
        'export function processOrder(order: Order) {',
        '  // DONE: validate user balance',
        '  deductBalance(order.userId, order.amount);',
        '  // DONE: send push notification',
        '  return { success: true };',
        '}',
      ];
      if (state.lines.length !== target.length) return false;
      return state.lines.every((line, idx) => line === target[idx]);
    },
  },
  {
    id: 50,
    title: "레슨 50: 순정 대문자 전역 마크(mA~mZ, 'A~'Z)로 파일/버퍼 간 순간이동하기",
    description:
      "소문자 마크(ma~mz)는 현재 열려 있는 단일 파일 내에서만 유효하지만, 대문자 전역 마크(mA~mZ)는 파일명과 버퍼 정보를 함께 기억하는 순정 Vim의 강력한 기능입니다.\n\n다른 파일로 버퍼를 이동하거나 수많은 파일을 오가며 작업하더라도, 언제든 'A (또는 `A)를 누르면 해당 마크가 저장된 파일로 즉시 자동 전환되며 해당 라인으로 순간이동합니다.\n\n1) mA: 현재 파일의 커서 위치를 대문자 전역 마크 A에 저장합니다.\n2) :bn: 다른 버퍼 파일(config.ts)로 이동합니다.\n3) 'A: 어떤 파일에 있든 상관없이 마크 A가 설정된 원래 파일(server.ts)로 버퍼를 자동 전환하며 점프합니다.\n4) :marks: 저장된 모든 마크의 파일과 행/열 목록을 표 형태로 조회합니다.\n\n미션: server.ts에서 mA로 전역 마크를 저장한 뒤, :bn 명령으로 config.ts로 넘어가 port 값을 8080으로 수정(2w cw8080<Esc>)하고, 'A 를 눌러 1초 만에 server.ts의 원래 위치로 순간이동 복귀하세요.",
    hint: "mA 를 눌러 현재 위치를 전역 마크 A에 기억시키세요. :bn 으로 config.ts로 이동한 뒤, 2w cw8080<Esc> 로 포트를 수정하세요. 그 다음 'A 를 누르면 자동으로 server.ts로 돌아오며 미션이 완료됩니다.",
    par: 17,
    optimalKeys: ['m', 'A', ':', 'b', 'n', 'Enter', '2', 'w', 'c', 'w', '8', '0', '8', '0', 'Escape', "'", 'A'],
    primaryFilename: 'server.ts',
    secondaryFilename: 'config.ts',
    initialLines: [
      '// Server Entry Point',
      'export const API_URL = "/api/v1";',
      'startServer();',
    ],
    secondaryLines: [
      'PORT = 3000;',
      'HOST = "localhost";',
    ],
    targetLines: [
      '// Server Entry Point',
      'export const API_URL = "/api/v1";',
      'startServer();',
    ],
    initialCursor: { line: 1, col: 13 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const s = ensureBuffers(state);
      const buf1 = s.buffers?.find((b) => b.name === 'server.ts' || b.id === 1);
      const buf2 = s.buffers?.find((b) => b.name === 'config.ts' || b.id === 2);
      const isBackOnServer = s.currentBufferId === 1 || s.primaryFilename === 'server.ts';
      const isConfigUpdated = buf2?.lines[0] === 'PORT = 8080;';
      const isServerIntact = !!buf1 && buf1.lines[1] === 'export const API_URL = "/api/v1";';
      const isCursorAtMark = state.cursor.line === 1;

      return isBackOnServer && isConfigUpdated && isServerIntact && isCursorAtMark;
    },
  },
  {
    id: 51,
    title: '레슨 51: 순정 키매핑 인터프리터(:nmap, :nnoremap)로 나만의 단축키 정의하고 실행하기',
    description:
      'Vim의 가장 강력한 확장성 중 하나는 키매핑 인터프리터입니다. 반복되는 긴 명령어 시퀀스나 비효율적인 기본 동작을 나만의 직관적인 단축키로 재정의할 수 있습니다.\n\n순정 Vim에서 D(줄 끝까지 삭제), C(줄 끝까지 변경)와 달리, 기본 Y는 줄 전체 복사(yy)로 동작하여 일관성이 떨어집니다. 따라서 전 세계 대부분의 Vim 사용자는 Y를 "커서 위치부터 줄 끝까지 복사(y$)"로 재정의하여 사용합니다.\n\n1) :nmap Y y$: 일반 모드(Normal Mode)에서 Y를 누르면 y$가 실행되도록 키매핑을 등록합니다.\n2) :nnoremap Y y$: 비재귀적(No-Remap) 안전 매핑으로, y나 $에 다른 매핑이 걸려 있어도 본래의 순정 동작으로 실행되도록 보호합니다.\n3) :nmap: 현재 등록된 일반 모드 키매핑 목록을 표 형태로 조회합니다.\n4) :nunmap Y: 등록된 노멀 모드 키매핑을 해제합니다.\n\n미션: :nmap Y y$<Enter> 명령으로 필수 단축키 Y를 정의하세요. 그 다음 Y 를 눌러 현재 위치부터 줄 끝("alpha-beta";)까지 복사하고, j 로 다음 줄로 이동한 후 p 로 붙여넣어 백업 키를 완성하세요.',
    hint: ':nmap Y y$<Enter> 를 입력하여 Y 단축키를 정의한 뒤, Y 를 눌러 복사하고, j 로 아래 줄로 내려가 p 로 붙여넣으세요.',
    par: 14,
    optimalKeys: [
      ':', 'n', 'm', 'a', 'p', ' ', 'Y', ' ', 'y', '$', 'Enter',
      'Y',
      'j',
      'p',
    ],
    initialLines: [
      'primaryKey = "alpha-beta";',
      'backupKey = ',
    ],
    targetLines: [
      'primaryKey = "alpha-beta";',
      'backupKey = "alpha-beta";',
    ],
    initialCursor: { line: 0, col: 13 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const isMappingRegistered =
        state.userKeymaps?.['n:Y'] === 'y$' ||
        state.userKeymaps?.['Y'] === 'y$';
      const target0 = 'primaryKey = "alpha-beta";';
      const target1 = 'backupKey = "alpha-beta";';
      return (
        isMappingRegistered &&
        state.lines[0] === target0 &&
        state.lines[1] === target1
      );
    },
  },
  {
    id: 52,
    title: '레슨 52: 사실상 Vim 필수 표준 플러그인 vim-surround로 괄호·따옴표 감싸고 변경하기',
    description:
      'Vim 생태계에서 가장 유명하고 사랑받는 플러그인이자 Neovim, VSCode Vim, IdeaVim에 기본 내장된 사실상 표준 기능인 vim-surround입니다.\n\n괄호나 따옴표를 지우고 새로 입력하느라 고생할 필요 없이, 단 2~4타의 키스트로크로 텍스트를 감싸거나(ys), 변경하거나(cs), 벗겨낼(ds) 수 있습니다.\n\n1) cs{old}{new}: 둘러싸인 기호를 변경합니다. (예: cs"\' 큰따옴표를 작은따옴표로 교체, cs)] 소괄호를 대괄호로 교체)\n2) ds{char}: 둘러싸인 기호를 삭제합니다. (예: ds" 따옴표 벗기기, ds) 괄호 벗기기)\n3) ys{motion}{char}: 지정한 모션 영역을 기호로 감쌉니다. (예: ysiw" 커서 단어를 큰따옴표로 감싸기)\n4) yss{char}: 들여쓰기를 유지하며 줄 전체를 기호로 감쌉니다.\n\n미션:\n1) 첫 번째 줄에서 cs"\' 로 큰따옴표를 작은따옴표(\')로 변경하세요.\n2) 다음 줄(j)로 이동하여 cs)] 로 소괄호를 대괄호([])로 변경하세요.\n3) 다음 줄(j)로 내려간 후 ysiw" 로 product 단어를 큰따옴표로 감싸세요.',
    hint: 'cs"\' 로 1번 줄 큰따옴표를 작은따옴표로 바꾸고, j 로 내려가 cs)] 로 괄호를 대괄호로 바꾼 뒤, j 로 내려가 ysiw" 로 product 를 감싸세요.',
    par: 15,
    optimalKeys: [
      'c', 's', '"', "'",
      'j',
      'c', 's', ')', ']',
      'j',
      'y', 's', 'i', 'w', '"',
    ],
    initialLines: [
      'const title = "Welcome to Vim";',
      'const tags = (frontend, react);',
      'const item = product;',
    ],
    targetLines: [
      "const title = 'Welcome to Vim';",
      'const tags = [frontend, react];',
      'const item = "product";',
    ],
    initialCursor: { line: 0, col: 14 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target0 = "const title = 'Welcome to Vim';";
      const target1 = 'const tags = [frontend, react];';
      const target2 = 'const item = "product";';
      return (
        state.lines[0] === target0 &&
        state.lines[1] === target1 &&
        state.lines[2] === target2
      );
    },
  },
  {
    id: 53,
    title: '레슨 53: 매크로 반복 실행([count]@a, @@)과 슬로우모션 디버거로 매크로 검증하기',
    description:
      '매크로는 한 번 녹화하면 원하는 만큼 재생할 수 있습니다. 하지만 긴 매크로가 어디서 꼬였는지 눈으로 따라가기는 어렵습니다.\n\n1) @a: 레지스터 a의 매크로를 한 번 실행합니다.\n2) @@: 마지막으로 실행한 매크로를 다시 실행합니다.\n3) [count]@@ / [count]@a: 숫자를 붙이면 그 횟수만큼 반복합니다. (예: 3@@)\n\n💡 상단 [패널 보기] → [🎞️ 매크로 디버거]를 켜면 녹화한 매크로를 1x / 0.5x / 0.2x 슬로우모션으로 재생하거나 키 하나씩 스텝 실행하며 커서와 모드 변화를 미리볼 수 있습니다. 미리보기는 실제 버퍼를 바꾸지 않습니다.\n\n미션:\n1) 첫 줄에서 qa I- [ ] <Esc> j q 로 체크박스를 붙이고 다음 줄로 내려가는 매크로를 녹화하세요.\n2) @a 로 두 번째 줄에 매크로를 적용하세요.\n3) 3@@ 로 나머지 세 줄에 한 번에 반복 적용하세요.',
    hint: 'qa → I → "- [ ] " 입력 → Esc → j → q 로 녹화한 뒤, @a 와 3@@ 를 입력하세요. 매크로 디버거 패널에서 슬로우모션으로 미리 확인해 볼 수 있습니다.',
    par: 17,
    optimalKeys: [
      'q', 'a', 'I', '-', ' ', '[', ' ', ']', ' ', 'Escape', 'j', 'q',
      '@', 'a',
      '3', '@', '@',
    ],
    initialLines: [
      'fix login bug',
      'update README',
      'add unit tests',
      'refactor parser',
      'bump version',
    ],
    targetLines: [
      '- [ ] fix login bug',
      '- [ ] update README',
      '- [ ] add unit tests',
      '- [ ] refactor parser',
      '- [ ] bump version',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = [
        '- [ ] fix login bug',
        '- [ ] update README',
        '- [ ] add unit tests',
        '- [ ] refactor parser',
        '- [ ] bump version',
      ];
      return state.lines.length === target.length && target.every((t, i) => state.lines[i] === t);
    },
  },
  {
    id: 54,
    title: '레슨 54: 인덴트 텍스트 객체(ii, ai, aI)로 YAML·Python 들여쓰기 블록 통째로 다루기',
    description:
      'Python, YAML처럼 괄호 대신 들여쓰기로 블록을 나누는 코드에서는 i{ 같은 괄호 텍스트 객체를 쓸 수 없습니다. 이럴 때는 들여쓰기 깊이 자체를 범위로 삼는 인덴트 텍스트 객체를 씁니다. (vim-indent-object 플러그인과 동일한 동작, 항상 줄 단위)\n\n1) ii: 커서 줄과 들여쓰기가 같거나 더 깊은 연속된 줄 (중간 빈 줄 포함)\n2) ai: ii + 바로 위의 헤더 줄 (예: `legacy:`, `def foo():`)\n3) aI: ai + 바로 아래의 경계 줄\n4) 2ii, 3ii: 숫자를 붙이면 한 단계씩 바깥 블록으로 확장\n\nd, c, y, v, =, gU 등 모든 연산자와 조합할 수 있습니다. (dii, cii, yai, vii ...)\n\n미션:\n1) 커서가 있는 legacy 블록을 dai 로 헤더 줄(legacy:)까지 통째로 삭제하세요.\n2) j 로 database 의 첫 항목으로 내려가 cii 로 블록 전체를 지우고 path: ./dev.db 를 입력한 뒤 Esc 를 누르세요.',
    hint: 'dai 로 legacy 블록을 지운 뒤, j 로 내려가 cii → "path: ./dev.db" 입력 → Esc 를 누르세요.',
    par: 22,
    optimalKeys: [
      'd', 'a', 'i',
      'j',
      'c', 'i', 'i',
      'p', 'a', 't', 'h', ':', ' ', '.', '/', 'd', 'e', 'v', '.', 'd', 'b',
      'Escape',
    ],
    initialLines: [
      'server:',
      '  port: 8080',
      '  debug: true',
      '  legacy:',
      '    host: old.example.com',
      '    retries: 3',
      'database:',
      '  host: db.internal',
      '  user: admin',
    ],
    targetLines: [
      'server:',
      '  port: 8080',
      '  debug: true',
      'database:',
      '  path: ./dev.db',
    ],
    initialCursor: { line: 4, col: 4 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = ['server:', '  port: 8080', '  debug: true', 'database:', '  path: ./dev.db'];
      return state.lines.length === target.length && target.every((t, i) => state.lines[i] === t);
    },
  },
  {
    id: 55,
    title: '레슨 55: 사용자 정의 Ex 명령(:command!)으로 나만의 명령 만들기',
    description:
      '자주 쓰는 긴 Ex 명령은 :command! 로 이름을 붙여 두면 짧게 다시 쓸 수 있습니다. ~/.vimrc 에 적어 두면 :source 할 때마다 자동으로 등록됩니다.\n\n:command[!] [속성] {Name} {실행할 Ex 명령}\n- 이름은 반드시 대문자로 시작합니다. (:W, :Trim, :D)\n- -nargs=0|1|*|?|+ : 인자 개수 (기본 0)\n- -range / -range=% : 범위 허용 (:2,5Name), -bang : :Name! 허용\n- 실행할 명령 안에서 <args>(인자), <q-args>(따옴표로 감싼 인자), <line1>/<line2>(범위), <bang> 이 치환됩니다.\n- :command 로 목록 확인, :delcommand Name 으로 삭제, :Na 처럼 겹치지 않는 접두어로도 호출할 수 있습니다.\n\n미션:\n1) :com! -nargs=1 D g/<args>/d 를 입력해, 인자로 받은 패턴이 들어간 줄을 모두 지우는 :D 명령을 만드세요.\n2) :D console 로 디버그용 console.log 줄을 한 번에 지우세요.',
    hint: ':com! -nargs=1 D g/<args>/d 입력 후 Enter, 이어서 :D console 입력 후 Enter',
    par: 39,
    optimalKeys: [
      ':', 'c', 'o', 'm', '!', ' ', '-', 'n', 'a', 'r', 'g', 's', '=', '1', ' ', 'D', ' ', 'g', '/', '<', 'a', 'r', 'g', 's', '>', '/', 'd', 'Enter', ':', 'D', ' ', 'c', 'o', 'n', 's', 'o', 'l', 'e', 'Enter',
    ],
    initialLines: [
      'const a = 1;',
      'console.log("debug a");',
      'const b = 2;',
      'console.log("debug b");',
      'export { a, b };',
    ],
    targetLines: [
      'const a = 1;',
      'const b = 2;',
      'export { a, b };',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = ['const a = 1;', 'const b = 2;', 'export { a, b };'];
      const hasCommand = !!state.userCommands?.D;
      return hasCommand && state.lines.length === target.length && target.every((t, i) => state.lines[i] === t);
    },
  },
  {
    id: 56,
    title: '레슨 56: Vim script 함수(:function, :call)로 반복 작업을 함수로 만들기',
    description:
      'Vim script 함수를 만들면 여러 단계의 편집을 이름 하나로 묶어 다시 쓸 수 있습니다.\n\n1) :function! Name(인자) 를 입력하고 Enter 를 누르면 본문 입력이 이어집니다. (상태 표시줄에 몇 번째 줄인지 표시)\n2) 본문을 한 줄씩 입력하고 endfunction(endf) 으로 끝냅니다. Esc 를 누르면 정의가 취소됩니다.\n3) :call Name() 으로 실행합니다. :[범위]call 은 함수에 range 속성이 없으면 범위의 줄마다 커서를 옮겨 가며 호출합니다.\n\n본문에서 쓸 수 있는 것: let, echo, execute(문자열을 Ex 명령으로 실행), return, if/elseif/else/endif, while, call, 그리고 :normal 같은 모든 Ex 명령. a:인자, a:firstline/a:lastline, getline()/setline()/line() 같은 내장 함수도 지원합니다.\n\n미션:\n1) :fu! Cmt() 를 입력해 함수 정의를 시작하세요.\n2) 본문에 exe "norm! I// " 를 입력하세요. (현재 줄 맨 앞에 // 를 붙임)\n3) endf 로 정의를 마치세요.\n4) :%call Cmt() 로 모든 줄을 한 번에 주석 처리하세요.',
    hint: ':fu! Cmt() Enter → exe "norm! I// " Enter → endf Enter → :%call Cmt() Enter',
    par: 46,
    optimalKeys: [
      ':', 'f', 'u', '!', ' ', 'C', 'm', 't', '(', ')', 'Enter', 'e', 'x', 'e', ' ', '"', 'n', 'o', 'r', 'm', '!', ' ', 'I', '/', '/', ' ', '"', 'Enter', 'e', 'n', 'd', 'f', 'Enter', ':', '%', 'c', 'a', 'l', 'l', ' ', 'C', 'm', 't', '(', ')', 'Enter',
    ],
    initialLines: [
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
    ],
    targetLines: [
      '// const a = 1;',
      '// const b = 2;',
      '// const c = 3;',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = ['// const a = 1;', '// const b = 2;', '// const c = 3;'];
      const hasFunction = !!state.userFunctions?.Cmt;
      return hasFunction && state.lines.length === target.length && target.every((t, i) => state.lines[i] === t);
    },
  },
  {
    id: 57,
    title: '레슨 57: Vim script 리스트·map()·printf()로 버퍼 전체를 한 번에 가공하기',
    description:
      'Vim script 는 숫자·문자열뿐 아니라 리스트 [1, 2] 와 딕셔너리 {\'k\': v} 를 다룰 수 있습니다. 버퍼의 줄들을 리스트로 읽어 가공한 뒤 다시 써 넣으면, 정규식 치환만으로는 어려운 편집도 한 줄 명령으로 끝납니다.\n\n- getline(1, \'$\'): 1번 줄부터 마지막 줄까지를 리스트로 읽기\n- map(list, \'표현식\'): 각 항목을 v:val(값), v:key(인덱스)로 바꾼 새 리스트\n- printf(\'%d. %s\', n, s): 서식 문자열 (%d 숫자, %s 문자열, %03d 0 채움, %-5s 왼쪽 정렬)\n- setline(1, list): 1번 줄부터 리스트의 항목을 차례로 써 넣기\n\n그 밖에 filter(), sort(), join(), split(), substitute(), range(), len(), keys()/values()/items(), =~ 정규식 비교, :for x in list ... :endfor, :let [a, b] = [1, 2] 도 사용할 수 있습니다. :call 하나는 u 한 번으로 되돌릴 수 있습니다.\n\n미션:\n:call setline(1, map(getline(1, \'$\'), \'printf("%d. %s", v:key + 1, v:val)\')) 로 모든 할 일 앞에 번호를 붙이세요.',
    hint: ':call setline(1, map(getline(1, \'$\'), \'printf("%d. %s", v:key + 1, v:val)\')) 를 입력하고 Enter',
    par: 77,
    optimalKeys: [
      ':', 'c', 'a', 'l', 'l', ' ', 's', 'e', 't', 'l', 'i', 'n', 'e', '(', '1', ',', ' ', 'm', 'a', 'p', '(', 'g', 'e', 't', 'l', 'i', 'n', 'e', '(', '1', ',', ' ', "'", '$', "'", ')', ',', ' ', "'", 'p', 'r', 'i', 'n', 't', 'f', '(', '"', '%', 'd', '.', ' ', '%', 's', '"', ',', ' ', 'v', ':', 'k', 'e', 'y', ' ', '+', ' ', '1', ',', ' ', 'v', ':', 'v', 'a', 'l', ')', "'", ')', ')', 'Enter',
    ],
    initialLines: [
      'Install dependencies',
      'Run the tests',
      'Build for production',
      'Deploy',
    ],
    targetLines: [
      '1. Install dependencies',
      '2. Run the tests',
      '3. Build for production',
      '4. Deploy',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = ['1. Install dependencies', '2. Run the tests', '3. Build for production', '4. Deploy'];
      return state.lines.length === target.length && target.every((t, i) => state.lines[i] === t);
    },
  },
  {
    id: 58,
    title: '레슨 58: 문단·문장 텍스트 객체(ip, ap, is, as)로 문서 구조 다듬기',
    description:
      'iw, i( 처럼 단어와 괄호를 다루듯, 문단과 문장도 텍스트 객체로 한 번에 다룰 수 있습니다.\n\n1) ip: 커서가 있는 문단 (빈 줄로 구분, 공백만 있는 줄도 빈 줄로 봄)\n2) ap: 문단 + 뒤의 빈 줄 (마지막 문단이면 앞의 빈 줄) → dap 로 지우고 P 로 붙이면 문단 순서를 바꿀 수 있습니다.\n3) is: 커서가 있는 문장 (. ! ? 뒤에 공백이나 줄 끝이 오면 문장 끝)\n4) as: 문장 + 뒤 공백 (뒤 공백이 없으면 앞 공백)\n\nd, c, y, v, gU 등 모든 연산자와 함께 쓰고, 2dap / d2as 처럼 카운트도 붙일 수 있습니다.\n\n미션:\n1) 커서가 있는 ## Deploy 문단을 dap 로 잘라내세요.\n2) gg 로 맨 위로 가서 P 로 붙여 넣어 Deploy 를 첫 번째 문단으로 옮기세요.\n3) 4j 로 Install 줄로 내려가 fR 로 Run 으로 이동한 뒤, das 로 "Run the build." 문장을 지우세요.',
    hint: 'dap → gg → P 로 문단을 옮기고, 4j → fR → das 로 문장을 지우세요.',
    par: 13,
    optimalKeys: ['d', 'a', 'p', 'g', 'g', 'P', '4', 'j', 'f', 'R', 'd', 'a', 's'],
    initialLines: [
      '## Setup',
      'Install the tools. Run the build.',
      '',
      '## Deploy',
      'Push the image. Restart the pods.',
      '',
      '## Notes',
      'Ask the team first.',
    ],
    targetLines: [
      '## Deploy',
      'Push the image. Restart the pods.',
      '',
      '## Setup',
      'Install the tools.',
      '',
      '## Notes',
      'Ask the team first.',
    ],
    initialCursor: { line: 4, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = [
        '## Deploy',
        'Push the image. Restart the pods.',
        '',
        '## Setup',
        'Install the tools.',
        '',
        '## Notes',
        'Ask the team first.',
      ];
      return state.lines.length === target.length && target.every((t, i) => state.lines[i] === t);
    },
  },
  {
    id: 59,
    title: '레슨 59: 순정 Vim 정규식(\\zs, \\d\\+)과 \\= 계산식 치환으로 설정 값 일괄 변경하기',
    description:
      'Vim 의 기본(magic) 정규식에서는 + ? | ( ) { } 가 그냥 글자이고, 앞에 \\ 를 붙여야 기호가 됩니다. (\\+ 하나 이상, \\( \\) 묶음, \\| 또는) 기호를 \\ 없이 쓰고 싶으면 패턴 앞에 \\v 를 붙이세요.\n\n- \\d\\+ : 숫자 하나 이상\n- \\zs / \\ze : 찾은 부분 중 실제로 바꿀 시작·끝을 지정 (= \\zs\\d\\+ 는 "= " 뒤의 숫자만 바꿈)\n- \\=식 : 바꿀 내용을 Vim script 식으로 계산, submatch(0) 은 찾은 전체, submatch(1) 은 첫 번째 묶음\n- :&& / g& : 직전 치환 반복, 치환 문자열의 ~ : 직전 치환 문자열\n\n미션:\n:%s/= \\zs\\d\\+/\\=submatch(0) * 2/ 로 숫자로 된 설정 값만 모두 두 배로 바꾸세요. (name 처럼 문자열 값은 그대로 두어야 합니다)',
    hint: ':%s/= \\zs\\d\\+/\\=submatch(0) * 2/ 를 입력하고 Enter',
    par: 33,
    optimalKeys: [
      ':', '%', 's', '/', '=', ' ', '\\', 'z', 's', '\\', 'd', '\\', '+', '/', '\\', '=', 's', 'u', 'b', 'm', 'a', 't', 'c', 'h', '(', '0', ')', ' ', '*', ' ', '2', '/', 'Enter',
    ],
    initialLines: [
      'timeout = 30',
      'retries = 3',
      'name = "api"',
      'port = 8080',
    ],
    targetLines: [
      'timeout = 60',
      'retries = 6',
      'name = "api"',
      'port = 16160',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = ['timeout = 60', 'retries = 6', 'name = "api"', 'port = 16160'];
      return state.lines.length === target.length && target.every((t, i) => state.lines[i] === t);
    },
  },
  {
    id: 60,
    title: '레슨 60: 보조 모션(]), [(, g_, ge, +, -, (, ))으로 정밀하게 이동하고 지우기',
    description:
      'hjkl, w, b, e 외에도 Vim 에는 코드와 문장을 다룰 때 유용한 이동 키가 많습니다. 모두 d, c, y 와 함께 쓸 수 있습니다.\n\n- [( / ]) : 커서를 감싸고 있는 ( 의 시작 / ) 의 끝으로 ([{ / ]} 는 중괄호). 안쪽의 짝 있는 괄호는 건너뜁니다.\n- ( / ) : 이전 / 다음 문장의 시작\n- ge / gE : 이전 단어 / WORD 의 끝 (e 의 반대 방향)\n- g_ : 줄의 마지막 공백 아닌 문자 ($ 와 달리 뒤 공백을 건너뜀)\n- + / Enter / - : 다음 / 이전 줄의 첫 공백 아닌 문자\n- [count]| : count 번째 칸\n\n미션:\n1) 커서가 있는 쉼표에서 d]) 로 닫는 괄호 앞까지 인자를 지우세요.\n2) g_ 로 줄의 마지막 공백 아닌 문자(;)로 가서 l → D 로 뒤에 남은 공백을 지우세요.\n3) + 로 다음 줄로 내려가 d) 로 첫 문장 "Remove this. " 를 지우세요.',
    hint: 'd]) → g_ → l → D → + → d)',
    par: 10,
    optimalKeys: ['d', ']', ')', 'g', '_', 'l', 'D', '+', 'd', ')'],
    initialLines: [
      'call(alpha, beta, gamma);   ',
      'Remove this. Keep me.',
    ],
    targetLines: [
      'call(alpha);',
      'Keep me.',
    ],
    initialCursor: { line: 0, col: 10 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      return state.lines.length === 2 && state.lines[0] === 'call(alpha);' && state.lines[1] === 'Keep me.';
    },
  },
];
