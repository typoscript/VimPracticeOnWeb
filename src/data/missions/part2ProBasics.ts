import { Mission } from '../../types/mission';
import { ensureBuffers, syncCurrentBuffer, ensureTabPages } from '../../vim-engine';

export const MISSIONS_PART2: Mission[] = [
  {
    id: 21,
    title: '레슨 21: 실무 필수 라인/문자 편집 (J, ~, >>, <<, Ctrl-a/x)',
    description: '~로 대소문자를 변경하고, Ctrl-a로 숫자를 증가시키며, J로 줄을 이어붙이고 >>로 들여쓰기를 맞춰보세요.',
    hint: '~로 V를 만들고, Ctrl-a로 1을 2로 올린 뒤, j -> J로 아래 줄을 연결하고, j -> >>로 들여쓰기를 정렬하세요.',
    par: 7,
    optimalKeys: ['~', 'Ctrl-a', 'j', 'J', 'j', '>', '>'],
    initialLines: [
      'const version = 1;',
      'const message =',
      '  "hello vim";',
      'console.log(message);',
    ],
    targetLines: [
      'const Version = 2;',
      'const message = "hello vim";',
      '  console.log(message);',
    ],
    initialCursor: { line: 0, col: 6 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === 3 &&
        state.lines[0] === 'const Version = 2;' &&
        state.lines[1] === 'const message = "hello vim";' &&
        state.lines[2] === '  console.log(message);'
      );
    },
  },
  {
    id: 22,
    title: '레슨 22: :g 글로벌 명령과 :norm으로 초고속 일괄 편집 (:g/pattern/d, :norm)',
    description: ':g/console/d 명령으로 불필요한 디버그 로그 줄을 한 번에 삭제하고, :%norm A; 명령으로 남은 모든 줄 끝에 세미콜론(;)을 추가하세요.',
    hint: ':g/console/d 를 입력해 엔터를 누르면 콘솔 로그 줄이 모두 삭제됩니다. 그 다음 :%norm A; 를 실행하면 모든 줄 끝에 ;이 일괄 추가됩니다.',
    par: 24,
    optimalKeys: [
      ':', 'g', '/', 'c', 'o', 'n', 's', 'o', 'l', 'e', '/', 'd', 'Enter',
      ':', '%', 'n', 'o', 'r', 'm', ' ', 'A', ';', 'Enter',
    ],
    initialLines: [
      'const a = 1',
      'console.log("debug: a is", a)',
      'const b = 2',
      'console.log("debug: b is", b)',
      'const sum = a + b',
    ],
    targetLines: [
      'const a = 1;',
      'const b = 2;',
      'const sum = a + b;',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === 3 &&
        state.lines[0] === 'const a = 1;' &&
        state.lines[1] === 'const b = 2;' &&
        state.lines[2] === 'const sum = a + b;'
      );
    },
  },
  {
    id: 23,
    title: '레슨 23: 블랙홀 레지스터 "_ 와 명명된 레지스터 "a 활용하기 ("ayiw, "_dd, "ap)',
    description: '일반 삭제(d, x)는 기본 클립보드를 덮어쓰지만, 블랙홀 레지스터("_")를 쓰면 기존 복사본을 오염시키지 않고 삭제할 수 있습니다. 첫 줄의 토큰을 "a 레지스터에 복사하고, 불필요한 둘째 줄은 "_dd로 삭제한 뒤, 세 번째 줄에 "ap로 붙여넣으세요.',
    hint: '첫 줄 따옴표 안에서 "ayi" 로 a에 복사하고, j -> "_dd 로 둘째 줄을 블랙홀 삭제합니다. 그 다음 "ap 로 세 번째 줄 따옴표 사이에 바로 붙여넣으세요.',
    par: 13,
    optimalKeys: [
      '"', 'a', 'y', 'i', '"',
      'j',
      '"', '_', 'd', 'd',
      '"', 'a', 'p',
    ],
    initialLines: [
      'const secret = "secretKey123";',
      'const garbageLine = "DELETE_ME_NOW";',
      'let authHeader = "";',
    ],
    targetLines: [
      'const secret = "secretKey123";',
      'let authHeader = "secretKey123";',
    ],
    initialCursor: { line: 0, col: 17 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === 2 &&
        state.lines[0] === 'const secret = "secretKey123";' &&
        state.lines[1] === 'let authHeader = "secretKey123";' &&
        state.registers?.a?.content === 'secretKey123'
      );
    },
  },
  {
    id: 24,
    title: '레슨 24: :vsp 화면 분할과 창 간 코드 이동 (:vsp, Ctrl-w l, "ap, "bp)',
    description: ':vsp 명령으로 화면을 세로 분할해 오른쪽 창(target.ts)을 열고, 왼쪽 창(source.ts)의 필요한 함수들을 "a와 "b 레지스터에 복사한 뒤, Ctrl-w l 로 넘어가 붙여넣어 리팩토링을 완성하세요.',
    hint: ':vsp 엔터로 창을 열고, "ayy 로 helperA를 a에, 2j -> "byy 로 helperB를 b에 복사하세요. 그 다음 Ctrl-w l 로 오른쪽 창으로 넘어가 "ap 와 "bp 로 붙여넣으세요.',
    par: 23,
    optimalKeys: [
      ':', 'v', 's', 'p', 'Enter',
      '"', 'a', 'y', 'y',
      '2', 'j',
      '"', 'b', 'y', 'y',
      'Ctrl-w', 'l',
      '"', 'a', 'p',
      '"', 'b', 'p',
    ],
    primaryFilename: 'source.ts',
    secondaryFilename: 'target.ts',
    initialLines: [
      'export function helperA() { return "A"; }',
      'export function deprecated() { return null; }',
      'export function helperB() { return "B"; }',
    ],
    secondaryLines: [
      '// Refactored Target',
    ],
    targetLines: [
      '// Refactored Target',
      'export function helperA() { return "A"; }',
      'export function helperB() { return "B"; }',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const targetLines = state.splitPanes
        ? (state.activePaneIndex === 1 ? state.lines : state.splitPanes[1].lines)
        : state.lines;
      return (
        state.mode === 'NORMAL' &&
        targetLines.length === 3 &&
        targetLines[0] === '// Refactored Target' &&
        targetLines[1] === 'export function helperA() { return "A"; }' &&
        targetLines[2] === 'export function helperB() { return "B"; }'
      );
    },
  },
  {
    id: 25,
    title: '레슨 25: JSX 태그 편집과 자동 들여쓰기 (cit, gg=G)',
    description: 'cit로 JSX 태그 내부 내용을 한 번에 교체하고, gg=G로 문서 전체의 어긋난 들여쓰기를 자동 정렬하세요.',
    hint: '초기 커서 위치(버튼 태그 내부)에서 citClick Me<Esc> 로 버튼 텍스트를 수정한 뒤, gg=G 로 코드 전체 줄을 정렬하세요.',
    par: 16,
    optimalKeys: [
      'c', 'i', 't',
      'C', 'l', 'i', 'c', 'k', ' ', 'M', 'e',
      'Escape',
      'g', 'g',
      '=', 'G',
    ],
    initialLines: [
      'function App() {',
      'const title = "Vim";',
      'return (',
      '<button>Old</button>',
      ');',
      '}',
    ],
    targetLines: [
      'function App() {',
      '  const title = "Vim";',
      '  return (',
      '    <button>Click Me</button>',
      '  );',
      '}',
    ],
    initialCursor: { line: 3, col: 8 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === 6 &&
        state.lines[0] === 'function App() {' &&
        state.lines[1] === '  const title = "Vim";' &&
        state.lines[2] === '  return (' &&
        state.lines[3] === '    <button>Click Me</button>' &&
        state.lines[4] === '  );' &&
        state.lines[5] === '}'
      );
    },
  },
  {
    id: 26,
    title: '레슨 26: Insert 모드 고속 제어와 인버퍼 자동완성 (Ctrl+w, Ctrl+n)',
    description: 'Insert 모드에서 홈 로우를 벗어나지 않고 오타 단어를 Ctrl+w로 지우고, 긴 식별자를 Ctrl+n(또는 Alt+n)으로 자동완성하세요.',
    hint: 'A를 눌러 줄 끝에서 Insert 모드로 진입한 후, Ctrl+w(또는 Alt+w)로 wrongWord를 삭제하고 calc 입력 후 Ctrl+n(또는 Alt+n)을 눌러 자동완성한 뒤 ;와 Escape를 누르세요.',
    par: 9,
    optimalKeys: ['A', 'Ctrl-w', 'c', 'a', 'l', 'c', 'Ctrl-n', ';', 'Escape'],
    initialLines: [
      'const calculateTotalHospitalPrescriptionPrice = 12000;',
      'const currentTotal = wrongWord',
    ],
    targetLines: [
      'const calculateTotalHospitalPrescriptionPrice = 12000;',
      'const currentTotal = calculateTotalHospitalPrescriptionPrice;',
    ],
    initialCursor: { line: 1, col: 29 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === 2 &&
        state.lines[0] === 'const calculateTotalHospitalPrescriptionPrice = 12000;' &&
        state.lines[1] === 'const currentTotal = calculateTotalHospitalPrescriptionPrice;'
      );
    },
  },
  {
    id: 27,
    title: '레슨 27: {} 문단 점프와 gi, gv, g;로 편집 위치 복귀하기',
    description: 'Vim의 문단 점프({, })로 코드 블록 사이를 빠르게 오가고, gi를 사용해 상단 코드를 둘러본 뒤 방금 편집하던 정확한 위치로 1초 만에 복귀하세요.',
    hint: 'A; <Esc> 로 세미콜론을 추가한 뒤, { 를 두 번 눌러 상단 블록으로 점프해 확인하고, gi 로 방금 작업 위치로 복귀한 후 <Esc> 를 누르세요.',
    par: 8,
    optimalKeys: ['A', ';', 'Escape', '{', '{', 'g', 'i', 'Escape'],
    initialLines: [
      '// Header 1: Configuration',
      'const MAX_RETRIES = 3;',
      '',
      '// Header 2: Client Instance',
      'const client = new ApiClient()',
    ],
    targetLines: [
      '// Header 1: Configuration',
      'const MAX_RETRIES = 3;',
      '',
      '// Header 2: Client Instance',
      'const client = new ApiClient();',
    ],
    initialCursor: { line: 4, col: 30 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === 5 &&
        state.lines[4] === 'const client = new ApiClient();' &&
        state.cursor.line === 4 &&
        // 세미콜론만 붙이고 끝내지 않도록, { 로 윗 블록까지 점프했다가(점프 리스트에 기록) 돌아왔는지 확인합니다.
        (state.jumpList ?? []).some((j) => j.row === 4)
      );
    },
  },
  {
    id: 28,
    title: '레슨 28: 캡처 그룹 \\1, \\2와 \\u로 snake_case 코드를 camelCase로 1초 만에 리팩토링하기',
    description: 'Vim의 정규식 치환(:%s)에서 캡처 그룹(\\(...\\))과 역참조(\\1), 대소문자 변환 플래그(\\u)를 조합하여 레거시 snake_case 함수들을 camelCase로 일괄 리팩토링하세요.',
    hint: ':%s/get_\\(\\w\\+\\)/get\\u\\1/g (또는 :%s/get_(\\w+)/get\\u\\1/g)를 입력하고 Enter를 누르세요.',
    par: 27,
    optimalKeys: [
      ':', '%', 's', '/', 'g', 'e', 't', '_', '\\', '(', '\\', 'w', '\\', '+', '\\', ')', '/', 'g', 'e', 't', '\\', 'u', '\\', '1', '/', 'g', 'Enter',
    ],
    initialLines: [
      'function get_user() {',
      '  const user = get_account();',
      '  return get_profile(user);',
      '}',
    ],
    targetLines: [
      'function getUser() {',
      '  const user = getAccount();',
      '  return getProfile(user);',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === 4 &&
        state.lines[0] === 'function getUser() {' &&
        state.lines[1] === '  const user = getAccount();' &&
        state.lines[2] === '  return getProfile(user);' &&
        state.lines[3] === '}'
      );
    },
  },
  {
    id: 29,
    title: '레슨 29: 타이핑 도중 Ctrl+r 0으로 변수명 붙여넣고 Ctrl+r =로 매직 넘버 계산하기',
    description: 'INSERT 모드에서 빠져나가지 않고 Ctrl+r {reg}로 복사된 레지스터 값을 즉시 붙여넣고, Ctrl+r =로 수식을 계산하여 코드에 바로 삽입하세요.',
    hint: 'yiw로 CHUNK_SIZE를 복사한 뒤, jA로 줄 끝에서 편집을 시작하세요. Ctrl+r 0으로 변수명을 붙여넣고, Ctrl+r =을 누른 뒤 1024*64 Enter로 계산값을 삽입하세요.',
    par: 22,
    optimalKeys: [
      'y', 'i', 'w',
      'j', 'A',
      'Ctrl-r', '0',
      ' ', '*', ' ',
      'Ctrl-r', '=', '1', '0', '2', '4', '*', '6', '4', 'Enter',
      ';',
      'Escape',
    ],
    initialLines: [
      'const CHUNK_SIZE = 1024;',
      'const maxBytes = ',
    ],
    targetLines: [
      'const CHUNK_SIZE = 1024;',
      'const maxBytes = CHUNK_SIZE * 65536;',
    ],
    initialCursor: { line: 0, col: 6 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === 2 &&
        state.lines[0] === 'const CHUNK_SIZE = 1024;' &&
        state.lines[1] === 'const maxBytes = CHUNK_SIZE * 65536;'
      );
    },
  },
  {
    id: 30,
    title: '레슨 30: cgn + . 콤보와 /pattern/e 오프셋으로 초고속 정밀 타격하기',
    description: '검색 매치 텍스트 객체 cgn과 . (Dot Repeat) 연속 치환으로 특정 변수를 초고속으로 리팩토링하고, /pattern/e 오프셋 검색으로 단어의 끝으로 정확하게 이동하여 편집을 완료하세요.',
    hint: '/oldVal로 검색 후 cgnnewVal<Esc>를 입력하세요. 그 다음 . 키를 두 번 눌러 나머지 oldVal들을 순차 치환하고, /Value/e Enter 후 a s <Esc>로 processValue를 processValues로 완성하세요.',
    par: 32,
    optimalKeys: [
      '/', 'o', 'l', 'd', 'V', 'a', 'l', 'Enter',
      'c', 'g', 'n', 'n', 'e', 'w', 'V', 'a', 'l', 'Escape',
      '.',
      '.',
      '/', 'V', 'a', 'l', 'u', 'e', '/', 'e', 'Enter',
      'a', 's', 'Escape',
    ],
    initialLines: [
      'const oldVal = 10;',
      'const tempVal = oldVal + 5;',
      'const finalVal = oldVal * 2;',
      'function processValue() {}',
    ],
    targetLines: [
      'const newVal = 10;',
      'const tempVal = newVal + 5;',
      'const finalVal = newVal * 2;',
      'function processValues() {}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === 4 &&
        state.lines[0] === 'const newVal = 10;' &&
        state.lines[1] === 'const tempVal = newVal + 5;' &&
        state.lines[2] === 'const finalVal = newVal * 2;' &&
        state.lines[3] === 'function processValues() {}'
      );
    },
  },
  {
    id: 31,
    title: '레슨 31: 대문자 "A로 흩어진 코드 수집하기 & 실수한 매크로에 qA로 명령 덧붙이기',
    description: '소문자 레지스터("a)와 달리 대문자 레지스터("A)는 기존 내용 뒤에 텍스트를 누적(Append)합니다. 파일 곳곳의 핵심 라인을 "Ayy로 수집해 한 번에 붙여넣고, qA로 기존 매크로에 아랫줄 이동(j) 명령을 덧붙여 반복 작업을 단번에 끝내세요.',
    hint: '"ayy로 첫 줄을 복사하고 2j "Ayy로 3번째 줄을 누적 복사한 뒤, G "ap로 아래에 붙여넣으세요. 그 다음 gg로 올라가 qa I// <Esc> q로 주석 매크로를 만든 뒤, qAjq로 아랫줄 이동을 덧붙이고 2@a를 실행하세요.',
    par: 31,
    optimalKeys: [
      '"', 'a', 'y', 'y',
      '2', 'j',
      '"', 'A', 'y', 'y',
      'G',
      '"', 'a', 'p',
      'g', 'g',
      'q', 'a', 'I', '/', '/', ' ', 'Escape', 'q',
      'q', 'A', 'j', 'q',
      '2', '@', 'a',
    ],
    initialLines: [
      'const port = 3000;',
      'const debug = true;',
      'const host = "localhost";',
      '',
      '// TARGET BUNDLE:',
    ],
    targetLines: [
      '// const port = 3000;',
      '// const debug = true;',
      '// const host = "localhost";',
      '',
      '// TARGET BUNDLE:',
      'const port = 3000;',
      'const host = "localhost";',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === 7 &&
        state.lines[0] === '// const port = 3000;' &&
        state.lines[1] === '// const debug = true;' &&
        state.lines[2] === '// const host = "localhost";' &&
        state.lines[3] === '' &&
        state.lines[4] === '// TARGET BUNDLE:' &&
        state.lines[5] === 'const port = 3000;' &&
        state.lines[6] === 'const host = "localhost";'
      );
    },
  },
  {
    id: 32,
    title: '레슨 32: g Ctrl+a로 배열 번호를 한 번에 매기고 :sort u로 중복 데이터 정제하기',
    description: 'Visual 모드에서 g Ctrl+a(또는 Alt+a)를 사용하여 목업 데이터에 1, 2, 3 순차 인덱스를 일괄 부여하고, :4,$sort u 명령으로 중복 태그 목록을 가나다순으로 정제하세요.',
    hint: 'V2j로 3개 줄을 선택 후 g와 Ctrl-a(또는 Alt-a)를 눌러 순차 번호를 매긴 뒤, :4,$sort u 를 입력하고 Enter를 누르세요.',
    par: 16,
    optimalKeys: ['V', '2', 'j', 'g', 'Ctrl-a', ':', '4', ',', '$', 's', 'o', 'r', 't', ' ', 'u', 'Enter'],
    initialLines: [
      'data_0',
      'data_0',
      'data_0',
      'cherry',
      'apple',
      'banana',
      'cherry',
    ],
    targetLines: [
      'data_1',
      'data_2',
      'data_3',
      'apple',
      'banana',
      'cherry',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === 6 &&
        state.lines[0] === 'data_1' &&
        state.lines[1] === 'data_2' &&
        state.lines[2] === 'data_3' &&
        state.lines[3] === 'apple' &&
        state.lines[4] === 'banana' &&
        state.lines[5] === 'cherry'
      );
    },
  },
  {
    id: 33,
    title: '레슨 33: :bnext, :bprev와 Ctrl+^로 여러 버퍼(파일) 자유자재로 넘나들기',
    description: 'Vim의 버퍼(Buffer)는 메모리에 열린 파일 탭입니다. :ls로 버퍼 목록을 확인하고, :bnext/:bprev와 초고속 단축키 Ctrl+^(또는 Ctrl+6)을 사용하여 여러 파일 사이를 자유자재로 오가며 코드를 완성하세요.',
    hint: '$r2로 source.ts의 버전을 2로 올린 뒤, :bn으로 config.ts 버퍼로 이동하세요. 그 다음 $r8로 포트를 3008로 변경하고, Ctrl-^(또는 Ctrl-6)을 눌러 직전 버퍼 source.ts로 초고속 복귀하세요.',
    par: 12,
    optimalKeys: ['$', 'r', '2', ':', 'b', 'n', 'Enter', '$', 'r', '8', 'Ctrl-^'],
    primaryFilename: 'source.ts',
    secondaryFilename: 'config.ts',
    initialLines: [
      'const API_VERSION = 1',
      'export function initApp() {}',
    ],
    secondaryLines: [
      'export const PORT = 3000',
      'export const HOST = "localhost"',
    ],
    targetLines: [
      'const API_VERSION = 2',
      'export function initApp() {}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const s = ensureBuffers(state);
      const buf1 = s.buffers?.find((b) => b.name === 'source.ts' || b.id === 1);
      const buf2 = s.buffers?.find((b) => b.name === 'config.ts' || b.id === 2);
      const isCurrentBuf1 = s.currentBufferId === 1 || s.primaryFilename === 'source.ts';

      return (
        state.mode === 'NORMAL' &&
        isCurrentBuf1 &&
        buf1?.lines[0] === 'const API_VERSION = 2' &&
        buf2?.lines[0] === 'export const PORT = 3008'
      );
    },
  },
  {
    id: 34,
    title: '레슨 34: :tabnew, :tabclose와 gt/gT로 여러 탭 페이지 워크스페이스 제어하기',
    description: 'Vim의 탭(Tab Page)은 각 탭마다 독립된 창 분할 레이아웃과 작업 환경을 보존하는 최상위 워크스페이스입니다. :tabnew로 새 작업 탭을 열고, gt/gT 및 [count]gt로 탭 사이를 자유자재로 넘나들며 편집을 완성하세요.',
    hint: '$r2로 main.ts의 STAGE를 2로 수정한 뒤, :tabnew로 새 탭을 엽니다. 새 탭에서 iOK<Esc>로 코드를 작성한 후, gt를 눌러 1번 탭 main.ts로 돌아오세요.',
    par: 18,
    optimalKeys: [
      '$', 'r', '2',
      ':', 't', 'a', 'b', 'n', 'e', 'w', 'Enter',
      'i', 'O', 'K', 'Escape',
      'g', 't',
    ],
    primaryFilename: 'main.ts',
    initialLines: [
      'const STAGE = 1',
      'export const READY = true',
    ],
    targetLines: [
      'const STAGE = 2',
      'export const READY = true',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const s = ensureTabPages(state);
      const tab1 = s.tabPages?.find((t) => t.id === 1);
      const tab2 = s.tabPages?.find((t) => t.id === 2);
      const isCurrentTab1 = s.currentTabId === 1;

      return (
        state.mode === 'NORMAL' &&
        isCurrentTab1 &&
        tab1?.lines[0] === 'const STAGE = 2' &&
        tab2?.lines[0] === 'OK'
      );
    },
  },
  {
    id: 35,
    title: '레슨 35: q: 커맨드라인 윈도우와 히스토리로 과거 명령어 재사용 및 수정하기',
    description: 'Vim의 커맨드라인 윈도우(q:, q/)는 이전에 실행했던 모든 명령어와 검색 기록을 독립된 Vim 편집 버퍼로 열어주는 강력한 기능입니다. 작은 프롬프트 한 줄에서 방향키로 헤매지 않고, k/j 이동과 cw, dd 등 평소 쓰던 모든 Vim 편집 명령으로 과거 명령어를 손쉽게 재사용 및 수정하여 실행할 수 있습니다.',
    hint: 'NORMAL 모드에서 q:를 눌러 커맨드라인 윈도우를 엽니다. k를 눌러 윗줄의 이전 명령어(%s/DEBUG/RELEASE/g)로 이동한 뒤 Enter를 눌러 실행하세요. (Esc로 취소 가능)',
    par: 4,
    optimalKeys: ['q', ':', 'k', 'Enter'],
    primaryFilename: 'config.ts',
    initialLines: [
      'mode: DEBUG',
      'target: DEBUG',
    ],
    targetLines: [
      'mode: RELEASE',
      'target: RELEASE',
    ],
    initialCursor: { line: 0, col: 0 },
    initialCommandHistory: [
      'set nu',
      '%s/DEBUG/RELEASE/g',
    ],
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        !state.cmdlineWindow &&
        state.lines[0] === 'mode: RELEASE' &&
        state.lines[1] === 'target: RELEASE'
      );
    },
  },
  {
    id: 36,
    title: '레슨 36: 퀵픽스(Quickfix: :cc, :cn, :copen)로 코드 에러 순회 및 수정하기',
    description: '순정 Vim의 퀵픽스(Quickfix)는 프로젝트 전역 검색(:vimgrep) 결과나 컴파일러/린터 에러 목록을 모아두고 빠르게 탐색하는 IDE 기능의 핵심입니다. :copen으로 하단 목록 창을 열고, :cc로 특정 에러 또는 :cn(다음 에러)과 :cp(이전 에러)로 에러가 발생한 위치로 즉시 점프하여 코드를 수정해 보세요.',
    hint: ':cc로 1번 에러 위치(BAD)로 점프한 뒤 cwOK<Esc>로 수정합니다. :cn으로 다음 에러로 점프한 뒤 .(점 반복)으로 간결하게 수정하세요. (:copen으로 퀵픽스 창을 열 수도 있습니다)',
    par: 14,
    optimalKeys: [
      ':', 'c', 'c', 'Enter',
      'c', 'w', 'O', 'K', 'Escape',
      ':', 'c', 'n', 'Enter',
      '.',
    ],
    primaryFilename: 'config.ts',
    initialLines: [
      'flag1 = BAD',
      'flag2 = BAD',
    ],
    targetLines: [
      'flag1 = OK',
      'flag2 = OK',
    ],
    initialCursor: { line: 0, col: 0 },
    initialQuickfixItems: [
      { filename: 'config.ts', line: 1, col: 9, text: 'flag1 = BAD' },
      { filename: 'config.ts', line: 2, col: 9, text: 'flag2 = BAD' },
    ],
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines[0] === 'flag1 = OK' &&
        state.lines[1] === 'flag2 = OK'
      );
    },
  },
  {
    id: 37,
    title: '레슨 37: 체인지 리스트(Change List: g;, g,, :changes)로 과거 편집 위치 탐색 및 복귀하기',
    description: '순정 Vim의 체인지 리스트(Change List)는 버퍼에서 텍스트를 수정한 모든 위치를 시간 순서대로 기억하는 강력한 내비게이션 기능입니다. 대형 코드베이스에서 여러 군데를 수정한 뒤 다른 곳을 둘러보더라도, g;를 누르면 이전 수정 위치로, g,를 누르면 다시 최근 수정 위치로 1초 만에 되돌아갈 수 있습니다.',
    hint: 'g;를 눌러 직전 수정 위치(val2의 0)로 점프한 뒤 r1으로 1로 수정합니다. 다시 g;를 눌러 그 이전 수정 위치(val1의 0)로 점프한 뒤 .(점 반복)으로 1로 수정하세요. (:changes로 전체 수정 이력을 조회할 수 있습니다)',
    par: 7,
    optimalKeys: ['g', ';', 'r', '1', 'g', ';', '.'],
    primaryFilename: 'state.ts',
    initialLines: [
      'val1 = 0;',
      'val2 = 0;',
      '// footer',
    ],
    targetLines: [
      'val1 = 1;',
      'val2 = 1;',
      '// footer',
    ],
    initialCursor: { line: 2, col: 0 },
    initialChangeList: [
      { row: 0, col: 7, line: 0 },
      { row: 1, col: 7, line: 1 },
    ],
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines[0] === 'val1 = 1;' &&
        state.lines[1] === 'val2 = 1;' &&
        state.lines[2] === '// footer'
      );
    },
  },
  {
    id: 38,
    title: '레슨 38: 아규먼트 리스트(Arglist: :args, :argdo, :n)로 여러 파일 일괄 치환하기',
    description: 'Vim의 아규먼트 리스트(Arglist)는 대규모 프로젝트에서 여러 파일을 작업 목록에 묶어두고 일괄 처리하는 순정 강력 기능입니다. :args로 파일 목록을 확인하거나 등록하고, :n(다음 파일)과 :prev(이전 파일)로 넘나들 수 있으며, 특히 :argdo를 사용하면 목록에 포함된 모든 파일에 대해 치환(%s)이나 명령을 한 번에 일괄 적용할 수 있습니다.',
    hint: ':argdo %s/1/2/g 를 입력하고 Enter를 누르면 아규먼트 목록(serviceA.ts, serviceB.ts)의 모든 파일에서 1이 2로 일괄 치환됩니다. (:args로 파일 목록을 확인하거나 :n으로 파일을 넘나들 수도 있습니다)',
    par: 16,
    optimalKeys: [
      ':', 'a', 'r', 'g', 'd', 'o', ' ', '%', 's', '/', '1', '/', '2', '/', 'g', 'Enter',
    ],
    primaryFilename: 'serviceA.ts',
    secondaryFilename: 'serviceB.ts',
    initialLines: [
      'const API_HOST = "HTTP_V1";',
      'export const ready = true;',
    ],
    secondaryLines: [
      'const AUTH_HOST = "HTTP_V1";',
      'export const auth = true;',
    ],
    targetLines: [
      'const API_HOST = "HTTP_V2";',
      'export const ready = true;',
    ],
    initialCursor: { line: 0, col: 0 },
    initialArgs: ['serviceA.ts', 'serviceB.ts'],
    checkComplete: (state) => {
      const s = syncCurrentBuffer(ensureBuffers(state));
      const bufA = s.buffers?.find((b) => b.name === 'serviceA.ts');
      const bufB = s.buffers?.find((b) => b.name === 'serviceB.ts');
      const aLine = bufA?.lines[0];
      const bLine = bufB?.lines[0];

      return (
        state.mode === 'NORMAL' &&
        aLine === 'const API_HOST = "HTTP_V2";' &&
        bLine === 'const AUTH_HOST = "HTTP_V2";'
      );
    },
  },
  {
    id: 39,
    title: '레슨 39: 순정 파일 탐색기 Netrw(:Explore, :E)로 프로젝트 파일 탐색 및 열기',
    description: 'Vim은 외부 플러그인 없이도 순정 상태에서 강력한 내장 디렉터리/파일 탐색기 Netrw를 제공합니다. 명령행 모드에서 :Explore 또는 축약형인 :E(:edit .)를 입력하면 현재 프로젝트 디렉터리를 브라우징하는 Netrw 버퍼가 열립니다. j/k 모션으로 이동한 뒤 Enter(<CR>)를 누르면 선택한 파일이 열리고, v(세로 분할)나 o(가로 분할) 또는 t(새 탭)로도 열 수 있습니다.',
    hint: ':E 를 입력하고 Enter를 눌러 Netrw 파일 탐색기를 연 뒤, j를 세 번 눌러 README.md 로 이동하고 Enter를 누르면 README.md 파일이 열립니다. (q를 누르면 언제든 닫고 복귀할 수 있습니다)',
    par: 7,
    optimalKeys: [':', 'E', 'Enter', 'j', 'j', 'j', 'Enter'],
    primaryFilename: 'index.ts',
    initialLines: [
      'console.log("Welcome to Netrw lesson");',
    ],
    targetLines: [
      '# Vim Practice on Web',
      'Pure Vim experience right in your browser.',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.primaryFilename === 'README.md' &&
        state.lines[0] === '# Vim Practice on Web' &&
        !state.netrw
      );
    },
  },
  {
    id: 40,
    title: '레슨 40: .vimrc 환경설정 버퍼 편집(:e ~/.vimrc) 및 실시간 소싱(:source, :so %)',
    description: 'Vim은 ~/.vimrc 설정 파일에 옵션(set number, set relativenumber, set ignorecase 등)과 키 매핑을 작성하여 나만의 환경을 구축합니다. 에디터 사용 도중 설정을 변경하고 싶을 때는 :e ~/.vimrc 로 환경설정 버퍼를 열어 편집하고, 재시작 없이 :source %(축약형 :so %)를 실행하여 즉시 현재 세션에 반영할 수 있습니다. 또한 직전 대안 버퍼 토글 단축키인 Ctrl+^(또는 Ctrl+6)을 사용해 원래 작업 중이던 코드로 초고속 복귀할 수 있습니다.',
    hint: ':e ~/.vimrc 를 입력하여 환경설정 버퍼를 열고, :so % 로 설정을 즉시 에디터에 적용한 뒤, Ctrl-^(또는 :bn)을 눌러 원래 작업 파일(app.ts)로 복귀하세요. (또는 :so ~/.vimrc 로 즉시 소싱할 수도 있습니다)',
    par: 19,
    optimalKeys: [
      ':', 'e', ' ', '~', '/', '.', 'v', 'i', 'm', 'r', 'c', 'Enter',
      ':', 's', 'o', ' ', '%', 'Enter',
      'Ctrl-^',
    ],
    primaryFilename: 'app.ts',
    initialLines: [
      '// Open ~/.vimrc, apply the settings, and come back.',
      'export function main() {',
      '  console.log("Vim configuration sourced!");',
      '}',
    ],
    targetLines: [
      '// Open ~/.vimrc, apply the settings, and come back.',
      'export function main() {',
      '  console.log("Vim configuration sourced!");',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const isReturnedToApp = state.primaryFilename === 'app.ts';
      const hasRelativeNumber = Boolean(state.options?.relativenumber);
      const hasIgnoreCase = Boolean(state.options?.ignorecase);
      const hasVimrcBuffer = Boolean(
        state.buffers?.some((b) => b.name === '~/.vimrc' || b.name === '.vimrc')
      );

      return (
        state.mode === 'NORMAL' &&
        isReturnedToApp &&
        hasRelativeNumber &&
        hasIgnoreCase &&
        (hasVimrcBuffer || Boolean(state.userKeymaps?.['jk']))
      );
    },
  },
];
