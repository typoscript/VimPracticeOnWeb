import {
  VimEditorState,
  SplitPaneState,
  diagnosticsToQuickfixItems,
  computeDiffHunks,
} from '../vim-engine';
import { Mission } from '../types/mission';
import {
  SANDBOX_HARPOON_LIST,
  SANDBOX_PRIMARY_FILENAME,
  createSandboxGitBaseLines,
  createSandboxVirtualFiles,
  sandboxInitialLines,
} from '../data/sandbox';
import { compileUserKeymaps, CustomKeymapItem } from './keymapStorage';
import { UserInitConfig, applyUserInitConfigToState } from './userInitConfig';

export interface UserKeymapSettings {
  activePresets: Record<string, boolean>;
  leaderKey: string;
  customKeymaps: CustomKeymapItem[];
  userInitConfig?: UserInitConfig;
}

/**
 * 레슨 미션 정의로부터 초기 VimEditorState 를 생성합니다.
 */
export function buildMissionInitialState(
  m: Mission,
  { activePresets, leaderKey, customKeymaps }: UserKeymapSettings
): VimEditorState {
  const isSplit = m.initialSplit && m.initialSplit !== 'none';
  let splitPanes: SplitPaneState[] | undefined = undefined;
  if (isSplit) {
    const p0: SplitPaneState = {
      filename: m.primaryFilename || 'source.ts',
      lines: [...m.initialLines],
      cursor: { ...m.initialCursor },
      mode: 'NORMAL',
      diff: m.initialDiffMode ?? false,
    };
    const p1: SplitPaneState = {
      filename: m.secondaryFilename || 'target.ts',
      lines: m.secondaryLines ? [...m.secondaryLines] : [...m.initialLines],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      diff: m.initialDiffMode ?? false,
    };
    splitPanes = [p0, p1];
  }

  return {
    lines: [...m.initialLines],
    cursor: { ...m.initialCursor },
    mode: 'NORMAL',
    undoStack: m.initialUndoStack ? [...m.initialUndoStack] : [],
    redoStack: [],
    undoTreeNodes: m.initialUndoTreeNodes,
    currentUndoSeq: m.initialCurrentUndoSeq,
    maxUndoSeq: m.initialMaxUndoSeq,
    undoTimeHistory: m.initialUndoTimeHistory,
    undoTimeIndex: m.initialUndoTimeIndex,
    clipboard: m.initialClipboard,
    registers: m.initialRegisters ? { ...m.initialRegisters } : undefined,
    primaryFilename: m.primaryFilename,
    secondaryFilename: m.secondaryFilename,
    secondaryLines: m.secondaryLines,
    splitDirection: m.initialSplit ?? 'none',
    splitPanes,
    diffMode: m.initialDiffMode ?? false,
    diffHunks:
      m.initialDiffMode && splitPanes
        ? computeDiffHunks(splitPanes[0].lines, splitPanes[1].lines)
        : undefined,
    activePaneIndex: 0,
    commandHistory: m.initialCommandHistory ? [...m.initialCommandHistory] : undefined,
    searchHistory: m.initialSearchHistory ? [...m.initialSearchHistory] : undefined,
    quickfix: m.initialQuickfixItems
      ? { items: [...m.initialQuickfixItems], currentIndex: 0, isOpen: false }
      : undefined,
    locationList: m.initialLocationListItems
      ? { items: [...m.initialLocationListItems], currentIndex: 0, isOpen: false }
      : m.initialLspDiagnostics
      ? {
          items: diagnosticsToQuickfixItems(
            m.primaryFilename || `lesson_${m.id}.ts`,
            m.initialLspDiagnostics
          ),
          currentIndex: 0,
          isOpen: false,
        }
      : undefined,
    lspDiagnostics: m.initialLspDiagnostics
      ? m.initialLspDiagnostics.map((d) => ({ ...d }))
      : undefined,
    lspSymbols: m.initialLspSymbols ? { ...m.initialLspSymbols } : undefined,
    lspHover: null,
    changeList: m.initialChangeList ? [...m.initialChangeList] : undefined,
    changeIndex: m.initialChangeList ? m.initialChangeList.length : undefined,
    argList: m.initialArgs ? { files: [...m.initialArgs], currentIndex: 0 } : undefined,
    folds: m.initialFolds ? [...m.initialFolds] : undefined,
    virtualFiles: m.initialVirtualFiles ? { ...m.initialVirtualFiles } : undefined,
    gitBaseLines: m.initialGitBaseLines ? [...m.initialGitBaseLines] : undefined,
    dapScenarioTrace: m.initialDapTrace ? m.initialDapTrace.map((s) => ({ ...s })) : undefined,
    dapBreakpoints: m.initialDapBreakpoints
      ? Object.fromEntries(Object.entries(m.initialDapBreakpoints).map(([k, v]) => [k, [...v]]))
      : undefined,
    userKeymaps: compileUserKeymaps(activePresets, leaderKey, customKeymaps),
    leaderKey,
  };
}

