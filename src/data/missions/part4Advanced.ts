import { Mission } from '../../types/mission';
import { ensureBuffers } from '../../vim-engine';

export const MISSIONS_PART4: Mission[] = [
  {
    id: 61,
    title: '레슨 61: 순정 Vim 맞춤법 검사기(:set spell, ]s, z=, zg)로 오탈자 찾고 교정하기',
    description:
      '순정 Vim은 별도 외부 도구 없이도 내장된 스펠링 검사기(:set spell)를 제공합니다. 영문 문서나 코드 주석, 변수명을 작성할 때 흔히 발생하는 오탈자를 감지하고 최적의 추천 단어로 교체할 수 있습니다.\n\n1) :set spell : 현재 버퍼의 맞춤법 검사를 활성화합니다. 오탈자 단어에 빨간 물결 밑줄이 그어지고 상태바에 [SPELL] 배지가 표시됩니다. (:set nospell 로 비활성화)\n2) ]s / [s : 다음 / 이전 맞춤법 오류(오탈자) 단어로 점프합니다.\n3) z= : 커서 위치의 잘못된 단어에 대해 추천 목록(1~9)을 열고, 원하는 번호를 누르면 즉시 올바른 단어로 교체됩니다. (u 로 실행 취소 가능)\n4) zg : 커서 위치의 단어(예: 프로젝트 고유 용어, 기술 키워드)를 맞춤법 사전에 정상 단어로 등록합니다.\n\n미션:\n1) :set spell<Enter> 명령으로 맞춤법 검사기를 켜세요.\n2) ]s 로 첫 번째 오탈자인 recieve 로 점프한 뒤, z= 누르고 1 을 눌러 receive 로 교정하세요.\n3) ]s 로 다음 오탈자인 funtion 으로 점프한 뒤, z= 누르고 1 을 눌러 function 으로 교정하세요.\n4) ]s 로 고유 라이브러리 명칭인 redux 로 점프한 뒤, zg 를 눌러 사전에 정상 단어로 등록하세요.',
    hint: ':set spell<Enter> 로 맞춤법 검사를 켜고, ]s → z= → 1 로 두 단어를 교정한 뒤, 마지막 ]s 위치에서 zg 를 누르세요.',
    par: 25,
    optimalKeys: [
      ':', 's', 'e', 't', ' ', 's', 'p', 'e', 'l', 'l', 'Enter',
      ']', 's',
      'z', '=',
      '1',
      ']', 's',
      'z', '=',
      '1',
      ']', 's',
      'z', 'g',
    ],
    initialLines: [
      '// Please recieve message',
      'funtion start() {',
      '  return redux;',
      '}',
    ],
    targetLines: [
      '// Please receive message',
      'function start() {',
      '  return redux;',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const isSpellActive = state.options?.spell === true;
      const target = [
        '// Please receive message',
        'function start() {',
        '  return redux;',
        '}',
      ];
      const linesMatch =
        state.lines.length === target.length &&
        target.every((line, idx) => state.lines[idx] === line);
      const isGoodWordAdded =
        (state.spellGoodWords?.includes('redux') ?? false) ||
        (state.spellGoodWords?.includes('Redux') ?? false);
      return isSpellActive && linesMatch && isGoodWordAdded;
    },
  },
  {
    id: 62,
    title: '레슨 62: 고급 Vim script 람다({args -> expr})와 sort()로 길이순 정렬하기',
    description:
      '최신 Vim(Vim 8/9, Neovim)은 함수를 별도로 선언하지 않고도 인라인으로 간결하게 작성할 수 있는 람다 표현식 `{ [args] -> expr }` 과 함수 참조(Funcref), 예외 처리(:try / :catch / :finally)를 지원합니다.\n\n1) 람다 표현식: `{x -> x * 2}`, `{a, b -> a + b}`, `{-> 42}` 처럼 화살표(`->`)를 사용해 이름 없는 익명 함수를 정의합니다.\n2) 고차 함수와의 연계:\n   - map(list, {idx, val -> expr}) : 각 항목을 람다로 변환\n   - filter(list, {idx, val -> expr}) : 조건에 맞는 항목만 선별\n   - sort(list, {a, b -> expr}) : 커스텀 비교 람다로 정렬 (a > b 이면 양수, 같으면 0, 음수)\n3) 일반 :sort 명령은 알파벳/숫자 순서로만 정렬할 수 있지만, sort() 에 람다 `{a, b -> len(a) - len(b)}` 를 넘기면 문자열의 길이순으로 정렬할 수 있습니다!\n4) 예외 처리: :try ... :catch [ /pattern/ ] ... :finally ... :endtry 로 런타임 오류나 :throw 예외를 안전하게 포착하고 마무리 작업을 보장합니다.\n\n미션:\n:call setline(1, sort(getline(1, \'$\'), {a, b -> len(a) - len(b)})) 명령으로 과일 이름들을 글자 수(길이)가 짧은 순서대로 정렬하세요.',
    hint: ':call setline(1, sort(getline(1, \'$\'), {a, b -> len(a) - len(b)})) 를 입력하고 Enter',
    par: 68,
    optimalKeys: [
      ':', 'c', 'a', 'l', 'l', ' ', 's', 'e', 't', 'l', 'i', 'n', 'e', '(', '1', ',', ' ', 's', 'o', 'r', 't', '(', 'g', 'e', 't', 'l', 'i', 'n', 'e', '(', '1', ',', ' ', "'", '$', "'", ')', ',', ' ', '{', 'a', ',', ' ', 'b', ' ', '-', '>', ' ', 'l', 'e', 'n', '(', 'a', ')', ' ', '-', ' ', 'l', 'e', 'n', '(', 'b', ')', '}', ')', ')', 'Enter',
    ],
    initialLines: [
      'watermelon',
      'fig',
      'banana',
      'kiwi',
    ],
    targetLines: [
      'fig',
      'kiwi',
      'banana',
      'watermelon',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = ['fig', 'kiwi', 'banana', 'watermelon'];
      return state.lines.length === target.length && target.every((t, i) => state.lines[i] === t);
    },
  },
  {
    id: 63,
    title: '레슨 63: 커맨드라인 파이프(|)와 한 줄 제어문(:for, :if)으로 다중 명령 일괄 자동화하기',
    description:
      'Vim에서는 여러 Ex 명령어를 파이프 기호(`|`)로 연결해 한 번의 명령행 실행으로 연속 처리할 수 있습니다 (`:help :bar`). 또한 별도의 `:function` 선언 없이도 `:for` / `:if` 제어문을 파이프로 엮어 강력한 한 줄 스크립트 블록을 즉시 실행할 수 있습니다.\n\n1) 다중 명령 파이프 체이닝:\n   - `:cmd1 | cmd2 | cmd3` 형식으로 여러 명령을 한 줄에 나열하여 순차 실행합니다.\n   - 예: `:%s/dev/prod/g | %s/http:/https:/g` (여러 치환을 한 번에 실행)\n   - 파이프 체인 실행 도중 하나의 명령이라도 실패(`bell: true`)하면 후속 명령은 안전하게 중단됩니다.\n   - 따옴표 내부(`"..."`, \'...\'), 역슬래시 이스케이프(`\\|`), 치환 패턴 내부의 `|`, 논리 OR(`||`)는 구분자로 분할되지 않고 본래 문자로 보존됩니다.\n\n2) 최상위 제어문 스크립트 블록:\n   - `:for i in range(1, 3) | ... | :endfor` 처럼 한 줄로 반복 제어문을 구성할 수 있습니다.\n   - 버퍼의 라인을 동적으로 조회(`getline()`), 가공(`toupper()`, 문자열 결합 `.`), 저장(`setline()`)하는 복합 자동화를 즉각 수행합니다.\n\n미션:\n:%s/task_// | for i in range(1, 3) | call setline(i, i . \'. \' . toupper(getline(i))) | endfor\n명령을 실행하여 불필요한 접두어를 제거하고, 각 줄 앞에 번호를 매기며 대문자로 일괄 변환하세요.',
    hint: ':%s/task_// | for i in range(1, 3) | call setline(i, i . \'. \' . toupper(getline(i))) | endfor 를 입력하고 Enter',
    par: 94,
    optimalKeys: [
      ':', '%', 's', '/', 't', 'a', 's', 'k', '_', '/', '/', ' ',
      '|', ' ',
      'f', 'o', 'r', ' ', 'i', ' ', 'i', 'n', ' ', 'r', 'a', 'n', 'g', 'e', '(', '1', ',', ' ', '3', ')', ' ',
      '|', ' ',
      'c', 'a', 'l', 'l', ' ', 's', 'e', 't', 'l', 'i', 'n', 'e', '(', 'i', ',', ' ', 'i', ' ', '.', ' ', "'", '.', ' ', "'", ' ', '.', ' ', 't', 'o', 'u', 'p', 'p', 'e', 'r', '(', 'g', 'e', 't', 'l', 'i', 'n', 'e', '(', 'i', ')', ')', ')', ' ',
      '|', ' ',
      'e', 'n', 'd', 'f', 'o', 'r',
      'Enter',
    ],
    initialLines: [
      'task_deploy',
      'task_build',
      'task_test',
    ],
    targetLines: [
      '1. DEPLOY',
      '2. BUILD',
      '3. TEST',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = ['1. DEPLOY', '2. BUILD', '3. TEST'];
      return state.lines.length === target.length && target.every((t, i) => state.lines[i] === t);
    },
  },
  {
    id: 64,
    title: '레슨 64: 순정 Netrw 고급 탐색(:Hexplore) 및 디렉터리 탐색, 신규 파일 생성(%)과 버퍼 제어',
    description:
      'Vim의 강력한 내장 파일 탐색기 Netrw는 단순히 파일을 확인하는 것뿐만 아니라 프로젝트 디렉터리를 실시간 탐색하고, 신규 파일을 즉각 생성하며, 여러 버퍼 간의 작업 흐름을 제어하는 완전한 프로젝트 매니저 역할을 수행합니다.\n\n1) 창 분할 탐색기 열기:\n   - :Explore(:E) : 현재 윈도우에서 Netrw 열기\n   - :Hexplore(:He) / :Sexplore(:Se) : 가로 분할(horizontal split) 창으로 Netrw 열기\n   - :Vexplore(:Ve) : 세로 분할(vertical split) 창으로 Netrw 열기\n\n2) 인터랙티브 디렉터리 탐색:\n   - j / k 모션으로 탐색 커서를 이동합니다.\n   - 디렉터리(예: src/) 위에서 Enter(<CR>)를 누르면 해당 폴더 내부로 진입합니다.\n   - - (하이픈) 또는 ../ 위에서 Enter를 누르면 상위 디렉터리로 복귀합니다.\n\n3) 파일 및 폴더 생성/삭제:\n   - % : 현재 디렉터리에 신규 파일 생성 (new_file.txt)\n   - d : 현재 디렉터리에 신규 하위 폴더 생성 (new_dir/)\n   - D : 커서 위치의 파일 삭제\n\n4) 파일 열기 및 버퍼 복귀:\n   - 파일 위에서 Enter를 누르면 해당 파일이 현재 창에 로드됩니다.\n   - 작업 후 직전 대안 버퍼 토글 단축키인 Ctrl+^(또는 Ctrl+6)을 누르면 원래 편집하던 기본 파일(index.ts)로 즉시 복귀할 수 있습니다!\n\n미션:\n1. :E (또는 :He) 명령으로 Netrw 파일 탐색기를 여세요.\n2. j j 로 src/ 디렉터리로 이동한 뒤 Enter를 눌러 폴더에 진입하세요.\n3. % 키를 눌러 신규 파일(new_file.txt)을 생성하세요.\n4. utils.ts 파일로 이동한 뒤 Enter를 눌러 파일을 여세요.\n5. add 함수의 덧셈(+)을 곱셈(*)으로 수정한 뒤 (jf+r*),\n6. Ctrl-^ 를 눌러 원래 작업 파일(index.ts)로 복귀하세요!',
    hint: ':E 입력 후 Enter → j j Enter로 src/ 진입 → % 키로 new_file.txt 생성 → 4j(또는 jjjj) Enter로 utils.ts 열기 → j f + r * 로 곱셈 수정 → Ctrl-^ 로 원래 버퍼(index.ts) 복귀',
    par: 20,
    optimalKeys: [
      ':', 'E', 'Enter',
      'j', 'j', 'Enter',
      '%',
      '4', 'j', 'Enter',
      'j', 'f', '+', 'r', '*',
      'Ctrl-^',
    ],
    primaryFilename: 'index.ts',
    initialLines: [
      '// Lesson 64: Pure Netrw Project Explorer & Buffer Control',
      "import { add } from './src/utils';",
      'console.log(add(10, 20));',
    ],
    targetLines: [
      '// Lesson 64: Pure Netrw Project Explorer & Buffer Control',
      "import { add } from './src/utils';",
      'console.log(add(10, 20));',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const isNetrwClosed = !state.netrw || !state.netrw.isOpen;
      if (!isNetrwClosed) return false;

      // 1. 신규 파일(new_file.txt) 생성 여부
      const isFileCreated = Boolean(
        state.virtualFiles?.['src/new_file.txt'] ||
        state.virtualFiles?.['new_file.txt'] ||
        state.netrw?.files?.['src/new_file.txt'] ||
        state.netrw?.files?.['new_file.txt']
      );
      if (!isFileCreated) return false;

      // 2. src/utils.ts 의 add 함수 덧셈(+)이 곱셈(*)으로 수정되었는지 검증
      const utilsBuf = state.buffers?.find(
        (b) => b.name === 'src/utils.ts' || b.name === 'utils.ts'
      );
      const isUtilsModified = Boolean(
        utilsBuf?.lines.some((l) => l.includes('return a * b;')) ||
        (state.primaryFilename?.includes('utils.ts') && state.lines.some((l) => l.includes('return a * b;')))
      );
      if (!isUtilsModified) return false;

      // 3. 원래 버퍼(index.ts)로 복귀했는지 검증 (Ctrl-^ 또는 :b)
      const isReturnedToIndex =
        state.primaryFilename === 'index.ts' ||
        (state.buffers?.find((b) => b.id === state.currentBufferId)?.name === 'index.ts');

      return isReturnedToIndex;
    },
  },
  {
    id: 65,
    title: '레슨 65: 글로벌 프로젝트 리팩토링과 :vimgrep, :cdo / :cfdo 대규모 검색 치환 마스터',
    description:
      '실무 대규모 코드베이스에서 수십~수백 개의 파일에 걸쳐 있는 구형 API나 식별자를 한 번에 리팩토링할 때, 순정 Vim의 퀵픽스 배치 커맨드(:cdo / :cfdo)는 최강의 생산성을 발휘합니다.\n\n1) 다중 파일 검색 (:vimgrep):\n   - :vimgrep /pattern/ [files] 명령으로 프로젝트 내 모든 파일이나 버퍼(*)를 검색하여 퀵픽스 목록을 생성합니다.\n   - 예: :vimgrep /v1/ * (모든 열린 버퍼에서 v1 패턴 검색)\n\n2) 퀵픽스 일괄 치환 (:cdo / :cfdo):\n   - :cdo {cmd} : 퀵픽스 목록에 있는 모든 매칭 항목의 위치로 순차 점프하며 Ex 명령({cmd})을 실행합니다.\n     예: :cdo s/v1/v2/g (모든 매치 위치에서 치환 실행)\n   - :cfdo {cmd} : 퀵픽스에 매칭이 존재하는 각 파일마다 한 번씩 명령을 실행합니다.\n     예: :cfdo %s/v1/v2/g (파일 단위 전체 치환)\n\n3) 작업 완료 후 버퍼 복귀:\n   - 일괄 치환 후 Ctrl-^(또는 Ctrl-6, :b 1)을 누르면 원래 편집하던 기본 파일(api.ts)로 초고속 복귀합니다.\n\n미션:\n1. :vimgrep /v1/ * 명령으로 api.ts와 auth.ts의 모든 v1 엔드포인트를 검색하세요.\n2. :cdo s/v1/v2/g 명령으로 모든 파일의 v1을 v2로 일괄 치환하세요.\n3. Ctrl-^ 를 눌러 원래 파일(api.ts)로 복귀하여 미션을 완료하세요!',
    hint: ':vimgrep /v1/ * 입력 후 Enter → :cdo s/v1/v2/g 입력 후 Enter → Ctrl-^ 로 원래 버퍼(api.ts) 복귀',
    par: 35,
    optimalKeys: [
      ':', 'v', 'i', 'm', 'g', 'r', 'e', 'p', ' ', '/', 'v', '1', '/', ' ', '*', 'Enter',
      ':', 'c', 'd', 'o', ' ', 's', '/', 'v', '1', '/', 'v', '2', '/', 'g', 'Enter',
      'Ctrl-^',
    ],
    primaryFilename: 'api.ts',
    secondaryFilename: 'auth.ts',
    initialLines: [
      'const BASE_URL = "https://api.io/v1";',
      'export const getItems = () => "/v1/items";',
    ],
    secondaryLines: [
      'export const tokenUrl = "https://api.io/v1/tokens";',
    ],
    targetLines: [
      'const BASE_URL = "https://api.io/v2";',
      'export const getItems = () => "/v2/items";',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const s = ensureBuffers(state);
      const buf1 = s.buffers?.find((b) => b.name === 'api.ts' || b.id === 1);
      const buf2 = s.buffers?.find((b) => b.name === 'auth.ts' || b.id === 2);
      const isBackOnApi = s.currentBufferId === 1 || s.primaryFilename === 'api.ts';

      const isApiUpdated =
        buf1?.lines[0] === 'const BASE_URL = "https://api.io/v2";' &&
        buf1?.lines[1] === 'export const getItems = () => "/v2/items";';
      const isAuthUpdated =
        buf2?.lines[0] === 'export const tokenUrl = "https://api.io/v2/tokens";';

      return isBackOnApi && isApiUpdated && isAuthUpdated;
    },
  },
  {
    id: 66,
    title: '레슨 66: 고급 매크로 레지스터 조작과 "ap / "ay 실전 편집 마스터',
    description:
      'Vim의 매크로는 특수 바이너리가 아니라 일반 텍스트 레지스터("a~"z)에 그대로 저장됩니다. 만약 복잡한 매크로를 녹화하다가 오타나 실수가 발생했다면 처음부터 다시 녹화할 필요 없이 버퍼에 붙여넣어 수정할 수 있습니다!\n\n1) 매크로를 버퍼에 붙여넣기 ("ap):\n   - 레지스터 a에 녹화된 매크로를 현재 커서 위치에 텍스트로 붙여넣습니다.\n   - <Esc>, <CR> 같은 특수 키는 실제 제어 글자로 저장되어 있어, 버퍼에는 Vim 처럼 ^[ (Esc), ^M (Enter) 로 색을 달리해 보입니다. ^[ 는 화면에서 두 칸이지만 글자 하나라서 커서는 한 번에 넘어갑니다.\n   - 예: "ap → A,^[j\n\n2) 버퍼에서 오타 수정:\n   - 일반 Vim 편집 명령(f, r, cw 등)으로 잘못된 키스트로크나 문자를 수정합니다.\n   - 예: 0f,r; (쉼표 , 를 세미콜론 ; 로 변경) → A;^[j\n\n3) 수정한 매크로를 다시 레지스터에 복사 ("ay$):\n   - 수정된 라인을 0"ay$ 로 다시 레지스터 a에 복사합니다.\n\n4) 수정된 매크로 실행 (@a, 2@@):\n   - 대상 라인으로 이동하여 @a 를 실행하고, 2@@ 로 나머지 라인에 일괄 적용합니다.\n\n미션:\n1. 빈 1번 라인에서 "ap 로 레지스터 a의 매크로(A,^[j)를 붙여넣으세요.\n2. 0f,r; 로 쉼표(,)를 세미콜론(;)으로 수정하세요 (A;^[j).\n3. 0"ay$ 로 수정된 매크로를 다시 레지스터 a에 복사하세요.\n4. j 로 const a = 1 라인으로 이동한 후 @a 를 실행하세요.\n5. 2@@ 로 const b = 2 및 const c = 3 라인까지 세미콜론을 일괄 추가하세요!',
    hint: '"ap 로 붙여넣기 → 0f,r; 로 , 를 ; 로 수정 → 0"ay$ 로 레지스터 a에 복사 → j 로 이동 → @a 및 2@@ 실행',
    par: 22,
    optimalKeys: [
      '"', 'a', 'p',
      '0', 'f', ',', 'r', ';',
      '0', '"', 'a', 'y', '$',
      'j',
      '@', 'a',
      '2', '@', '@',
    ],
    initialLines: [
      '// Scratch line: paste "ap, fix typo, and yank back with "ay$',
      '',
      'const a = 1',
      'const b = 2',
      'const c = 3',
    ],
    targetLines: [
      '// Scratch line: paste "ap, fix typo, and yank back with "ay$',
      'A;\x1bj', // "ap 는 실제 ESC 글자를 붙여 넣습니다 (화면에는 ^[)
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
    ],
    initialRegisters: {
      a: {
        type: 'macro',
        content: ['A', ',', 'Escape', 'j'],
      },
    },
    initialCursor: { line: 1, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const hasLines =
        state.lines.some((l) => l === 'const a = 1;') &&
        state.lines.some((l) => l === 'const b = 2;') &&
        state.lines.some((l) => l === 'const c = 3;');

      const aContent = state.registers?.a?.content;
      const aStr = Array.isArray(aContent)
        ? aContent.join('')
        : (aContent ?? '');
      const isMacroFixed = aStr.includes(';') && !aStr.includes(',');

      return hasLines && isMacroFixed;
    },
  },
  {
    id: 67,
    title: '레슨 67: Vim 세션 관리(:mksession, :source)로 분할 창과 버퍼 환경 영구 보존하기',
    description:
      'Vim/Neovim에서 복잡한 프로젝트를 작업할 때 여러 개의 분할 창(Split Window)과 버퍼(Buffer), 커서 위치, 옵션 설정을 세팅해 두고 개발을 진행합니다. 작업 중인 환경 전체를 영구 보존하고 나중에 한 번에 복원할 때 순정 Vim의 세션 기능(:mksession 및 :source)을 사용합니다.\n\n1) 세션 저장 (:mksession [파일명]):\n   - :mksession (또는 축약 :mks) : 기본 세션 파일(Session.vim)로 현재 분할 창 구조, 열려 있는 버퍼 목록, 커서 위치, 옵션을 저장합니다.\n   - :mksession [파일명] : 지정한 이름(예: :mks dev.vim)으로 세션 파일을 저장합니다.\n   - 이미 존재하는 세션 파일에 덮어쓸 때는 !를 붙여 :mks! dev.vim 처럼 실행합니다.\n\n2) 작업 환경 리셋 / 단일 창 정리 (:only):\n   - :only (또는 :on, Ctrl-w o) : 현재 활성 창만 남기고 나머지 분할 창을 모두 닫습니다. 다른 작업을 하거나 창을 닫아버린 상황을 시뮬레이션할 수 있습니다.\n\n3) 세션 복원 (:source [파일명]):\n   - :source dev.vim (또는 축약 :so dev.vim) : 저장해 둔 세션 스크립트를 로드하여 이전의 가로/세로 분할 창 구조, 보조 파일 내용, 커서 위치를 100% 무손실로 완벽히 복원합니다!\n\n미션:\n1. :vsp config.ts 명령으로 오른쪽에 config.ts 보조 설정 창을 수직 분할로 여세요.\n2. :mks dev.vim 명령으로 현재 분할 창과 버퍼 작업 환경을 dev.vim 세션 파일로 저장하세요.\n3. :only 명령을 실행하여 분할 창을 닫고 app.ts 단일 창으로 초기화하세요.\n4. :so dev.vim 명령을 실행하여 저장해 둔 세션을 불러와 이전의 분할 창 작업 환경을 완벽하게 복원하세요!',
    hint: ':vsp config.ts 입력 후 Enter → :mks dev.vim 입력 후 Enter → :only 입력 후 Enter → :so dev.vim 입력 후 Enter',
    par: 55,
    optimalKeys: [
      ':', 'v', 's', 'p', ' ', 'c', 'o', 'n', 'f', 'i', 'g', '.', 't', 's', 'Enter',
      ':', 'm', 'k', 's', ' ', 'd', 'e', 'v', '.', 'v', 'i', 'm', 'Enter',
      ':', 'o', 'n', 'l', 'y', 'Enter',
      ':', 's', 'o', ' ', 'd', 'e', 'v', '.', 'v', 'i', 'm', 'Enter',
    ],
    primaryFilename: 'app.ts',
    secondaryFilename: 'config.ts',
    initialLines: [
      '// app.ts - Core Application Entry',
      'import { API_KEY, PORT } from "./config";',
      'export function bootstrap() {',
      '  console.log(`Server starting on port ${PORT}...`);',
      '}',
    ],
    secondaryLines: [
      '// config.ts - Application Configuration',
      'export const PORT = 8080;',
      'export const API_KEY = "secret_jwt_token";',
    ],
    targetLines: [
      '// app.ts - Core Application Entry',
      'import { API_KEY, PORT } from "./config";',
      'export function bootstrap() {',
      '  console.log(`Server starting on port ${PORT}...`);',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const hasSessionFile = Boolean(
        state.virtualFiles?.['dev.vim'] ||
        state.globalVars?.['v:this_session'] === 'dev.vim'
      );
      if (!hasSessionFile) return false;

      // :mks dev.vim 직후에도 분할 창이 그대로라 창 구성만 보면 저장 단계에서 완료됩니다.
      // 마지막 저장 이후 :so dev.vim 으로 세션을 다시 불러왔는지까지 확인합니다.
      const history = state.commandHistory ?? [];
      const normalize = (cmd: string) => cmd.trim().replace(/^:+/, '').replace(/\s+/g, ' ');
      let lastSaveIdx = -1;
      let lastSourceIdx = -1;
      history.forEach((cmd, idx) => {
        const c = normalize(cmd);
        if (/^mk(s|se|ses|sess|sessi|sessio|session)!? dev\.vim$/.test(c)) lastSaveIdx = idx;
        if (/^so(u|ur|urc|urce)? dev\.vim$/.test(c)) lastSourceIdx = idx;
      });
      if (lastSaveIdx < 0 || lastSourceIdx < lastSaveIdx) return false;

      const isSplitRestored =
        state.splitDirection === 'vertical' &&
        Boolean(state.splitPanes && state.splitPanes.length === 2);
      if (!isSplitRestored) return false;

      const pane0 = state.splitPanes![0];
      const pane1 = state.splitPanes![1];
      const hasApp = pane0.filename === 'app.ts' || pane1.filename === 'app.ts';
      const hasConfig = pane0.filename === 'config.ts' || pane1.filename === 'config.ts';

      return hasApp && hasConfig;
    },
  },
  {
    id: 68,
    title: '레슨 68: 점프 리스트(Ctrl-o / Ctrl-i)와 마크 정리(:delmarks!)로 대규모 코드 정밀 탐색하기',
    description:
      'Vim은 커서가 큰 폭으로 점프(G, gg, /검색, 마크 점프 \' 등)할 때마다 그 이전 위치를 내부 점프 리스트(Jump List)에 자동으로 기록합니다. 웹 브라우저의 \'뒤로 가기\'와 \'앞으로 가기\'처럼 코드베이스 어디로 이동했든 손쉽게 이전 작업 위치로 순간이동할 수 있습니다.\n\n1) 점프 리스트 양방향 이동 (Ctrl-o / Ctrl-i):\n   - Ctrl-o (Older): 점프 리스트의 이전(과거) 위치로 뒤로 가기 점프합니다.\n   - Ctrl-i (Newer): 점프 리스트의 다음(최신) 위치로 앞으로 가기 점프합니다.\n   - :jumps : 현재 점프 리스트 목록과 포인터(>)를 표 형태로 확인합니다.\n   - :clearjumps : 점프 리스트 히스토리를 초기화합니다.\n\n2) 마크 설정과 삭제 (:delmarks):\n   - ma : 현재 커서 위치를 마크 a로 저장합니다.\n   - \'a : 마크 a가 위치한 행의 첫 글자로 즉시 점프합니다.\n   - :marks : 등록된 모든 마크 목록을 조회합니다.\n   - :delmarks! (또는 축약 :delm!) : 현재 버퍼의 모든 소문자 마크(a-z)를 한 번에 일괄 삭제하여 버퍼를 깨끗하게 정리합니다.\n\n미션:\n1. 1번 줄에서 ma 키를 눌러 현재 위치를 마크 a로 북마크하세요.\n2. G 키로 맨 마지막 줄로 점프한 뒤, k f 3 c w 8 0 8 0 <Esc> 로 port 값을 3000에서 8080으로 수정하세요.\n3. Ctrl-o 키를 눌러 점프 리스트 이전 위치(1번 줄)로 뒤로 가기 복귀하세요.\n4. Ctrl-i 키를 눌러 다시 최신 점프 위치(마지막 줄)로 앞으로 가기 전진하세요.\n5. \'a 키를 눌러 마크 a가 있는 1번 줄로 순간이동하세요.\n6. :delmarks! 명령으로 임시 마크 a를 삭제하여 미션을 완료하세요!',
    hint: 'ma 로 마크 a 설정 → G 로 마지막 줄 점프 → k f 3 c w 8 0 8 0 Escape 로 포트 수정 → Ctrl-o 로 1번 줄 복귀 → Ctrl-i 로 점프 위치 전진 → \'a 로 마크 점프 → :delmarks! 입력 후 Enter',
    par: 30,
    optimalKeys: [
      'm', 'a',
      'G',
      'k',
      'f', '3',
      'c', 'w', '8', '0', '8', '0', 'Escape',
      'Ctrl-o',
      'Ctrl-i',
      "'", 'a',
      ':', 'd', 'e', 'l', 'm', 'a', 'r', 'k', 's', '!', 'Enter',
    ],
    initialLines: [
      '// User Settings Module',
      'export const config = {',
      '  theme: "dark",',
      '  debug: false,',
      '  timeout: 5000,',
      '  port: 3000,',
      '};',
    ],
    targetLines: [
      '// User Settings Module',
      'export const config = {',
      '  theme: "dark",',
      '  debug: false,',
      '  timeout: 5000,',
      '  port: 8080,',
      '};',
    ],
    initialCursor: { line: 0, col: 0 },
    targetCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const isPortUpdated = state.lines.some((l) => l.includes('port: 8080'));
      const isBackOnTop = state.cursor.line === 0;
      const hasUsedJumps = (state.jumpList?.length ?? 0) >= 1;
      const isMarkCleaned = !state.marks?.a;

      return isPortUpdated && isBackOnTop && hasUsedJumps && isMarkCleaned;
    },
  },
  {
    id: 69,
    title: '레슨 69: 버퍼 로컬 옵션(:setlocal)과 파일타입 들여쓰기(ftplugin) 실무 마스터',
    description:
      '실무의 다중 언어 프로젝트는 Python(4칸 들여쓰기), Go(탭 들여쓰기), TypeScript(2칸 들여쓰기) 등 파일마다 다른 서식 규칙을 요구합니다. 전역 설정(:set)을 바꾸면 다른 파일의 서식이 망가질 수 있으므로, 현재 버퍼에만 독립적으로 적용되는 :setlocal(:setl)을 사용하는 것이 필수적입니다.\n\n1) 버퍼 로컬 옵션 제어 (:setlocal / :setl):\n   - :setlocal ft=python : 현재 버퍼의 파일타입을 python으로 설정하고, 표준 4칸 공백 들여쓰기(shiftwidth=4, tabstop=4, expandtab)를 적용합니다.\n   - :setlocal ft=go : 현재 버퍼의 파일타입을 go로 설정하고, 순정 탭 들여쓰기(shiftwidth=8, tabstop=8, noexpandtab)를 적용합니다.\n   - :setlocal? : 현재 버퍼에 적용된 로컬 오버라이드 설정을 확인합니다.\n\n2) 언어별 동적 들여쓰기 (>> / <<):\n   - 들여쓰기 연산자(>>)는 하드코딩된 공백이 아닌 현재 버퍼의 shiftwidth와 expandtab 설정을 동적으로 반영합니다. Python 버퍼에서는 4칸 공백이 삽입되고, Go 버퍼에서는 탭(\\t) 문자로 정확하게 들여쓰기됩니다.\n\n3) 버퍼 간 설정 격리:\n   - :bn(또는 :b 2)으로 2번 버퍼로 전환하거나 Ctrl-^로 이전 버퍼로 복귀할 때 각 버퍼 고유의 로컬 옵션이 완벽하게 보존됩니다.\n\n미션:\n1. 1번 버퍼(main.py)에서 :setl ft=python<Enter> 명령으로 Python 파일타입 및 4칸 들여쓰기를 활성화하세요.\n2. j 키로 1번 줄로 이동한 뒤, >> 연산자로 4칸 들여쓰기를 적용하세요.\n3. :bn<Enter> 명령으로 2번 버퍼(server.go)로 전환하세요.\n4. :setl ft=go<Enter> 명령으로 Go 파일타입 및 탭 들여쓰기를 활성화하세요.\n5. j 키로 1번 줄로 이동한 뒤, >> 연산자로 탭(\\t) 들여쓰기를 적용하세요.\n6. Ctrl-^ 키를 눌러 원래의 1번 버퍼(main.py)로 복귀하여 미션을 완료하세요!',
    hint: ':setl ft=python 입력 후 Enter → j >> 로 4칸 들여쓰기 → :bn 입력 후 Enter 로 server.go 이동 → :setl ft=go 입력 후 Enter → j >> 로 탭 들여쓰기 → Ctrl-^ 로 main.py 복귀',
    par: 42,
    optimalKeys: [
      ':', 's', 'e', 't', 'l', ' ', 'f', 't', '=', 'p', 'y', 't', 'h', 'o', 'n', 'Enter',
      'j',
      '>', '>',
      ':', 'b', 'n', 'Enter',
      ':', 's', 'e', 't', 'l', ' ', 'f', 't', '=', 'g', 'o', 'Enter',
      'j',
      '>', '>',
      'Ctrl-^',
    ],
    primaryFilename: 'main.py',
    secondaryFilename: 'server.go',
    initialLines: [
      'def process_job():',
      'return True',
    ],
    secondaryLines: [
      'func Handle() {',
      'return',
      '}',
    ],
    targetLines: [
      'def process_job():',
      '    return True',
    ],
    initialCursor: { line: 0, col: 0 },
    targetCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const s = ensureBuffers(state);
      const buf1 = s.buffers?.find((b) => b.name === 'main.py' || b.id === 1);
      const buf2 = s.buffers?.find((b) => b.name === 'server.go' || b.id === 2);

      const isCurrentBuf1 = s.currentBufferId === 1 || s.primaryFilename === 'main.py';

      const buf1Correct =
        buf1?.lines[1] === '    return True' &&
        (buf1.localOptions?.shiftwidth === 4 || s.bufferLocalOptions?.[1]?.shiftwidth === 4);

      const buf2Correct =
        buf2?.lines[1] === '\treturn' &&
        (buf2.localOptions?.expandtab === false || s.bufferLocalOptions?.[2]?.expandtab === false);

      return isCurrentBuf1 && Boolean(buf1Correct) && Boolean(buf2Correct);
    },
  },
  {
    id: 70,
    title: '레슨 70: 입력 모드 고속 탈출(:imap jk <Esc>)과 리더키(<leader>) 실무 키매핑 마스터',
    description:
      'Vim의 가장 큰 강점 중 하나는 나만의 손가락 타건 리듬에 맞춰 키를 재정의하는 커스텀 키매핑입니다. 특히 실무 Vim 고수들이 가장 먼저 설정하는 두 가지 필수 키매핑이 있습니다.\n\n1) 입력 모드 고속 탈출 (:imap jk <Esc>):\n   - 일반 키보드에서 <Esc>는 좌측 최상단에 있어, 입력 모드를 빠져나올 때마다 홈 로우(Home Row) 타건 자세가 무너집니다.\n   - :imap jk <Esc> 를 등록해 두면 입력 모드에서 j와 k를 빠르게 연속 입력했을 때 직전 j가 자동으로 지워지면서 즉시 노멀 모드로 탈출합니다! 손가락을 홈 로우에서 단 1mm도 뗄 필요가 없습니다.\n\n2) 리더 키(Leader Key)와 레지스터 보호 (:nmap <leader>d "_d):\n   - Vim의 기본 단축키와 충돌하지 않는 나만의 안전한 단축키 네임스페이스를 만들 때 <leader>를 사용합니다 (기본 리더 키: <Space> 공백).\n   - 코드를 정리할 때 이전에 복사(Yank)해 둔 중요한 텍스트를 유지하면서 불필요한 줄을 지우고 싶을 때, 기본 dd는 클립보드(무명 레지스터 ")를 덮어써 버립니다.\n   - :nmap <leader>d "_d 를 등록하면 <Space>dd 입력 한 번으로 클립보드 손실 없이 블랙홀 레지스터(_)로 깔끔하게 삭제할 수 있습니다.\n\n미션:\n1. :imap jk <Esc><Enter> 명령으로 입력 모드 탈출 매핑을 등록하세요.\n2. :nmap <leader>d "_d<Enter> 명령으로 리더키 블랙홀 삭제 매핑을 등록하세요.\n3. 1번 줄에서 ya" 키로 "AUTH_BEARER_SECRET" 토큰을 복사하세요.\n4. j 키로 2번 줄(console.log)로 이동한 뒤, <Space>dd 키로 토큰을 보존한 채 디버그 줄을 블랙홀 삭제하세요.\n5. $ 키로 backup 라인 끝으로 이동한 뒤, p 키로 복사한 토큰을 붙여넣으세요.\n6. A 키로 줄 끝 입력 모드로 진입하고, ; 문자를 타이핑한 뒤, jk 키를 연속으로 입력하여 노멀 모드로 초고속 복귀하세요!',
    hint: ':imap jk <Esc> 입력 후 Enter → :nmap <leader>d "_d 입력 후 Enter → ya" 로 토큰 복사 → j 후 <Space>dd 로 디버그 줄 삭제 → $ 후 p 로 토큰 붙여넣기 → A;jk 로 세미콜론 추가 및 노멀 모드 복귀',
    par: 52,
    optimalKeys: [
      ':', 'i', 'm', 'a', 'p', ' ', 'j', 'k', ' ', '<', 'E', 's', 'c', '>', 'Enter',
      ':', 'n', 'm', 'a', 'p', ' ', '<', 'l', 'e', 'a', 'd', 'e', 'r', '>', 'd', ' ', '"', '_', 'd', 'Enter',
      'y', 'a', '"',
      'j',
      ' ', 'd', 'd',
      '$', 'p',
      'A', ';', 'j', 'k',
    ],
    initialLines: [
      'const token = "AUTH_BEARER_SECRET";',
      'console.log("DEBUG_LEAK");',
      'const backup = ',
    ],
    targetLines: [
      'const token = "AUTH_BEARER_SECRET";',
      'const backup = "AUTH_BEARER_SECRET";',
    ],
    initialCursor: { line: 0, col: 0 },
    targetCursor: { line: 1, col: 34 },
    // 설명·optimalKeys 가 <Space>dd 를 가르치므로 사용자 리더 키 설정과 무관하게 Space 로 고정합니다.
    fixedLeaderKey: ' ',
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const isImapRegistered =
        state.userKeymaps?.['i:jk'] === '<Esc>' ||
        state.userKeymaps?.['i:jk'] === 'Escape';
      const isNmapRegistered =
        state.userKeymaps?.['n:<leader>d'] === '"_d' ||
        state.userKeymaps?.['n: d'] === '"_d' ||
        state.userKeymaps?.['<leader>d'] === '"_d' ||
        state.userKeymaps?.[' d'] === '"_d';

      const target0 = 'const token = "AUTH_BEARER_SECRET";';
      const target1 = 'const backup = "AUTH_BEARER_SECRET";';
      return (
        isImapRegistered &&
        isNmapRegistered &&
        state.lines.length === 2 &&
        state.lines[0] === target0 &&
        state.lines[1] === target1
      );
    },
  },
  {
    id: 71,
    title: '레슨 71: 순정 ctags 멀티 정의 심볼 탐색과 태그 선택기(:tselect, :tjump, g]) 마스터',
    description:
      'Vim의 순정 ctags는 서로 다른 파일에 동일한 이름의 함수나 메서드가 여러 개 정의되어 있을 때도 손쉽게 탐색할 수 있는 강력한 태그 선택기(Tag Selector) 기능을 제공합니다.\n\n1) 단일 정의 vs 다중 정의 심볼 점프 (Ctrl+] vs g]):\n   - 기본 Ctrl+](또는 :tag)는 일치하는 심볼이 여러 개라도 무조건 첫 번째 정의부로 점프합니다.\n   - g](또는 g Ctrl-] / :tjump / :tj)는 정의부가 1개면 즉시 점프하고, 2개 이상이면 일치하는 모든 파일과 라인 번호 목록을 표시하며 첫 번째 위치로 점프합니다.\n\n2) 태그 일치 목록 순회 (:tnext / :tprev / :tselect):\n   - :tnext (축약 :tn): 현재 검색된 태그 목록의 다음 정의부 파일로 버퍼를 즉시 전환합니다.\n   - :tprev (축약 :tp): 이전 정의부 파일로 되돌아갑니다.\n   - :tfirst (:tf) / :tlast (:tl): 첫 번째 / 마지막 정의부로 한 번에 이동합니다.\n   - :tselect <이름> (축약 :ts): 해당 심볼의 모든 정의 목록을 표로 조회하고 특정 번호로 즉시 점프합니다 (예: :ts 2).\n\n3) 태그 스택 복귀 (Ctrl-t / :pop):\n   - 다중 정의부를 모두 확인한 뒤 Ctrl-t(또는 :pop)를 누르면 태그 스택을 거슬러 올라가 탐색을 시작했던 원래 파일로 정확하게 복귀합니다.\n\n미션:\n1. 3번 줄의 add 함수 호출부 위에서 g] 단축키를 눌러 다중 정의 태그 목록을 확인하고 첫 번째 정의부로 점프하세요.\n2. :tn<Enter> 명령으로 다음 정의부 파일로 이동하세요.\n3. Ctrl-t 키를 눌러 원래 파일(app.ts)의 호출 위치로 복귀하여 미션을 완료하세요!',
    hint: 'g] 로 add 다중 정의 확인 및 첫 정의부 점프 → :tn 입력 후 Enter 로 다음 정의부 이동 → Ctrl-t 로 app.ts 복귀',
    par: 10,
    optimalKeys: ['g', ']', ':', 't', 'n', 'Enter', 'Ctrl-t'],
    primaryFilename: 'app.ts',
    secondaryFilename: 'src/math.ts',
    initialLines: [
      'import { add } from "./utils";',
      '',
      'function calculate() {',
      '  const sum = add(10, 20);',
      '  return sum;',
      '}',
    ],
    secondaryLines: [
      'export function add(vectorA: number[], vectorB: number[]) {',
      '  return vectorA.map((v, i) => v + vectorB[i]);',
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
    initialCursor: { line: 3, col: 14 },
    checkComplete: (state) => {
      const isReturnedToApp = state.primaryFilename === 'app.ts';
      const hasVisitedUtils = Boolean(
        state.buffers?.some((b) => b.name === 'src/utils.ts')
      );
      const hasVisitedMath = Boolean(
        state.buffers?.some((b) => b.name === 'src/math.ts')
      );
      const isTagStackCleared = (state.tagStack?.length ?? 0) === 0;
      const hasMatchedTags = (state.tagMatches?.length ?? 0) >= 2;

      return (
        state.mode === 'NORMAL' &&
        isReturnedToApp &&
        hasVisitedUtils &&
        hasVisitedMath &&
        isTagStackCleared &&
        hasMatchedTags
      );
    },
  },
  {
    id: 72,
    title: '레슨 72: 순정 Vim 자동 명령(Autocommand)과 저장 시 공백 자동 정리 마스터',
    description:
      'Vim의 순정 자동 명령(Autocommand)은 특정 이벤트(파일 저장, 버퍼 진입, 파일타입 설정 등)가 발생할 때 미리 등록해 둔 명령어를 자동으로 실행해 주는 강력한 자동화 기능입니다.\n\n1) 자동 명령 기본 문법 (:autocmd 또는 :au):\n   - :autocmd [group] {event} {pat} {cmd}\n   - {event}: BufWritePre(저장 직전), BufWritePost(저장 직후), BufEnter(버퍼 진입), FileType(파일타입 감지) 등\n   - {pat}: 대상 파일 패턴 (*, *.ts, *.py 등)\n   - {cmd}: 실행할 Vim Ex 명령어\n\n2) 파일 저장 전 끝 공백 자동 제거 (BufWritePre):\n   - 실무에서 코드 저장 시 줄 끝에 남은 불필요한 공백(trailing whitespace)을 자동으로 정리할 때 가장 많이 사용되는 설정입니다:\n     :autocmd BufWritePre * :%s/\\s\\+$//e\n   - %s/\\s\\+$//e: 전체 줄(%)에서 줄 끝의 공백 1개 이상(\\s\\+$)을 빈 문자열로 치환하며, 일치하지 않는 줄이 있어도 에러를 무시(e 플래그)합니다.\n\n3) 실행 및 저장 연동 (:w):\n   - 자동 명령을 등록한 뒤 :w 로 파일을 저장하면 저장 직전에 BufWritePre 훅이 발동하여 줄 끝의 지저분한 공백들이 자동으로 말끔하게 정리됩니다!\n\n미션:\n1. :autocmd BufWritePre * :%s/\\s\\+$//e (또는 줄여서 :au BufWritePre * %s/\\s\\+$//e)<Enter> 를 입력하여 파일 저장 직전 끝 공백 자동 제거 훅을 등록하세요.\n2. :w<Enter> 를 입력하여 파일을 저장하세요. BufWritePre 자동 명령이 발동하여 끝 공백이 모두 정리되고 파일이 저장되면 미션이 완료됩니다!',
    hint: ':au BufWritePre * %s/\\s\\+$//e 입력 후 Enter → :w 입력 후 Enter 로 공백 자동 제거 및 저장',
    par: 36,
    optimalKeys: [
      ':', 'a', 'u', ' ', 'B', 'u', 'f', 'W', 'r', 'i', 't', 'e', 'P', 'r', 'e', ' ', '*', ' ',
      '%', 's', '/', '\\', 's', '\\', '+', '$', '/', '/', 'e', 'Enter',
      ':', 'w', 'Enter',
    ],
    primaryFilename: 'service.ts',
    initialLines: [
      'const serviceName = "auth-service";   ',
      'const retryLimit = 3;  ',
      'function authenticate(token: string) {    ',
      '  return Boolean(token);',
      '}',
    ],
    targetLines: [
      'const serviceName = "auth-service";',
      'const retryLimit = 3;',
      'function authenticate(token: string) {',
      '  return Boolean(token);',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const hasAutocmd = Boolean(
        state.autocmds?.some(
          (a) =>
            a.event.toLowerCase() === 'bufwritepre' &&
            a.command.includes('%s')
        )
      );
      const targetClean = [
        'const serviceName = "auth-service";',
        'const retryLimit = 3;',
        'function authenticate(token: string) {',
        '  return Boolean(token);',
        '}',
      ];
      const isLinesClean =
        state.lines.length === targetClean.length &&
        state.lines.every((line, idx) => line === targetClean[idx]);
      const isSaved = (state.saveCounter ?? 0) > 0;

      return (
        state.mode === 'NORMAL' &&
        hasAutocmd &&
        isLinesClean &&
        isSaved
      );
    },
  },
  {
    id: 73,
    title: '레슨 73: 순정 Netrw 디렉터리 북마크(mb, gb)와 프로젝트 고속 탐색 마스터',
    description:
      '대규모 모노레포 프로젝트에서는 깊은 폴더 트리를 매번 오르내리는 대신, 자주 찾는 디렉터리를 Netrw 북마크로 등록해 두면 gb 키 하나로 즉시 워프할 수 있습니다.\n\n1) Netrw 디렉터리 북마크 등록 (mb):\n   - :Explore (또는 :E) 로 Netrw 탐색기를 연 뒤, 북마크하고 싶은 디렉터리(예: services/) 줄 위에 커서를 두고 mb 를 누르면 북마크 목록에 등록됩니다.\n\n2) 북마크 디렉터리 고속 점프 (gb):\n   - Netrw 내에서 gb 키를 누르면 등록된 북마크 디렉터리들 사이를 순환하며 즉시 점프합니다.\n\n3) 파일 열기 및 버퍼 복귀 (<CR>, Ctrl-^):\n   - 이동한 디렉터리에서 원하는 파일(auth.ts) 위에서 Enter 를 눌러 파일을 열고 작업한 뒤, Ctrl-^ 키를 누르면 원래의 시작 파일(app.ts)로 완벽하게 복귀합니다.\n\n미션:\n1. :E<Enter> 명령으로 순정 Netrw 탐색기를 여세요.\n2. j 키를 2번 눌러 services/ 디렉터리로 이동한 뒤 mb 키로 북마크를 등록하세요.\n3. gb 키를 눌러 등록된 services/ 디렉터리로 즉시 점프하세요.\n4. j 키를 2번 눌러 auth.ts 파일로 이동한 뒤 Enter 키를 눌러 파일을 여세요.\n5. Ctrl-^ 키를 눌러 원래 버퍼(app.ts)로 복귀하여 미션을 완료하세요!',
    hint: ':E 입력 후 Enter → jj 후 mb 로 services/ 북마크 → gb 로 점프 → jj 후 Enter 로 auth.ts 열기 → Ctrl-^ 로 app.ts 복귀',
    par: 20,
    optimalKeys: [
      ':', 'E', 'Enter',
      'j', 'j',
      'm', 'b',
      'g', 'b',
      'j', 'j',
      'Enter',
      'Ctrl-^',
    ],
    primaryFilename: 'app.ts',
    initialLines: [
      'import { verifyToken } from "./services/auth";',
      '',
      'function main() {',
      '  return verifyToken();',
      '}',
    ],
    targetLines: [
      'import { verifyToken } from "./services/auth";',
      '',
      'function main() {',
      '  return verifyToken();',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    initialVirtualFiles: {
      'services/auth.ts': ['export const verifyToken = () => true;'],
      'services/user.ts': ['export const getUser = () => null;'],
      'utils/logger.ts': ['export const log = console.log;'],
    },
    checkComplete: (state) => {
      const hasBookmark = Boolean(state.netrwBookmarks?.includes('services'));
      const isReturnedToApp = state.primaryFilename === 'app.ts';
      const hasOpenedAuth = Boolean(
        state.buffers?.some((b) => b.name === 'services/auth.ts')
      );

      return (
        state.mode === 'NORMAL' &&
        hasBookmark &&
        isReturnedToApp &&
        hasOpenedAuth
      );
    },
  },
  {
    id: 74,
    title: '레슨 74: 순정 퍼지 파인더(:find, :Files)와 프로젝트 파일 고속 분할 탐색 마스터',
    description:
      '규모가 큰 프로젝트에서는 파일 트리를 하나하나 뒤지는 대신, 순정 Ex 명령 :find 또는 대화형 퍼지 파인더 :Files 를 사용하면 수백 개의 파일 중에서도 원하는 파일을 1초 만에 찾아낼 수 있습니다.\n\n1) 순정 Ex 파일 탐색 (:find {name}):\n   - :find payment.ts 를 실행하면 가상 파일시스템(VFS) 전체에서 일치하는 경로(services/payment.ts)를 찾아 즉시 버퍼로 열어줍니다.\n\n2) 대화형 퍼지 팝업 파인더 (:Files 또는 :find):\n   - 인자 없이 :find 를 실행하거나 :Files 를 입력하면 화면 상단에 실시간 검색 팝업이 나타나며, 검색어 입력 및 <C-j>/<C-k>로 선택 후 Enter(열기) 또는 Ctrl-v(세로 분할)로 열 수 있습니다.\n\n3) 파일 수정, 저장 및 대안 버퍼 복귀 (:w, Ctrl-^):\n   - 이동한 payment.ts 파일의 포트 번호를 수정한 뒤, :w 로 저장하고 Ctrl-^ 키를 누르면 원래의 메인 버퍼(main.ts)로 즉시 복귀합니다.\n\n미션:\n1. :find payment.ts<Enter> 명령으로 services/payment.ts 파일을 즉시 찾아 여세요.\n2. 첫 번째 줄의 8080 포트를 9000 으로 수정하세요 (2w cw9000<Esc>).\n3. :w<Enter> 명령으로 파일을 저장하세요.\n4. Ctrl-^ 키를 눌러 원래 버퍼(main.ts)로 복귀하여 미션을 완료하세요!',
    hint: ':find payment.ts 입력 후 Enter → 2w cw9000<Esc> 로 포트 수정 → :w 로 저장 → Ctrl-^ 로 main.ts 복귀',
    par: 32,
    optimalKeys: [
      ':', 'f', 'i', 'n', 'd', ' ', 'p', 'a', 'y', 'm', 'e', 'n', 't', '.', 't', 's', 'Enter',
      '2', 'w',
      'c', 'w', '9', '0', '0', '0', 'Escape',
      ':', 'w', 'Enter',
      'Ctrl-^',
    ],
    primaryFilename: 'main.ts',
    initialLines: [
      'import { processPayment } from "./services/payment";',
      '',
      'export function checkout() {',
      '  return processPayment();',
      '}',
    ],
    targetLines: [
      'import { processPayment } from "./services/payment";',
      '',
      'export function checkout() {',
      '  return processPayment();',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    initialVirtualFiles: {
      'services/payment.ts': [
        'PORT = 8080;',
        'export const processPayment = () => true;',
      ],
      'services/auth.ts': ['export const verify = () => true;'],
      'utils/helper.ts': ['export const noop = () => {};'],
    },
    checkComplete: (state) => {
      const isBackToMain = state.primaryFilename === 'main.ts';
      const isPaymentUpdated =
        state.virtualFiles?.['services/payment.ts']?.[0] === 'PORT = 9000;' ||
        Boolean(
          state.buffers?.some(
            (b) => b.name === 'services/payment.ts' && b.lines[0] === 'PORT = 9000;'
          )
        );

      return (
        state.mode === 'NORMAL' &&
        isBackToMain &&
        isPaymentUpdated
      );
    },
  },
  {
    id: 75,
    title: '레슨 75: 순정 Vim 내장 도움말(:help, K)과 태그 링크 점프 마스터',
    description:
      'Vim 내장 매뉴얼 시스템은 인터넷 검색 없이도 터미널 안에서 모든 모션, 연산자, 텍스트 객체를 찾아볼 수 있는 가장 강력한 순정 레퍼런스입니다.\n\n1) 커서 아래 단어로 도움말 열기 (K 키 또는 :help {topic}):\n   - 노멀 모드에서 알고 싶은 단어(예: motion) 위에 커서를 두고 대문자 K 를 누르면, 커서 위치의 단어를 추출하여 즉시 해당 토픽의 도움말 창(:help motion)을 열어줍니다.\n   - 명령행에서 :h {topic} 또는 :help {topic} 을 직접 입력해도 동일합니다.\n\n2) 도움말 내 |tag| 하이퍼링크 점프 (<CR> 또는 Ctrl-]):\n   - 도움말 본문에서 |motion|, |change|, |text-objects| 와 같이 세로 막대(|)로 감싸진 태그 링크 위에 커서를 두고 Enter (<CR>) 또는 Ctrl-] 를 누르면 해당 세부 도움말로 즉시 점프합니다.\n   - 점프할 때마다 이전 도움말 문서와 커서 위치가 내부 태그 스택(tagStack)에 차곡차곡 쌓입니다.\n\n3) 이전 도움말 위치로 복귀 (Ctrl-t) 및 닫기 (q 또는 :q):\n   - Ctrl-t 키를 누르면 브라우저의 뒤로 가기처럼 직전 태그 위치로 완벽하게 되돌아갑니다.\n   - q 키 또는 :q 를 입력하면 도움말 창이 닫히고 원래 작업 중이던 코드로 복귀합니다.\n\n미션:\n1. 두 번째 줄의 "motion" 단어 위로 이동(j 3w)한 뒤 K 키를 눌러 도움말(:help motion)을 여세요.\n2. 도움말 하단 관련 항목의 |change| 링크 위로 이동(G k f|)한 뒤 Enter 키를 눌러 change.txt 로 점프하세요.\n3. Ctrl-t 키를 눌러 이전 도움말(motion.txt)로 복귀하세요.\n4. q 키를 눌러 도움말을 닫으세요.\n5. 원래 코드에서 ci"verified<Esc> 로 문자열을 "verified" 로 수정하여 미션을 완료하세요!',
    hint: 'j 3w 로 motion 이동 → K 로 도움말 열기 → G k f| 로 |change| 이동 후 Enter → Ctrl-t 로 복귀 → q 로 닫기 → ci"verified<Esc>',
    par: 28,
    optimalKeys: [
      'j',
      '3', 'w',
      'K',
      'G',
      'k',
      'f', '|',
      'Enter',
      'Ctrl-t',
      'q',
      'c', 'i', '"', 'v', 'e', 'r', 'i', 'f', 'i', 'e', 'd', 'Escape',
    ],
    primaryFilename: 'manual.ts',
    initialLines: [
      '// Use the built-in help (:help, K) to look up features and verify the code.',
      'const status = "motion";',
      'function check() {',
      '  return status === "verified";',
      '}',
    ],
    targetLines: [
      '// Use the built-in help (:help, K) to look up features and verify the code.',
      'const status = "verified";',
      'function check() {',
      '  return status === "verified";',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '// Use the built-in help (:help, K) to look up features and verify the code.',
        'const status = "verified";',
        'function check() {',
        '  return status === "verified";',
        '}',
      ];
      const isTargetMatched =
        state.lines.length === target.length &&
        state.lines.every((line, idx) => line === target[idx]);
      const isHelpClosed = !state.helpSession || !state.helpSession.isOpen;

      return (
        state.mode === 'NORMAL' &&
        isTargetMatched &&
        isHelpClosed
      );
    },
  },
  {
    id: 76,
    title: '레슨 76: 순정 주석 토글(gcc, gc{motion})과 언어별 commentstring 마스터',
    description:
      'Neovim 0.10+ 에 기본 탑재된 순정 주석 토글 연산자(gc)를 사용하면, 별도 플러그인 없이도 파일타입(commentstring)에 맞춰 한 줄 또는 블록 전체의 주석을 즉시 켜고 끌 수 있습니다.\n\n1) 현재 줄 주석 토글 (gcc, [count]gcc):\n   - 노멀 모드에서 gcc 를 누르면 현재 줄을 주석 처리하거나 이미 주석이면 해제합니다.\n   - 3gcc 처럼 숫자를 붙이면 아래 3줄을 한꺼번에 토글합니다.\n\n2) 모션 & 텍스트 객체 결합 (gc{motion}, gcip, V...gc):\n   - gcj, gc2j, gc} 처럼 모션과 결합하거나, gcip 로 문단 전체의 주석을 한 번에 토글할 수 있습니다.\n   - 비주얼 모드(V)로 줄을 선택한 뒤 gc 를 눌러도 동일하게 동작합니다.\n   - 각 줄의 들여쓰기가 달라도 가장 얕은 들여쓰기 기준으로 주석 기호를 깔끔하게 정렬합니다.\n\n미션:\n1. 3번째 줄의 디버그 로그(console.log)로 내려가(2j) gcc 로 주석 처리하세요.\n2. 아래의 주석 처리된 if 문단으로 이동(3j)한 뒤, gcip 로 문단 전체의 주석을 한꺼번에 해제하여 코드를 복구하세요!',
    hint: '2j 로 디버그 줄 이동 → gcc 로 주석 처리 → 3j 로 주석 문단 이동 → gcip 로 문단 주석 일괄 해제',
    par: 12,
    optimalKeys: [
      '2', 'j',
      'g', 'c', 'c',
      '3', 'j',
      'g', 'c', 'i', 'p',
    ],
    primaryFilename: 'authMiddleware.ts',
    initialLines: [
      '// Comment out the auth middleware debug code and restore the disabled block.',
      'function verifySession(userId: string) {',
      "  console.log('DEBUG userId:', userId);",
      '  const cacheKey = `session:${userId}`;',
      '',
      '  // if (!cacheKey) {',
      "  //   throw new Error('Missing session');",
      '  // }',
      '',
      '  return cacheKey;',
      '}',
    ],
    targetLines: [
      '// Comment out the auth middleware debug code and restore the disabled block.',
      'function verifySession(userId: string) {',
      "  // console.log('DEBUG userId:', userId);",
      '  const cacheKey = `session:${userId}`;',
      '',
      '  if (!cacheKey) {',
      "    throw new Error('Missing session');",
      '  }',
      '',
      '  return cacheKey;',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '// Comment out the auth middleware debug code and restore the disabled block.',
        'function verifySession(userId: string) {',
        "  // console.log('DEBUG userId:', userId);",
        '  const cacheKey = `session:${userId}`;',
        '',
        '  if (!cacheKey) {',
        "    throw new Error('Missing session');",
        '  }',
        '',
        '  return cacheKey;',
        '}',
      ];
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === target.length &&
        state.lines.every((line, idx) => line === target[idx])
      );
    },
  },
  {
    id: 77,
    title: '레슨 77: 커서 아래 파일 점프(gf, gF)와 프로젝트 탐색 마스터',
    description:
      '코드 속 import 경로 나 에러 로그의 파일:줄번호 위에 커서를 두고 gf / gF 를 누르면, 별도의 파일 찾기 없이 즉시 해당 파일(및 지정 줄)로 점프할 수 있습니다.\n\n1) 커서 아래 파일 열기 (gf) & 줄 번호 포함 점프 (gF):\n   - gf 는 커서 아래의 경로(예: ./config/routes 또는 src/config/routes.ts)를 프로젝트에서 찾아 버퍼로 열어줍니다.\n   - gF 는 경로 뒤의 :4 같은 줄 번호까지 함께 읽어 해당 줄로 커서를 바로 착지시킵니다.\n\n2) 수정 저장 후 원래 파일 복귀 (:w, Ctrl-^):\n   - 이동한 파일에서 값을 수정하고 :w 로 저장한 뒤, Ctrl-^ 를 누르면 직전에 보고 있던 메인 버퍼(src/app.ts)로 즉시 되돌아옵니다.\n\n미션:\n1. 첫 번째 줄의 경로(src/config/routes.ts:4) 위로 이동(fs)한 뒤 gF 를 눌러 4번째 줄로 즉시 점프하세요.\n2. timeout 값 3000 을 5000 으로 수정하세요 (f3 cw5000<Esc>).\n3. :w<Enter> 로 변경 사항을 저장한 뒤, Ctrl-^ 를 눌러 src/app.ts 로 복귀하여 미션을 완료하세요!',
    hint: 'fs 로 경로 이동 → gF 로 routes.ts 4번 줄 점프 → f3 cw5000<Esc> → :w<Enter> 저장 → Ctrl-^ 복귀',
    par: 18,
    optimalKeys: [
      'f', 's',
      'g', 'F',
      'f', '3',
      'c', 'w', '5', '0', '0', '0', 'Escape',
      ':', 'w', 'Enter',
      'Ctrl-^',
    ],
    primaryFilename: 'src/app.ts',
    initialVirtualFiles: {
      'src/app.ts': [
        '// Bump the timeout in (src/config/routes.ts:4) up to 5000.',
        "import { ROUTES } from './config/routes';",
        'const currentTimeout = ROUTES.timeout;',
      ],
      'src/config/routes.ts': [
        'export const ROUTES = {',
        "  login: '/v1/login',",
        "  profile: '/v1/profile',",
        '  timeout: 3000,',
        '};',
      ],
    },
    initialLines: [
      '// Bump the timeout in (src/config/routes.ts:4) up to 5000.',
      "import { ROUTES } from './config/routes';",
      'const currentTimeout = ROUTES.timeout;',
    ],
    targetLines: [
      '// Bump the timeout in (src/config/routes.ts:4) up to 5000.',
      "import { ROUTES } from './config/routes';",
      'const currentTimeout = ROUTES.timeout;',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const routesLines =
        state.buffers?.find((b) => b.name === 'src/config/routes.ts')?.lines ??
        state.virtualFiles?.['src/config/routes.ts'] ??
        [];
      const isRoutesUpdated = routesLines.some((l) => l.includes('timeout: 5000'));
      return (
        state.mode === 'NORMAL' &&
        state.primaryFilename === 'src/app.ts' &&
        isRoutesUpdated
      );
    },
  },
  {
    id: 78,
    title: '레슨 78: 들여쓰기 기반 폴딩(:set fdm=indent)과 수동 폴드(zf) 마스터',
    description:
      'Python 처럼 중괄호({})가 없는 언어에서는 들여쓰기 깊이에 따라 자동으로 접히는 :set fdm=indent 와, 원하는 범위를 직접 묶는 수동 폴드 zf 를 활용하면 긴 코드를 한눈에 정리할 수 있습니다.\n\n1) 들여쓰기 폴딩 활성화 (:set fdm=indent) & 토글 (za):\n   - :set fdm=indent 를 실행하면 들여쓰기가 적용된 블록을 za / zc / zo 로 접고 펼칠 수 있습니다.\n\n2) 수동 폴드 생성 (zf{motion}) & 접힌 블록 일괄 삭제 (dd):\n   - zfip 로 현재 문단 전체를 수동 폴드로 접은 뒤, 접힌 폴드 위에서 dd 를 누르면 접힌 블록 전체가 한 번에 삭제됩니다!\n\n미션:\n1. :set fdm=indent<Enter> 로 들여쓰기 폴딩을 활성화하세요.\n2. active_service 본문으로 이동(2j)해 za 로 본문을 접으세요.\n3. 아래 legacy_helper 함수로 이동(j)해 zfip 로 문단 전체를 수동 폴드로 접은 뒤, dd 로 접힌 레거시 블록을 통째로 삭제하세요!',
    hint: ':set fdm=indent<Enter> → 2j za 로 active_service 본문 접기 → j zfip 로 legacy_helper 폴드 생성 → dd 로 통째 삭제',
    par: 30,
    optimalKeys: [
      ':', 's', 'e', 't', ' ', 'f', 'd', 'm', '=', 'i', 'n', 'd', 'e', 'n', 't', 'Enter',
      '2', 'j',
      'z', 'a',
      'j',
      'z', 'f', 'i', 'p',
      'd', 'd',
    ],
    primaryFilename: 'service.py',
    initialLines: [
      '# Fold by indent with :set fdm=indent (za), then make a manual fold (zfip) and delete it (dd).',
      'def active_service():',
      '  host = "localhost"',
      '  port = 8080',
      '  return f"{host}:{port}"',
      '',
      'def legacy_helper():',
      '  old_a = 1',
      '  old_b = 2',
      '  return old_a + old_b',
    ],
    targetLines: [
      '# Fold by indent with :set fdm=indent (za), then make a manual fold (zfip) and delete it (dd).',
      'def active_service():',
      '  host = "localhost"',
      '  port = 8080',
      '  return f"{host}:{port}"',
      '',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '# Fold by indent with :set fdm=indent (za), then make a manual fold (zfip) and delete it (dd).',
        'def active_service():',
        '  host = "localhost"',
        '  port = 8080',
        '  return f"{host}:{port}"',
        '',
      ];
      const isLinesMatched =
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx]);
      const hasIndentFdm = state.options?.foldmethod === 'indent';
      const hasClosedActiveFold =
        state.folds?.some((f) => f.closed && f.startRow === 2 && (f.endRow === 4 || f.endRow === 5)) ?? false;

      return (
        state.mode === 'NORMAL' &&
        isLinesMatched &&
        hasIndentFdm &&
        hasClosedActiveFold
      );
    },
  },
  {
    id: 79,
    title: '레슨 79: 표현식 레지스터("=)와 시스템 클립보드("+) 완전 마스터',
    description:
      'Vim 의 표현식 레지스터("=)를 사용하면 에디터를 벗어나지 않고도 수식·함수 계산 결과를 즉시 버퍼에 삽입할 수 있으며, "+ 레지스터로 OS 시스템 클립보드와 자유롭게 값을 주고받을 수 있습니다.\n\n1) 표현식 레지스터 ("={expr}<CR> 후 p / P):\n   - 노멀 모드에서 "=250 * 4<Enter> 를 입력하면 계산 결과(1000)가 "= 레지스터에 저장되고, P 또는 p 로 즉시 붙여넣을 수 있습니다. (입력 모드에서는 Ctrl-r = 로도 가능)\n\n2) 시스템 클립보드 레지스터 ("+ / "*):\n   - "+yy 또는 "+yi" 처럼 "+ 레지스터를 지정해 복사하면 브라우저/OS 시스템 클립보드로 즉시 내보내집니다.\n\n미션:\n1. 4번째 줄의 세미콜론(;) 위치로 이동(3j f;)한 뒤, "=250 * 4<Enter> P 로 계산 결과 1000 을 삽입하세요.\n2. 아랫줄(exportedToken)로 내려가(j) "+yy 로 해당 줄을 시스템 클립보드("+)에 복사하여 미션을 완료하세요!',
    hint: '3j f; 로 이동 → "=250 * 4<Enter>P 로 1000 삽입 → j "+yy 로 시스템 클립보드 복사',
    par: 22,
    optimalKeys: [
      '3', 'j', 'f', ';',
      '"', '=', '2', '5', '0', ' ', '*', ' ', '4', 'Enter', 'P',
      'j', '"', '+', 'y', 'y',
    ],
    primaryFilename: 'invoice.ts',
    initialLines: [
      '// Insert a computed value with the expression register ("=) and export it via the system clipboard ("+).',
      'const unitPrice = 250;',
      'const quantity = 4;',
      'const totalAmount = ;',
      'const exportedToken = "SYNC_OK";',
    ],
    targetLines: [
      '// Insert a computed value with the expression register ("=) and export it via the system clipboard ("+).',
      'const unitPrice = 250;',
      'const quantity = 4;',
      'const totalAmount = 1000;',
      'const exportedToken = "SYNC_OK";',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '// Insert a computed value with the expression register ("=) and export it via the system clipboard ("+).',
        'const unitPrice = 250;',
        'const quantity = 4;',
        'const totalAmount = 1000;',
        'const exportedToken = "SYNC_OK";',
      ];
      const isLinesMatched =
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx]);
      const plusContent = state.registers?.['+']?.content;
      const hasClipboard =
        typeof plusContent === 'string' && plusContent.includes('SYNC_OK');

      return (
        state.mode === 'NORMAL' &&
        isLinesMatched &&
        hasClipboard
      );
    },
  },
  {
    id: 80,
    title: '레슨 80: 텍스트 포매팅(gq, :set textwidth)과 탭 정리(:retab) 마스터',
    description:
      '긴 주석이나 문서 문단을 손으로 줄바꿈하지 마세요. Vim 은 gq 로 문단을 정해진 폭에 맞춰 자동으로 다시 채워 주고, :retab 으로 탭/공백을 한 번에 정리합니다.\n\n1) 폭 지정 (:set textwidth=N, 줄여서 :set tw=N):\n   - gq 가 한 줄을 최대 N 글자로 맞춥니다 (0 이면 79열 기준).\n\n2) 포매팅 오퍼레이터 (gq{motion}, gqq, gqip, 비주얼 gq, gw):\n   - gqq 는 현재 줄, gqip 는 문단 전체를 다시 채웁니다. // 나 # 같은 주석 기호와 들여쓰기는 자동으로 유지됩니다. gw 는 커서 위치를 그대로 둡니다.\n\n3) 탭 정리 (:retab, :retab!, :retab N):\n   - expandtab 이 켜져 있으면 탭 문자를 공백으로 바꿉니다. (:retab! 은 연속 공백까지 변환)\n\n미션:\n1. :set tw=30<Enter> 로 폭을 30 으로 지정하세요.\n2. 첫 줄 위에서 gqq 로 긴 주석을 // 기호를 유지한 채 3줄로 나누세요.\n3. :retab<Enter> 로 아래 함수의 탭 들여쓰기를 공백으로 바꾸세요!',
    hint: ':set tw=30<Enter> → gqq 로 주석 줄바꿈 → :retab<Enter> 로 탭을 공백으로',
    par: 23,
    optimalKeys: [
      ':', 's', 'e', 't', ' ', 't', 'w', '=', '3', '0', 'Enter',
      'g', 'q', 'q',
      ':', 'r', 'e', 't', 'a', 'b', 'Enter',
    ],
    primaryFilename: 'notes.ts',
    initialLines: [
      '// The quick brown fox jumps over the lazy dog and keeps running far away',
      '',
      'function run() {',
      '\treturn 1;',
      '}',
    ],
    targetLines: [
      '// The quick brown fox jumps',
      '// over the lazy dog and keeps',
      '// running far away',
      '',
      'function run() {',
      '  return 1;',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '// The quick brown fox jumps',
        '// over the lazy dog and keeps',
        '// running far away',
        '',
        'function run() {',
        '  return 1;',
        '}',
      ];
      const isLinesMatched =
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx]);

      return state.mode === 'NORMAL' && isLinesMatched && state.options?.textwidth === 30;
    },
  },
];
