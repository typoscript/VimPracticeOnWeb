import { useState, useCallback, useRef, MutableRefObject, Dispatch, SetStateAction } from 'react';
import { VimEditorState } from '../vim-engine';
import {
  ActionTimelineStep,
  createInitialTimelineStep,
  formatCommandLabel,
  getActionDescription,
} from '../utils/actionTimeline';
import { loadActionTimelineSetting, saveActionTimelineSetting } from '../utils/storage';
import { t } from '../i18n';

interface UseActionTimelineParams {
  createInitialState: () => VimEditorState;
  editorState: VimEditorState;
  editorStateRef: MutableRefObject<VimEditorState>;
  setEditorState: Dispatch<SetStateAction<VimEditorState>>;
  keystrokeCountRef: MutableRefObject<number>;
  setKeystrokeCount: Dispatch<SetStateAction<number>>;
  setCoachingMessage: Dispatch<SetStateAction<string | null>>;
}

interface ActionStepBranchContext {
  baseState: VimEditorState;
  baseKeystrokes: number;
  baseSteps: ActionTimelineStep[];
  currentPending: string[];
  baseAllKeys: string[];
}

/**
 * 실시간 명령 복기 타임라인 및 과거 스텝 미리보기/분기(Branch) 상태를 관리하는 훅입니다.
 */
