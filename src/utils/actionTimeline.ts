import { VimEditorState } from '../vim-engine';
import { t, getLocale } from '../i18n';

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
  if (keys.length === 0) return t('초기 상태');

  const fullCmd = keys.join('');

  // 1. 점(.) 반복
  if (fullCmd === '.') return t('마지막 변경 명령 반복 (.)');

  // 2. 실행 취소 / 다시 실행
  if (fullCmd === 'u') return t('실행 취소 (Undo)');
  if (fullCmd.toLowerCase().includes('ctrl+r')) return t('다시 실행 (Redo)');

  // 3. 단순 단일/카운트 이동
  const countMatch = fullCmd.match(/^(\d+)?([hjklwbe0\^\$]|gg|G)$/);
  if (countMatch) {
    const count = countMatch[1] ? parseInt(countMatch[1], 10) : 1;
    const motion = countMatch[2];
    const countStr = count > 1 ? t(' {count}회', { count }) : '';

    switch (motion) {
      case 'h': return t('왼쪽으로{countStr} 이동', { countStr });
      case 'l': return t('오른쪽으로{countStr} 이동', { countStr });
      case 'j': return t('아래 줄로{countStr} 이동', { countStr });
      case 'k': return t('위 줄로{countStr} 이동', { countStr });
      case 'w': return t('다음 단어 시작으로{countStr} 이동', { countStr });
      case 'b': return t('이전 단어 시작으로{countStr} 이동', { countStr });
      case 'e': return t('단어 끝으로{countStr} 이동', { countStr });
      case '0': return t('줄 맨 앞으로 이동 (0)');
      case '^': return t('첫 글자로 이동 (^)');
      case '$': return t('줄 맨 끝으로 이동 ($)');
      case 'gg': return count > 1 ? t('{count}번째 줄로 이동', { count }) : t('문서 맨 처음으로 이동 (gg)');
      case 'G': return t('문서 맨 끝으로 이동 (G)');
    }
  }

  // 4. 문자 탐색 f, F, t, T
  if (/^[fFtT].$/.test(fullCmd)) {
    const target = fullCmd[1];
    if (fullCmd.startsWith('f')) return t('\'{target}\' 문자로 이동 (f)', { target });
    if (fullCmd.startsWith('F')) return t('이전 \'{target}\' 문자로 역방향 이동 (F)', { target });
    if (fullCmd.startsWith('t')) return t('\'{target}\' 직전으로 이동 (t)', { target });
    if (fullCmd.startsWith('T')) return t('이전 \'{target}\' 직후로 역방향 이동 (T)', { target });
  }
  if (fullCmd === ';') return t('직전 문자 탐색 반복 (;)');
  if (fullCmd === ',') return t('직전 문자 탐색 역방향 반복 (,)');
  if (fullCmd === '%') return t('짝 괄호로 점프 (%)');

  // 5. 삭제 (d, x, D)
  if (fullCmd === 'x') return t('한 글자 삭제 (x)');
  if (/^\d+x$/.test(fullCmd)) return t('{v}글자 삭제', { v: parseInt(fullCmd, 10) });
  if (fullCmd === 'D' || fullCmd === 'd$') return t('줄 끝까지 삭제 (D)');
  if (fullCmd === 'd0') return t('줄 시작까지 삭제 (d0)');
  if (fullCmd === 'dd') return t('현재 줄 삭제 (dd)');
  if (/^\d+dd$/.test(fullCmd)) return t('{v}줄 일괄 삭제', { v: parseInt(fullCmd, 10) });
  if (fullCmd === 'dw') return t('단어 앞부분 삭제 (dw)');
  if (fullCmd === 'de') return t('단어 끝까지 삭제 (de)');
  if (fullCmd === 'diw') return t('단어 내부 삭제 (diw)');
  if (fullCmd === 'daw') return t('단어 주변(공백 포함) 삭제 (daw)');
  if (fullCmd === 'di"') return t('따옴표 내부 삭제 (di")');
  if (fullCmd === 'da"') return t('따옴표 전체 삭제 (da")');
  if (fullCmd === 'di(' || fullCmd === 'dib') return t('괄호 내부 삭제 (di()');
  if (fullCmd === 'da(' || fullCmd === 'dab') return t('괄호 전체 삭제 (da()');
  if (fullCmd === 'di{' || fullCmd === 'diB') return t('중괄호 내부 삭제 (di{})');
  if (fullCmd === 'da{' || fullCmd === 'daB') return t('중괄호 전체 삭제 (da{})');

  // 6. 변경 세션 (c, s, C, S)
  if (fullCmd.startsWith('cw')) return t('단어 변경 (cw)');
  if (fullCmd.startsWith('ce')) return t('단어 끝까지 변경 (ce)');
  if (fullCmd.startsWith('ciw')) return t('단어 내부 내용 변경 (ciw)');
  if (fullCmd.startsWith('caw')) return t('단어 전체 내용 변경 (caw)');
  if (fullCmd.startsWith('ci"')) return t('따옴표 내부 내용 변경 (ci")');
  if (fullCmd.startsWith('da"')) return t('따옴표 전체 내용 변경 (da")');
  if (fullCmd.startsWith('ci(')) return t('괄호 내부 내용 변경 (ci()');
  if (fullCmd.startsWith('ci{')) return t('중괄호 내부 내용 변경 (ci{})');
  if (fullCmd.startsWith('c$') || fullCmd.startsWith('C')) return t('줄 끝까지 변경 (C)');
  if (fullCmd.startsWith('cc') || fullCmd.startsWith('S')) return t('줄 전체 비우고 새로 입력 (S/cc)');
  if (fullCmd.startsWith('s')) return t('글자 삭제 후 입력 (s)');
  if (fullCmd.startsWith('r')) return t('글자 교체 ({v})', { v: fullCmd.slice(0, 2) });

  // 7. 삽입 세션 (i, a, o, O, I, A)
  if (fullCmd.startsWith('i')) return t('현재 위치에서 텍스트 삽입 (i)');
  if (fullCmd.startsWith('a')) return t('다음 위치에서 텍스트 추가 (a)');
  if (fullCmd.startsWith('I')) return t('줄 첫 글자에서 텍스트 삽입 (I)');
  if (fullCmd.startsWith('A')) return t('줄 맨 끝에서 텍스트 추가 (A)');
  if (fullCmd.startsWith('o')) return t('아래 줄에 새 줄 열고 삽입 (o)');
  if (fullCmd.startsWith('O')) return t('윗 줄에 새 줄 열고 삽입 (O)');

  // 8. 복사 및 붙여넣기 (y, p, P)
  if (fullCmd === 'yw') return t('단어 복사 (yw)');
  if (fullCmd === 'yy') return t('현재 줄 복사 (yy)');
  if (fullCmd === 'yiw') return t('단어 내부 복사 (yiw)');
  if (fullCmd === 'p') return t('커서 뒤에 붙여넣기 (p)');
  if (fullCmd === 'P') return t('커서 앞에 붙여넣기 (P)');
  if (fullCmd.startsWith('"') && fullCmd.includes('p')) return t('레지스터 붙여넣기 ({fullCmd})', { fullCmd });
  if (fullCmd.startsWith('"') && fullCmd.includes('y')) return t('레지스터 복사 ({fullCmd})', { fullCmd });
  if (fullCmd.startsWith('"') && fullCmd.includes('d')) return t('레지스터 잘라내기 ({fullCmd})', { fullCmd });

  // 9. 비주얼 모드 블록
  if (fullCmd.startsWith('v') || fullCmd.startsWith('V')) {
    if (fullCmd.endsWith('d')) return t('비주얼 선택 영역 삭제');
    if (fullCmd.endsWith('y')) return t('비주얼 선택 영역 복사');
    return t('비주얼 선택 영역 조작');
  }

  // 10. 기타 기본
  return t('명령 실행 [{v}{v2}]', { v: fullCmd.slice(0, 10), v2: fullCmd.length > 10 ? '...' : '' });
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
    description: t('미션 초기 상태'),
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
  const isEn = getLocale() === 'en';

  const c1 = isEn ? '// 1. Initial text and cursor setup' : '// 1. 초기 텍스트 및 커서 설정';
  const c2 = isEn
    ? `// 2. User keystroke sequence (${allKeys.length} keys)`
    : `// 2. 사용자가 입력한 키 시퀀스 (${allKeys.length}타)`;
  const c3 = isEn ? '// 3. Initial engine state' : '// 3. 엔진 초기 상태';
  const c4 = isEn ? '// 4. Execute keys sequentially' : '// 4. 키 순차 실행';
  const c5 = isEn ? '// 5. Final verification (current editor state)' : '// 5. 최종 검증 (현재 에디터 결과값)';

  return `it('${testTitle}', () => {
  ${c1}
  const initialLines = ${JSON.stringify(initialLines, null, 2)};
  const initialCursor = { line: ${initialCursor.line}, col: ${initialCursor.col} };

  ${c2}
  const keys = ${JSON.stringify(allKeys)};

  ${c3}
  let state: VimEditorState = {
    lines: [...initialLines],
    cursor: { ...initialCursor },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
    registers: {},
  };

  ${c4}
  for (const key of keys) {
    state = handleKey(state, key);
  }

  ${c5}
  expect(state.lines).toEqual(${JSON.stringify(currentState.lines, null, 2)});
  expect(state.cursor).toEqual({ line: ${currentState.cursor.line}, col: ${currentState.cursor.col} });
  expect(state.mode).toBe('${currentState.mode}');
});`;
}
