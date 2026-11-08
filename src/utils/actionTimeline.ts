import { VimEditorState } from '../vim-engine';

export interface ActionTimelineStep {
  stepIndex: number;
  command: string;
  description: string;
  keys: string[];
  keystrokesSoFar: number;
  snapshot: VimEditorState;
  timestamp?: number;
}

/**
 * 키 시퀀스를 분석하여 한국어 사용자 친화적인 설명 레이블을 생성합니다.
 */
export function getActionDescription(keys: string[], _finalState?: VimEditorState): string {
  if (keys.length === 0) return '초기 상태';

  const fullCmd = keys.join('');

  // 1. 점(.) 반복
  if (fullCmd === '.') return '마지막 변경 명령 반복 (.)';

  // 2. 실행 취소 / 다시 실행
  if (fullCmd === 'u') return '실행 취소 (Undo)';
  if (fullCmd.toLowerCase().includes('ctrl+r')) return '다시 실행 (Redo)';

  // 3. 단순 단일/카운트 이동
  const countMatch = fullCmd.match(/^(\d+)?([hjklwbe0\^\$]|gg|G)$/);
  if (countMatch) {
    const count = countMatch[1] ? parseInt(countMatch[1], 10) : 1;
    const motion = countMatch[2];
    const countStr = count > 1 ? ` ${count}회` : '';

    switch (motion) {
      case 'h': return `왼쪽으로${countStr} 이동`;
      case 'l': return `오른쪽으로${countStr} 이동`;
      case 'j': return `아래 줄로${countStr} 이동`;
      case 'k': return `위 줄로${countStr} 이동`;
      case 'w': return `다음 단어 시작으로${countStr} 이동`;
      case 'b': return `이전 단어 시작으로${countStr} 이동`;
      case 'e': return `단어 끝으로${countStr} 이동`;
      case '0': return '줄 맨 앞으로 이동 (0)';
      case '^': return '첫 글자로 이동 (^)';
      case '$': return '줄 맨 끝으로 이동 ($)';
      case 'gg': return count > 1 ? `${count}번째 줄로 이동` : '문서 맨 처음으로 이동 (gg)';
      case 'G': return '문서 맨 끝으로 이동 (G)';
    }
  }

  // 4. 문자 탐색 f, F, t, T
  if (/^[fFtT].$/.test(fullCmd)) {
    const target = fullCmd[1];
    if (fullCmd.startsWith('f')) return `'${target}' 문자로 이동 (f)`;
    if (fullCmd.startsWith('F')) return `이전 '${target}' 문자로 역방향 이동 (F)`;
    if (fullCmd.startsWith('t')) return `'${target}' 직전으로 이동 (t)`;
    if (fullCmd.startsWith('T')) return `이전 '${target}' 직후로 역방향 이동 (T)`;
  }
  if (fullCmd === ';') return '직전 문자 탐색 반복 (;)';
  if (fullCmd === ',') return '직전 문자 탐색 역방향 반복 (,)';
  if (fullCmd === '%') return '짝 괄호로 점프 (%)';

  // 5. 삭제 (d, x, D)
  if (fullCmd === 'x') return '한 글자 삭제 (x)';
  if (/^\d+x$/.test(fullCmd)) return `${parseInt(fullCmd, 10)}글자 삭제`;
  if (fullCmd === 'D' || fullCmd === 'd$') return '줄 끝까지 삭제 (D)';
  if (fullCmd === 'd0') return '줄 시작까지 삭제 (d0)';
  if (fullCmd === 'dd') return '현재 줄 삭제 (dd)';
  if (/^\d+dd$/.test(fullCmd)) return `${parseInt(fullCmd, 10)}줄 일괄 삭제`;
  if (fullCmd === 'dw') return '단어 앞부분 삭제 (dw)';
  if (fullCmd === 'de') return '단어 끝까지 삭제 (de)';
  if (fullCmd === 'diw') return '단어 내부 삭제 (diw)';
  if (fullCmd === 'daw') return '단어 주변(공백 포함) 삭제 (daw)';
  if (fullCmd === 'di"') return '따옴표 내부 삭제 (di")';
  if (fullCmd === 'da"') return '따옴표 전체 삭제 (da")';
  if (fullCmd === 'di(' || fullCmd === 'dib') return '괄호 내부 삭제 (di()';
  if (fullCmd === 'da(' || fullCmd === 'dab') return '괄호 전체 삭제 (da()';
  if (fullCmd === 'di{' || fullCmd === 'diB') return '중괄호 내부 삭제 (di{})';
  if (fullCmd === 'da{' || fullCmd === 'daB') return '중괄호 전체 삭제 (da{})';

  // 6. 변경 세션 (c, s, C, S)
  if (fullCmd.startsWith('cw')) return '단어 변경 (cw)';
  if (fullCmd.startsWith('ce')) return '단어 끝까지 변경 (ce)';
  if (fullCmd.startsWith('ciw')) return '단어 내부 내용 변경 (ciw)';
  if (fullCmd.startsWith('caw')) return '단어 전체 내용 변경 (caw)';
  if (fullCmd.startsWith('ci"')) return '따옴표 내부 내용 변경 (ci")';
  if (fullCmd.startsWith('da"')) return '따옴표 전체 내용 변경 (da")';
  if (fullCmd.startsWith('ci(')) return '괄호 내부 내용 변경 (ci()';
  if (fullCmd.startsWith('ci{')) return '중괄호 내부 내용 변경 (ci{})';
  if (fullCmd.startsWith('c$') || fullCmd.startsWith('C')) return '줄 끝까지 변경 (C)';
  if (fullCmd.startsWith('cc') || fullCmd.startsWith('S')) return '줄 전체 비우고 새로 입력 (S/cc)';
  if (fullCmd.startsWith('s')) return '글자 삭제 후 입력 (s)';
  if (fullCmd.startsWith('r')) return `글자 교체 (${fullCmd.slice(0, 2)})`;

  // 7. 삽입 세션 (i, a, o, O, I, A)
  if (fullCmd.startsWith('i')) return '현재 위치에서 텍스트 삽입 (i)';
  if (fullCmd.startsWith('a')) return '다음 위치에서 텍스트 추가 (a)';
  if (fullCmd.startsWith('I')) return '줄 첫 글자에서 텍스트 삽입 (I)';
  if (fullCmd.startsWith('A')) return '줄 맨 끝에서 텍스트 추가 (A)';
  if (fullCmd.startsWith('o')) return '아래 줄에 새 줄 열고 삽입 (o)';
  if (fullCmd.startsWith('O')) return '윗 줄에 새 줄 열고 삽입 (O)';

  // 8. 복사 및 붙여넣기 (y, p, P)
  if (fullCmd === 'yw') return '단어 복사 (yw)';
  if (fullCmd === 'yy') return '현재 줄 복사 (yy)';
  if (fullCmd === 'yiw') return '단어 내부 복사 (yiw)';
  if (fullCmd === 'p') return '커서 뒤에 붙여넣기 (p)';
  if (fullCmd === 'P') return '커서 앞에 붙여넣기 (P)';
  if (fullCmd.startsWith('"') && fullCmd.includes('p')) return `레지스터 붙여넣기 (${fullCmd})`;
  if (fullCmd.startsWith('"') && fullCmd.includes('y')) return `레지스터 복사 (${fullCmd})`;
  if (fullCmd.startsWith('"') && fullCmd.includes('d')) return `레지스터 잘라내기 (${fullCmd})`;

  // 9. 비주얼 모드 블록
  if (fullCmd.startsWith('v') || fullCmd.startsWith('V')) {
    if (fullCmd.endsWith('d')) return '비주얼 선택 영역 삭제';
    if (fullCmd.endsWith('y')) return '비주얼 선택 영역 복사';
    return '비주얼 선택 영역 조작';
  }

  // 10. 기타 기본
  return `명령 실행 [${fullCmd.slice(0, 10)}${fullCmd.length > 10 ? '...' : ''}]`;
}

