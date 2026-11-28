import type { VimEditorState } from './types';

/**
 * 버퍼마다 따로 가져야 하는 상태(Vim 의 buffer-local 정보)를 파일별로 보관·복원합니다.
 *
 * 소문자·특수 마크(`'a`, `'^`, `'.`, `'[`, `'<` …), 변경 목록(`g;`/`g,`), 직전 비주얼 선택(`gv`),
 * 직전 삽입 위치(`gi`), 수동 폴드는 Vim 에서 버퍼 로컬입니다. 대문자·숫자 마크와 점프 리스트는 전역입니다.
 * 현재 파일이 바뀌면 이전 파일의 값을 `bufferLocalSnapshots` 에 넣고, 새 파일의 값을 꺼내옵니다
 * (처음 여는 파일은 빈 상태). Oil·터미널 같은 특수 버퍼도 파일명(`oil://…`, `term://…`)으로 구분됩니다.
 */
export type BufferLocalSnapshot = Pick<
  VimEditorState,
  | 'marks'
  | 'changeList'
  | 'changeIndex'
  | 'changeListNewChange'
  | 'lastInsertPos'
  | 'lastChangeMark'
  | 'lastBracketMarks'
  | 'lastVisualSelection'
  | 'folds'
>;

const isGlobalMark = (name: string) => /^[A-Z0-9]$/.test(name);

export function bufferLocalFileKey(state: Pick<VimEditorState, 'primaryFilename'>): string {
  return state.primaryFilename || 'source.ts';
}

function splitMarks(marks: VimEditorState['marks']) {
  const global: NonNullable<VimEditorState['marks']> = {};
  const local: NonNullable<VimEditorState['marks']> = {};
  for (const [name, pos] of Object.entries(marks ?? {})) {
    (isGlobalMark(name) ? global : local)[name] = pos;
  }
  return { global, local };
}

/**
 * `prev`(전환 전 상태) → `next`(전환 후 상태)에서 현재 파일이 바뀌었으면 버퍼 로컬 상태를 교체합니다.
 * 이미 맞춰진 상태에 다시 호출해도 아무것도 바꾸지 않습니다.
 */
export function syncBufferLocalState(prev: VimEditorState, next: VimEditorState): VimEditorState {
  const owner = next.bufferLocalOwner ?? bufferLocalFileKey(prev);
  const fileKey = bufferLocalFileKey(next);
  if (owner === fileKey) {
    return next.bufferLocalOwner === fileKey ? next : { ...next, bufferLocalOwner: fileKey };
  }

  const { global, local } = splitMarks(next.marks);
  const saved: BufferLocalSnapshot = {
    marks: local,
    changeList: next.changeList,
    changeIndex: next.changeIndex,
    changeListNewChange: next.changeListNewChange,
    lastInsertPos: next.lastInsertPos,
    lastChangeMark: next.lastChangeMark,
    lastBracketMarks: next.lastBracketMarks,
    lastVisualSelection: next.lastVisualSelection,
    folds: next.folds,
  };
  const restored = next.bufferLocalSnapshots?.[fileKey];
  const restoredMarks = { ...global, ...(restored?.marks ?? {}) };

  return {
    ...next,
    marks: Object.keys(restoredMarks).length > 0 ? restoredMarks : undefined,
    changeList: restored?.changeList,
    changeIndex: restored?.changeIndex,
    changeListNewChange: restored?.changeListNewChange,
    lastInsertPos: restored?.lastInsertPos ?? null,
    lastChangeMark: restored?.lastChangeMark ?? null,
    lastBracketMarks: restored?.lastBracketMarks ?? null,
    lastVisualSelection: restored?.lastVisualSelection ?? null,
    folds: restored?.folds,
    bufferLocalSnapshots: { ...next.bufferLocalSnapshots, [owner]: saved },
    bufferLocalOwner: fileKey,
  };
}
