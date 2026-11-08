import { describe, it, expect } from 'vitest';
import { VimEditorState } from './types';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';
import {
  ensureUndoTreeInitialized,
  recordUndoTreeChange,
  travelUndoTime,
  travelEarlier,
  travelLater,
  jumpUndoSeq,
  formatUndoList,
  recordFileSave,
} from './undoTreeEngine';

describe('Vim 순정 Undo Tree 시간 여행 엔진 (undoTreeEngine)', () => {
  it('초기 버퍼 상태에서 ensureUndoTreeInitialized 호출 시 루트 노드(seq 0)가 생성된다', () => {
    const state: VimEditorState = {
      lines: ['initial text'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    const initialized = ensureUndoTreeInitialized(state);
    expect(initialized.undoTreeNodes).toBeDefined();
    expect(initialized.undoTreeNodes![0]).toBeDefined();
    expect(initialized.undoTreeNodes![0].seq).toBe(0);
    expect(initialized.undoTreeNodes![0].parentSeq).toBeNull();
    expect(initialized.undoTreeNodes![0].lines).toEqual(['initial text']);
    expect(initialized.currentUndoSeq).toBe(0);
    expect(initialized.maxUndoSeq).toBe(0);
    expect(initialized.undoTimeHistory).toEqual([0]);
    expect(initialized.undoTimeIndex).toBe(0);
  });

  it('버퍼 변경 시 새로운 노드가 등록되며, undo 후 다른 편집 시 브랜치(Branch)가 생성된다', () => {
    // 1. 초기 상태: Seq 0
    let state: VimEditorState = {
      lines: ['Hello'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    state = ensureUndoTreeInitialized(state);

    // 2. 첫 번째 변경: Seq 1 ("Hello World")
    state = {
      ...state,
      lines: ['Hello World'],
    };
    state = recordUndoTreeChange(state);
    expect(state.currentUndoSeq).toBe(1);
    expect(state.undoTreeNodes![1].parentSeq).toBe(0);
    expect(state.undoTreeNodes![1].lines).toEqual(['Hello World']);
    expect(state.undoTimeHistory).toEqual([0, 1]);

    // 3. 실행 취소 (u): Seq 0 ("Hello")으로 복귀
    state = handleKey(state, 'u');
    expect(state.lines).toEqual(['Hello']);
    expect(state.currentUndoSeq).toBe(0);

    // 4. 두 번째 변경: Seq 2 ("Hello Vim") - Seq 0에서 분기된 새로운 브랜치!
    state = {
      ...state,
      lines: ['Hello Vim'],
    };
    state = recordUndoTreeChange(state);
    expect(state.currentUndoSeq).toBe(2);
    // Seq 2의 부모는 Seq 1이 아니라 Seq 0이어야 함! (브랜치 형성)
    expect(state.undoTreeNodes![2].parentSeq).toBe(0);
    expect(state.undoTreeNodes![2].lines).toEqual(['Hello Vim']);
    // 시간 이력에는 발생 순서대로 [0, 1, 2]로 누적
    expect(state.undoTimeHistory).toEqual([0, 1, 2]);
    expect(state.undoTimeIndex).toBe(2);
  });

  it('g- 키와 travelUndoTime으로 브랜치를 가로질러 절대 시간 역순으로 여행할 수 있다', () => {
    // Seq 0: ["A"]
    // Seq 1: ["A", "B"] (branch 1)
    // Seq 2: ["A", "C"] (branch 2, parent is 0)
    let state: VimEditorState = {
      lines: ['A'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    state = ensureUndoTreeInitialized(state);

    state = { ...state, lines: ['A', 'B'] };
    state = recordUndoTreeChange(state); // seq 1

    state = handleKey(state, 'u'); // back to seq 0

    state = { ...state, lines: ['A', 'C'] };
    state = recordUndoTreeChange(state); // seq 2

    expect(state.lines).toEqual(['A', 'C']);
    expect(state.currentUndoSeq).toBe(2);

    // g-: 선형 redo로는 갈 수 없는 이전 브랜치 Seq 1로 시간 여행!
    state = travelUndoTime(state, 'older');
    expect(state.lines).toEqual(['A', 'B']);
    expect(state.currentUndoSeq).toBe(1);

    // g- 한 번 더: Seq 0으로 이동
    state = travelUndoTime(state, 'older');
    expect(state.lines).toEqual(['A']);
    expect(state.currentUndoSeq).toBe(0);

    // 가장 오래된 상태에서 g- 입력 시 경고 피드백
    state = travelUndoTime(state, 'older');
    expect(state.commandMessage).toBe('이미 가장 오래된 변경사항입니다.');
    expect(state.currentUndoSeq).toBe(0);

    // g+: 시간 순방향으로 Seq 1 -> Seq 2 복귀
    state = travelUndoTime(state, 'newer');
    expect(state.lines).toEqual(['A', 'B']);
    expect(state.currentUndoSeq).toBe(1);

    state = travelUndoTime(state, 'newer');
    expect(state.lines).toEqual(['A', 'C']);
    expect(state.currentUndoSeq).toBe(2);

    // 가장 최신 상태에서 g+ 입력 시 피드백
    state = travelUndoTime(state, 'newer');
    expect(state.commandMessage).toBe('이미 가장 최신 변경사항입니다.');
  });

  it(':undo {seq} 명령으로 원하는 변경 번호로 즉시 점프하고 u로 선형 복귀할 수 있다', () => {
    let state: VimEditorState = {
      lines: ['Original'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    state = ensureUndoTreeInitialized(state);

    state = { ...state, lines: ['Branch 1 Line'] };
    state = recordUndoTreeChange(state); // seq 1

    state = handleKey(state, 'u');

    state = { ...state, lines: ['Branch 2 Line'] };
    state = recordUndoTreeChange(state); // seq 2

    // :undo 1 실행
    const jumped = jumpUndoSeq(state, 1);
    expect(jumped.lines).toEqual(['Branch 1 Line']);
    expect(jumped.currentUndoSeq).toBe(1);
    // 재구성된 undoStack 덕분에 'u'를 누르면 부모(Seq 0)로 정상 복귀
    const undone = handleKey(jumped, 'u');
    expect(undone.lines).toEqual(['Original']);
    expect(undone.currentUndoSeq).toBe(0);

    // 존재하지 않는 seq 점프 시 오류 메시지
    const notFound = jumpUndoSeq(state, 999);
    expect(notFound.commandMessage).toContain('E830');
  });

  it(':earlier 및 :later 명령으로 변경 수, 시간, 파일 저장 단위로 시간 여행을 수행한다', () => {
    let state: VimEditorState = {
      lines: ['Start'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    state = ensureUndoTreeInitialized(state);

    // 1. Seq 1 변경 및 저장(:w)
    state = { ...state, lines: ['Saved Step 1'] };
    state = recordUndoTreeChange(state);
    state = recordFileSave(state);
    expect(state.undoTreeNodes![1].saveNumber).toBe(1);

    // 2. Seq 2 변경 (저장 안 됨)
    state = { ...state, lines: ['Unsaved Step 2'] };
    state = recordUndoTreeChange(state);

    // 3. :earlier 1f -> 저장된 상태(Seq 1)로 즉시 복귀!
    const atSave = travelEarlier(state, '1f');
    expect(atSave.lines).toEqual(['Saved Step 1']);
    expect(atSave.currentUndoSeq).toBe(1);

    // 4. :later 1 -> 다시 Seq 2로 이동
    const atLater = travelLater(atSave, '1');
    expect(atLater.lines).toEqual(['Unsaved Step 2']);
    expect(atLater.currentUndoSeq).toBe(2);

    // 5. :earlier 10s -> 과거 시간 상태로 이동
    const atSec = travelEarlier(atLater, '10s');
    expect(atSec.currentUndoSeq).toBe(0);
  });

  it(':undolist 명령이 리프(Leaf) 노드 목록을 Vim 표준 포맷으로 서식화하여 반환한다', () => {
    let state: VimEditorState = {
      lines: ['Root'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    state = ensureUndoTreeInitialized(state);

    // Leaf 1: Seq 1
    state = { ...state, lines: ['Branch 1'] };
    state = recordUndoTreeChange(state);
    state = recordFileSave(state);

    // Root로 돌아가서 Leaf 2: Seq 2
    state = handleKey(state, 'u');
    state = { ...state, lines: ['Branch 2'] };
    state = recordUndoTreeChange(state);

    const listStr = formatUndoList(state);
    expect(listStr).toContain('number changes  when               saved');
    expect(listStr).toContain('1'); // Seq 1 리프 노드
    expect(listStr).toContain('2'); // Seq 2 리프 노드
  });

  it('handleKey를 통해 g-, g+, 2g- 및 Ex 명령행 연동이 완벽하게 작동한다', () => {
    let state: VimEditorState = {
      lines: ['initial'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    // 1. A 입력 -> ' modified 1' -> Escape
    state = handleKey(state, 'A');
    for (const ch of ' modified 1') {
      state = handleKey(state, ch);
    }
    state = handleKey(state, 'Escape');
    expect(state.lines).toEqual(['initial modified 1']);
    const seq1 = state.currentUndoSeq;

    // 2. 실행 취소 'u' -> 'initial'
    state = handleKey(state, 'u');
    expect(state.lines).toEqual(['initial']);

    // 3. A 입력 -> ' branch 2' -> Escape
    state = handleKey(state, 'A');
    for (const ch of ' branch 2') {
      state = handleKey(state, ch);
    }
    state = handleKey(state, 'Escape');
    expect(state.lines).toEqual(['initial branch 2']);
    const seq2 = state.currentUndoSeq;
    expect(seq2).not.toBe(seq1);

    // 4. 'g' 누르고 '-' 입력 -> Seq 1로 시간 여행!
    state = handleKey(state, 'g');
    state = handleKey(state, '-');
    expect(state.lines).toEqual(['initial modified 1']);

    // 5. 'g' 누르고 '+' 입력 -> Seq 2로 시간 여행!
    state = handleKey(state, 'g');
    state = handleKey(state, '+');
    expect(state.lines).toEqual(['initial branch 2']);

    // 6. Ex 커맨드: :earlier 1
    state = executeCommandLine(state, 'earlier 1');
    expect(state.lines).toEqual(['initial modified 1']);

    // 7. Ex 커맨드: :later 1
    state = executeCommandLine(state, 'later 1');
    expect(state.lines).toEqual(['initial branch 2']);

    // 8. Ex 커맨드: :undolist
    state = executeCommandLine(state, 'undolist');
    expect(state.commandMessage).toContain('number changes');

    // 9. Ex 커맨드: :undo 0
    state = executeCommandLine(state, 'undo 0');
    expect(state.lines).toEqual(['initial']);
  });
});
