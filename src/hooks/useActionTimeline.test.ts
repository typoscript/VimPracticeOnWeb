import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef, useState } from 'react';
import { useActionTimeline } from './useActionTimeline';
import { VimEditorState, handleKey } from '../vim-engine';
import { loadActionTimelineSetting } from '../utils/storage';

function makeInitialState(): VimEditorState {
  return {
    lines: ['alpha', 'beta', 'gamma'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
  };
}

describe('useActionTimeline', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('키 입력을 pending/commit 단위로 기록하고 미리보기·분기를 처리한다', () => {
    const setCoachingMessage = vi.fn();

    const { result } = renderHook(() => {
      const [editorState, setEditorState] = useState<VimEditorState>(makeInitialState);
      const editorStateRef = useRef(editorState);
      editorStateRef.current = editorState;
      const keystrokeCountRef = useRef(0);
      const [, setKeystrokeCount] = useState(0);

      const timeline = useActionTimeline({
        createInitialState: makeInitialState,
        editorState,
        editorStateRef,
        setEditorState,
        keystrokeCountRef,
        setKeystrokeCount,
        setCoachingMessage,
      });

      const press = (key: string) => {
        const ctx = timeline.beginTimelineKeyInput(key);
        const nextCount = ctx.baseKeystrokes + 1;
        keystrokeCountRef.current = nextCount;
        setKeystrokeCount(nextCount);
        const nextState = handleKey(ctx.baseState, key);
        editorStateRef.current = nextState;
        setEditorState(nextState);
        timeline.commitTimelineKeyStep(ctx.baseSteps, ctx.nextActionKeys, nextCount, nextState);
      };

      return { editorState, timeline, press };
    });

    expect(result.current.timeline.timelineSteps).toHaveLength(1);

    // 1) 'j' 이동 (단일 키 명령 -> 스텝 1 커밋)
    act(() => result.current.press('j'));
    expect(result.current.timeline.timelineSteps).toHaveLength(2);

    // 2) 'd' 대기 -> pending 상태 유지, 'd' 추가 입력 시 스텝 2('dd') 커밋
    act(() => result.current.press('d'));
    expect(result.current.timeline.timelineSteps).toHaveLength(2);
    act(() => result.current.press('d'));
    expect(result.current.timeline.timelineSteps).toHaveLength(3);
    expect(result.current.editorState.lines).toEqual(['alpha', 'gamma']);

    // 스텝 1 미리보기 선택 후 분기 실행
    act(() => {
      result.current.timeline.handleSelectTimelineStep(1);
    });
    expect(result.current.timeline.previewStepIndex).toBe(1);
    expect(result.current.timeline.timelineBaseState.lines).toEqual(['alpha', 'beta', 'gamma']);

    act(() => {
      result.current.timeline.handleBranchFromStep(1);
    });
    expect(result.current.timeline.previewStepIndex).toBeNull();
    expect(result.current.timeline.timelineSteps).toHaveLength(2);
    expect(result.current.editorState.lines).toEqual(['alpha', 'beta', 'gamma']);
    expect(setCoachingMessage).toHaveBeenCalled();

    // 초기화
    act(() => {
      result.current.timeline.resetActionTimeline(makeInitialState());
    });
    expect(result.current.timeline.timelineSteps).toHaveLength(1);
    expect(result.current.timeline.allKeysSoFar).toEqual([]);
  });

  it('타임라인 표시 토글 시 localStorage 에 저장한다', () => {
    const { result } = renderHook(() => {
      const [editorState, setEditorState] = useState<VimEditorState>(makeInitialState);
      const editorStateRef = useRef(editorState);
      const keystrokeCountRef = useRef(0);
      return useActionTimeline({
        createInitialState: makeInitialState,
        editorState,
        editorStateRef,
        setEditorState,
        keystrokeCountRef,
        setKeystrokeCount: vi.fn(),
        setCoachingMessage: vi.fn(),
      });
    });

    const initial = result.current.showActionTimeline;
    act(() => {
      result.current.handleToggleActionTimeline();
    });
    expect(result.current.showActionTimeline).toBe(!initial);
    expect(loadActionTimelineSetting()).toBe(!initial);
  });
});