export function useActionTimeline({
  createInitialState,
  editorState,
  editorStateRef,
  setEditorState,
  keystrokeCountRef,
  setKeystrokeCount,
  setCoachingMessage,
}: UseActionTimelineParams) {
  const [showActionTimeline, setShowActionTimeline] = useState<boolean>(() =>
    loadActionTimelineSetting()
  );
  const [timelineSteps, setTimelineSteps] = useState<ActionTimelineStep[]>(() => [
    createInitialTimelineStep(createInitialState()),
  ]);
  const [pendingActionKeys, setPendingActionKeys] = useState<string[]>([]);
  const [allKeysSoFar, setAllKeysSoFar] = useState<string[]>([]);
  const [previewStepIndex, setPreviewStepIndex] = useState<number | null>(null);

  const timelineStepsRef = useRef(timelineSteps);
  timelineStepsRef.current = timelineSteps;
  const pendingActionKeysRef = useRef(pendingActionKeys);
  pendingActionKeysRef.current = pendingActionKeys;
  const allKeysSoFarRef = useRef(allKeysSoFar);
  allKeysSoFarRef.current = allKeysSoFar;
  const previewStepIndexRef = useRef(previewStepIndex);
  previewStepIndexRef.current = previewStepIndex;

  const handleToggleActionTimeline = useCallback(() => {
    setShowActionTimeline((prev) => {
      const next = !prev;
      saveActionTimelineSetting(next);
      return next;
    });
  }, []);

  const handleSelectTimelineStep = useCallback((stepIndex: number) => {
    setPreviewStepIndex((prev) => (prev === stepIndex ? null : stepIndex));
    previewStepIndexRef.current =
      previewStepIndexRef.current === stepIndex ? null : stepIndex;
  }, []);

  const handleCancelPreview = useCallback(() => {
    setPreviewStepIndex(null);
    previewStepIndexRef.current = null;
  }, []);

  const handleBranchFromStep = useCallback(
    (stepIndex: number) => {
      const targetStep = timelineStepsRef.current[stepIndex];
      if (!targetStep) return;

      editorStateRef.current = targetStep.snapshot;
      setEditorState(targetStep.snapshot);

      keystrokeCountRef.current = targetStep.keystrokesSoFar;
      setKeystrokeCount(targetStep.keystrokesSoFar);

      previewStepIndexRef.current = null;
      setPreviewStepIndex(null);

      pendingActionKeysRef.current = [];
      setPendingActionKeys([]);

      // stepIndex 이후 스텝들 잘라내기 (해당 시점부터 분기)
      const slicedSteps = timelineStepsRef.current.slice(0, stepIndex + 1);
      timelineStepsRef.current = slicedSteps;
      setTimelineSteps(slicedSteps);

      // allKeysSoFar도 targetStep 시점까지의 키들만 보존
      const prunedKeys: string[] = [];
      for (let i = 1; i <= stepIndex; i++) {
        if (timelineStepsRef.current[i]) {
          prunedKeys.push(...timelineStepsRef.current[i].keys);
        }
      }
      allKeysSoFarRef.current = prunedKeys;
      setAllKeysSoFar(prunedKeys);
      setCoachingMessage(
        t('⏪ 스텝 #{stepIndex} ({command}) 시점부터 이어서 플레이합니다!', {
          stepIndex,
          command: targetStep.command,
        })
      );
    },
    [editorStateRef, keystrokeCountRef, setCoachingMessage, setEditorState, setKeystrokeCount]
  );

  const resetActionTimeline = useCallback(
    (initialState: VimEditorState) => {
      const step0 = [createInitialTimelineStep(initialState)];
      setTimelineSteps(step0);
      timelineStepsRef.current = step0;
      setPendingActionKeys([]);
      pendingActionKeysRef.current = [];
      setAllKeysSoFar([]);
      allKeysSoFarRef.current = [];
      setPreviewStepIndex(null);
      previewStepIndexRef.current = null;
      editorStateRef.current = initialState;
      keystrokeCountRef.current = 0;
    },
    [editorStateRef, keystrokeCountRef]
  );

  /**
   * 키 입력 직전 기준 상태(미리보기 중이면 해당 스텝에서 분기)를 계산하고 allKeysSoFar를 갱신합니다.
   */
  const beginTimelineKeyInput = useCallback((key: string): ActionStepBranchContext & {
    nextActionKeys: string[];
  } => {
    let baseState = editorStateRef.current;
    let baseKeystrokes = keystrokeCountRef.current;
    let baseSteps = timelineStepsRef.current;
    let currentPending = pendingActionKeysRef.current;
    let baseAllKeys = allKeysSoFarRef.current;

    if (previewStepIndexRef.current !== null) {
      const targetStep = timelineStepsRef.current[previewStepIndexRef.current];
      if (targetStep) {
        baseState = targetStep.snapshot;
        baseKeystrokes = targetStep.keystrokesSoFar;
        baseSteps = timelineStepsRef.current.slice(0, previewStepIndexRef.current + 1);
        currentPending = [];
        const pruned: string[] = [];
        for (let i = 1; i <= previewStepIndexRef.current; i++) {
          if (timelineStepsRef.current[i]) pruned.push(...timelineStepsRef.current[i].keys);
        }
        baseAllKeys = pruned;
      }
      previewStepIndexRef.current = null;
      setPreviewStepIndex(null);
    }

    const nextAllKeys = [...baseAllKeys, key];
    allKeysSoFarRef.current = nextAllKeys;
    setAllKeysSoFar(nextAllKeys);

    return {
      baseState,
      baseKeystrokes,
      baseSteps,
      currentPending,
      baseAllKeys,
      nextActionKeys: [...currentPending, key],
    };
  }, [editorStateRef, keystrokeCountRef]);

  /**
   * handleKey 처리 후 NORMAL 복귀 시 완료된 명령 스텝을 타임라인에 추가합니다.
   */
  const commitTimelineKeyStep = useCallback(
    (
      baseSteps: ActionTimelineStep[],
      nextActionKeys: string[],
      nextKeystrokes: number,
      nextState: VimEditorState
    ) => {
      if (nextState.mode === 'NORMAL' && !nextState.pendingKeys) {
        const newStep: ActionTimelineStep = {
          stepIndex: baseSteps.length,
          command: formatCommandLabel(nextActionKeys),
          description: getActionDescription(nextActionKeys, nextState),
          keys: nextActionKeys,
          keystrokesSoFar: nextKeystrokes,
          snapshot: nextState,
          timestamp: Date.now(),
        };
        const updatedSteps = [...baseSteps, newStep];
        timelineStepsRef.current = updatedSteps;
        setTimelineSteps(updatedSteps);
        pendingActionKeysRef.current = [];
        setPendingActionKeys([]);
      } else {
        timelineStepsRef.current = baseSteps;
        setTimelineSteps(baseSteps);
        pendingActionKeysRef.current = nextActionKeys;
        setPendingActionKeys(nextActionKeys);
      }
    },
    []
  );

  // 타임라인 스텝 미리보기 중이면 해당 스냅샷이 기준 상태가 됩니다.
  const timelineBaseState =
    previewStepIndex !== null && timelineSteps[previewStepIndex]
      ? timelineSteps[previewStepIndex].snapshot
      : editorState;

  return {
    showActionTimeline,
    setShowActionTimeline,
    timelineSteps,
    allKeysSoFar,
    previewStepIndex,
    timelineBaseState,
    handleToggleActionTimeline,
    handleSelectTimelineStep,
    handleCancelPreview,
    handleBranchFromStep,
    resetActionTimeline,
    beginTimelineKeyInput,
    commitTimelineKeyStep,
  };
}
