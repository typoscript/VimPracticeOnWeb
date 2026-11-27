import { useState, lazy, Suspense } from 'react';
import { MISSIONS } from '../../data/missions';
import { VimEditorState, VimMode } from '../../vim-engine';
import { LessonProgress } from '../../utils/storage';
import { VimTheme } from '../../utils/theme';
import { CustomMissionData } from '../../utils/customMission';
import type { CapstoneProject } from '../../data/capstoneProjects';
import { CustomKeymapItem } from '../../utils/keymapStorage';
import type { UserInitConfig } from '../../utils/userInitConfig';

const LessonSelectModal = lazy(() =>
  import('../LessonSelectModal/LessonSelectModal').then((m) => ({
    default: m.LessonSelectModal,
  }))
);
const FuzzyFinder = lazy(() =>
  import('../FuzzyFinder/FuzzyFinder').then((m) => ({ default: m.FuzzyFinder }))
);
const HelpViewer = lazy(() =>
  import('../HelpViewer/HelpViewer').then((m) => ({ default: m.HelpViewer }))
);
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
const KeyReferenceModal = lazy(() =>
  import('../KeyReference/KeyReferenceModal').then((m) => ({ default: m.KeyReferenceModal }))
);
const CheatsheetModal = lazy(() =>
  import('../CheatsheetModal/CheatsheetModal').then((m) => ({ default: m.CheatsheetModal }))
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

export interface AppModalsProps {
  editorState: VimEditorState;
  lesson: {
    isOpen: boolean;
    onClose: () => void;
    currentMissionId: number;
    progress: LessonProgress;
    onSelectById: (missionId: number) => void;
    onStartCapstone?: (project: CapstoneProject) => void;
  };
  customMission: {
    isOpen: boolean;
    onClose: () => void;
    onPlay: (data: CustomMissionData) => void;
  };
  analytics: {
    isOpen: boolean;
    onClose: () => void;
    onOpenDaily: () => void;
    onStartWeaknessDrill: () => void;
  };
  daily: {
    isOpen: boolean;
    onClose: () => void;
    playKeySound: (key: string, mode: VimMode) => void;
    playSuccessSound: () => void;
  };
  config: {
    isOpen: boolean;
    onClose: () => void;
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
    userInitConfig?: UserInitConfig;
    onApplyUserInitConfig?: (config: UserInitConfig) => { ok: boolean; message: string };
  };
  byoc: {
    isOpen: boolean;
    onClose: () => void;
    onPlay: (missionData: {
      title: string;
      description: string;
      initialText: string;
      targetText: string;
      par: number;
      hint: string;
    }) => void;
  };
  fuzzyFinderHandlers: {
    onSelectAction: (action: 'open' | 'vsplit' | 'split' | 'tab') => void;
    onSelectItemIndex: (index: number) => void;
    onClose: () => void;
  };
  helpHandlers: {
    onJumpTag: (tag: string) => void;
    onPopTag: () => void;
    onClose: () => void;
  };
  cheatsheet?: {
    isOpen: boolean;
    onClose: () => void;
    onExecuteKeys?: (keys: readonly string[]) => void;
  };
  keyReference?: {
    isOpen: boolean;
    onClose: () => void;
  };
}

/**
 * 레슨 선택 모달, 지연 로딩 모달 5종(Custom/Analytics/Daily/Config/BYOC), 퍼지 파인더, 도움말 오버레이를 관리합니다.
 */
export function AppModals({
  editorState,
  lesson,
  customMission,
  analytics,
  daily,
  config,
  byoc,
  fuzzyFinderHandlers,
  helpHandlers,
  cheatsheet,
  keyReference,
}: AppModalsProps) {
  const lessonModalLoaded = useOpenedOnce(lesson.isOpen);
  const customModalLoaded = useOpenedOnce(customMission.isOpen);
  const analyticsModalLoaded = useOpenedOnce(analytics.isOpen);
  const dailyModalLoaded = useOpenedOnce(daily.isOpen);
  const configModalLoaded = useOpenedOnce(config.isOpen);
  const byocModalLoaded = useOpenedOnce(byoc.isOpen);
  const cheatsheetModalLoaded = useOpenedOnce(Boolean(cheatsheet?.isOpen));
  const keyReferenceLoaded = useOpenedOnce(Boolean(keyReference?.isOpen));

  return (
    <Suspense fallback={null}>
      {lessonModalLoaded && (
        <LessonSelectModal
          isOpen={lesson.isOpen}
          onClose={lesson.onClose}
          missions={MISSIONS}
          currentMissionId={lesson.currentMissionId}
          progress={lesson.progress}
          onSelectLesson={lesson.onSelectById}
          onStartCapstone={lesson.onStartCapstone}
        />
      )}

      {customModalLoaded && (
          <CustomMissionModal
            isOpen={customMission.isOpen}
            onClose={customMission.onClose}
            onPlayMission={customMission.onPlay}
          />
        )}

        {analyticsModalLoaded && (
          <AnalyticsModal
            isOpen={analytics.isOpen}
            onClose={analytics.onClose}
            progress={lesson.progress}
            onOpenDailyChallenge={analytics.onOpenDaily}
            onStartWeaknessDrill={analytics.onStartWeaknessDrill}
            onSelectLesson={lesson.onSelectById}
          />
        )}

        {dailyModalLoaded && (
          <DailyChallengeModal
            isOpen={daily.isOpen}
            onClose={daily.onClose}
            onPlayKeySound={daily.playKeySound}
            onPlaySuccessSound={daily.playSuccessSound}
          />
        )}

        {configModalLoaded && (
          <ConfigExporterModal
            isOpen={config.isOpen}
            onClose={config.onClose}
            relativenumber={config.relativeLineNumbers}
            theme={config.currentTheme}
            leaderKey={config.leaderKey}
            activePresets={config.activePresets}
            onTogglePreset={config.onTogglePreset}
            onChangeLeaderKey={config.onChangeLeaderKey}
            customKeymaps={config.customKeymaps}
            onAddCustomKeymap={config.onAddCustomKeymap}
            onDeleteCustomKeymap={config.onDeleteCustomKeymap}
            options={editorState.options}
            onRestoreBackup={config.onRestoreBackup}
            userInitConfig={config.userInitConfig}
            onApplyUserInitConfig={config.onApplyUserInitConfig}
          />
        )}

        {byocModalLoaded && (
          <BYOCModal
            isOpen={byoc.isOpen}
            onClose={byoc.onClose}
            initialCode={editorState.lines.join('\n')}
            onStartMission={byoc.onPlay}
          />
        )}

        {cheatsheetModalLoaded && cheatsheet && (
          <CheatsheetModal
            isOpen={cheatsheet.isOpen}
            onClose={cheatsheet.onClose}
            onExecuteKeys={cheatsheet.onExecuteKeys}
          />
        )}

        {keyReferenceLoaded && keyReference && (
          <KeyReferenceModal
            isOpen={keyReference.isOpen}
            onClose={keyReference.onClose}
            editorMode={editorState.mode}
            missions={MISSIONS}
            onSelectLesson={lesson.onSelectById}
          />
        )}
      {editorState.fuzzyFinder?.isOpen && (
        <FuzzyFinder
          state={editorState}
          onSelectAction={fuzzyFinderHandlers.onSelectAction}
          onSelectItemIndex={fuzzyFinderHandlers.onSelectItemIndex}
          onClose={fuzzyFinderHandlers.onClose}
        />
      )}

      {editorState.helpSession?.isOpen && (
        <HelpViewer
          session={editorState.helpSession}
          onJumpTag={helpHandlers.onJumpTag}
          onPopTag={helpHandlers.onPopTag}
          onClose={helpHandlers.onClose}
        />
      )}
    </Suspense>
  );
}
