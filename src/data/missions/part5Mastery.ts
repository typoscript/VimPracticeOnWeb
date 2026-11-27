import { Mission } from '../../types/mission';
import { ensureBuffers } from '../../vim-engine';

export const MISSIONS_PART5: Mission[] = [
  {
    id: 81,
    title: '레슨 81: 뷰포트 스크롤(:set scrolloff)과 정밀 붙여넣기(]p, gp) 마스터',
    description:
      '스크롤 여유 줄(:set scrolloff)로 시야를 확보하고, 상황에 맞게 붙여넣는 ]p 와 gp 를 결합하면 코드 리팩토링 속도가 극대화됩니다.\n\n1) 뷰포트 스크롤 & 여유 줄 (Ctrl-f/b/e/y, :set so=N):\n   - Ctrl-f / Ctrl-b 로 한 페이지씩 스크롤하고, Ctrl-e / Ctrl-y 로 커서는 유지한 채 화면만 한 줄씩 스크롤합니다.\n   - :set so=3 (:set scrolloff=3) 을 켜면 커서 위아래 최소 3줄의 맥락을 항상 유지합니다.\n\n2) 정밀 붙여넣기 (]p / [p, gp / gP):\n   - ]p 는 복사한 줄의 들여쓰기를 현재 줄의 들여쓰기 깊이에 자동으로 맞춰 아래에 붙여넣습니다.\n   - gp 는 붙여넣은 텍스트 바로 뒤 위치로 커서를 옮겨 곧바로 이어 입력(i)할 수 있게 합니다.\n\n미션:\n1. :set so=3<Enter> 로 scrolloff 여백을 3 으로 설정하세요.\n2. 3번째 줄의 "v1" 안의 텍스트(v1)를 yi" 로 복사해 2번째 줄 "" 안에 gp 로 붙여넣고, 바로 i_ok<Esc> 를 입력해 "v1_ok" 로 만드세요.\n3. 3번째 줄(prefix)을 yy 로 줄 단위 복사한 뒤, 5번째 줄(step = 1;)로 내려가 ]p 로 들여쓰기(4칸)를 맞춰 아래에 붙여넣으세요!',
    hint: ':set so=3<Enter> → 2j f" yi" 로 복사 → k 0 f" gp 후 i_ok<Esc> → j yy 2j ]p',
    par: 36,
    optimalKeys: [
      ':', 's', 'e', 't', ' ', 's', 'o', '=', '3', 'Enter',
      '2', 'j', 'f', '"', 'y', 'i', '"',
      'k', '0', 'f', '"', 'g', 'p', 'i', '_', 'o', 'k', 'Escape',
      'j', 'y', 'y', '2', 'j', ']', 'p',
    ],
    primaryFilename: 'refactor.ts',
    initialLines: [
      '// Set scrolloff (:set so=3), then master ]p (match indent) and gp (cursor after paste).',
      'const label = "";',
      '  const prefix = "v1";',
      'function runTask() {',
      '    const step = 1;',
      '}',
    ],
    targetLines: [
      '// Set scrolloff (:set so=3), then master ]p (match indent) and gp (cursor after paste).',
      'const label = "v1_ok";',
      '  const prefix = "v1";',
      'function runTask() {',
      '    const step = 1;',
      '    const prefix = "v1";',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '// Set scrolloff (:set so=3), then master ]p (match indent) and gp (cursor after paste).',
        'const label = "v1_ok";',
        '  const prefix = "v1";',
        'function runTask() {',
        '    const step = 1;',
        '    const prefix = "v1";',
        '}',
      ];
      const isLinesMatched =
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx]);

      return state.mode === 'NORMAL' && isLinesMatched && state.options?.scrolloff === 3;
    },
  },
  {
    id: 82,
    title: '레슨 82: 자동 약어 확장(:iabbrev, :cabbrev, Ctrl-])과 오타 자동 교정 마스터',
    description:
      '자주 틀리는 오타나 반복 입력하는 긴 명령을 Vim 약어(:abbrev)로 등록해 두면, 단어 경계에서 공백이나 구두점을 치는 순간 자동으로 치환됩니다.\n\n1) 입력 모드 약어 (:iabbrev, :inoreabbrev):\n   - :iabbrev teh the 로 등록한 뒤, 입력 모드에서 teh 뒤 Space / . / Tab / Enter / Esc 를 누르면 자동으로 the 로 교정됩니다.\n   - ateh 처럼 단어 중간에 붙어 있으면 확장하지 않고, 정확히 한 단어일 때만 동작합니다. (Ctrl-v 로 다음 문자 확장 억제, Ctrl-] 로 문자 삽입 없이 즉시 확장)\n\n2) 커맨드라인 약어 & 해제 (:cabbrev, :unabbrev, :abclear):\n   - :cabbrev S 3,4sort 처럼 등록하면 커맨드라인에서 :S<Enter> 만 입력해도 3,4sort 가 실행됩니다.\n   - :iunabbrev teh / :cunabbrev S / :abclear 로 언제든 약어를 해제·초기화할 수 있습니다.\n\n미션:\n1. :iabbrev teh the<Enter> 로 오타 교정 약어를 등록하세요.\n2. :cabbrev S 3,4sort<Enter> 로 커맨드라인 단축 약어를 등록하세요.\n3. 2번째 줄(msg)로 내려가 "" 안에 teh ok 를 입력(f" a teh ok<Esc>)해 자동 교정을 발동시키고, :S<Enter> 로 아래 두 줄(3~4번 줄)을 알파벳순으로 정렬하세요!',
    hint: ':iabbrev teh the<Enter> → :cabbrev S 3,4sort<Enter> → j f" a teh ok<Esc> 로 교정 후 :S<Enter> 로 정렬',
    par: 54,
    optimalKeys: [
      ':', 'i', 'a', 'b', 'b', 'r', 'e', 'v', ' ', 't', 'e', 'h', ' ', 't', 'h', 'e', 'Enter',
      ':', 'c', 'a', 'b', 'b', 'r', 'e', 'v', ' ', 'S', ' ', '3', ',', '4', 's', 'o', 'r', 't', 'Enter',
      'j', 'f', '"', 'a', 't', 'e', 'h', ' ', 'o', 'k', 'Escape',
      ':', 'S', 'Enter',
    ],
    primaryFilename: 'notes.ts',
    initialLines: [
      '// Auto-correct typos with :iabbrev and shorten long Ex commands with :cabbrev.',
      'const msg = "";',
      'const itemB = 2;',
      'const itemA = 1;',
    ],
    targetLines: [
      '// Auto-correct typos with :iabbrev and shorten long Ex commands with :cabbrev.',
      'const msg = "the ok";',
      'const itemA = 1;',
      'const itemB = 2;',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '// Auto-correct typos with :iabbrev and shorten long Ex commands with :cabbrev.',
        'const msg = "the ok";',
        'const itemA = 1;',
        'const itemB = 2;',
      ];
      const isLinesMatched =
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx]);

      return (
        state.mode === 'NORMAL' &&
        isLinesMatched &&
        Boolean(state.abbreviations?.['i:teh']) &&
        Boolean(state.abbreviations?.['c:S'])
      );
    },
  },
  {
    id: 83,
    title: '레슨 83: Visual 고급 편집(o / O, g Ctrl-g, gJ)과 비주얼 블록(Ctrl-v $ A / c) 마스터',
    description:
      'Visual 및 Visual Block 모드의 숨은 고급 조작을 익히면 불규칙한 길이의 여러 줄도 한 번에 정교하게 리팩토링할 수 있습니다.\n\n1) 커서·앵커 반전 (o / O) & 공백 없는 줄 병합 (gJ):\n   - Visual(v/V)에서 o / O 는 선택 영역의 시작과 끝(anchor ↔ cursor)을 즉시 바꿉니다.\n   - Visual Block(Ctrl-v)에서 o 는 대각선 반대 모서리로, O 는 같은 줄 반대쪽 가로 모서리로 커서를 옮깁니다.\n   - gJ 는 J 와 달리 공백을 넣거나 지우지 않고 그대로 붙입니다 (붙는 줄의 들여쓰기도 유지).\n\n2) 선택 영역 통계 (g Ctrl-g) & 비주얼 블록 줄 끝 추가/변경 (Ctrl-v $ A / c):\n   - g Ctrl-g 는 현재 커서 또는 선택 영역의 열·줄·단어·바이트 수를 상태줄에 출력합니다.\n   - Ctrl-v 로 여러 줄을 잡은 뒤 $ A 를 입력하면 길이가 제각각인 줄들의 실제 끝($)에 일괄 추가되며, c 는 블록 구간을 한 번에 수정합니다.\n\n미션:\n1. 2~3번째 줄("https://" 와 "api.dev/v1";)을 V j g J 로 공백 없이 한 줄로 붙이세요.\n2. 아래 3줄(old_*)의 old 부분을 Ctrl-v 2j 2l 로 선택한 뒤 o 와 O 로 모서리를 오간 후 c new<Esc> 로 new_ 로 일괄 변경하세요.\n3. Ctrl-v 2j $ A ;<Esc> 로 세 줄의 서로 다른 줄 끝에 세미콜론(;)을 붙이고, g Ctrl-g 로 전체 줄·단어·바이트 통계를 확인하세요!',
    hint: 'j V j g J → j 0 Ctrl-v 2j 2l o O c new<Esc> → Ctrl-v 2j $ A ;<Esc> → g Ctrl-g',
    par: 29,
    optimalKeys: [
      'j', 'V', 'j', 'g', 'J',
      'j', '0', 'Ctrl-v', '2', 'j', '2', 'l', 'o', 'O', 'c', 'n', 'e', 'w', 'Escape',
      'Ctrl-v', '2', 'j', '$', 'A', ';', 'Escape',
      'g', 'Ctrl-g',
    ],
    primaryFilename: 'apiConfig.ts',
    initialLines: [
      '// Tidy up the API config with Visual o/O, gJ, g Ctrl-g, and Ctrl-v $ A/c.',
      'const endpoint = "https://',
      'api.dev/v1";',
      'old_host = "local"',
      'old_port = "8080"',
      'old_mode = "prod"',
    ],
    targetLines: [
      '// Tidy up the API config with Visual o/O, gJ, g Ctrl-g, and Ctrl-v $ A/c.',
      'const endpoint = "https://api.dev/v1";',
      'new_host = "local";',
      'new_port = "8080";',
      'new_mode = "prod";',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '// Tidy up the API config with Visual o/O, gJ, g Ctrl-g, and Ctrl-v $ A/c.',
        'const endpoint = "https://api.dev/v1";',
        'new_host = "local";',
        'new_port = "8080";',
        'new_mode = "prod";',
      ];
      const isLinesMatched =
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx]);
      const hasWordCountMessage =
        typeof state.commandMessage === 'string' &&
        /(\d+\s*\/\s*\d+|\d+\s+of\s+\d+)/.test(state.commandMessage);

      return state.mode === 'NORMAL' && isLinesMatched && hasWordCountMessage;
    },
  },
  {
    id: 84,
    title: '레슨 84: 고급 Ex 정렬(:sort /pat/ f ! i)과 파일 삽입(:read), 줄 이동·복제(:move/:copy) 마스터',
    description:
      '터미널에서 로그나 지표 리포트를 가공할 때, 파일 삽입(:read), 정규식 오프셋 기준 숫자 정렬(:sort), 줄 이동·복제(:move / :copy)를 조합하면 한 줄의 수작업 없이 보고서를 완성할 수 있습니다.\n\n1) 외부 파일 내용 삽입 (:[range]r[ead] {file}):\n   - :r header.txt 는 현재 줄 아래에 파일 내용을 삽입하고, :0r header.txt 는 1번째 줄 앞(맨 위)에 삽입합니다. (:$r 는 맨 끝)\n\n2) 고급 정렬 (:sort[!] [i][u][n|f|x|o|b][r] [/pattern/]):\n   - :sort f 는 소수점 실수(float), :sort n 은 정수, :sort x 는 16진수, :sort i 는 대소문자 무시로 정렬하며 ! 를 붙이면 내림차순입니다.\n   - /pattern/ 을 지정하면 매치 뒤의 텍스트를 기준으로 정렬합니다 (예: :3,6sort! /=/ f 는 = 뒤의 실수 기준 내림차순 정렬).\n\n3) 줄 이동과 복제 (:[range]m[ove] {addr}, :[range]t {addr} / :co {addr}):\n   - :3m $ 로 3번째 줄을 맨 끝($)으로 옮기고, :3t $ 로 3번째 줄을 지우지 않고 맨 끝에 복제합니다.\n\n미션:\n1. :0r templates/header.txt<Enter> 로 버퍼 맨 위에 헤더(2줄)를 삽입하세요.\n2. :3m $<Enter> 로 3번째 줄(# Summary:)을 맨 끝으로 이동시키세요.\n3. :3,6sort! /=/ f<Enter> 로 3~6번 메트릭 줄을 = 뒤의 실수(ms) 기준 내림차순으로 정렬하세요.\n4. :3t $<Enter> 로 가장 느린 최상위 지표(3번 줄)를 맨 끝 # Summary: 아래에 복제해 완성하세요!',
    hint: ':0r templates/header.txt<Enter> → :3m $<Enter> → :3,6sort! /=/ f<Enter> → :3t $<Enter>',
    par: 55,
    optimalKeys: [
      ':', '0', 'r', ' ', 't', 'e', 'm', 'p', 'l', 'a', 't', 'e', 's', '/', 'h', 'e', 'a', 'd', 'e', 'r', '.', 't', 'x', 't', 'Enter',
      ':', '3', 'm', ' ', '$', 'Enter',
      ':', '3', ',', '6', 's', 'o', 'r', 't', '!', ' ', '/', '=', '/', ' ', 'f', 'Enter',
      ':', '3', 't', ' ', '$', 'Enter',
    ],
    primaryFilename: 'metrics.txt',
    initialVirtualFiles: {
      'templates/header.txt': [
        '# === Latency Report ===',
        '# Unit: ms',
      ],
    },
    initialLines: [
      '# Summary:',
      'metric: avg=8.25ms',
      'metric: p50=12.4ms',
      'metric: p99=120.5ms',
      'metric: p95=45.0ms',
    ],
    targetLines: [
      '# === Latency Report ===',
      '# Unit: ms',
      'metric: p99=120.5ms',
      'metric: p95=45.0ms',
      'metric: p50=12.4ms',
      'metric: avg=8.25ms',
      '# Summary:',
      'metric: p99=120.5ms',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '# === Latency Report ===',
        '# Unit: ms',
        'metric: p99=120.5ms',
        'metric: p95=45.0ms',
        'metric: p50=12.4ms',
        'metric: avg=8.25ms',
        '# Summary:',
        'metric: p99=120.5ms',
      ];
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx])
      );
    },
  },
  {
    id: 85,
    title: '레슨 85: 가상 셸 파이프·필터링(:!cmd, :[range]!cmd, :r !cmd, !! / !{motion}) 마스터',
    description:
      'Vim 의 ! 필터 연산자와 Ex 셸 명령을 사용하면 에디터를 떠나지 않고도 sort, uniq, grep, awk, sed, tr, column, jq 같은 POSIX 파이프라인으로 버퍼 텍스트를 즉시 가공할 수 있습니다.\n\n1) 셸 출력 읽기 & 파이프 확인 (:r !cmd, :w !cmd):\n   - :0r !echo "// top" 처럼 :[range]r !{cmd} 를 실행하면 외부 명령의 출력을 버퍼에 삽입합니다.\n   - :w !wc -l 처럼 :[range]w !{cmd} 를 실행하면 버퍼(또는 범위) 내용을 수정하지 않고 셸 명령의 표준 입력(stdin)으로 넘겨 결과를 확인합니다.\n\n2) 버퍼 범위 필터링 (:[range]!cmd, !!, !{motion}):\n   - 노멀 모드에서 !! 를 누르면 현재 줄(: .!), !G 나 !ip 를 누르면 해당 범위(:.,$! / :.,.+N!)가 커맨드라인에 자동 입력됩니다.\n   - 이어서 sort | uniq 나 tr a-z A-Z 같은 파이프라인을 입력하고 <Enter> 를 누르면 해당 범위가 표준 출력으로 교체됩니다. (:%!cmd 는 전체 필터)\n\n미션:\n1. :0r !echo "// top"<Enter> 로 버퍼 맨 위에 // top 줄을 삽입하세요.\n2. 다음 줄(// raw)로 내려가(j) !!tr a-z A-Z<Enter> 로 현재 줄만 대문자(// RAW)로 변환하세요.\n3. 그 아래 데이터 시작 줄(zeta)로 이동(j)한 뒤 !Gsort | uniq<Enter> 로 끝까지 정렬 및 중복 제거하세요.\n4. 마지막으로 :w !wc -l<Enter> 로 전체 줄 수(5)를 파이프 집계하여 완료하세요!',
    hint: ':0r !echo "// top"<Enter> → j !!tr a-z A-Z<Enter> → j !Gsort | uniq<Enter> → :w !wc -l<Enter>',
    par: 64,
    optimalKeys: [
      ':', '0', 'r', ' ', '!', 'e', 'c', 'h', 'o', ' ', '"', '/', '/', ' ', 't', 'o', 'p', '"', 'Enter',
      'j', '!', '!', 't', 'r', ' ', 'a', '-', 'z', ' ', 'A', '-', 'Z', 'Enter',
      'j', '!', 'G', 's', 'o', 'r', 't', ' ', '|', ' ', 'u', 'n', 'i', 'q', 'Enter',
      ':', 'w', ' ', '!', 'w', 'c', ' ', '-', 'l', 'Enter',
    ],
    primaryFilename: 'services.txt',
    initialLines: [
      '// raw',
      'zeta',
      'alpha',
      'beta',
      'alpha',
    ],
    targetLines: [
      '// top',
      '// RAW',
      'alpha',
      'beta',
      'zeta',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '// top',
        '// RAW',
        'alpha',
        'beta',
        'zeta',
      ];
      const isLinesMatched =
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx]);

      return (
        state.mode === 'NORMAL' &&
        isLinesMatched &&
        state.lastShellCommand === 'wc -l' &&
        state.commandMessage === '5'
      );
    },
  },
  {
    id: 86,
    title: '레슨 86: 검색 오프셋과 연산자 결합(/pat/e, /pat/+1, ?pat?b, d/pat/e, c?pat?b) 마스터',
    description:
      '검색 명령 뒤에 오프셋을 붙이면 "어디에 착지할지"를 정할 수 있고, 연산자(d/c/y)와 결합하면 매치 위치까지의 정밀한 편집이 한 번에 끝납니다.\n\n1) 검색 오프셋 (/pat/{offset}, ?pat?{offset}):\n   - /pat/e (매치 끝), /pat/e+1 (끝 다음 글자), /pat/b 또는 /pat/s-1 (매치 시작 기준), /pat/+1 · /pat/-1 (매치 줄에서 ±N줄, 줄 첫 글자).\n   - ? 는 위쪽(역방향) 검색입니다. ?pat?e 처럼 구분자도 ? 이고, 이후 n 은 같은 방향(위), N 은 반대 방향입니다.\n   - // 처럼 패턴을 비우면 직전 패턴을 재사용하므로 //e 로 방금 검색한 패턴에 새 오프셋만 줄 수 있습니다. n / N 도 마지막 오프셋을 그대로 따릅니다.\n\n2) 연산자 결합 (d/pat/e, c/pat/e, y?pat?b ...):\n   - 오프셋이 e 면 inclusive(착지 글자까지 포함), 그 외 문자 오프셋은 exclusive, 줄 오프셋(+N/-N)은 줄 단위(linewise) 연산입니다.\n   - 위쪽 검색(d?pat?)은 커서 앞쪽 범위를 지웁니다. 결합된 변경은 . 로 반복할 수 있습니다.\n\n미션:\n1. 커서가 맨 위에 있을 때 d/TODO/-1<Enter> 로 TODO 줄 바로 앞 줄까지(2줄)를 한 번에 지우세요.\n2. 이제 TODO 줄에서 c/ship/e<Enter>DONE<Esc> 로 "TODO ship"을 DONE 으로 바꾸세요.\n3. G 0 으로 마지막 줄(footer) 맨 앞으로 가서 d?body?b<Enter> 로 body 줄을 위쪽 검색 오프셋으로 삭제하세요.',
    hint: 'd/TODO/-1<Enter> → c/ship/e<Enter>DONE<Esc> → G0 d?body?b<Enter>',
    par: 38,
    optimalKeys: [
      'd', '/', 'T', 'O', 'D', 'O', '/', '-', '1', 'Enter', 'c', '/', 's', 'h', 'i', 'p', '/', 'e', 'Enter', 'D', 'O', 'N', 'E', 'Escape', 'G', '0', 'd', '?', 'b', 'o', 'd', 'y', '?', 'b', 'Enter',
    ],
    primaryFilename: 'notes.txt',
    initialLines: [
      '[draft] release notes v1',
      'owner: temp-user',
      'TODO ship it',
      'body line',
      'footer',
    ],
    targetLines: [
      'DONE it',
      'footer',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = ['DONE it', 'footer'];
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx])
      );
    },
  },
  {
    id: 87,
    title: '레슨 87: 레지스터 Ex 명령(:d {reg}, :y {reg}, :put, :put!, :0put) 마스터',
    description:
      'Ex 명령에도 레지스터를 지정할 수 있습니다. 줄 단위 이동·복제를 노멀 모드 키 없이 정확한 줄 번호로 처리할 때 유용합니다.\n\n1) 레지스터를 지정한 삭제·복사 (:[range]d [x] [count], :[range]y [x] [count]):\n   - :3d a 는 3번 줄을 지우며 a 레지스터에 담고, :2,4y b 는 2~4번 줄을 b 레지스터에 복사합니다.\n   - 대문자(A)는 기존 내용에 이어 붙이고, _ 는 블랙홀 레지스터라 아무 레지스터도 바꾸지 않습니다.\n   - 끝의 숫자는 개수입니다. :2d 3 은 2번 줄부터 3줄을 지웁니다.\n\n2) 레지스터 붙여넣기 (:[line]pu[t][!] [x]):\n   - :put a 는 현재 줄 아래에, :put! a 는 현재 줄 위에 붙입니다. 레지스터를 생략하면 무명 레지스터("")를 씁니다.\n   - :$put a 는 맨 끝, :0put a 는 맨 앞에 붙입니다. 문자 단위로 복사한 내용도 :put 은 항상 새 줄로 넣습니다.\n   - 붙인 뒤 커서는 마지막으로 넣은 줄에 놓이고, 한 번의 u 로 되돌릴 수 있습니다.\n\n미션:\n1. :3d h<Enter> 로 HEADER 줄을 지우면서 h 레지스터에 담으세요.\n2. :0put h<Enter> 로 h 레지스터의 HEADER 를 맨 위에 붙이세요.',
    hint: ':3d h<Enter> → :0put h<Enter>',
    par: 17,
    optimalKeys: [
      ':', '3', 'd', ' ', 'h', 'Enter', ':', '0', 'p', 'u', 't', ' ', 'h', 'Enter',
    ],
    primaryFilename: 'doc.txt',
    initialLines: [
      'body one',
      'body two',
      'HEADER',
      'end',
    ],
    targetLines: [
      'HEADER',
      'body one',
      'body two',
      'end',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = ['HEADER', 'body one', 'body two', 'end'];
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx])
      );
    },
  },
  {
    id: 88,
    title: '레슨 88: 멀티 윈도우 레이아웃 회전·일괄 제어(Ctrl-w H/J/K/L, r/R/x, :windo, :set scb) 마스터',
    description:
      '여러 분할 창을 열어 비교하거나 동시에 리팩토링할 때, 창 위치를 바꾸고(:vsp/Ctrl-w H/J/K/L/r/x), 모든 창에 명령을 일괄 적용(:windo)하며, 두 창의 스크롤을 동기화(:set scrollbind)할 수 있습니다.\n\n1) 분할 창 회전·교환·재배치 (Ctrl-w x / r / R / H / J / K / L):\n   - Ctrl-w x 는 두 창의 위치를 맞바꾸고, Ctrl-w r / R 은 창을 시계/반시계 방향으로 회전합니다.\n   - Ctrl-w H / L 은 수직 분할로 전환해 현재 창을 좌/우 끝으로, K / J 는 수평 분할로 전환해 상/하 끝으로 보냅니다.\n\n2) 전 창 일괄 실행 (:windo[!] {cmd}) & 동기 스크롤 (:set scb / noscb):\n   - :windo {cmd} 는 열려 있는 모든 분할 창을 순회하며 Ex 명령을 실행합니다. (예: :windo %s/a/b/g | set scb)\n   - :set scb (scrollbind) 를 양쪽 창에 모두 켜면 한 창을 스크롤(Ctrl-e/y/d/u)할 때 다른 창도 함께 스크롤됩니다.\n\n미션:\n1. :sp<Enter> 로 가로 분할 창을 여세요.\n2. Ctrl-w L 을 눌러 현재 창(main.ts)을 세로 분할 오른쪽 창으로 이동하세요.\n3. :windo %s/dev/prod/g | set scb<Enter> 로 양쪽 창의 dev 를 prod 로 바꾸고 동기 스크롤을 켜세요!',
    hint: ':sp<Enter> → Ctrl-w L → :windo %s/dev/prod/g | set scb<Enter>',
    par: 42,
    optimalKeys: [
      ':', 's', 'p', 'Enter',
      'Ctrl-w', 'L',
      ':', 'w', 'i', 'n', 'd', 'o', ' ', '%', 's', '/', 'd', 'e', 'v', '/', 'p', 'r', 'o', 'd', '/', 'g', ' ', '|', ' ', 's', 'e', 't', ' ', 's', 'c', 'b', 'Enter',
    ],
    primaryFilename: 'main.ts',
    secondaryFilename: 'side.ts',
    initialLines: [
      'const env = "dev";',
      '// main panel',
    ],
    secondaryLines: [
      'const mode = "dev";',
      '// side panel',
    ],
    targetLines: [
      'const env = "prod";',
      '// main panel',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL' || state.splitDirection !== 'vertical' || !state.splitPanes) {
        return false;
      }
      const p0 = state.splitPanes[0];
      const p1 = state.splitPanes[1];
      return (
        p0.filename === 'side.ts' &&
        p0.lines[0] === 'const mode = "prod";' &&
        p0.scrollbind === true &&
        p1.filename === 'main.ts' &&
        p1.lines[0] === 'const env = "prod";' &&
        p1.scrollbind === true
      );
    },
  },
  {
    id: 89,
    title: '레슨 89: 표현식 폴딩(:set fdm=expr, :set fde=...) & 커맨드라인 윈도우(q:) 검색·실행 마스터',
    description:
      '수식으로 폴드 계층을 동적으로 계산하는 foldexpr(:set fdm=expr) 과, 명령어 이력을 일반 버퍼처럼 검색(/pat, ?pat)·편집·재실행할 수 있는 커맨드라인 윈도우(q:, q/, q?) 를 결합해 보세요.\n\n1) 표현식 폴딩 (:set fdm=expr fde={expr}):\n   - 각 줄(v:lnum)마다 표현식을 평가해 0/1/2..., >N(폴드 시작), <N(끝), =(유지), aN/sN 을 반환합니다.\n   - 예: :set fdm=expr fde=getline(v:lnum)=~\'^#\'?\'>1\':\'=\' 는 # 제목 줄마다 새 레벨 1 폴드를 시작합니다.\n   - 설정 후 zM 을 누르면 모든 섹션이 한꺼번에 접히며 zo / zc / za 로 여닫을 수 있습니다.\n\n2) 커맨드라인 윈도우 고급 탐색·실행 (q:, q/, q?, :his):\n   - q: (또는 q/, q?) 로 이력 버퍼를 연 뒤, 내부에서 ?done<Enter> / /pat<Enter> 로 과거 명령을 검색하고 I/A/cw 로 수정하거나 Enter 로 즉시 실행할 수 있습니다.\n   - 창 내부에서 :q<Enter> 또는 Ctrl-c 를 누르면 실행 없이 안전하게 닫히고, :his 로 이력 목록을 조회할 수 있습니다.\n\n미션:\n1. :set fdm=expr fde=getline(v:lnum)=~\'^#\'?\'>1\':\'=\'<Enter> 로 # 헤더 기준 표현식 폴딩을 설정하세요.\n2. zM 을 눌러 두 섹션(# Section 1, # Section 2)을 모두 접으세요.\n3. q: 로 커맨드라인 윈도우를 열고 ?done<Enter> 로 과거 치환 명령(%s/draft/done/g)을 찾아 Enter 로 실행하세요!',
    hint: ":set fdm=expr fde=getline(v:lnum)=~'^#'?'>1':'='<Enter> → zM → q: → ?done<Enter> → Enter",
    par: 66,
    optimalKeys: [
      ':', 's', 'e', 't', ' ', 'f', 'd', 'm', '=', 'e', 'x', 'p', 'r', ' ',
      'f', 'd', 'e', '=', 'g', 'e', 't', 'l', 'i', 'n', 'e', '(', 'v', ':', 'l', 'n', 'u', 'm', ')', '=', '~', "'", '^', '#', "'", '?', "'", '>', '1', "'", ':', "'", '=', "'", 'Enter',
      'z', 'M',
      'q', ':',
      '?', 'd', 'o', 'n', 'e', 'Enter',
      'Enter',
    ],
    initialCommandHistory: [
      'set nu',
      '%s/draft/done/g',
    ],
    initialLines: [
      '# Section 1',
      'status = draft',
      '# Section 2',
      'status = draft',
    ],
    targetLines: [
      '# Section 1',
      'status = done',
      '# Section 2',
      'status = done',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = ['# Section 1', 'status = done', '# Section 2', 'status = done'];
      return (
        state.mode === 'NORMAL' &&
        state.cmdlineWindow == null &&
        state.options?.foldmethod === 'expr' &&
        (state.folds?.length ?? 0) === 2 &&
        state.folds!.every((f) => f.closed) &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx])
      );
    },
  },
  {
    id: 90,
    title: '레슨 90: 마커 폴딩(:set fdm=marker, :set fmr=...) & Insert 단발 노멀(Ctrl-o) 마스터',
    description:
      '코드에 직접 주석 마커({{{ / }}} 또는 사용자 정의 구분자)를 심어 폴드 구조를 고정하는 마커 폴딩(:set fdm=marker, zj/zk/[z/]z) 과, 입력 모드를 빠져나가지 않고 단발성 노멀/Ex/검색 명령을 실행한 뒤 자동으로 입력 모드로 복귀하는 Ctrl-o 를 익혀 보세요.\n\n1) 마커 폴딩 (:set fdm=marker, :set fmr={open},{close}) & 폴드 이동:\n   - 기본 마커는 {{{,}}} 이며 :set fmr=<<<,>>> 처럼 구분자를 바꿀 수 있습니다. {{{1 / }}}1 처럼 숫자로 중첩 레벨도 지정합니다.\n   - zf{motion} 을 실행하면 commentstring 에 맞춰 시작·끝 줄에 마커를 자동 삽입하고 폴드를 생성합니다.\n   - zj / zk 는 다음·이전 폴드로 점프하고, [z / ]z 는 현재 열린 폴드의 시작·끝 줄로 이동합니다.\n\n2) 입력 모드 단발 명령 (Ctrl-o):\n   - INSERT 모드에서 Ctrl-o 를 누르면 단일 명령용 NORMAL 모드로 진입합니다.\n   - $ / 2w 같은 모션뿐 아니라 Ctrl-o :s/.../.../<Enter> 나 Ctrl-o /pat<Enter> 도 실행 즉시 INSERT 모드로 자동 복귀합니다.\n\n미션:\n1. :set fdm=marker fmr=<<<,>>><Enter> 로 커스텀 마커 폴딩을 설정하고 zM 으로 두 블록을 모두 접으세요.\n2. zj 로 두 번째 블록(// Handlers <<<)으로 이동한 뒤 zo 로 펼치고, j 로 아래 줄(status = "draft";)로 내려가세요.\n3. i 로 입력 모드에 들어가 const 를 입력한 뒤 Ctrl-o :s/draft/ready<Enter> 로 치환하고, 계속 입력 모드에서 Ctrl-o $ 뒤 // ok (앞 공백 포함)를 붙여 Esc 로 마치세요!',
    hint: ':set fdm=marker fmr=<<<,>>><Enter> → zM → zj → zo → j → iconst <Ctrl-o>:s/draft/ready<Enter><Ctrl-o>$ // ok<Esc>',
    par: 68,
    optimalKeys: [
      ':', 's', 'e', 't', ' ', 'f', 'd', 'm', '=', 'm', 'a', 'r', 'k', 'e', 'r', ' ',
      'f', 'm', 'r', '=', '<', '<', '<', ',', '>', '>', '>', 'Enter',
      'z', 'M',
      'z', 'j',
      'z', 'o',
      'j',
      'i', 'c', 'o', 'n', 's', 't', ' ',
      'Ctrl-o', ':', 's', '/', 'd', 'r', 'a', 'f', 't', '/', 'r', 'e', 'a', 'd', 'y', 'Enter',
      'Ctrl-o', '$', ' ', '/', '/', ' ', 'o', 'k', 'Escape',
    ],
    initialLines: [
      '// Config <<<',
      'const port = 8080;',
      '// >>>',
      '// Handlers <<<',
      'status = "draft";',
      '// >>>',
    ],
    targetLines: [
      '// Config <<<',
      'const port = 8080;',
      '// >>>',
      '// Handlers <<<',
      'const status = "ready"; // ok',
      '// >>>',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '// Config <<<',
        'const port = 8080;',
        '// >>>',
        '// Handlers <<<',
        'const status = "ready"; // ok',
        '// >>>',
      ];
      return (
        state.mode === 'NORMAL' &&
        state.options?.foldmethod === 'marker' &&
        state.options?.foldmarker === '<<<,>>>' &&
        (state.folds?.length ?? 0) === 2 &&
        state.folds![0].closed === true &&
        state.folds![1].closed === false &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx])
      );
    },
  },
  {
    id: 91,
    title: '레슨 91: WORD 객체(iW/aW), 섹션 점프([[/]]), 화면·빈 줄([<Space>, gI) & Insert 들여쓰기(Ctrl-t/d) 마스터',
    description:
      'URL 이나 점(.)/슬래시(/)가 섞인 토큰을 공백 기준으로 통째 편집하는 iW/aW 객체, 블록 경계 섹션 이동([[ / ]] / [] / ][), 그리고 커서를 0열/들여쓰기 기준으로 다듬는 gI · Ctrl-t/d · [<Space>/]<Space> 를 실전에서 익혀 보세요.\n\n1) WORD 텍스트 객체 (iW / aW) & 섹션 이동 ([[ / ]] / [] / ][):\n   - ciW / diW / vaW 는 구두점이 섞여 있어도 공백(whitespace) 기준의 큰 단어 전체를 선택합니다. (URL·경로 치환에 최적)\n   - ]] / [[ 는 열 0의 { 로 시작하는 다음·이전 섹션으로, ][ / [] 는 } 로 이동합니다.\n\n2) gI · Insert 들여쓰기(Ctrl-t / Ctrl-d) · 빈 줄 삽입([<Space> / ]<Space>):\n   - gI 는 선행 들여쓰기를 건너뛰는 I 와 달리 항상 0열에서 INSERT 모드를 시작합니다.\n   - 입력 모드 중 Ctrl-t / Ctrl-d 를 누르면 shiftwidth 단위로 현재 줄을 들여쓰기·내어쓰기합니다. (Ctrl-y/Ctrl-e 는 위·아래 줄 문자 복사)\n   - 노멀 모드 [<Space> / ]<Space> 는 커서 줄 위·아래에 빈 줄을 깔끔히 끼워 넣습니다.\n\n미션:\n1. ]] 를 눌러 두 번째 { 블록(4번째 줄)으로 점프한 뒤 j f: ciW 로 URL(old://dev.api/v1;) 전체를 https://prod.api/v2; 로 교체하고 Esc 를 누르세요.\n2. j 로 ready = true; 줄로 내려가 gI Ctrl-t 를 누른 뒤 const 를 입력하고 Esc 를 누르세요.\n3. 마지막으로 [<Space> ([ 뒤 Space)를 눌러 ready 줄 바로 위에 빈 줄을 추가해 완료하세요!',
    hint: ']] → j → f: → ciWhttps://prod.api/v2;<Esc> → j → gI<Ctrl-t>const <Esc> → [<Space>',
    par: 44,
    optimalKeys: [
      ']', ']',
      'j',
      'f', ':',
      'c', 'i', 'W',
      'h', 't', 't', 'p', 's', ':', '/', '/', 'p', 'r', 'o', 'd', '.', 'a', 'p', 'i', '/', 'v', '2', ';', 'Escape',
      'j',
      'g', 'I',
      'Ctrl-t',
      'c', 'o', 'n', 's', 't', ' ', 'Escape',
      '[', ' ',
    ],
    initialLines: [
      '{',
      '  const base = "ok";',
      '}',
      '{',
      '  let url = old://dev.api/v1;',
      'ready = true;',
      '}',
    ],
    targetLines: [
      '{',
      '  const base = "ok";',
      '}',
      '{',
      '  let url = https://prod.api/v2;',
      '',
      '  const ready = true;',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '{',
        '  const base = "ok";',
        '}',
        '{',
        '  let url = https://prod.api/v2;',
        '',
        '  const ready = true;',
        '}',
      ];
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx])
      );
    },
  },
  {
    id: 92,
    title: '레슨 92: Neovim LSP 호버(K)·진단 탐색([d, ]d)과 :lopen 버그 수정 마스터',
    description:
      'Neovim 내장 LSP 클라이언트처럼 타입 시그니처 문서 호버 창(K), 실시간 진단 점프(]d / [d / ]D / [D), 그리고 창 로컬 진단 목록(:lopen)을 결합해 코드 버그를 정확히 진단하고 수정해 보세요.\n\n1) LSP 호버 플로팅 팝업 (K):\n   - 심볼 위에서 K 를 누르면 시그니처와 문서를 담은 플로팅 호버 창이 열립니다. (Esc / q / 커서 이동으로 닫기)\n\n2) 진단(Diagnostic) 탐색 (]d / [d / ]D / [D) & :lopen:\n   - ]d / [d 는 파일 내 다음·이전 에러/경고 위치로 즉시 이동합니다. (]D / [D 는 마지막·첫 번째 진단)\n   - :lopen (:diagnostics) 은 모든 진단 항목을 하단 Location List 분할 창에 띄우며, 코드에서 버그를 고치면 진단과 목록이 실시간으로 자동 해소됩니다.\n\n미션:\n1. 1번째 줄의 parsePort 위에서 K 를 눌러 LSP 호버 창으로 타입 시그니처를 확인하세요.\n2. :lopen<Enter> 로 진단 목록 창을 여세요.\n3. ]d 와 [d 로 두 개의 TS2322 타입 오류("8080", "300")를 탐색한 뒤 따옴표를 제거(x f" x)하여 모두 숫자 타입으로 고쳐 모든 진단을 0개로 해소하세요!',
    hint: 'K(호버) → :lopen<Enter>(진단 목록) → ]d / [d(오류 이동) → x f" x(따옴표 제거)',
    par: 26,
    optimalKeys: [
      'K',
      ':', 'l', 'o', 'p', 'e', 'n', 'Enter',
      ']', 'd',
      ']', 'd',
      '[', 'd',
      'x', 'f', '"', 'x',
      ']', 'd',
      'x', 'f', '"', 'x',
    ],
    primaryFilename: 'service.ts',
    initialLines: [
      'function parsePort(raw: string): number {',
      '  const port: number = "8080";',
      '  return port;',
      '}',
      'const timeout: number = "300";',
      'const active = parsePort("8080");',
    ],
    targetLines: [
      'function parsePort(raw: string): number {',
      '  const port: number = 8080;',
      '  return port;',
      '}',
      'const timeout: number = 300;',
      'const active = parsePort("8080");',
    ],
    initialCursor: { line: 0, col: 9 },
    initialLspSymbols: {
      parsePort: {
        symbol: 'parsePort',
        kind: 'function',
        signature: 'function parsePort(raw: string): number',
        documentation: 'Parses a port configuration string into a numeric TCP port.',
        source: 'service.ts',
      },
    },
    initialLspDiagnostics: [
      {
        id: 'ts-2322-port',
        line: 1,
        col: 23,
        endCol: 29,
        severity: 'error',
        code: 'TS2322',
        source: 'ts',
        message: "Type 'string' is not assignable to type 'number'.",
        rule: { matchPattern: 'port: number = ("8080")', highlightGroup: 1 },
      },
      {
        id: 'ts-2322-timeout',
        line: 4,
        col: 24,
        endCol: 29,
        severity: 'error',
        code: 'TS2322',
        source: 'ts',
        message: "Type 'string' is not assignable to type 'number'.",
        rule: { matchPattern: 'timeout: number = ("300")', highlightGroup: 1 },
      },
    ],
    checkComplete: (state) => {
      const target = [
        'function parsePort(raw: string): number {',
        '  const port: number = 8080;',
        '  return port;',
        '}',
        'const timeout: number = 300;',
        'const active = parsePort("8080");',
      ];
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx]) &&
        (state.lspDiagnostics?.length ?? 0) === 0 &&
        Boolean(state.locationList?.isOpen)
      );
    },
  },
  {
    id: 93,
    title: '레슨 93: 메서드 점프(]m/[m), 다이그래프(Ctrl-k), 직전 삽입(Ctrl-a) & UTF-8 바이트(g8) 마스터',
    description:
      '클래스 내부 메서드를 단숨에 오가는 ]m / [m / ]M / [M 모션, 입력 모드 특수문자 다이그래프(Ctrl-k), 직전 입력 내용을 즉시 반복하는 Insert Ctrl-a, 그리고 커서 아래 문자의 UTF-8 16진수 바이트를 확인하는 g8 을 실전에서 결합해 보세요.\n\n1) 메서드 블록 점프 (]m / [m / ]M / [M):\n   - ]m / [m 은 다음·이전 메서드 여는 중괄호({)로, ]M / [M 은 닫는 중괄호(})로 즉시 이동합니다. (카운트 및 d/c/y/v 결합 지원)\n\n2) 다이그래프(Ctrl-k {c1}{c2}) & 직전 삽입 반복(Ctrl-a):\n   - INSERT 모드에서 Ctrl-k 뒤 두 문자(예: -> 는 →, != 는 ≠, *l 은 λ)를 치면 유니코드 특수 기호가 입력됩니다.\n   - 다른 위치로 이동해 다시 INSERT 모드에서 Ctrl-a 를 누르면 방금 전 INSERT 세션에 입력했던 텍스트 전체가 즉시 재삽입됩니다.\n\n3) UTF-8 바이트 검사 (g8):\n   - NORMAL 모드에서 커서 아래 문자의 UTF-8 인코딩 16진수 바이트(예: → 는 e2 86 92)를 명령줄에 표시합니다.\n\n미션:\n1. 2]m 으로 stepOne() { 로 점프한 뒤 아래 줄 문자열을 "ok → go" 로 바꾸세요. (→ 는 Insert 모드 Ctrl-k - >)\n2. F<Space> h g8 로 → 문자 위의 UTF-8 바이트(e2 86 92)를 확인하세요.\n3. ]m 으로 stepTwo() { 로 내려간 뒤 문자열 안으로 들어가 Ctrl-a 로 "ok → go" 를 한 번에 채워 완료하세요!',
    hint: '2]m → j f" ci" ok<Space>Ctrl-k - ><Space>go<Esc> → F<Space> h g8 → ]m j f" ci" Ctrl-a<Esc>',
    par: 34,
    optimalKeys: [
      '2', ']', 'm',
      'j', 'f', '"', 'c', 'i', '"',
      'o', 'k', ' ', 'Ctrl-k', '-', '>', ' ', 'g', 'o', 'Escape',
      'F', ' ', 'h',
      'g', '8',
      ']', 'm',
      'j', 'f', '"', 'c', 'i', '"', 'Ctrl-a', 'Escape',
    ],
    primaryFilename: 'pipeline.ts',
    initialLines: [
      'class Pipeline {',
      '  stepOne() {',
      '    const flow = "TODO";',
      '  }',
      '  stepTwo() {',
      '    const backup = "TODO";',
      '  }',
      '}',
    ],
    targetLines: [
      'class Pipeline {',
      '  stepOne() {',
      '    const flow = "ok → go";',
      '  }',
      '  stepTwo() {',
      '    const backup = "ok → go";',
      '  }',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        'class Pipeline {',
        '  stepOne() {',
        '    const flow = "ok → go";',
        '  }',
        '  stepTwo() {',
        '    const backup = "ok → go";',
        '  }',
        '}',
      ];
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx])
      );
    },
  },
  {
    id: 94,
    title: '레슨 94: 커맨드라인 중간 편집(Ctrl-b/e/w/u, Arrow, Ctrl-k)과 :digraphs / :ascii 마스터',
    description:
      '명령줄(: / ? =) 입력 도중 커서를 자유롭게 옮겨 고치는 커맨드라인 고급 편집, 커맨드라인 다이그래프(Ctrl-k), 커스텀 다이그래프 등록(:digraphs), 그리고 커서 문자의 코드 포인트를 출력하는 :ascii 를 실전에서 결합해 보세요.\n\n1) 커맨드라인·검색줄 중간 편집 (:, /, ?, =):\n   - ArrowLeft / ArrowRight 로 명령줄 중간으로 커서를 옮겨 글자를 끼워 넣거나 Delete 로 앞의 글자를 지울 수 있습니다.\n   - Ctrl-b / Home (줄 맨 앞), Ctrl-e / End (줄 맨 끝), Ctrl-w (커서 앞 단어 삭제), Ctrl-u (커서 앞 전체 삭제), Ctrl-c (즉시 취소)를 지원합니다.\n   - 커맨드라인과 검색줄에서도 Ctrl-k {c1}{c2} 로 유니코드 다이그래프를 즉시 삽입할 수 있습니다.\n\n2) :digraphs (:dig) & :ascii (:as):\n   - :digraphs 는 내장 및 사용자 다이그래프 목록을 표시하고, :digraph {c1}{c2} {code} 로 새 다이그래프(예: :dig z1 9733 → ★)를 등록합니다.\n   - :ascii (:as) 는 ga 와 동일하게 커서 아래 문자의 십진수·16진수·8진수 코드 값을 출력합니다.\n\n미션:\n1. :dig z1 9733<Enter> 로 커스텀 다이그래프 z1(★)을 등록하세요.\n2. :%s/TODO/ 와 Ctrl-k z 1, ok / 입력 후 ArrowLeft 로 슬래시(/) 앞으로 커서를 옮겨 Ctrl-k - > 를 끼워 넣고 Enter 로 두 줄 모두 "★ ok →" 로 치환하세요.\n3. f" l 로 ★ 위에 커서를 두고 :as<Enter> 를 실행해 ASCII/유니코드 코드(9733, Hex 2605)를 확인하세요!',
    hint: ':dig z1 9733<Enter> → :%s/TODO/ Ctrl-k z 1 ok / + ArrowLeft + Ctrl-k - ><Enter> → f" l :as<Enter>',
    par: 44,
    optimalKeys: [
      ':', 'd', 'i', 'g', ' ', 'z', '1', ' ', '9', '7', '3', '3', 'Enter',
      ':', '%', 's', '/', 'T', 'O', 'D', 'O', '/',
      'Ctrl-k', 'z', '1', ' ', 'o', 'k', ' ', '/',
      'ArrowLeft', 'Ctrl-k', '-', '>', 'Enter',
      'f', '"', 'l', ':', 'a', 's', 'Enter',
    ],
    primaryFilename: 'symbols.ts',
    initialLines: [
      'const primary = "TODO";',
      'const fallback = "TODO";',
    ],
    targetLines: [
      'const primary = "★ ok →";',
      'const fallback = "★ ok →";',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        'const primary = "★ ok →";',
        'const fallback = "★ ok →";',
      ];
      return (
        state.mode === 'NORMAL' &&
        Object.keys(state.userDigraphs ?? {}).length > 0 &&
        // 마지막 단계: 커서 문자를 :ascii (:as) 로 확인했는지
        /^as(c|ci|cii)?$/.test((state.commandHistory ?? []).at(-1)?.trim() ?? '') &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx])
      );
    },
  },
  {
    id: 95,
    title: '레슨 95: 부분 검색(g*/g#), 전역 선언(gD), 줄 정렬(:center/:right), Ex 반복(@:) & Ctrl-v 유니코드 마스터',
    description:
      '단어 경계 없이 부분 일치를 찾는 g* / g#, 파일 최상단 전역 선언으로 점프하는 gD, 문단·제목을 지정 너비에 맞춰 정렬하는 :center / :right / :left, 직전 Ex 명령을 단 두 타로 재실행하는 @:, 그리고 Insert 모드에서 16진수 코드 포인트로 유니코드를 직접 입력하는 Ctrl-v uXXXX 를 결합해 보세요.\n\n1) 전역 선언(gD) & 부분 검색(g* / g#):\n   - gd 가 현재 함수 내부 선언을 우선한다면, gD 는 파일 맨 위 전역 선언으로 즉시 이동합니다.\n   - g* / g# 는 * / # 과 달리 단어 경계(\\<...\\>)를 두지 않아 badge 로 badgeName 같은 부분 문자열도 모두 찾습니다.\n\n2) 줄 정렬(:center / :right / :left) & Ex 반복(@:) & Ctrl-v uXXXX:\n   - Insert 모드 Ctrl-v u 뒤에 4자리 16진수(예: u2605 → ★)를 입력하면 코드 포인트가 즉시 문자로 삽입됩니다.\n   - :center 14 는 현재 줄 앞뒤 공백을 정리해 너비 14 기준 가운데 정렬하며, 다른 줄로 옮겨 @: 를 누르면 직전 Ex 명령을 그대로 다시 실행합니다.\n\n미션:\n1. 4번째 줄의 badge 에서 gD 를 눌러 전역 선언(1번째 줄)으로 점프한 뒤, "TODO" 를 Ctrl-v u2605 로 "★" 로 바꾸세요.\n2. 0 w g* n 으로 badgeName(4번째 줄)까지 부분 검색으로 이동한 뒤 2j 로 HEADER 줄에 내려오세요.\n3. :center 14<Enter> 로 HEADER 를 정렬한 다음 j @: 로 SUBTITLE 까지 일괄 가운데 정렬해 완료하세요!',
    hint: 'gD → f" ci" Ctrl-v u 2 6 0 5<Esc> → 0 w g* n 2j → :center 14<Enter> → j @:',
    par: 38,
    optimalKeys: [
      'g', 'D',
      'f', '"', 'c', 'i', '"', 'Ctrl-v', 'u', '2', '6', '0', '5', 'Escape',
      '0', 'w', 'g', '*', 'n', '2', 'j',
      ':', 'c', 'e', 'n', 't', 'e', 'r', ' ', '1', '4', 'Enter',
      'j', '@', ':',
    ],
    primaryFilename: 'banner.ts',
    initialLines: [
      'const badge = "TODO";',
      'function render() {',
      '  const badge = "WAIT";',
      '  return badgeName(badge);',
      '}',
      'HEADER',
      'SUBTITLE',
    ],
    targetLines: [
      'const badge = "★";',
      'function render() {',
      '  const badge = "WAIT";',
      '  return badgeName(badge);',
      '}',
      '    HEADER',
      '   SUBTITLE',
    ],
    initialCursor: { line: 3, col: 19 },
    checkComplete: (state) => {
      const target = [
        'const badge = "★";',
        'function render() {',
        '  const badge = "WAIT";',
        '  return badgeName(badge);',
        '}',
        '    HEADER',
        '   SUBTITLE',
      ];
      return (
        state.mode === 'NORMAL' &&
        state.lastPlayedMacro === ':' &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx])
      );
    },
  },
  {
    id: 96,
    title: '레슨 96: 수평 뷰포트 스크롤(zh/zl/zH/zL/ze/zs), 줄 바꿈 해제(:set nowrap) & sidescroll 마스터',
    description:
      '아주 긴 단일 행 설정이나 URL, 로그를 다룰 때 줄 바꿈을 끄고(:set nowrap) 화면을 좌우로 정밀하게 스크롤하면 구조를 깨뜨리지 않고 오른쪽 끝을 탐색·수정할 수 있습니다.\n\n1) 수평 스크롤 옵션 (:set nowrap / sidescroll / sidescrolloff):\n   - :set nowrap 은 긴 줄을 다음 줄로 접지 않고 한 줄 그대로 펼쳐 좌우 스크롤을 활성화합니다. (복원은 :set wrap)\n   - :set sidescroll=N (:set ss=N) 은 커서가 화면 좌우 밖으로 나갈 때 한 번에 밀어주는 열 수입니다.\n   - :set sidescrolloff=N (:set siso=N) 은 커서 좌우에 항상 확보하는 여백 열 수입니다.\n\n2) 수평 뷰포트 스크롤 키 (zh, zl, zH, zL, ze, zs — nowrap 전용):\n   - zl / zh (및 [count]zl / [count]zh) 는 화면을 오른쪽/왼쪽으로 지정 열만큼 스크롤합니다.\n   - zL / zH 는 화면 너비(visibleCols)의 절반 단위로 크게 좌우 이동합니다.\n   - zs 는 커서가 화면 왼쪽 끝(sidescrolloff 적용)에, ze 는 커서가 화면 오른쪽 끝에 오도록 맞춥니다.\n\n미션:\n1. :set nowrap ss=5 siso=3<Enter> 로 줄 바꿈을 끄고 수평 스크롤 옵션(ss=5, siso=3)을 설정하세요.\n2. j 2f= l 로 긴 줄 오른쪽 끝의 TODO 위로 이동한 뒤 cw READY<Esc> 로 값을 바꾸세요.\n3. ze 로 커서가 화면 오른쪽 끝에 오도록 수평 뷰포트 스크롤(leftCol > 0)을 적용해 오른쪽 끝 상태를 확인하고 완료하세요!',
    hint: ':set nowrap ss=5 siso=3<Enter> → j 2f= l cw READY<Esc> → ze',
    par: 45,
    optimalKeys: [
      ':', 's', 'e', 't', ' ', 'n', 'o', 'w', 'r', 'a', 'p', ' ', 's', 's', '=', '5', ' ', 's', 'i', 's', 'o', '=', '3', 'Enter',
      'j', '2', 'f', '=', 'l', 'c', 'w', 'R', 'E', 'A', 'D', 'Y', 'Escape',
      'z', 'e',
    ],
    primaryFilename: 'gateway.ts',
    initialLines: [
      '// Use :set nowrap and horizontal scrolling (zl/zh/zL/zH/ze/zs) to check and fix the value at the far right.',
      'const endpoint = "https://edge-gateway.internal.example.com/v2/clusters/ap-northeast-2/tenants/prod/flag=TODO";',
    ],
    targetLines: [
      '// Use :set nowrap and horizontal scrolling (zl/zh/zL/zH/ze/zs) to check and fix the value at the far right.',
      'const endpoint = "https://edge-gateway.internal.example.com/v2/clusters/ap-northeast-2/tenants/prod/flag=READY";',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '// Use :set nowrap and horizontal scrolling (zl/zh/zL/zH/ze/zs) to check and fix the value at the far right.',
        'const endpoint = "https://edge-gateway.internal.example.com/v2/clusters/ap-northeast-2/tenants/prod/flag=READY";',
      ];
      return (
        state.mode === 'NORMAL' &&
        state.options?.wrap === false &&
        (state.options?.sidescroll ?? 0) > 0 &&
        (state.viewport?.leftCol ?? 0) > 0 &&
        // 마지막 단계 ze: 커서가 화면 오른쪽 끝(sidescrolloff 여백)에 오도록 스크롤했는지
        (() => {
          const visCols = Math.max(1, state.viewport?.visibleCols ?? 80);
          const siso = Math.max(0, Math.min(state.options?.sidescrolloff ?? 0, Math.floor((visCols - 1) / 2)));
          return state.viewport?.leftCol === Math.max(0, state.cursor.col - (visCols - 1 - siso));
        })() &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx])
      );
    },
  },
  {
    id: 97,
    title: "레슨 97: 특수 마크('', '., '^, '[, '], '<, '>) & :set nrformats (hex/bin/alpha) 마스터",
    description:
      "사용자가 직접 지정한 a~z 마크 외에도 Vim 은 점프·변경·삽입·복사·선택의 흔적을 특수 마크에 자동으로 기록합니다. 여기에 16진수(hex)·2진수(bin)·알파벳(alpha)까지 다루는 :set nrformats 를 결합해 보세요.\n\n1) 특수 마크 점프 (' / ` 접두어):\n   - '' / `` : 직전에 큰 점프(gg, G, / 등)를 하기 전 위치로 왕복 토글합니다.\n   - '. / `. : 마지막으로 텍스트를 수정한 위치로 이동합니다.\n   - '^ / `^ : 마지막으로 Insert 모드를 종료한 위치로 이동합니다.\n   - '[ / '] / `[ / `] : 마지막 변경·붙여넣기·복사(yank)된 구간의 시작과 끝 경계입니다.\n   - '< / '> / `< / `> : 마지막 Visual 선택 영역의 시작과 끝 경계입니다.\n\n2) :set nrformats (:set nf=...):\n   - 기본값 bin,hex 에서 Ctrl-a / Ctrl-x 는 0x09 → 0x0a, 0b0101 → 0b0110 을 그대로 증감합니다.\n   - :set nf+=alpha 를 추가하면 문자('a' → 'c')도 Ctrl-a / Ctrl-x 로 증감할 수 있습니다. (nf+=octal, nf+=unsigned 지원)\n\n미션:\n1. 1번째 줄의 0x09 에서 Ctrl-a 를 눌러 0x0a 로, j Ctrl-a 로 2번째 줄 0b0101 을 0b0110 으로 바꾸세요.\n2. j 로 3번째 줄로 내려간 뒤 :set nf+=alpha<Enter> 를 설정하고 0 f\" l 2Ctrl-a 로 \"a\" 를 \"c\" 로 올리세요.\n3. G f[ ci[ DONE<Esc> 로 마지막 줄을 [DONE] 으로 바꾼 뒤, gg 로 맨 위에 올라갔다가 `^ (또는 `.) 로 마지막 수정/삽입 위치(4번째 줄)로 복귀해 완료하세요!",
    hint: 'Ctrl-a → j Ctrl-a → j :set nf+=alpha<Enter> → 0 f" l 2Ctrl-a → G f[ ci[ DONE<Esc> → gg `^',
    par: 45,
    optimalKeys: [
      'Ctrl-a', 'j', 'Ctrl-a', 'j',
      ':', 's', 'e', 't', ' ', 'n', 'f', '+', '=', 'a', 'l', 'p', 'h', 'a', 'Enter',
      '0', 'f', '"', 'l', '2', 'Ctrl-a',
      'G', 'f', '[', 'c', 'i', '[', 'D', 'O', 'N', 'E', 'Escape',
      'g', 'g', '`', '^',
    ],
    primaryFilename: 'flags.ts',
    initialLines: [
      'const flags = 0x09;',
      'const mask  = 0b0101;',
      'const stage = "a";',
      '// target: [TODO]',
    ],
    targetLines: [
      'const flags = 0x0a;',
      'const mask  = 0b0110;',
      'const stage = "c";',
      '// target: [DONE]',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        'const flags = 0x0a;',
        'const mask  = 0b0110;',
        'const stage = "c";',
        '// target: [DONE]',
      ];
      return (
        state.mode === 'NORMAL' &&
        (state.options?.nrformats ?? '').includes('alpha') &&
        state.cursor.line === 3 &&
        state.lastJumpPos != null &&
        // 마지막 단계 gg → `^: 1번 줄에서 마지막 삽입 위치로 점프해 돌아왔는지 (점프 리스트에 1번 줄이 남음)
        (state.jumpList ?? []).some((j) => j.row === 0) &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx])
      );
    },
  },
  {
    id: 98,
    title: '레슨 98: 불가시 문자 시각화(:set list/listchars) & 명령행 커서 단어 삽입(<C-r><C-w>) 마스터',
    description:
      '겉으로 보이지 않는 탭(\\t)과 줄 끝 불필요한 공백(trailing space)을 화면에 드러내고, 명령행·검색줄에서 커서 아래 단어나 파일명을 타이핑 없이 한 방에 채워 넣는 실무 기술을 익혀 보세요.\n\n1) 불가시 문자 시각화 (:set list / :set listchars):\n   - :set list 는 탭·후행 공백·줄 끝 기호를 에디터에 표시합니다. (:set nolist 로 해제)\n   - :set listchars=tab:>-,trail:.,eol:$ (:set lcs=...) 로 탭·후행 공백·줄 끝·일반 공백(space:)·NBSP(nbsp:) 표시 문자를 원하는 대로 지정합니다. (+=, -= 지원)\n\n2) 명령행·검색줄 커서 컨텍스트 삽입 (Ctrl-r 접두어):\n   - : 또는 / / ? 입력 중 Ctrl-r Ctrl-w 를 누르면 커서 아래 단어(<cword>)가 명령행 커서 위치에 즉시 삽입됩니다.\n   - Ctrl-r Ctrl-a 는 공백 기준 큰 단어(<cWORD>), Ctrl-r Ctrl-l 은 현재 줄 전체, Ctrl-r Ctrl-f 는 커서 아래 파일명(<cfile>)을 삽입합니다.\n   - / 검색 프롬프트에서도 Ctrl-r {reg} 및 Ctrl-r = 계산식 삽입을 동일하게 쓸 수 있습니다.\n\n미션:\n1. :set list lcs=tab:>-,trail:.,eol:$<Enter> 로 탭과 줄 끝 공백을 눈에 보이게 켜세요.\n2. 2w 로 oldServiceHost 위로 커서를 옮긴 뒤, :%s/ 를 입력하고 Ctrl-r Ctrl-w 를 눌러 단어를 자동 삽입한 다음 /newServiceHost/g<Enter> 로 일괄 치환하세요.\n3. :%s/\\s\\+$//<Enter> 로 줄 끝 후행 공백을 모두 제거해 완료하세요!',
    hint: ':set list lcs=tab:>-,trail:.,eol:$<Enter> → 2w → :%s/ Ctrl-r Ctrl-w /newServiceHost/g<Enter> → :%s/\\s\\+$//<Enter>',
    par: 76,
    optimalKeys: [
      ':', 's', 'e', 't', ' ', 'l', 'i', 's', 't', ' ', 'l', 'c', 's', '=', 't', 'a', 'b', ':', '>', '-', ',', 't', 'r', 'a', 'i', 'l', ':', '.', ',', 'e', 'o', 'l', ':', '$', 'Enter',
      'w', 'w',
      ':', '%', 's', '/', 'Ctrl-r', 'Ctrl-w', '/', 'n', 'e', 'w', 'S', 'e', 'r', 'v', 'i', 'c', 'e', 'H', 'o', 's', 't', '/', 'g', 'Enter',
      ':', '%', 's', '/', '\\', 's', '\\', '+', '$', '/', '/', 'Enter',
    ],
    primaryFilename: 'service.ts',
    initialLines: [
      '\tconst oldServiceHost = "v1";  ',
      'let backupHost = oldServiceHost; ',
    ],
    targetLines: [
      '\tconst newServiceHost = "v1";',
      'let backupHost = newServiceHost;',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '\tconst newServiceHost = "v1";',
        'let backupHost = newServiceHost;',
      ];
      return (
        state.mode === 'NORMAL' &&
        state.options?.list === true &&
        (state.options?.listchars ?? '').includes('trail:') &&
        (state.options?.listchars ?? '').includes('eol:') &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx])
      );
    },
  },
  {
    id: 99,
    title: '레슨 99: 덮어쓰기 모드(R), [count]r & 비주얼 블록 치환(Ctrl-v r) 마스터',
    description:
      '글자를 지우고 다시 쓰는 대신 기존 자리에 정확히 1:1로 덮어쓰는 Replace 모드(R), 반복 카운트 단일 치환([count]r), 그리고 선택 영역 전체를 단 한 글자로 덮는 Visual r{char} 마스킹 기법을 익혀 보세요.\n\n1) 덮어쓰기 모드 (R) & [count]r:\n   - Normal 모드에서 R 을 누르면 REPLACE 모드로 진입해 입력한 글자마다 기존 문자를 1:1로 덮어씁니다. (Backspace 로 원본 복구, Esc 로 복귀)\n   - [count]r{char} (예: 3r0) 는 커서부터 지정 개수만큼을 한 글자로 즉시 치환합니다.\n\n2) Visual / Visual Block 일괄 치환 (v / V / Ctrl-v + r{char}):\n   - 선택 영역을 잡은 뒤 r{char} 를 누르면 선택된 모든 문자(Visual Block 은 사각형 영역 전체)를 해당 문자로 한 번에 치환해 민감한 키·비밀번호를 1초 만에 마스킹할 수 있습니다.\n\n미션:\n1. 1번째 줄의 "1" 위(f1)에서 R 2_NEW<Esc> 로 "1_OLD" 를 "2_NEW" 로 덮어쓰세요.\n2. f9 로 첫 번째 9 위에 이동한 뒤 3r0 으로 "999" 를 "000" 으로 한 번에 치환하세요.\n3. j F_ l 로 2번째 줄의 "9" 로 내려간 뒤 Ctrl-v j 3l r* 를 눌러 두 API 키의 뒷자리(9876, 1234)를 모두 "****" 로 마스킹하세요!',
    hint: 'f1 R 2_NEW<Esc> → f9 3r0 → j F_ l Ctrl-v j 3l r*',
    par: 26,
    optimalKeys: [
      'f', '1', 'R', '2', '_', 'N', 'E', 'W', 'Escape',
      'f', '9', '3', 'r', '0',
      'j', 'F', '_', 'l', 'Ctrl-v', 'j', '3', 'l', 'r', '*',
    ],
    primaryFilename: 'secrets.ts',
    initialLines: [
      'const code = "V1_OLD_999";',
      'const keyA = "sk_9876";',
      'const keyB = "sk_1234";',
    ],
    targetLines: [
      'const code = "V2_NEW_000";',
      'const keyA = "sk_****";',
      'const keyB = "sk_****";',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        'const code = "V2_NEW_000";',
        'const keyA = "sk_****";',
        'const keyB = "sk_****";',
      ];
      return (
        state.mode === 'NORMAL' &&
        state.lines.length === target.length &&
        state.lines.every((l, idx) => l === target[idx])
      );
    },
  },
  {
    id: 100,
    title: '레슨 100: [대단원] 정규식 캡처·매크로·vim-surround·다중 파일 배치 종합 마스터 챌린지',
    description:
      '축하합니다! 드디어 100강 마지막 졸업 미션입니다. 지금까지 익힌 정규식 치환(\\(\\)/\\u), 매크로(qq/@q), vim-surround(cs), 숫자 증가(Ctrl-a), 그리고 다중 버퍼 일괄 리팩토링(:vimgrep + :cdo + Ctrl-^)을 하나의 흐름으로 결합해 릴리스 코드를 완성하세요!\n\n미션:\n1. :%s/_\\([a-z]\\)/\\u\\1/g<Enter> 로 모든 snake_case 변수명(service_name, worker_name, target_env)을 camelCase 로 변환하세요.\n2. 2G 로 내려간 뒤 qq f\' cs\'" f1 Ctrl-a j 0 q 로 매크로를 녹화해 \'auth-v1\' → "auth-v2" 로 바꾸고, @q 로 다음 줄(\'queue-v1\' → "queue-v2")까지 자동 변환하세요.\n3. :vimgrep /staging/ *<Enter> 로 release.ts 와 deploy.ts 를 모두 검색한 뒤, :cdo s/staging/production/g<Enter> 로 두 파일의 "staging" 을 모두 "production" 으로 바꾸고 Ctrl-^ 로 원래 파일(release.ts)로 복귀해 졸업하세요!',
    hint: ':%s/_\\([a-z]\\)/\\u\\1/g<Enter> → 2G qq f\' cs\'" f1 Ctrl-a j 0 q @q → :vimgrep /staging/ *<Enter> → :cdo s/staging/production/g<Enter> → Ctrl-^',
    par: 95,
    optimalKeys: [
      ':', '%', 's', '/', '_', '\\', '(', '[', 'a', '-', 'z', ']', '\\', ')', '/', '\\', 'u', '\\', '1', '/', 'g', 'Enter',
      '2', 'G', 'q', 'q', 'f', "'", 'c', 's', "'", '"', 'f', '1', 'Ctrl-a', 'j', '0', 'q', '@', 'q',
      ':', 'v', 'i', 'm', 'g', 'r', 'e', 'p', ' ', '/', 's', 't', 'a', 'g', 'i', 'n', 'g', '/', ' ', '*', 'Enter',
      ':', 'c', 'd', 'o', ' ', 's', '/', 's', 't', 'a', 'g', 'i', 'n', 'g', '/', 'p', 'r', 'o', 'd', 'u', 'c', 't', 'i', 'o', 'n', '/', 'g', 'Enter',
      'Ctrl-^',
    ],
    primaryFilename: 'release.ts',
    secondaryFilename: 'deploy.ts',
    initialLines: [
      '// [Lesson 100] Vim Grandmaster Challenge',
      "const service_name = 'auth-v1';",
      "const worker_name = 'queue-v1';",
      'const target_env = "staging";',
    ],
    secondaryLines: [
      'export const deployEnv = "staging";',
    ],
    targetLines: [
      '// [Lesson 100] Vim Grandmaster Challenge',
      'const serviceName = "auth-v2";',
      'const workerName = "queue-v2";',
      'const targetEnv = "production";',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      if (state.mode !== 'NORMAL') return false;
      const target = [
        '// [Lesson 100] Vim Grandmaster Challenge',
        'const serviceName = "auth-v2";',
        'const workerName = "queue-v2";',
        'const targetEnv = "production";',
      ];
      const s = ensureBuffers(state);
      const releaseBuf = s.buffers?.find((b) => b.name === 'release.ts' || b.id === 1);
      const deployBuf = s.buffers?.find((b) => b.name === 'deploy.ts' || b.id === 2);
      const isBackOnRelease = s.currentBufferId === 1 || s.primaryFilename === 'release.ts';
      const isReleaseMatched =
        Boolean(releaseBuf) &&
        releaseBuf!.lines.length === target.length &&
        releaseBuf!.lines.every((l, idx) => l === target[idx]);
      const isDeployMatched =
        deployBuf?.lines.length === 1 &&
        deployBuf.lines[0] === 'export const deployEnv = "production";';

      return isBackOnRelease && isReleaseMatched && isDeployMatched;
    },
  },
];
