import { Mission } from '../types/mission';
import { ensureBuffers, syncCurrentBuffer } from '../engine/bufferEngine';
import { ensureTabPages } from '../engine/tabEngine';

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
      '// ~/.vimrc 환경설정 파일을 열어 설정을 적용하고 돌아오세요.',
      'export function main() {',
      '  console.log("Vim configuration sourced!");',
      '}',
    ],
    targetLines: [
      '// ~/.vimrc 환경설정 파일을 열어 설정을 적용하고 돌아오세요.',
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
      '    subtotal += item.price; // [BUG] 수량 누락됨',
      '  }',
      '  const discount = subtotal * 0.05; // [BUG] 5% 구버전 할인율',
      '  return subtotal - discount;',
      '}',
    ],
    secondaryLines: [
      'function calculateCartTotal(cart: CartItem[]) {',
      '  let subtotal = 0;',
      '  for (const item of cart) {',
      '    subtotal += item.price * item.quantity; // [FIX] 수량 정상 반영',
      '  }',
      '  const discount = subtotal * 0.15; // [FIX] 15% 신규 프로모션 할인율',
      '  return subtotal - discount;',
      '}',
    ],
    targetLines: [
      'function calculateCartTotal(cart: CartItem[]) {',
      '  let subtotal = 0;',
      '  for (const item of cart) {',
      '    subtotal += item.price * item.quantity; // [FIX] 수량 정상 반영',
      '  }',
      '  const discount = subtotal * 0.15; // [FIX] 15% 신규 프로모션 할인율',
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
        '    subtotal += item.price * item.quantity; // [FIX] 수량 정상 반영',
        '  }',
        '  const discount = subtotal * 0.15; // [FIX] 15% 신규 프로모션 할인율',
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
];


