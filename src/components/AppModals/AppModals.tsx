import { useState, lazy, Suspense } from 'react';
import { LessonSelectModal } from '../LessonSelectModal/LessonSelectModal';
import { FuzzyFinder } from '../FuzzyFinder/FuzzyFinder';
import { HelpViewer } from '../HelpViewer/HelpViewer';
import { MISSIONS } from '../../data/missions';
import { VimEditorState, VimMode } from '../../vim-engine';
import { LessonProgress } from '../../utils/storage';
import { VimTheme } from '../../utils/theme';
import { CustomMissionData } from '../../utils/customMission';
import { CustomKeymapItem } from '../../utils/keymapStorage';

const CustomMissionModal = lazy(() =>
  import('../CustomMissionModal/CustomMissionModal').then((m) => ({
    default: m.CustomMissionModal,
  }))
);
const AnalyticsModal = lazy(() =>
  import('../AnalyticsModal/AnalyticsModal').then((m) => ({ default: m.AnalyticsModal }))
);
const DailyChallengeModal = lazy(() =>
  import('../DailyChallengeModal/DailyChallengeModal').then((m) => ({
    default: m.DailyChallengeModal,
  }))
);
const ConfigExporterModal = lazy(() =>
  import('../ConfigExporterModal/ConfigExporterModal').then((m) => ({
    default: m.ConfigExporterModal,
  }))
);
const BYOCModal = lazy(() =>
  import('../BYOCModal/BYOCModal').then((m) => ({ default: m.BYOCModal }))
);

/**
 * 한 번이라도 열린 적이 있으면 true 를 유지합니다.
 * 모달을 처음 열 때 불러온 뒤에는 계속 마운트해 두어, 닫았다 다시 열어도 내부 상태가 유지됩니다.
 */
function useOpenedOnce(isOpen: boolean): boolean {
  const [opened, setOpened] = useState(isOpen);
  if (isOpen && !opened) setOpened(true);
  return opened || isOpen;
}

interface AppModalsProps {
  editorState: VimEditorState;
  currentMissionId: number;
  progress: LessonProgress;
  isModalOpen: boolean;
  onCloseLessonModal: () => void;
  onSelectLessonById: (missionId: number) => void;
  isCustomModalOpen: boolean;
  onCloseCustomModal: () => void;
  onPlayCustomMission: (data: CustomMissionData) => void;
  isAnalyticsModalOpen: boolean;
  onCloseAnalyticsModal: () => void;
  onOpenDailyFromAnalytics: () => void;
  onStartWeaknessDrill: () => void;
  isDailyModalOpen: boolean;
  onCloseDailyModal: () => void;
  playKeySound: (key: string, mode: VimMode) => void;
  playSuccessSound: () => void;
  isConfigModalOpen: boolean;
  onCloseConfigModal: () => void;
  relativeLineNumbers: boolean;
  currentTheme: VimTheme;
  leaderKey: string;
  activePresets: Record<string, boolean>;
  onTogglePreset: (presetId: string) => void;
  onChangeLeaderKey: (leader: string) => void;
  customKeymaps: CustomKeymapItem[];
  onAddCustomKeymap: (rule: Omit<CustomKeymapItem, 'id'>) => void;
  onDeleteCustomKeymap: (id: string) => void;
  onRestoreBackup: () => void;
  isBYOCModalOpen: boolean;
  onCloseBYOCModal: () => void;
  onPlayBYOCMission: (missionData: {
    title: string;
    description: string;
    initialText: string;
    targetText: string;
    par: number;
    hint: string;
  }) => void;
  onSelectFuzzyFinderAction: (action: 'open' | 'vsplit' | 'split' | 'tab') => void;
  onSelectFuzzyItemIndex: (index: number) => void;
  onCloseFuzzyFinder: () => void;
  onJumpHelpTag: (tag: string) => void;
  onPopHelpTag: () => void;
  onCloseHelp: () => void;
}

/**
 * 레슨 선택 모달, 지연 로딩 모달 5종(Custom/Analytics/Daily/Config/BYOC), 퍼지 파인더, 도움말 오버레이를 관리합니다.
 */
