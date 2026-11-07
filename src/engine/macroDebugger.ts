import { VimEditorState } from '../types/vim';
import { handleKey } from './vimEngine';

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
}

export interface MacroTrace {
  register: string;
  keys: string[];
  count: number;
  frames: MacroFrame[];
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
  return Array.isArray(entry.content) ? [...entry.content] : [entry.content];
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
    { index: 0, key: null, iteration: -1, keyIndex: -1, state: initial, changed: false },
  ];

  if (keys.length === 0) {
    return { register: reg, keys, count: repeat, frames };
  }

  let cur = initial;
  for (let it = 0; it < repeat; it++) {
    keys.forEach((k, ki) => {
      const next = handleKey(cur, k, false, 1);
      frames.push({
        index: frames.length,
        key: k,
        iteration: it,
        keyIndex: ki,
        state: next,
        changed: next.lines !== cur.lines && next.lines.join('\n') !== cur.lines.join('\n'),
      });
      cur = next;
    });
  }

  // 실제 @{reg} 실행 결과와 동일하게 마지막 재생 레지스터를 유지합니다.
  const last = frames[frames.length - 1];
  frames[frames.length - 1] = { ...last, state: { ...last.state, lastPlayedMacro: reg } };

  return { register: reg, keys, count: repeat, frames };
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
