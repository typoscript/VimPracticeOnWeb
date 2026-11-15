import { useState, useRef, useCallback, useEffect, Dispatch, SetStateAction } from 'react';
import { VimEditorState, VimMode, handleKey } from '../vim-engine';
import { Mission } from '../types/mission';

interface UseGhostReplayParams {
  currentMission: Mission;
  getMissionInitialState: (m: Mission) => VimEditorState;
  setEditorState: Dispatch<SetStateAction<VimEditorState>>;
  setKeystrokeCount: Dispatch<SetStateAction<number>>;
  setRecentKeys: Dispatch<SetStateAction<string[]>>;
  setLastPressedKey: Dispatch<SetStateAction<string | undefined>>;
  playKeySound: (key: string, prevMode: VimMode) => void;
}

/**
 * 레슨 모범 답안(optimalKeys)의 고스트 자동 리플레이 타이머와 진행 상태를 관리하는 훅입니다.
 */
export function useGhostReplay({
  currentMission,
  getMissionInitialState,
  setEditorState,
  setKeystrokeCount,
  setRecentKeys,
  setLastPressedKey,
  playKeySound,
}: UseGhostReplayParams) {
  const [isGhostReplaying, setIsGhostReplaying] = useState(false);
  const [ghostReplayProgress, setGhostReplayProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const ghostTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleStopGhostReplay = useCallback(() => {
    if (ghostTimerRef.current) {
      clearInterval(ghostTimerRef.current);
      ghostTimerRef.current = null;
    }
    setIsGhostReplaying(false);
    setLastPressedKey(undefined);
  }, [setLastPressedKey]);

  const handleStartGhostReplay = useCallback(() => {
    const keys = currentMission.optimalKeys;
    if (!keys || keys.length === 0) return;

    if (ghostTimerRef.current) {
      clearInterval(ghostTimerRef.current);
      ghostTimerRef.current = null;
    }

    let currentState = getMissionInitialState(currentMission);
    setEditorState(currentState);
    setKeystrokeCount(0);
    setRecentKeys([]);
    setLastPressedKey(undefined);
    setIsGhostReplaying(true);
    setGhostReplayProgress({ current: 0, total: keys.length });

    let step = 0;
    ghostTimerRef.current = setInterval(() => {
      if (step >= keys.length) {
        if (ghostTimerRef.current) {
          clearInterval(ghostTimerRef.current);
          ghostTimerRef.current = null;
        }
        setIsGhostReplaying(false);
        setLastPressedKey(undefined);
        return;
      }

      const key = keys[step];
      const prevMode = currentState.mode;
      currentState = handleKey(currentState, key);
      setEditorState(currentState);

      setLastPressedKey(key);
      playKeySound(key, prevMode);
      setKeystrokeCount((prev) => prev + 1);
      setRecentKeys((prev) => [...prev.slice(-7), key]);
      step += 1;
      setGhostReplayProgress({ current: step, total: keys.length });

      if (step >= keys.length) {
        if (ghostTimerRef.current) {
          clearInterval(ghostTimerRef.current);
          ghostTimerRef.current = null;
        }
        setIsGhostReplaying(false);
        setLastPressedKey(undefined);
      }
    }, 350);
  }, [
    currentMission,
    getMissionInitialState,
    setEditorState,
    setKeystrokeCount,
    setRecentKeys,
    setLastPressedKey,
    playKeySound,
  ]);

  useEffect(() => {
    return () => {
      if (ghostTimerRef.current) {
        clearInterval(ghostTimerRef.current);
      }
    };
  }, []);

  return {
    isGhostReplaying,
    ghostReplayProgress,
    handleStopGhostReplay,
    handleStartGhostReplay,
  };
}
