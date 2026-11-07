import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import {
  buildMacroTrace,
  getMacroKeys,
  listMacroRegisters,
  normalizeMacroRegister,
  clampFrameIndex,
} from './macroDebugger';
import type { VimEditorState } from '../types/vim';

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

  it('@@ 와 [count]@@ 로 마지막 매크로를 반복 실행한다 (레슨 53 키 흐름)', () => {
    let state = press(createState(['apple', 'banana', 'cherry', 'grape', 'melon']), RECORD_BULLET);
    state = press(state, ['@', 'a']);
    expect(state.lines[1]).toBe('- banana');
    state = press(state, ['3', '@', '@']);
    expect(state.lines).toEqual(['- apple', '- banana', '- cherry', '- grape', '- melon']);
  });
});
