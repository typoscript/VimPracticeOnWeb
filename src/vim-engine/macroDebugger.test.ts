import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import {
  buildMacroTrace,
  getMacroKeys,
  listMacroRegisters,
  normalizeMacroRegister,
  clampFrameIndex,
  explainMacroKeyAction,
  getMacroFailureReason,
} from './macroDebugger';
import type { VimEditorState } from './types';

function createState(lines: string[], cursor = { line: 0, col: 0 }): VimEditorState {
  return {
    lines,
    cursor,
    mode: 'NORMAL',
  };
}

function press(state: VimEditorState, keys: string[]): VimEditorState {
  return keys.reduce((s, k) => handleKey(s, k), state);
}

/** qa I- <Esc> j q : 줄 앞에 "- "를 붙이고 다음 줄로 이동하는 매크로 녹화 */
const RECORD_BULLET = ['q', 'a', 'I', '-', ' ', 'Escape', 'j', 'q'];

describe('MacroDebugger Engine: 매크로 프레임 분해', () => {
  it('레지스터 이름을 정규화하고 매크로 키 시퀀스를 읽는다', () => {
    expect(normalizeMacroRegister('A')).toBe('a');
    expect(normalizeMacroRegister('3')).toBe('3');
    expect(normalizeMacroRegister('"')).toBeNull();

    const state = press(createState(['apple', 'banana']), RECORD_BULLET);
    expect(getMacroKeys(state, 'a')).toEqual(['I', '-', ' ', 'Escape', 'j']);
    expect(getMacroKeys(state, 'A')).toEqual(['I', '-', ' ', 'Escape', 'j']);
    expect(getMacroKeys(state, 'b')).toEqual([]);
    expect(listMacroRegisters(state)).toEqual(['a']);
  });

  it('각 키 적용 직후의 상태 스냅샷을 프레임으로 기록한다', () => {
    const recorded = press(createState(['apple', 'banana', 'cherry']), RECORD_BULLET);
    const trace = buildMacroTrace(recorded, 'a');

    expect(trace.keys).toEqual(['I', '-', ' ', 'Escape', 'j']);
    expect(trace.frames).toHaveLength(6);
    expect(trace.frames[0].key).toBeNull();
    expect(trace.frames[0].state.lines[1]).toBe('banana');

    // I 직후 INSERT 모드
    expect(trace.frames[1].key).toBe('I');
    expect(trace.frames[1].state.mode).toBe('INSERT');
    expect(trace.frames[1].changed).toBe(false);

    // '-' 입력 직후 버퍼 변경
    expect(trace.frames[2].state.lines[1]).toBe('-banana');
    expect(trace.frames[2].changed).toBe(true);

    // Escape 후 NORMAL, j 후 다음 줄
    expect(trace.frames[4].state.mode).toBe('NORMAL');
    expect(trace.frames[5].state.cursor.line).toBe(2);
  });

  it('마지막 프레임은 실제 @a 실행 결과와 동일하다 (카운트 포함)', () => {
    const recorded = press(createState(['a', 'b', 'c', 'd', 'e']), RECORD_BULLET);

    const real = press(recorded, ['3', '@', 'a']);
    const trace = buildMacroTrace(recorded, 'a', 3);
    const last = trace.frames[trace.frames.length - 1];

    expect(trace.frames).toHaveLength(1 + 3 * 5);
    expect(last.iteration).toBe(2);
    expect(last.keyIndex).toBe(4);
    expect(last.state.lines).toEqual(real.lines);
    expect(last.state.cursor).toEqual(real.cursor);
    expect(last.state.lastPlayedMacro).toBe('a');
  });

  it('원본 상태를 변경하지 않으며, 빈 레지스터는 초기 프레임만 반환한다', () => {
    const recorded = press(createState(['x', 'y']), RECORD_BULLET);
    const snapshot = JSON.stringify(recorded.lines);
    buildMacroTrace(recorded, 'a', 2);
    expect(JSON.stringify(recorded.lines)).toBe(snapshot);

    const empty = buildMacroTrace(createState(['x']), 'z');
    expect(empty.frames).toHaveLength(1);
    expect(empty.keys).toEqual([]);
  });

  it('프레임 인덱스를 범위 안으로 제한한다', () => {
    const recorded = press(createState(['x', 'y']), RECORD_BULLET);
    const trace = buildMacroTrace(recorded, 'a');
    expect(clampFrameIndex(trace, -5)).toBe(0);
    expect(clampFrameIndex(trace, 999)).toBe(trace.frames.length - 1);
  });

  it('모션이 실패한 프레임에서 추적을 멈추고 실제 실행 결과와 일치한다', () => {
    const recorded = press(createState(['abc', 'abc', 'abc']), ['q', 'a', 'x', 'j', 'q']);
    const trace = buildMacroTrace(recorded, 'a', 10);
    const real = press(recorded, ['1', '0', '@', 'a']);
    const last = trace.frames[trace.frames.length - 1];

    expect(trace.aborted).toBe(true);
    // 2번째 줄: x, j / 3번째 줄: x, j(실패)
    expect(trace.frames).toHaveLength(1 + 4);
    expect(last.key).toBe('j');
    expect(last.failed).toBe(true);
    expect(trace.frames.filter((f) => f.failed)).toHaveLength(1);
    expect(last.state.lines).toEqual(real.lines);
  });

  it('@@ 와 [count]@@ 로 마지막 매크로를 반복 실행한다 (레슨 53 키 흐름)', () => {
    let state = press(createState(['apple', 'banana', 'cherry', 'grape', 'melon']), RECORD_BULLET);
    state = press(state, ['@', 'a']);
    expect(state.lines[1]).toBe('- banana');
    state = press(state, ['3', '@', '@']);
    expect(state.lines).toEqual(['- apple', '- banana', '- cherry', '- grape', '- melon']);
  });

  it('대화형 매크로 튜터 해설 및 실패 원인 진단이 정확하게 동작한다', () => {
    const s0 = createState(['apple', 'banana'], { line: 0, col: 0 });
    const s1 = createState(['apple', 'banana'], { line: 1, col: 0 });
    expect(explainMacroKeyAction('j', s0, s1)).toBe('한 줄 아래로 이동');

    // 버퍼 끝에서 j 실행 시 해설
    expect(explainMacroKeyAction('j', s1, s1)).toContain('버퍼 끝 도달');

    // Insert 모드에서 글자 입력 해설
    const ins0 = { ...s0, mode: 'INSERT' as const };
    const ins1 = { ...s0, lines: ['aapple', 'banana'], mode: 'INSERT' as const };
    expect(explainMacroKeyAction('a', ins0, ins1)).toBe('문자 "a" 타이핑 입력');

    // 실패 원인 분석
    const lastLineState = createState(['single line'], { line: 0, col: 0 });
    const failedFrame = {
      index: 1,
      key: 'j',
      iteration: 0,
      keyIndex: 0,
      state: { ...lastLineState, bell: true },
      changed: false,
      failed: true,
    };
    const prevFrame = {
      index: 0,
      key: null,
      iteration: -1,
      keyIndex: -1,
      state: lastLineState,
      changed: false,
      failed: false,
    };
    const reason = getMacroFailureReason(failedFrame, prevFrame);
    expect(reason).toContain('마지막 줄에서 j 모션을 실행하여');
  });
});
