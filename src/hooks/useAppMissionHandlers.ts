import { useCallback, Dispatch, SetStateAction, MutableRefObject } from 'react';
import { VimEditorState } from '../vim-engine';
import { Mission } from '../types/mission';
import { MISSIONS } from '../data/missions';
import { AntiPatternDetector } from '../utils/antiPatternDetector';
import {
  createCustomMissionObject,
  CustomMissionData,
} from '../utils/customMission';
import {
  loadProgress,
  loadActionTimelineSetting,
  loadSpeedrunRecord,
  LessonProgress,
  SpeedrunRecord,
} from '../utils/storage';
import {
  buildCustomInitialState,
  buildSandboxInitialState,
  UserKeymapSettings,
} from '../utils/missionInitialState';
import { AppTab } from '../components/AppHeader/AppHeader';
import { t } from '../i18n';

interface UseAppMissionHandlersParams {
  currentMission: Mission;
  currentMissionIndex: number;
  customMission: Mission | null;
  activePresets: UserKeymapSettings['activePresets'];
  leaderKey: UserKeymapSettings['leaderKey'];
  customKeymaps: UserKeymapSettings['customKeymaps'];
  userInitConfig?: UserKeymapSettings['userInitConfig'];
  antiPatternDetectorRef: MutableRefObject<AntiPatternDetector>;
  getMissionInitialState: (mission: Mission) => VimEditorState;
  resetActionTimeline: (initState: VimEditorState) => void;
  resetSpeedrunReady: () => void;
  handleStopGhostReplay: () => void;
  enableDiffView: () => void;
  reloadHardcoreAndKeymaps: () => void;
  restoreViewSettings: () => void;
  processKeyInput: (key: string) => void;
  setCurrentTab: Dispatch<SetStateAction<AppTab>>;
  setCurrentMissionIndex: Dispatch<SetStateAction<number>>;
  setCustomMission: Dispatch<SetStateAction<Mission | null>>;
  setEditorState: Dispatch<SetStateAction<VimEditorState>>;
  setKeystrokeCount: Dispatch<SetStateAction<number>>;
  setRecentKeys: Dispatch<SetStateAction<string[]>>;
  setLastPressedKey: Dispatch<SetStateAction<string | undefined>>;
  setCoachingMessage: Dispatch<SetStateAction<string | null>>;
  setProgress: Dispatch<SetStateAction<LessonProgress>>;
  setShowActionTimeline: (show: boolean) => void;
  setSpeedrunBestRecord: Dispatch<SetStateAction<SpeedrunRecord | null>>;
}

/**
 * 미션 선택/초기화, 샌드박스, 커스텀/BYOC 미션, 탭 전환 및 백업 복구 핸들러를 모은 훅.
 */