/**
 * 명령 문자열의 가독성을 높여 표시합니다 (예: Escape -> <Esc>, Enter -> <CR>).
 */
export function formatCommandLabel(keys: string[]): string {
  if (keys.length === 0) return '';
  return keys
    .map((k) => {
      if (k === 'Escape') return '<Esc>';
      if (k === 'Enter') return '<CR>';
      if (k === ' ') return '<Space>';
      return k;
    })
    .join('');
}

/**
 * 초기 상태로부터 타임라인 0번 스텝(Initial State)을 생성합니다.
 */
export function createInitialTimelineStep(initialState: VimEditorState): ActionTimelineStep {
  return {
    stepIndex: 0,
    command: 'START',
    description: '미션 초기 상태',
    keys: [],
    keystrokesSoFar: 0,
    snapshot: initialState,
    timestamp: Date.now(),
  };
}

/**
 * 현재 상태와 키 시퀀스를 바탕으로 버그 재현용 Vitest it(...) 단위 테스트 코드를 생성합니다.
 */
export function generateVitestReproductionCode(options: {
  missionTitle?: string;
  initialText: string;
  initialCursor: { line: number; col: number };
  allKeys: string[];
  currentState: VimEditorState;
}): string {
  const { missionTitle, initialText, initialCursor, allKeys, currentState } = options;

  const testTitle = missionTitle
    ? `reproduce issue in mission: ${missionTitle}`
    : 'reproduce vim engine issue';

  const initialLines = initialText.split('\n');

  return `it('${testTitle}', () => {
  // 1. 초기 텍스트 및 커서 설정
  const initialLines = ${JSON.stringify(initialLines, null, 2)};
  const initialCursor = { line: ${initialCursor.line}, col: ${initialCursor.col} };

  // 2. 사용자가 입력한 키 시퀀스 (${allKeys.length}타)
  const keys = ${JSON.stringify(allKeys)};

  // 3. 엔진 초기 상태
  let state: VimEditorState = {
    lines: [...initialLines],
    cursor: { ...initialCursor },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
    registers: {},
  };

  // 4. 키 순차 실행
  for (const key of keys) {
    state = handleKey(state, key);
  }

  // 5. 최종 검증 (현재 에디터 결과값)
  expect(state.lines).toEqual(${JSON.stringify(currentState.lines, null, 2)});
  expect(state.cursor).toEqual({ line: ${currentState.cursor.line}, col: ${currentState.cursor.col} });
  expect(state.mode).toBe('${currentState.mode}');
});`;
}
