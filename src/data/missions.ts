import { Mission } from '../types/mission';
import { ensureBuffers, syncCurrentBuffer } from '../vim-engine';
import { ensureTabPages } from '../vim-engine';

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
        state.cursor.line === 4
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
      'Vim의 매크로는 특수 바이너리가 아니라 일반 텍스트 레지스터("a~"z)에 그대로 저장됩니다. 만약 복잡한 매크로를 녹화하다가 오타나 실수가 발생했다면 처음부터 다시 녹화할 필요 없이 버퍼에 붙여넣어 수정할 수 있습니다!\n\n1) 매크로를 버퍼에 붙여넣기 ("ap):\n   - 레지스터 a에 녹화된 매크로를 현재 커서 위치에 텍스트로 붙여넣습니다.\n   - <Esc>, <CR> 등의 특수 키도 시각적 텍스트로 변환되어 버퍼에 출력됩니다.\n   - 예: "ap → A,<Esc>j\n\n2) 버퍼에서 오타 수정:\n   - 일반 Vim 편집 명령(f, r, cw 등)으로 잘못된 키스트로크나 문자를 수정합니다.\n   - 예: 0f,r; (쉼표 , 를 세미콜론 ; 로 변경) → A;<Esc>j\n\n3) 수정한 매크로를 다시 레지스터에 복사 ("ay$):\n   - 수정된 라인을 0"ay$ 로 다시 레지스터 a에 복사합니다.\n\n4) 수정된 매크로 실행 (@a, 2@@):\n   - 대상 라인으로 이동하여 @a 를 실행하고, 2@@ 로 나머지 라인에 일괄 적용합니다.\n\n미션:\n1. 빈 1번 라인에서 "ap 로 레지스터 a의 매크로(A,<Esc>j)를 붙여넣으세요.\n2. 0f,r; 로 쉼표(,)를 세미콜론(;)으로 수정하세요 (A;<Esc>j).\n3. 0"ay$ 로 수정된 매크로를 다시 레지스터 a에 복사하세요.\n4. j 로 const a = 1 라인으로 이동한 후 @a 를 실행하세요.\n5. 2@@ 로 const b = 2 및 const c = 3 라인까지 세미콜론을 일괄 추가하세요!',
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
      'A;<Esc>j',
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
      '// 순정 Vim 내장 도움말(:help, K)로 기능을 확인하고 코드를 검증하세요.',
      'const status = "motion";',
      'function check() {',
      '  return status === "verified";',
      '}',
    ],
    targetLines: [
      '// 순정 Vim 내장 도움말(:help, K)로 기능을 확인하고 코드를 검증하세요.',
      'const status = "verified";',
      'function check() {',
      '  return status === "verified";',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    checkComplete: (state) => {
      const target = [
        '// 순정 Vim 내장 도움말(:help, K)로 기능을 확인하고 코드를 검증하세요.',
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
      '// 인증 미들웨어 디버그 코드를 주석 처리하고 비활성 블록을 복구하세요.',
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
      '// 인증 미들웨어 디버그 코드를 주석 처리하고 비활성 블록을 복구하세요.',
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
        '// 인증 미들웨어 디버그 코드를 주석 처리하고 비활성 블록을 복구하세요.',
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
];
