import { Mission } from '../types/mission';

export const MISSIONS: Mission[] = [
  {
    id: 1,
    title: '레슨 1: 기본 방향 이동 (h, j, k, l)',
    description: 'Vim의 핵심 이동키 h(좌), j(하), k(상), l(우)를 사용해 [TARGET] 위치로 커서를 이동하세요.',
    hint: 'j를 두 번 눌러 아래로 내려간 뒤, l을 여러 번 눌러 오른쪽으로 이동하세요.',
    par: 6,
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
    initialLines: [
      'Words allow quick navigation.',
      'Jump over words toward destination directly.',
    ],
    initialCursor: { line: 1, col: 0 },
    targetCursor: { line: 1, col: 24 },
    checkComplete: (state) => state.cursor.line === 1 && state.cursor.col === 24,
  },
  {
    id: 3,
    title: '레슨 3: 줄 끝 점프 ($)',
    description: '$ 키를 눌러 현재 줄의 가장 끝 문자로 즉시 이동하세요.',
    hint: '$ 키(Shift + 4)를 누르면 줄 길이에 상관없이 줄 끝으로 이동합니다.',
    par: 1,
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
];
