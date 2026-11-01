import { Mission } from '../types/mission';

export const MISSIONS: Mission[] = [
  {
    id: 1,
    title: '레슨 1: 기본 방향 이동 (h, j, k, l)',
    description: 'Vim의 핵심 이동키 h(좌), j(하), k(상), l(우)를 사용해 [TARGET] 위치로 커서를 이동하세요.',
    hint: 'j를 두 번 눌러 아래로 내려간 뒤, l을 여러 번 눌러 오른쪽으로 이동하세요.',
    par: 6,
    optimalKeys: ['j', 'j', 'w', 'w', 'w'],
    initialLines: [
      'Welcome to Vim Lesson 1!',
      'Navigate using h, j, k, l keys.',
      'Reach the -> [TARGET] to pass.',
    ],
    initialCursor: { line: 0, col: 0 },
    targetCursor: { line: 2, col: 13 },
    checkComplete: (state) => state.cursor.line === 2 && state.cursor.col === 13,
  },
  {
    id: 2,
    title: '레슨 2: 단어 단위 점프 (w, b, e)',
    description: 'w 키를 누르면 다음 단어로 빠르게 점프합니다. destination 단어로 이동하세요.',
    hint: 'w를 4번 누르면 destination 단어의 첫 글자에 바로 도달합니다.',
    par: 4,
    optimalKeys: ['w', 'w', 'w', 'w'],
    initialLines: [
      'Words allow quick navigation.',
      'Jump over words toward destination directly.',
    ],
    initialCursor: { line: 1, col: 0 },
    targetCursor: { line: 1, col: 23 },
    checkComplete: (state) => state.cursor.line === 1 && (state.cursor.col === 23 || state.cursor.col === 24),
  },
  {
    id: 3,
    title: '레슨 3: 줄 끝 점프 ($)',
    description: '$ 키를 눌러 현재 줄의 가장 끝 문자로 즉시 이동하세요.',
    hint: '$ 키(Shift + 4)를 누르면 줄 길이에 상관없이 줄 끝으로 이동합니다.',
    par: 1,
    optimalKeys: ['$'],
    initialLines: [
      'This is a long sentence and your goal is to jump straight to the end.',
      'Stay on this line and press $ to finish.',
    ],
    initialCursor: { line: 0, col: 0 },
    targetCursor: { line: 0, col: 68 },
    checkComplete: (state) => state.cursor.line === 0 && state.cursor.col === 68,
  },
  {
    id: 4,
    title: '레슨 4: 오타 삭제 (x)',
    description: 'x 키를 사용해 Viiim의 여분의 "i"를 삭제하여 올바른 "Vim"으로 만드세요.',
    hint: 'l 키로 두 번째 i로 이동한 다음 x를 두 번 누르세요.',
    par: 3,
    optimalKeys: ['l', 'x', 'x'],
    initialLines: [
      'Viiim is awesome!',
      'Fix the typo on the first line.',
    ],
    targetLines: [
      'Vim is awesome!',
      'Fix the typo on the first line.',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const line0 = state.lines[0] ?? '';
      return line0.startsWith('Vim is awesome!') && !line0.includes('Viiim');
    },
  },
  {
    id: 5,
    title: '레슨 5: 텍스트 입력 및 모드 복귀 (i, Esc)',
    description: 'i 키를 눌러 INSERT 모드로 진입한 후 "rocks"를 입력하고, Esc를 눌러 NORMAL 모드로 복귀하세요.',
    hint: '$ 키로 줄 끝으로 간 뒤 a 또는 i로 " rocks"를 입력하고 Esc를 누르세요.',
    par: 8,
    optimalKeys: ['A', ' ', 'r', 'o', 'c', 'k', 's', 'Escape'],
    initialLines: [
      'Vim',
      'Change the first line to "Vim rocks".',
    ],
    targetLines: [
      'Vim rocks',
      'Change the first line to "Vim rocks".',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const line0 = (state.lines[0] ?? '').trim();
      return state.mode === 'NORMAL' && line0 === 'Vim rocks';
    },
  },
  {
    id: 6,
    title: '레슨 6: 한 줄 삭제 (dd)',
    description: 'dd 키를 연속으로 두 번 눌러 불필요한 [DELETE ME] 줄을 삭제하세요.',
    hint: 'j를 눌러 2번째 줄로 이동한 후, d를 두 번 연속으로 누르면 줄 전체가 삭제됩니다.',
    par: 3,
    optimalKeys: ['j', 'd', 'd'],
    initialLines: [
      'Keep this important line.',
      'DELETE ME: This line should be removed.',
      'Keep this line too.',
    ],
    targetLines: [
      'Keep this important line.',
      'Keep this line too.',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      return (
        state.lines.length === 2 &&
        !state.lines.some((l) => l.includes('DELETE ME'))
      );
    },
  },
  {
    id: 7,
    title: '레슨 7: 단어 삭제 (dw)',
    description: 'dw 키를 눌러 문장 속 잘못 들어간 "wrong" 단어를 삭제하세요.',
    hint: 'w 키를 눌러 "wrong" 단어로 이동한 뒤, d를 누르고 w를 누르세요.',
    par: 4,
    optimalKeys: ['2', 'w', 'd', 'w'],
    initialLines: [
      'Vim is wrong an amazing editor!',
      'Delete the word "wrong" from the first line.',
    ],
    targetLines: [
      'Vim is an amazing editor!',
      'Delete the word "wrong" from the first line.',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const line0 = state.lines[0] ?? '';
      return line0.includes('Vim is an amazing editor!') && !line0.includes('wrong');
    },
  },
  {
    id: 8,
    title: '레슨 8: 실행 취소 (u) & 되살리기',
    description: '실수로 중요한 줄이 삭제되었습니다! u 키를 눌러 삭제된 줄을 복구하세요.',
    hint: 'u 키를 한 번 누르면 방금 삭제된 줄(Line 2)이 원래대로 되살아납니다.',
    par: 1,
    optimalKeys: ['u'],
    initialLines: [
      'Line 1: Safe and sound.',
      'Line 3: Wait, where did Line 2 go?',
    ],
    targetLines: [
      'Line 1: Safe and sound.',
      'Line 2: Important configuration data!',
      'Line 3: Wait, where did Line 2 go?',
    ],
    initialCursor: { line: 1, col: 0 },
    initialUndoStack: [
      {
        lines: [
          'Line 1: Safe and sound.',
          'Line 2: Important configuration data!',
          'Line 3: Wait, where did Line 2 go?',
        ],
        cursor: { line: 1, col: 0 },
      },
    ],
    checkComplete: (state) => {
      return state.lines.some((l) => l.includes('Line 2'));
    },
  },
  {
    id: 9,
    title: '레슨 9: VISUAL 모드 영역 선택 및 일괄 삭제 (v, d)',
    description: 'v 키를 눌러 VISUAL 모드로 진입한 뒤, [DELETE THIS PART] 영역을 블록 지정하고 d 키로 한 번에 삭제하세요.',
    hint: 'v 키를 누른 뒤 l이나 w 키로 블록을 [DELETE THIS PART] 끝까지 지정하고 d를 누르세요.',
    par: 5,
    optimalKeys: ['d', 'a', '['],
    initialLines: [
      'Keep start - [DELETE THIS PART] - Keep end.',
      'Select and delete only the bracketed part.',
    ],
    targetLines: [
      'Keep start -  - Keep end.',
      'Select and delete only the bracketed part.',
    ],
    initialCursor: { line: 0, col: 13 },
    checkComplete: (state) => {
      const line0 = state.lines[0] ?? '';
      return (
        state.mode === 'NORMAL' &&
        line0.includes('Keep start -  - Keep end.') &&
        !line0.includes('DELETE THIS PART')
      );
    },
  },
  {
    id: 10,
    title: '레슨 10: 숫자 반복 카운트 활용 (3w, 2dd)',
    description: 'Vim에서는 명령어 앞에 숫자를 붙여 여러 번 반복할 수 있습니다. 2dd로 불필요한 두 줄을 한 번에 삭제하고, 3w로 [GOAL] 위치로 빠르게 이동하세요.',
    hint: '2dd를 눌러 불필요한 줄을 지우고, 3w를 눌러 목표 위치로 가보세요.',
    par: 5,
    optimalKeys: ['2', 'd', 'd', '3', 'w'],
    initialLines: [
      'Header line',
      'REMOVE ME 1',
      'REMOVE ME 2',
      'one two three [GOAL]',
    ],
    targetLines: [
      'Header line',
      'one two three [GOAL]',
    ],
    initialCursor: { line: 1, col: 0 },
    targetCursor: { line: 1, col: 14 },
    checkComplete: (state) => {
      return (
        !state.lines.some((l) => l.includes('REMOVE ME')) &&
        state.lines.length === 2 &&
        state.cursor.line === 1 &&
        state.cursor.col === 14
      );
    },
  },
  {
    id: 11,
    title: '레슨 11: 빠른 입력 모드 진입 (o, A)',
    description: 'A 키로 줄 끝에서 바로 추가하고, o 키로 아래에 새 줄을 생성하여 입력하세요. 첫 줄 끝에 " done"을 추가하고, 아래 새 줄에 "Vim is fast!"를 입력하세요.',
    hint: 'A를 누르고 " done" 입력 후 Esc, 이어서 o를 누르고 "Vim is fast!"를 입력한 뒤 Esc를 누르세요.',
    par: 21,
    optimalKeys: ['A', ' ', 'd', 'o', 'n', 'e', 'Escape', 'o', 'V', 'i', 'm', ' ', 'i', 's', ' ', 'f', 'a', 's', 't', '!', 'Escape'],
    initialLines: ['Task 1'],
    targetLines: [
      'Task 1 done',
      'Vim is fast!',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines[0] === 'Task 1 done' &&
        state.lines[1] === 'Vim is fast!'
      );
    },
  },
  {
    id: 12,
    title: '레슨 12: 빠른 단어 수정과 문자 교체 (cw, r)',
    description: 'cw를 사용해 틀린 단어 "slow"를 "fast"로 수정하고, r 키로 오타 "cwt"를 "cat"으로 1글자만 교체하세요.',
    hint: 'cw를 누르고 "fast" 입력 후 Esc, 다음 줄로 가서 오타 위에 커서를 두고 r을 누른 뒤 a를 입력하세요.',
    par: 14,
    optimalKeys: ['c', 'w', 'f', 'a', 's', 't', 'Escape', 'j', 'h', 'r', 'a'],
    initialLines: [
      'Vim is slow',
      'A cute cwt',
    ],
    targetLines: [
      'Vim is fast',
      'A cute cat',
    ],
    initialCursor: { line: 0, col: 7 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines[0] === 'Vim is fast' &&
        state.lines[1] === 'A cute cat'
      );
    },
  },
  {
    id: 13,
    title: '레슨 13: 줄 내 문자 탐색과 삭제 (f, df))',
    description: 'f{char}로 원하는 문자로 바로 점프하고, df)로 닫는 괄호까지 불필요한 인자들을 한 번에 삭제하세요. 커서를 "("로 옮긴 뒤 df)를 입력하여 "(unwanted, junk)"를 제거하세요.',
    hint: 'f(를 눌러 여는 괄호로 이동한 다음, df)를 입력하면 닫는 괄호까지 한 번에 삭제됩니다.',
    par: 5,
    optimalKeys: ['f', '(', 'd', 'f', ')'],
    initialLines: ['console.log(unwanted, junk);'],
    targetLines: ['console.log;'],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines[0] === 'console.log;'
      );
    },
  },
  {
    id: 14,
    title: '레슨 14: 텍스트 객체 내부 수정과 삭제 (ciw, di")',
    description: 'ciw로 변수명을 "status"로 변경하고, 다음 줄로 이동해 di"로 큰따옴표 내부의 임시 문자열을 비우세요.',
    hint: 'ciw를 눌러 "status" 입력 후 Esc, j로 내려가 di"를 누르세요.',
    par: 14,
    optimalKeys: ['c', 'i', 'w', 's', 't', 'a', 't', 'u', 's', 'Escape', 'j', 'd', 'i', '"'],
    initialLines: [
      'let oldVariable = 200;',
      'const msg = "delete this text";',
    ],
    targetLines: [
      'let status = 200;',
      'const msg = "";',
    ],
    initialCursor: { line: 0, col: 4 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines[0] === 'let status = 200;' &&
        state.lines[1] === 'const msg = "";'
      );
    },
  },
  {
    id: 15,
    title: '레슨 15: 점(.) 명령어로 반복 편집 자동화하기',
    description: '첫 번째 줄 끝에서 A 키로 ";"를 추가한 뒤 Esc를 누르고, 아래 2개 줄로 내려가며 . 키를 눌러 세미콜론을 반복 추가하세요.',
    hint: 'A를 눌러 ; 입력 후 Esc, j를 누르고 .를 누르고, 다시 j를 누르고 .를 누르세요.',
    par: 7,
    optimalKeys: ['A', ';', 'Escape', 'j', '.', 'j', '.'],
    initialLines: [
      'const a = 1',
      'const b = 2',
      'const c = 3',
    ],
    targetLines: [
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines[0] === 'const a = 1;' &&
        state.lines[1] === 'const b = 2;' &&
        state.lines[2] === 'const c = 3;'
      );
    },
  },
  {
    id: 16,
    title: '레슨 16: 키워드 검색과 점프 (/, n, N, *)',
    description: '/target을 입력하고 Enter를 눌러 첫 번째 target으로 점프한 뒤, n을 눌러 마지막 목표 지점인 [FINAL_TARGET]으로 이동하세요.',
    hint: '/target 입력 후 Enter를 치고, n 키를 두 번 눌러 마지막 [FINAL_TARGET] 위치로 이동하세요.',
    par: 10,
    optimalKeys: ['/', 'F', 'I', 'N', 'A', 'L', 'Enter'],
    initialLines: [
      'First line with target item.',
      'Second line without any match.',
      'Third line has another target here.',
      'Fourth line reaches the [FINAL_TARGET]!',
    ],
    initialCursor: { line: 0, col: 0 },
    targetCursor: { line: 3, col: 31 },
    checkComplete: (state) => {
      return (
        state.cursor.line === 3 &&
        state.cursor.col >= 24 &&
        state.cursor.col <= 37
      );
    },
  },
  {
    id: 17,
    title: '레슨 17: 커맨드라인 일괄 치환 (:%s/old/new/g)',
    description: ':%s/TODO/DONE/g 명령어를 입력하고 Enter를 눌러 버퍼 안의 모든 "TODO"를 "DONE"으로 일괄 치환하세요.',
    hint: ':%s/TODO/DONE/g 입력 후 Enter를 누르면 문서 전체의 TODO가 DONE으로 한 번에 바뀝니다.',
    par: 16,
    optimalKeys: [':', '%', 's', '/', 'T', 'O', 'D', 'O', '/', 'D', 'O', 'N', 'E', '/', 'g', 'Enter'],
    initialLines: [
      '1. TODO: Fix authentication bug',
      '2. TODO: Implement search feature',
      '3. TODO: Write comprehensive tests',
    ],
    targetLines: [
      '1. DONE: Fix authentication bug',
      '2. DONE: Implement search feature',
      '3. DONE: Write comprehensive tests',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        !state.lines.some((l) => l.includes('TODO')) &&
        state.lines.every((l) => l.includes('DONE'))
      );
    },
  },
  {
    id: 18,
    title: '레슨 18: 매크로 녹화와 괄호 점프 (% 및 qa, @a)',
    description: '% 키로 짝이 되는 괄호 위치를 확인하고, qa 매크로를 녹화하여 리스트 항목들을 일괄 포맷팅하세요.',
    hint: '% 키를 누르면 짝 괄호로 점프합니다. qa -> I -> " -> $ -> a -> ", -> Esc -> j -> 0 -> q 로 매크로를 녹화한 뒤 @a로 반복 실행하세요.',
    par: 16,
    optimalKeys: ['j', 'q', 'a', 'I', '"', 'Escape', 'A', '"', ',', 'Escape', 'j', '0', 'q', '2', '@', 'a'],
    initialLines: [
      'const list = [',
      '  alpha',
      '  beta',
      '  gamma',
      '];',
    ],
    targetLines: [
      'const list = [',
      '  "alpha",',
      '  "beta",',
      '  "gamma",',
      '];',
    ],
    initialCursor: { line: 0, col: 13 }, // '[' 위
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines[1] === '  "alpha",' &&
        state.lines[2] === '  "beta",' &&
        state.lines[3] === '  "gamma",'
      );
    },
  },
  {
    id: 19,
    title: '레슨 19: Ctrl+v 비주얼 블록 다중 줄 편집 (I, Escape)',
    description: 'Ctrl+v로 3개 줄의 맨 앞 열을 직사각형 블록으로 선택한 뒤, Shift+I를 눌러 "// "를 입력하고 Escape를 눌러 한 번에 주석 처리하세요.',
    hint: 'Ctrl-v를 누르고 j를 2번 눌러 3개 줄을 블록 선택합니다. Shift+I를 눌러 "// "를 입력한 뒤 Escape를 누르면 모든 줄에 주석이 일괄 적용됩니다.',
    par: 8,
    optimalKeys: ['Ctrl-v', '2', 'j', 'I', '/', '/', ' ', 'Escape'],
    initialLines: [
      'const host = "localhost";',
      'const port = 8080;',
      'const debug = true;',
      'startServer();',
    ],
    targetLines: [
      '// const host = "localhost";',
      '// const port = 8080;',
      '// const debug = true;',
      'startServer();',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.lines[0] === '// const host = "localhost";' &&
        state.lines[1] === '// const port = 8080;' &&
        state.lines[2] === '// const debug = true;' &&
        state.lines[3] === 'startServer();'
      );
    },
  },
  {
    id: 20,
    title: '레슨 20: 마크와 점프 리스트로 코드 순간이동 (m, \', Ctrl-o)',
    description: '현재 위치를 마크 ma로 북마크한 뒤, 파일 맨 끝(G)으로 이동해 코드를 확인하고, \'a 또는 Ctrl-o로 원래 마크 위치로 순간이동하세요.',
    hint: 'ma로 현재 위치를 저장하고, G로 맨 끝 줄로 점프한 뒤, \'a를 누르면 마크 a가 위치한 줄의 첫 글자로 즉시 복귀합니다.',
    par: 5,
    optimalKeys: ['m', 'a', 'G', "'", 'a'],
    initialLines: [
      'function calculateTotal() {',
      '  return 100;',
      '}',
      '',
      '// End of file notes',
    ],
    initialCursor: { line: 0, col: 0 },
    targetCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      return (
        state.mode === 'NORMAL' &&
        state.marks?.a !== undefined &&
        state.cursor.line === 0 &&
        (state.jumpList?.length ?? 0) >= 1
      );
    },
  },
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
];
