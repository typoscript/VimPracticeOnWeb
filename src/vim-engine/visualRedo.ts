import { VimEditorState } from './types';
import { CURSWANT_EOL } from './curswant';
import { getGlobalOptions } from './setOptionsCore';

/**
 * `.` 로 비주얼 연산을 반복할 때 같은 크기의 영역을 직접 다시 고릅니다 (Vim do_pending_operator 의 redo_VIsual).
 * 반복 키의 앞부분(`Ctrl-v 2j 11l`, `v 2j 0 5l`)을 키로 재생하면 짧은 줄에서 `l` 이 실패하거나 줄 끝에서 멈춰
 * 블록이 좁아집니다. Vim 은 블록 끝 열을 `시작 열 + 너비 - 1` 로 정하고(줄 길이와 무관),
 * 여러 줄 문자 단위는 마지막 줄의 같은 열(줄이 짧으면 줄 끝)까지 고릅니다. 줄 수는 버퍼 끝에서 잘립니다.
 *
 * 블록이 줄 끝을 넘으면 그동안만 'virtualedit' 에 block 을 더해 커서를 그 열에 둡니다 (`restore` 가 되돌림).
 * 줄 단위(V)·한 줄 문자 단위는 키 재생 그대로 둡니다 (null).
 */
export function reselectVisualForRedo(
  state: VimEditorState,
  keys: readonly string[]
): { state: VimEditorState; rest: readonly string[]; restore: (s: VimEditorState) => VimEditorState } | null {
  const head = keys[0];
  if (head !== 'Ctrl-v' && head !== 'v') return null;
  let i = 1;
  const readCount = (motion: string): number | null => {
    let j = i;
    while (j < keys.length && /^[0-9]$/.test(keys[j])) j++;
    if (j === i || keys[j] !== motion) return null;
    const n = Number(keys.slice(i, j).join(''));
    i = j + 1;
    return n;
  };
  const lineCount = readCount('j') ?? 0;
  const top = state.cursor.line;
  const bottom = Math.min(state.lines.length - 1, top + lineCount);
  const bottomText = state.lines[bottom] ?? '';
  const identity = (s: VimEditorState) => s;

  if (head === 'v') {
    if (lineCount === 0 || keys[i] !== '0') return null;
    i++;
    const endCol = readCount('l') ?? 0;
    const col = Math.max(0, Math.min(endCol, bottomText.length - 1));
    return {
      state: { ...state, mode: 'VISUAL', visualAnchor: { ...state.cursor }, cursor: { line: bottom, col }, curswant: endCol, pendingKeys: undefined },
      rest: keys.slice(i),
      restore: identity,
    };
  }

  if (keys[i] === '$') {
    i++;
    return {
      state: {
        ...state,
        mode: 'VISUAL_BLOCK',
        visualAnchor: { ...state.cursor },
        cursor: { line: bottom, col: Math.max(0, bottomText.length - 1) },
        visualBlockEndOfLine: true,
        curswant: CURSWANT_EOL,
        pendingKeys: undefined,
      },
      rest: keys.slice(i),
      restore: identity,
    };
  }
  const width = readCount('l') ?? 0;
  const col = state.cursor.col + width;
  const reselected: VimEditorState = {
    ...state,
    mode: 'VISUAL_BLOCK',
    visualAnchor: { ...state.cursor },
    cursor: { line: bottom, col },
    visualBlockEndOfLine: undefined,
    pendingKeys: undefined,
  };
  if (col <= Math.max(0, bottomText.length - 1)) return { state: reselected, rest: keys.slice(i), restore: identity };
  // 블록 오른쪽 끝이 마지막 줄 밖: 그동안만 virtualedit=block (Vim 은 redo 때 end_vcol 을 너비로 정함)
  const savedOptions = state.options;
  const savedGlobal = state.globalOptions;
  const base = getGlobalOptions(state);
  const ve = base.virtualedit ? `${base.virtualedit},block` : 'block';
  return {
    state: {
      ...reselected,
      globalOptions: { ...base, virtualedit: ve },
      ...(state.options ? { options: { ...state.options, virtualedit: ve } } : {}),
    },
    rest: keys.slice(i),
    restore: (s) => ({ ...s, options: savedOptions, globalOptions: savedGlobal }),
  };
}
