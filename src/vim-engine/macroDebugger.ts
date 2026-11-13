import { VimEditorState } from './types';
import { handleKey } from './vimEngine';
import { parseMacroStringToKeys } from './registers';

/**
 * 매크로 슬로우모션 디버거 엔진 (MacroDebugger)
 *
 * `[count]@{reg}` 실행을 키 하나 단위의 프레임으로 분해하여,
 * 각 키가 적용된 직후의 불변 상태 스냅샷을 순서대로 기록합니다.
 * 실제 `@{reg}` 실행과 동일하게 macroDepth=1 로 handleKey를 호출하므로
 * 녹화 중 키 누적, 키매핑 재귀 등이 실제 실행과 동일하게 재현됩니다.
 */

export interface MacroFrame {
  /** 0 = 실행 전 초기 상태, 1..N = N번째 키 적용 직후 */
  index: number;
  /** 이 프레임에서 적용된 키 (초기 프레임은 null) */
  key: string | null;
  /** 몇 번째 반복인지 (0-based, 초기 프레임은 -1) */
  iteration: number;
  /** 반복 내에서의 키 위치 (0-based, 초기 프레임은 -1) */
  keyIndex: number;
  /** 키 적용 직후의 에디터 상태 */
  state: VimEditorState;
  /** 직전 프레임 대비 버퍼 텍스트가 변경되었는지 여부 */
  changed: boolean;
  /** 이 키에서 모션이 실패하여 매크로가 중단되었는지 여부 (실제 Vim과 동일하게 이후 키는 실행되지 않음) */
  failed: boolean;
}

export interface MacroTrace {
  register: string;
  keys: string[];
  count: number;
  frames: MacroFrame[];
  /** 모션 실패로 매크로가 중간에 중단되었는지 여부 */
  aborted: boolean;
}

/** 매크로 레지스터 이름 정규화: 대문자 레지스터(qA로 이어 녹화)는 소문자 레지스터에 저장됩니다. */
export function normalizeMacroRegister(register: string): string | null {
  if (!/^[a-zA-Z0-9]$/.test(register)) return null;
  return register.toLowerCase();
}

/** 레지스터에 저장된 매크로 키 시퀀스를 반환합니다. 매크로가 없으면 빈 배열을 반환합니다. */
export function getMacroKeys(state: VimEditorState, register: string): string[] {
  const reg = normalizeMacroRegister(register);
  if (!reg) return [];
  const entry = state.registers?.[reg];
  if (!entry || !entry.content) return [];
  return Array.isArray(entry.content)
    ? [...entry.content]
    : parseMacroStringToKeys(entry.content);
}

/** 재생 가능한 매크로(type === 'macro') 레지스터 이름 목록을 정렬하여 반환합니다. */
export function listMacroRegisters(state: VimEditorState): string[] {
  const regs = state.registers ?? {};
  return Object.keys(regs)
    .filter((k) => regs[k]?.type === 'macro' && getMacroKeys(state, k).length > 0)
    .sort();
}

/**
 * `[count]@{register}` 실행을 프레임 단위로 추적합니다.
 * 원본 state는 변경되지 않으며, 마지막 프레임의 상태는 `handleKey`로 `@{register}`를 실행한 결과와 같습니다.
 */
export function buildMacroTrace(state: VimEditorState, register: string, count = 1): MacroTrace {
  const reg = normalizeMacroRegister(register) ?? register;
  const keys = getMacroKeys(state, reg);
  const repeat = Math.max(1, Math.floor(count));

  const initial: VimEditorState = {
    ...state,
    pendingKeys: undefined,
    lastPlayedMacro: reg,
  };

  const frames: MacroFrame[] = [
    { index: 0, key: null, iteration: -1, keyIndex: -1, state: initial, changed: false, failed: false },
  ];

  if (keys.length === 0) {
    return { register: reg, keys, count: repeat, frames, aborted: false };
  }

  let cur = initial;
  let aborted = false;
  for (let it = 0; it < repeat && !aborted; it++) {
    for (let ki = 0; ki < keys.length; ki++) {
      const k = keys[ki];
      const next = handleKey(cur, k, false, 1);
      // 실제 @{reg} 실행과 동일하게 키가 실패(bell)하면 매크로를 중단합니다.
      aborted = !!next.bell;
      frames.push({
        index: frames.length,
        key: k,
        iteration: it,
        keyIndex: ki,
        state: next,
        changed: next.lines !== cur.lines && next.lines.join('\n') !== cur.lines.join('\n'),
        failed: aborted,
      });
      cur = next;
      if (aborted) break;
    }
  }

  // 실제 @{reg} 실행 결과와 동일하게 마지막 재생 레지스터를 유지합니다.
  const last = frames[frames.length - 1];
  frames[frames.length - 1] = { ...last, state: { ...last.state, lastPlayedMacro: reg } };

  return { register: reg, keys, count: repeat, frames, aborted };
}

/** 재생 속도 배율별 프레임 간 딜레이(ms). 1x = 300ms 기준입니다. */
export const MACRO_PLAYBACK_SPEEDS = [
  { label: '1x', delayMs: 300 },
  { label: '0.5x', delayMs: 600 },
  { label: '0.2x', delayMs: 1500 },
] as const;