/**
 * 커스텀/BYOC 미션용 초기 VimEditorState 를 생성합니다.
 */
export function buildCustomInitialState(
  mission: Mission,
  settings?: UserKeymapSettings
): VimEditorState {
  const virtualFiles = mission.initialVirtualFiles
    ? Object.fromEntries(
        Object.entries(mission.initialVirtualFiles).map(([k, v]) => [k, [...v]])
      )
    : undefined;
  return {
    lines: [...mission.initialLines],
    cursor: { ...mission.initialCursor },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
    primaryFilename: mission.primaryFilename,
    virtualFiles,
    gitBaseLines: mission.initialGitBaseLines ? [...mission.initialGitBaseLines] : undefined,
    harpoonList: mission.initialHarpoonList ? [...mission.initialHarpoonList] : undefined,
    virtualTests: mission.initialVirtualTests
      ? mission.initialVirtualTests.map((spec) => ({ ...spec }))
      : undefined,
    lastTestRun: mission.initialVirtualTests
      ? {
          suiteName: mission.title,
          passedCount: 0,
          totalCount: mission.initialVirtualTests.length,
          allPassed: false,
          results: mission.initialVirtualTests.map((spec) => ({
            id: spec.id,
            name: spec.name,
            file: spec.file,
            passed: false,
          })),
          runCount: 0,
        }
      : undefined,
    ...(settings
      ? {
          userKeymaps: compileUserKeymaps(
            settings.activePresets,
            settings.leaderKey,
            settings.customKeymaps
          ),
          leaderKey: settings.leaderKey,
        }
      : {}),
  };
}

/**
 * 자유 연습장(Sandbox) 탭용 초기 VimEditorState 를 생성합니다.
 */
export function buildSandboxInitialState({
  activePresets,
  leaderKey,
  customKeymaps,
  userInitConfig,
}: UserKeymapSettings): VimEditorState {
  const lines = sandboxInitialLines();
  const base: VimEditorState = {
    lines,
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
    primaryFilename: SANDBOX_PRIMARY_FILENAME,
    virtualFiles: createSandboxVirtualFiles(lines),
    gitBaseLines: createSandboxGitBaseLines(lines),
    harpoonList: [...SANDBOX_HARPOON_LIST],
    userKeymaps: compileUserKeymaps(activePresets, leaderKey, customKeymaps),
    leaderKey,
  };
  if (userInitConfig && userInitConfig.enabled && userInitConfig.code.trim()) {
    const applied = applyUserInitConfigToState(base, userInitConfig);
    if (applied.ok) return applied.state;
  }
  return base;
}

/**
 * 현재 활성 창·탭·미션에 따른 상태바 파일명을 계산합니다.
 */
export function resolveStatusFilename(
  displayEditorState: VimEditorState,
  currentTab: string,
  currentMission: Mission,
  speedrunCurrentStage: number
): string {
  if (displayEditorState.splitPanes && displayEditorState.splitPanes.length > 0) {
    const idx = displayEditorState.activePaneIndex ?? 0;
    const activePane = displayEditorState.splitPanes[idx] ?? displayEditorState.splitPanes[0];
    if (idx === 0) {
      return displayEditorState.primaryFilename || activePane?.filename || 'source.ts';
    }
    if (idx === 1) {
      return displayEditorState.secondaryFilename || activePane?.filename || 'target.ts';
    }
    return activePane?.filename || `pane_${idx + 1}.ts`;
  }
  if (currentTab === 'course') {
    return currentMission.primaryFilename || `lesson_${currentMission.id}.txt`;
  }
  if (currentTab === 'custom') {
    return displayEditorState.virtualTests?.length && displayEditorState.primaryFilename
      ? displayEditorState.primaryFilename
      : 'custom_golf.txt';
  }
  if (currentTab === 'speedrun') {
    return `speedrun_stage_${speedrunCurrentStage + 1}.txt`;
  }
  return displayEditorState.primaryFilename || 'sandbox.ts';
}
