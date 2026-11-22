import { CursorPosition, VimEditorState, VimMode, handleKey } from '../vim-engine';

export interface GolfReplayFrame {
  step: number;
  key: string | null;
  displayKey: string;
  lines: string[];
  cursor: CursorPosition;
  mode: VimMode;
  changedLines: number[];
}

export interface GolfComparisonSummary {
  userKeystrokes: number;
  optimalKeystrokes: number;
  delta: number;
  efficiencyPct: number;
  firstDivergenceStep: number | null;
  userRedundantMotionStreaks: number;
}

/**
 * 엔진 키 이름을 사람이 읽기 쉬운 Vim 표기(<Esc>, <CR>, <C-a> 등)로 변환합니다.
 */
export function formatReplayKey(key: string): string {
  if (key === 'Escape') return '<Esc>';
  if (key === 'Enter') return '<CR>';
  if (key === 'Backspace') return '<BS>';
  if (key === 'Tab') return '<Tab>';
  if (key === 'Shift-Tab') return '<S-Tab>';
  if (key === ' ') return '<Space>';
  if (key.startsWith('Ctrl-')) return `<C-${key.slice(5)}>`;
  if (key.startsWith('Alt-')) return `<A-${key.slice(4)}>`;
  if (key === 'ArrowUp') return '<Up>';
  if (key === 'ArrowDown') return '<Down>';
  if (key === 'ArrowLeft') return '<Left>';
  if (key === 'ArrowRight') return '<Right>';
  return key;
}

function diffChangedLineIndices(prevLines: string[], nextLines: string[]): number[] {
  const maxLen = Math.max(prevLines.length, nextLines.length);
  const changed: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    if (prevLines[i] !== nextLines[i]) {
      changed.push(i);
    }
  }
  return changed;
}

/**
 * 초기 VimEditorState 에서 키 배열을 한 타씩 실행해 프레임 시퀀스를 생성합니다.
 */
export function buildGolfReplayTrace(
  initialState: VimEditorState,
  keys: readonly string[]
): GolfReplayFrame[] {
  const frames: GolfReplayFrame[] = [
    {
      step: 0,
      key: null,
      displayKey: 'START',
      lines: [...initialState.lines],
      cursor: { ...initialState.cursor },
      mode: initialState.mode,
      changedLines: [],
    },
  ];

  let cur = initialState;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const prevLines = cur.lines;
    cur = handleKey(cur, k);
    frames.push({
      step: i + 1,
      key: k,
      displayKey: formatReplayKey(k),
      lines: [...cur.lines],
      cursor: { ...cur.cursor },
      mode: cur.mode,
      changedLines: diffChangedLineIndices(prevLines, cur.lines),
    });
  }

  return frames;
}

/**
 * 사용자 풀이와 최적 해법(optimalKeys)의 키 시퀀스를 비교해 효율·첫 분기점·연타 습관을 요약합니다.
 */
export function compareGolfRuns(
  userKeys: readonly string[],
  optimalKeys: readonly string[]
): GolfComparisonSummary {
  const userKeystrokes = userKeys.length;
  const optimalKeystrokes = optimalKeys.length;
  const delta = userKeystrokes - optimalKeystrokes;
  const efficiencyPct =
    userKeystrokes === 0
      ? 100
      : Math.min(100, Math.round((optimalKeystrokes / userKeystrokes) * 100));

  let firstDivergenceStep: number | null = null;
  const minLen = Math.min(userKeystrokes, optimalKeystrokes);
  for (let i = 0; i < minLen; i++) {
    if (userKeys[i] !== optimalKeys[i]) {
      firstDivergenceStep = i + 1;
      break;
    }
  }
  if (firstDivergenceStep === null && userKeystrokes !== optimalKeystrokes) {
    firstDivergenceStep = minLen + 1;
  }

  // h/j/k/l 3연속 이상 연타 횟수 감지
  let userRedundantMotionStreaks = 0;
  let streakChar = '';
  let streakCount = 0;
  for (const k of userKeys) {
    if (k === 'h' || k === 'j' || k === 'k' || k === 'l') {
      if (k === streakChar) {
        streakCount += 1;
        if (streakCount === 3) {
          userRedundantMotionStreaks += 1;
        }
      } else {
        streakChar = k;
        streakCount = 1;
      }
    } else {
      streakChar = '';
      streakCount = 0;
    }
  }

  return {
    userKeystrokes,
    optimalKeystrokes,
    delta,
    efficiencyPct,
    firstDivergenceStep,
    userRedundantMotionStreaks,
  };
}