/** 프레임 인덱스를 trace 범위 안으로 제한합니다. */
export function clampFrameIndex(trace: MacroTrace, index: number): number {
  return Math.max(0, Math.min(trace.frames.length - 1, index));
}

/**
 * 프레임에서 실행된 키의 동작과 의미를 사람이 이해하기 쉽게 해설합니다. (대화형 매크로 튜터용)
 */
export function explainMacroKeyAction(
  key: string | null,
  prevState?: VimEditorState | null,
  nextState?: VimEditorState | null
): string {
  if (!key) return '실행 전 초기 상태';

  if (prevState && prevState.mode === 'INSERT' && nextState && nextState.mode === 'INSERT') {
    if (key === 'Enter') return '줄바꿈 문자 삽입 (새 줄 생성)';
    if (key === 'Backspace') return '커서 앞 문자 삭제 (백스페이스)';
    if (key === 'Tab') return '들여쓰기 탭/공백 삽입';
    if (key === ' ') return '공백 문자 삽입';
    return `문자 "${key}" 타이핑 입력`;
  }

  switch (key) {
    case 'j':
      return prevState && prevState.cursor.line >= prevState.lines.length - 1
        ? '버퍼 끝 도달 (더 이상 아래로 이동 불가)'
        : '한 줄 아래로 이동';
    case 'k':
      return prevState && prevState.cursor.line === 0
        ? '버퍼 시작 도달 (더 이상 위로 이동 불가)'
        : '한 줄 위로 이동';
    case 'h':
      return '왼쪽으로 1칸 이동';
    case 'l':
      return '오른쪽으로 1칸 이동';
    case 'w':
      return '다음 단어의 첫 글자로 점프';
    case 'b':
      return '이전 단어의 첫 글자로 점프';
    case 'e':
      return '현재/다음 단어의 끝 글자로 점프';
    case '$':
      return '현재 줄의 맨 마지막 글자로 점프';
    case '^':
      return '현재 줄의 첫 번째 비공백 글자로 점프';
    case '0':
      return '현재 줄의 0번 컬럼(맨 앞)으로 이동';
    case 'i':
      return '커서 위치에서 입력(Insert) 모드 진입';
    case 'a':
      return '커서 다음 칸에서 입력(Insert) 모드 진입 (Append)';
    case 'A':
      return '줄 끝으로 이동하여 입력 모드 진입';
    case 'I':
      return '줄 첫 글자로 이동하여 입력 모드 진입';
    case 'o':
      return '아래에 새 줄을 만들고 입력 모드 진입';
    case 'O':
      return '위에 새 줄을 만들고 입력 모드 진입';
    case 'Escape':
      return '노멀(Normal) 모드로 복귀 및 편집 완료';
    case 'x':
      return '커서 위치의 문자 1개 삭제';
    case 'p':
      return '복사/삭제한 내용을 커서 뒤에 붙여넣기';
    case 'P':
      return '복사/삭제한 내용을 커서 앞에 붙여넣기';
    case 'u':
      return '직전 작업 실행 취소 (Undo)';
    case '.':
      return '직전 변경 작업 반복 (Dot Repeat)';
    case '~':
      return '현재 글자의 대소문자 반전';
    case 'J':
      return '아래 줄을 현재 줄 끝으로 끌어올려 병합 (Join)';
    case ' ':
      return '오른쪽으로 1칸 이동';
    case 'Enter':
      return '다음 줄의 첫 글자로 이동';
    default:
      if (nextState?.bell) {
        return `키 "${key}" 실행 실패 (bell 발생)`;
      }
      if (nextState && prevState && nextState.lines.join('\n') !== prevState.lines.join('\n')) {
        return `키 "${key}" 실행 (버퍼 내용 변경)`;
      }
      return `키 "${key}" 실행 (커서 이동 / 모드 변경)`;
  }
}

/**
 * 매크로가 중간에 중단되었을 때(failed: true), 실패 원인을 상세히 진단합니다.
 */
export function getMacroFailureReason(
  frame: MacroFrame,
  prevFrame?: MacroFrame | null
): string {
  if (!frame.failed) return '';
  const key = frame.key;
  const prevState = prevFrame?.state;

  if (key === 'j' && prevState && prevState.cursor.line >= prevState.lines.length - 1) {
    return '버퍼의 마지막 줄에서 j 모션을 실행하여 이동에 실패했습니다. (Vim 매크로는 모션 실패 시 즉시 종료됩니다)';
  }
  if (key === 'k' && prevState && prevState.cursor.line === 0) {
    return '버퍼의 첫 번째 줄에서 k 모션을 실행하여 위로 이동할 수 없습니다.';
  }
  if (key === 'h' && prevState && prevState.cursor.col === 0) {
    return '줄의 맨 처음에서 h 모션을 실행하여 왼쪽으로 이동할 수 없습니다.';
  }

  return `키 "${key}" 실행 중 유효하지 않은 동작으로 인해 Vim 실패 신호(bell)가 발생하여 매크로가 안전하게 중단되었습니다.`;
}