export function useAppMissionHandlers({
  currentMission,
  currentMissionIndex,
  customMission,
  activePresets,
  leaderKey,
  customKeymaps,
  userInitConfig,
  antiPatternDetectorRef,
  getMissionInitialState,
  resetActionTimeline,
  resetSpeedrunReady,
  handleStopGhostReplay,
  enableDiffView,
  reloadHardcoreAndKeymaps,
  restoreViewSettings,
  processKeyInput,
  setCurrentTab,
  setCurrentMissionIndex,
  setCustomMission,
  setEditorState,
  setKeystrokeCount,
  setRecentKeys,
  setLastPressedKey,
  setCoachingMessage,
  setProgress,
  setShowActionTimeline,
  setSpeedrunBestRecord,
}: UseAppMissionHandlersParams) {
  const resetSessionWithState = useCallback(
    (initState: VimEditorState, message: string | null = null) => {
      setEditorState(initState);
      resetActionTimeline(initState);
      setKeystrokeCount(0);
      setRecentKeys([]);
      setLastPressedKey(undefined);
      setCoachingMessage(message);
      antiPatternDetectorRef.current.reset();
    },
    [
      setEditorState,
      resetActionTimeline,
      setKeystrokeCount,
      setRecentKeys,
      setLastPressedKey,
      setCoachingMessage,
      antiPatternDetectorRef,
    ]
  );

  const handleSelectMission = useCallback(
    (index: number) => {
      if (index >= 0 && index < MISSIONS.length) {
        handleStopGhostReplay();
        setCurrentMissionIndex(index);
        resetSessionWithState(getMissionInitialState(MISSIONS[index]));
      }
    },
    [handleStopGhostReplay, setCurrentMissionIndex, getMissionInitialState, resetSessionWithState]
  );

  const handleResetMission = useCallback(() => {
    handleStopGhostReplay();
    resetSessionWithState(getMissionInitialState(currentMission));
  }, [currentMission, handleStopGhostReplay, getMissionInitialState, resetSessionWithState]);

  const handleResetSandbox = useCallback(() => {
    handleStopGhostReplay();
    resetSessionWithState(
      buildSandboxInitialState({ activePresets, leaderKey, customKeymaps, userInitConfig })
    );
  }, [handleStopGhostReplay, resetSessionWithState, activePresets, leaderKey, customKeymaps, userInitConfig]);

  const handleResetCustomMission = useCallback(() => {
    if (!customMission) return;
    handleStopGhostReplay();
    resetSessionWithState(buildCustomInitialState(customMission));
  }, [customMission, handleStopGhostReplay, resetSessionWithState]);

  const handlePlayCustomMission = useCallback(
    (data: CustomMissionData) => {
      handleStopGhostReplay();
      const newMission = createCustomMissionObject(data);
      setCustomMission(newMission);
      setCurrentTab('custom');
      resetSessionWithState(
        buildCustomInitialState(newMission),
        t('⛳ 커스텀 미션 [{title}] 시작! 최소 타수로 완성을 노려보세요.', {
          title: newMission.title,
        })
      );
    },
    [handleStopGhostReplay, setCustomMission, setCurrentTab, resetSessionWithState]
  );

  const handlePlayBYOCMission = useCallback(
    (missionData: {
      title: string;
      description: string;
      initialText: string;
      targetText: string;
      par: number;
      hint: string;
    }) => {
      handlePlayCustomMission({
        title: missionData.title,
        description: missionData.description,
        initialText: missionData.initialText,
        targetText: missionData.targetText,
        par: missionData.par,
      });
      enableDiffView();
      setCoachingMessage(
        t('⛳ [BYOC] 리팩토링 미션 시작! 힌트: {hint}', { hint: missionData.hint })
      );
    },
    [handlePlayCustomMission, enableDiffView, setCoachingMessage]
  );

  const handleSwitchTab = useCallback(
    (tab: AppTab) => {
      handleStopGhostReplay();
      setCurrentTab(tab);
      setLastPressedKey(undefined);
      setCoachingMessage(null);
      antiPatternDetectorRef.current.reset();

      if (tab === 'sandbox') {
        handleResetSandbox();
      } else if (tab === 'speedrun') {
        resetSpeedrunReady();
      } else if (tab === 'arcade' || tab === 'dungeon' || tab === 'dojo') {
        // 게임 탭은 자체 상태를 갖습니다
      } else if (tab === 'custom' && customMission) {
        setEditorState(buildCustomInitialState(customMission));
        setKeystrokeCount(0);
        setRecentKeys([]);
      } else {
        setEditorState(getMissionInitialState(MISSIONS[currentMissionIndex]));
        setKeystrokeCount(0);
        setRecentKeys([]);
      }
    },
    [
      currentMissionIndex,
      handleResetSandbox,
      resetSpeedrunReady,
      customMission,
      handleStopGhostReplay,
      getMissionInitialState,
      setCurrentTab,
      setLastPressedKey,
      setCoachingMessage,
      antiPatternDetectorRef,
      setEditorState,
      setKeystrokeCount,
      setRecentKeys,
    ]
  );

  const handleRunMacroFromDebugger = useCallback(
    (register: string, count: number = 1) => {
      const keys = [...(count > 1 ? String(count).split('') : []), '@', register];
      keys.forEach((k) => processKeyInput(k));
    },
    [processKeyInput]
  );

  const handleSelectLessonById = useCallback(
    (missionId: number) => {
      const idx = MISSIONS.findIndex((m) => m.id === missionId);
      if (idx !== -1) {
        handleSelectMission(idx);
        setCurrentTab('course');
      }
    },
    [handleSelectMission, setCurrentTab]
  );

  const handleRestoreBackup = useCallback(() => {
    setProgress(loadProgress());
    reloadHardcoreAndKeymaps();
    restoreViewSettings();
    setShowActionTimeline(loadActionTimelineSetting());
    setSpeedrunBestRecord(loadSpeedrunRecord());
  }, [
    setProgress,
    reloadHardcoreAndKeymaps,
    restoreViewSettings,
    setShowActionTimeline,
    setSpeedrunBestRecord,
  ]);

  return {
    resetSessionWithState,
    handleSelectMission,
    handleResetMission,
    handleResetSandbox,
    handleResetCustomMission,
    handlePlayCustomMission,
    handlePlayBYOCMission,
    handleSwitchTab,
    handleRunMacroFromDebugger,
    handleSelectLessonById,
    handleRestoreBackup,
  };
}
