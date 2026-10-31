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
];
