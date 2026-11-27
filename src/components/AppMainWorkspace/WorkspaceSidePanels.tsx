import React, { lazy, Suspense } from 'react';
import { RegisterInspector } from '../RegisterInspector/RegisterInspector';
import { DiffViewer } from '../DiffViewer/DiffViewer';
import { VirtualKeyboard } from '../VirtualKeyboard/VirtualKeyboard';
import { ActionTimelinePanel } from '../ActionTimelinePanel/ActionTimelinePanel';
import type { AppTab } from '../AppHeader/AppHeader';
import type {
  WorkspaceEditorProps,
  WorkspaceMissionProps,
  WorkspacePanelsProps,
} from './workspaceTypes';

// 첫 화면에 닫혀 있는 보조 패널은 처음 열 때 별도 청크로 불러옵니다
const MarksJumpVisualizer = lazy(() =>
  import('../MarksJumpVisualizer/MarksJumpVisualizer').then((m) => ({
    default: m.MarksJumpVisualizer,
  }))
);
const MacroDebugger = lazy(() =>
  import('../MacroDebugger/MacroDebugger').then((m) => ({ default: m.MacroDebugger }))
);

interface WorkspaceSidePanelsProps {
  currentTab: AppTab;
  mission: WorkspaceMissionProps;
  editor: WorkspaceEditorProps;
  panels: WorkspacePanelsProps;
  // 지연 로딩 여부는 탭 전환에도 유지되도록 부모(AppMainWorkspace)가 기억합니다
  marksLoaded: boolean;
  macroDebuggerLoaded: boolean;
}

// 에디터 아래 보조 패널: 레지스터 인스펙터·마크/점프 맵·매크로 디버거·Diff·가상 키보드·액션 타임라인
export const WorkspaceSidePanels: React.FC<WorkspaceSidePanelsProps> = ({
  currentTab,
  mission,
  editor,
  panels,
  marksLoaded,
  macroDebuggerLoaded,
}) => {
  const { editorState, displayEditorState } = editor;
  return (
    <>
      <RegisterInspector
        isOpen={panels.showRegisterInspector}
        onToggle={panels.onToggleRegisterInspector}
        registers={editorState.registers}
        activeRegister={editorState.activeRegister}
        clipboard={editorState.clipboard}
        recordingMacro={editorState.recordingMacro}
        onRunMacro={panels.onRunMacroFromDebugger}
        onOpenMacroDebugger={panels.onOpenMacroDebugger}
        onUpdateRegister={panels.onUpdateRegister}
        onDeleteRegister={panels.onDeleteRegister}
      />

      <Suspense fallback={null}>
        {marksLoaded && (
          <MarksJumpVisualizer
            isOpen={panels.showMarksVisualizer}
            onClose={panels.onToggleMarksVisualizer}
            marks={displayEditorState.marks}
            jumpList={displayEditorState.jumpList}
            jumpIndex={displayEditorState.jumpIndex}
            lines={displayEditorState.lines}
            currentCursor={displayEditorState.cursor}
            primaryFilename={displayEditorState.primaryFilename}
            {...panels.marksHandlers}
          />
        )}

        {macroDebuggerLoaded && (
          <MacroDebugger
            isOpen={panels.showMacroDebugger}
            onToggle={panels.onToggleMacroDebugger}
            baseState={panels.timelineBaseState}
            onPreviewFrame={panels.onPreviewMacroFrame}
            onRunMacro={panels.onRunMacroFromDebugger}
          />
        )}
      </Suspense>

      {panels.showDiffView && panels.activeMissionForDiff && (
        <DiffViewer
          currentLines={displayEditorState.lines}
          targetLines={panels.activeMissionForDiff.targetLines}
          isCompleted={
            currentTab === 'course' || currentTab === 'custom' ? mission.isCompleted : false
          }
        />
      )}

      {panels.showVirtualKeyboard && (
        <VirtualKeyboard
          mode={editorState.mode}
          lastPressedKey={panels.lastPressedKey}
          onKeyPress={editor.processKeyInput}
        />
      )}

      {panels.showActionTimeline && (
        <ActionTimelinePanel
          steps={panels.timelineSteps}
          previewStepIndex={panels.previewStepIndex}
          editorState={displayEditorState}
          missionTitle={
            currentTab === 'course'
              ? mission.currentMission.title
              : currentTab === 'custom' && mission.customMission
                ? mission.customMission.title
                : undefined
          }
          initialText={
            currentTab === 'course'
              ? mission.currentMission.initialLines.join('\n')
              : currentTab === 'custom' && mission.customMission
                ? mission.customMission.initialLines.join('\n')
                : panels.sandboxInitialText
          }
          initialCursor={
            currentTab === 'course'
              ? mission.currentMission.initialCursor
              : currentTab === 'custom' && mission.customMission
                ? mission.customMission.initialCursor
                : { line: 0, col: 0 }
          }
          allKeysSoFar={panels.allKeysSoFar}
          onSelectStep={panels.onSelectTimelineStep}
          onBranchFromStep={panels.onBranchFromStep}
          onCancelPreview={panels.onCancelTimelinePreview}
          onClose={panels.onToggleActionTimeline}
        />
      )}
    </>
  );
};