export function AppModals({
  editorState,
  currentMissionId,
  progress,
  isModalOpen,
  onCloseLessonModal,
  onSelectLessonById,
  isCustomModalOpen,
  onCloseCustomModal,
  onPlayCustomMission,
  isAnalyticsModalOpen,
  onCloseAnalyticsModal,
  onOpenDailyFromAnalytics,
  onStartWeaknessDrill,
  isDailyModalOpen,
  onCloseDailyModal,
  playKeySound,
  playSuccessSound,
  isConfigModalOpen,
  onCloseConfigModal,
  relativeLineNumbers,
  currentTheme,
  leaderKey,
  activePresets,
  onTogglePreset,
  onChangeLeaderKey,
  customKeymaps,
  onAddCustomKeymap,
  onDeleteCustomKeymap,
  onRestoreBackup,
  isBYOCModalOpen,
  onCloseBYOCModal,
  onPlayBYOCMission,
  onSelectFuzzyFinderAction,
  onSelectFuzzyItemIndex,
  onCloseFuzzyFinder,
  onJumpHelpTag,
  onPopHelpTag,
  onCloseHelp,
}: AppModalsProps) {
  const customModalLoaded = useOpenedOnce(isCustomModalOpen);
  const analyticsModalLoaded = useOpenedOnce(isAnalyticsModalOpen);
  const dailyModalLoaded = useOpenedOnce(isDailyModalOpen);
  const configModalLoaded = useOpenedOnce(isConfigModalOpen);
  const byocModalLoaded = useOpenedOnce(isBYOCModalOpen);

  return (
    <>
      <LessonSelectModal
        isOpen={isModalOpen}
        onClose={onCloseLessonModal}
        missions={MISSIONS}
        currentMissionId={currentMissionId}
        progress={progress}
        onSelectLesson={onSelectLessonById}
      />

      <Suspense fallback={null}>
        {customModalLoaded && (
          <CustomMissionModal
            isOpen={isCustomModalOpen}
            onClose={onCloseCustomModal}
            onPlayMission={onPlayCustomMission}
          />
        )}

        {analyticsModalLoaded && (
          <AnalyticsModal
            isOpen={isAnalyticsModalOpen}
            onClose={onCloseAnalyticsModal}
            progress={progress}
            onOpenDailyChallenge={onOpenDailyFromAnalytics}
            onStartWeaknessDrill={onStartWeaknessDrill}
            onSelectLesson={onSelectLessonById}
          />
        )}

        {dailyModalLoaded && (
          <DailyChallengeModal
            isOpen={isDailyModalOpen}
            onClose={onCloseDailyModal}
            onPlayKeySound={playKeySound}
            onPlaySuccessSound={playSuccessSound}
          />
        )}

        {configModalLoaded && (
          <ConfigExporterModal
            isOpen={isConfigModalOpen}
            onClose={onCloseConfigModal}
            relativenumber={relativeLineNumbers}
            theme={currentTheme}
            leaderKey={leaderKey}
            activePresets={activePresets}
            onTogglePreset={onTogglePreset}
            onChangeLeaderKey={onChangeLeaderKey}
            customKeymaps={customKeymaps}
            onAddCustomKeymap={onAddCustomKeymap}
            onDeleteCustomKeymap={onDeleteCustomKeymap}
            options={editorState.options}
            onRestoreBackup={onRestoreBackup}
          />
        )}

        {byocModalLoaded && (
          <BYOCModal
            isOpen={isBYOCModalOpen}
            onClose={onCloseBYOCModal}
            initialCode={editorState.lines.join('\n')}
            onStartMission={onPlayBYOCMission}
          />
        )}
      </Suspense>

      {editorState.fuzzyFinder?.isOpen && (
        <FuzzyFinder
          state={editorState}
          onSelectAction={onSelectFuzzyFinderAction}
          onSelectItemIndex={onSelectFuzzyItemIndex}
          onClose={onCloseFuzzyFinder}
        />
      )}

      {editorState.helpSession?.isOpen && (
        <HelpViewer
          session={editorState.helpSession}
          onJumpTag={onJumpHelpTag}
          onPopTag={onPopHelpTag}
          onClose={onCloseHelp}
        />
      )}
    </>
  );
}
