import { lazy, Suspense } from 'react';
import { Editor } from '../Editor/Editor';
import { QuickfixPanel } from '../QuickfixPanel';
import {
  VimEditorState,
  WindowLayoutNode,
  TroubleMode,
  ensureBuffers,
  ensureTabPages,
  getEffectiveWindowTree,
  getGitLineSigns,
  computeGitBlameLines,
  CursorPosition,
} from '../../vim-engine';
import { t } from '../../i18n';

const TroublePanel = lazy(() =>
  import('../TroublePanel/TroublePanel').then((m) => ({ default: m.TroublePanel }))
);
const UndotreePanel = lazy(() =>
  import('../UndotreePanel/UndotreePanel').then((m) => ({ default: m.UndotreePanel }))
);
const SpectrePanel = lazy(() =>
  import('../SpectrePanel/SpectrePanel').then((m) => ({ default: m.SpectrePanel }))
);
const GitPanel = lazy(() =>
  import('../GitPanel/GitPanel').then((m) => ({ default: m.GitPanel }))
);

interface EditorViewportProps {
  editorState: VimEditorState;
  displayEditorState: VimEditorState;
  targetPosition?: CursorPosition;
  fallbackPrimaryFilename?: string;
  isEditorShaking: boolean;
  isEditorFocused: boolean;
  relativeLineNumbers: boolean;
  bellCount: number;
  onFocusEditor: () => void;
  onEditorAreaClick: () => void;
  onSwitchPane: (paneIndex: number) => void;
  onSelectCompletionCandidate: (index: number) => void;
  onSwitchBuffer: (bufferId: number) => void;
  onSwitchTabPage: (tabId: number) => void;
  onCloseTabPage: (tabId: number) => void;
  onNewTabPage: () => void;
  onJumpToMark: (markChar: string) => void;
  onCloseLspHover: () => void;
  onCancelLspRename?: () => void;
  onApplyLspCodeAction?: (index: number) => void;
  onCloseLspCodeAction?: () => void;
  onCloseGitHunkPreview?: () => void;
  onResetGitHunk?: () => void;
  onStageGitHunk?: () => void;
  onJumpQuickfixItem: (index: number) => void;
  onCloseQuickfixWindow: () => void;
  onJumpLocationListItem: (index: number) => void;
  onCloseLocationListWindow: () => void;
  onJumpTroubleItem?: (index: number) => void;
  onChangeTroubleMode?: (mode: TroubleMode) => void;
  onCloseTroublePanel?: () => void;
  onJumpUndoSeq?: (seq: number) => void;
  onTravelUndoOlder?: () => void;
  onTravelUndoNewer?: () => void;
  onCloseUndotreePanel?: () => void;
  onUpdateSpectreQuery?: (searchQuery: string, replaceQuery: string, ignoreCase?: boolean) => void;
  onToggleSpectreItem?: (itemId: string) => void;
  onToggleAllSpectreItems?: (enabled: boolean) => void;
  onJumpSpectreItem?: (index: number) => void;
  onApplySpectreReplaceAll?: () => void;
  onCloseSpectrePanel?: () => void;
  onSelectGitPanelIndex?: (index: number) => void;
  onChangeGitPanelTab?: (tab: 'changes' | 'log') => void;
  onToggleGitPanelHunkDiff?: (hunkId: number) => void;
  onJumpGitPanelHunk?: (index: number) => void;
  onStageGitPanelHunk?: (index: number) => void;
  onStageAllGitPanel?: () => void;
  onUnstageGitPanel?: () => void;
  onResetGitPanelHunk?: (index: number) => void;
  onCommitGitPanel?: (message: string) => void;
  onToggleGitBlame?: () => void;
  onCloseGitPanel?: () => void;
  onSwitchCommandLineWindowType: (type: ':' | '/') => void;
  onClearCommandLineHistory: (type: ':' | '/' | '?') => void;
  onCloseCommandLineWindow: () => void;
  onSelectCommandLineWindowLine: (lineIdx: number) => void;
  onExecuteCommandLineWindowLine: (lineIdx: number) => void;
}

/**
 * 에디터 메인 뷰포트(탭/버퍼 바, 단일/분할 에디터, 퀵픽스/로케이션 리스트, 커맨드라인 윈도우)를 렌더링합니다.
 */
export function EditorViewport({
  editorState,
  displayEditorState,
  targetPosition,
  fallbackPrimaryFilename,
  isEditorShaking,
  isEditorFocused,
  relativeLineNumbers,
  bellCount,
  onFocusEditor,
  onEditorAreaClick,
  onSwitchPane,
  onSelectCompletionCandidate,
  onSwitchBuffer,
  onSwitchTabPage,
  onCloseTabPage,
  onNewTabPage,
  onJumpToMark,
  onCloseLspHover,
  onCancelLspRename,
  onApplyLspCodeAction,
  onCloseLspCodeAction,
  onCloseGitHunkPreview,
  onResetGitHunk,
  onStageGitHunk,
  onJumpQuickfixItem,
  onCloseQuickfixWindow,
  onJumpLocationListItem,
  onCloseLocationListWindow,
  onJumpTroubleItem,
  onChangeTroubleMode,
  onCloseTroublePanel,
  onJumpUndoSeq,
  onTravelUndoOlder,
  onTravelUndoNewer,
  onCloseUndotreePanel,
  onUpdateSpectreQuery,
  onToggleSpectreItem,
  onToggleAllSpectreItems,
  onJumpSpectreItem,
  onApplySpectreReplaceAll,
  onCloseSpectrePanel,
  onSelectGitPanelIndex,
  onChangeGitPanelTab,
  onToggleGitPanelHunkDiff,
  onJumpGitPanelHunk,
  onStageGitPanelHunk,
  onStageAllGitPanel,
  onUnstageGitPanel,
  onResetGitPanelHunk,
  onCommitGitPanel,
  onToggleGitBlame,
  onCloseGitPanel,
  onSwitchCommandLineWindowType,
  onClearCommandLineHistory,
  onCloseCommandLineWindow,
  onSelectCommandLineWindowLine,
  onExecuteCommandLineWindowLine,
}: EditorViewportProps) {
  const stateWithTabs = ensureTabPages(displayEditorState);
  const tabList = stateWithTabs.tabPages ?? [];
  const currentTabId = stateWithTabs.currentTabId ?? 1;

  const stateWithBuffers = ensureBuffers(displayEditorState);
  const bufferList = stateWithBuffers.buffers ?? [];
  const currentBufId = stateWithBuffers.currentBufferId ?? 1;
  const altBufId = stateWithBuffers.alternateBufferId;

  const splitTree = getEffectiveWindowTree(editorState);
  const isSplitMode = Boolean(splitTree && editorState.splitPanes && editorState.splitPanes.length >= 2);
  const paneCount = editorState.splitPanes?.length ?? 0;
  const gitLineSigns = getGitLineSigns(displayEditorState);
  const gitBlameLines = displayEditorState.gitBlameVisible
    ? computeGitBlameLines(displayEditorState)
    : undefined;

  const renderSplitNode = (
    node: WindowLayoutNode,
    weight: number,
    isRoot: boolean,
    keyPrefix: string
  ): React.ReactNode => {
    if (node.kind === 'leaf') {
      const paneIdx = node.paneIndex;
      const pane = editorState.splitPanes?.[paneIdx];
      if (!pane) return null;
      const isActive = (editorState.activePaneIndex ?? 0) === paneIdx;
      const defaultName =
        paneIdx === 0 ? 'source.ts' : paneIdx === 1 ? 'target.ts' : `pane_${paneIdx + 1}.ts`;
      const paneFilename =
        paneIdx === 0
          ? pane.filename || editorState.primaryFilename || fallbackPrimaryFilename
          : paneIdx === 1
            ? pane.filename || editorState.secondaryFilename || defaultName
            : pane.filename || defaultName;
      const headerFilename =
        paneIdx === 0
          ? pane.filename || editorState.primaryFilename || defaultName
          : paneIdx === 1
            ? pane.filename || editorState.secondaryFilename || defaultName
            : pane.filename || defaultName;

      return (
        <div
          key={`${keyPrefix}-leaf-${paneIdx}`}
          className={`editor-split-pane ${isActive ? 'active' : ''}`}
          onClick={() => onSwitchPane(paneIdx)}
          data-testid={`split-pane-${paneIdx}`}
          style={{ flex: `${Math.round(weight)} 1 0%` }}
        >
          <div className="pane-header">
            <span className="pane-filename">
              {paneCount > 2 && <span className="pane-window-num">#{paneIdx + 1}</span>}
              📄 {headerFilename}
            </span>
            {displayEditorState.diffMode && (
              <span className="pane-diff-badge" data-testid={`diff-badge-${paneIdx}`}>
                [DIFF]
              </span>
            )}
            {isActive && <span className="pane-active-indicator">FOCUS</span>}
          </div>
          <Editor
            lines={isActive ? editorState.lines : pane.lines}
            cursor={isActive ? editorState.cursor : pane.cursor}
            mode={isActive ? editorState.mode : pane.mode}
            targetPosition={targetPosition}
            visualAnchor={isActive ? editorState.visualAnchor : pane.visualAnchor}
            visualBlockEndOfLine={
              isActive ? editorState.visualBlockEndOfLine : pane.visualBlockEndOfLine
            }
            relativeLineNumbers={relativeLineNumbers}
            searchQuery={
              isActive && editorState.mode === 'SEARCH'
                ? editorState.commandBuffer
                : editorState.hlsearchSuppressed
                ? undefined
                : editorState.lastSearchQuery
            }
            isFocused={isEditorFocused && isActive}
            onFocus={() => onSwitchPane(paneIdx)}
            marks={editorState.marks}
            jumpList={editorState.jumpList}
            jumpIndex={editorState.jumpIndex}
            onJumpToMark={onJumpToMark}
            viewport={isActive ? editorState.viewport : pane.viewport}
            folds={editorState.options?.foldenable === false ? undefined : editorState.folds}
            completionSession={isActive ? editorState.completionSession : undefined}
            insertNormalSession={isActive ? editorState.insertNormalSession : undefined}
            insertRegisterPending={isActive ? editorState.insertRegisterPending : undefined}
            confirmSubstitute={isActive ? editorState.confirmSubstitute : undefined}
            incCommandPreview={isActive ? editorState.incCommandPreview : undefined}
            blockInsertSession={isActive ? editorState.blockInsertSession : pane.blockInsertSession}
            options={
              pane.localOptions
                ? { ...(displayEditorState.options ?? ({} as any)), ...pane.localOptions }
                : displayEditorState.options
            }
            spellGoodWords={displayEditorState.spellGoodWords}
            spellWrongWords={displayEditorState.spellWrongWords}
            diffHunks={displayEditorState.diffMode ? displayEditorState.diffHunks : undefined}
            diffPaneIndex={paneIdx}
            bellSignal={isActive ? bellCount : undefined}
            onSelectCompletionItem={onSelectCompletionCandidate}
            primaryFilename={paneFilename}
            customMatches={displayEditorState.customMatches}
            gitLineSigns={isActive ? gitLineSigns : undefined}
            gitBlameLines={isActive ? gitBlameLines : undefined}
            gitHunkPreview={isActive ? displayEditorState.gitHunkPreview : undefined}
            onCloseGitHunkPreview={onCloseGitHunkPreview}
            onResetGitHunk={onResetGitHunk}
            onStageGitHunk={onStageGitHunk}
            flashJump={isActive ? editorState.flashJump : undefined}
            multiCursor={isActive ? editorState.multiCursor : undefined}
          />
        </div>
      );
    }

    const totalWeight = node.weights.reduce((acc, w) => acc + (w > 0 ? w : 0), 0);
    return (
      <div
        key={`${keyPrefix}-split-${node.direction}`}
        className={
          isRoot
            ? `editor-split-container split-${node.direction}`
            : `editor-split-branch split-${node.direction}`
        }
        data-testid={isRoot ? 'editor-split-container' : `split-branch-${node.direction}`}
        style={isRoot ? undefined : { flex: `${Math.round(weight)} 1 0%` }}
      >
        {node.children.map((child, idx) => {
          const childWeight =
            totalWeight > 0
              ? ((node.weights[idx] ?? 100 / node.children.length) / totalWeight) * 100
              : 100 / node.children.length;
          return renderSplitNode(child, childWeight, false, `${keyPrefix}-${idx}`);
        })}
      </div>
    );
  };

  return (
    <>
      <div
        className={`editor-main-viewport ${isEditorShaking ? 'shake-hardcore' : ''}`}
        onClick={onEditorAreaClick}
        data-testid="editor-main-viewport"
      >
        {/* 상단 탭 페이지 바 (Tabline: :tabnew, :tabc, gt, gT) */}
        {tabList.length > 1 && (
          <div className="editor-tab-bar" data-testid="editor-tab-bar">
            <div className="tab-list">
              {tabList.map((tab, idx) => {
                const isCurrent = tab.id === currentTabId;
                return (
                  <div
                    key={tab.id}
                    className={`tab-page ${isCurrent ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSwitchTabPage(tab.id);
                    }}
                    data-testid={`tab-page-${tab.id}`}
                    title={t('탭 {v}: {filename}', { v: idx + 1, filename: tab.filename })}
                  >
                    <span className="tab-number">{idx + 1}</span>
                    <span className="tab-filename">{tab.filename}</span>
                    {tabList.length > 1 && (
                      <button
                        type="button"
                        className="tab-close-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseTabPage(tab.id);
                        }}
                        title={t('탭 닫기 (:tabclose)')}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="tab-new-btn"
              onClick={(e) => {
                e.stopPropagation();
                onNewTabPage();
              }}
              title={t('새 탭 열기 (:tabnew)')}
            >
              +
            </button>
          </div>
        )}

        {/* 상단 버퍼 탭 바 (Bufferline) */}
        {bufferList.length > 1 && (
          <div className="editor-buffer-bar" data-testid="editor-buffer-bar">
            {bufferList.map((buf) => {
              const isCurrent = buf.id === currentBufId;
              const isAlt = buf.id === altBufId;
              return (
                <div
                  key={buf.id}
                  className={`buffer-tab ${isCurrent ? 'active' : ''} ${isAlt ? 'alternate' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSwitchBuffer(buf.id);
                  }}
                  data-testid={`buffer-tab-${buf.id}`}
                  title={t('버퍼 {id}: {name}', { id: buf.id, name: buf.name })}
                >
                  <span className="buffer-number">{buf.id}</span>
                  <span className="buffer-indicator">{isCurrent ? '%' : isAlt ? '#' : ''}</span>
                  <span className="buffer-name">{buf.name}</span>
                  {buf.isModified && <span className="buffer-modified">*</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* 에디터 렌더링: 분할 창 트리 모드 vs 단일 창 모드 */}
        {isSplitMode && splitTree ? (
          renderSplitNode(splitTree, 100, true, 'root')
        ) : (
          <Editor
            lines={displayEditorState.lines}
            cursor={displayEditorState.cursor}
            mode={displayEditorState.mode}
            targetPosition={targetPosition}
            visualAnchor={displayEditorState.visualAnchor}
            visualBlockEndOfLine={displayEditorState.visualBlockEndOfLine}
            relativeLineNumbers={relativeLineNumbers}
            searchQuery={
              displayEditorState.mode === 'SEARCH'
                ? displayEditorState.commandBuffer
                : displayEditorState.hlsearchSuppressed
                ? undefined
                : displayEditorState.lastSearchQuery
            }
            isFocused={isEditorFocused}
            onFocus={onFocusEditor}
            marks={displayEditorState.marks}
            jumpList={displayEditorState.jumpList}
            jumpIndex={displayEditorState.jumpIndex}
            onJumpToMark={onJumpToMark}
            viewport={displayEditorState.viewport}
            folds={displayEditorState.options?.foldenable === false ? undefined : displayEditorState.folds}
            completionSession={displayEditorState.completionSession}
            insertNormalSession={displayEditorState.insertNormalSession}
            insertRegisterPending={displayEditorState.insertRegisterPending}
            confirmSubstitute={displayEditorState.confirmSubstitute}
            incCommandPreview={displayEditorState.incCommandPreview}
            blockInsertSession={displayEditorState.blockInsertSession}
            options={displayEditorState.options}
            spellGoodWords={displayEditorState.spellGoodWords}
            spellWrongWords={displayEditorState.spellWrongWords}
            bellSignal={bellCount}
            onSelectCompletionItem={onSelectCompletionCandidate}
            primaryFilename={displayEditorState.primaryFilename || fallbackPrimaryFilename}
            lspDiagnostics={displayEditorState.lspDiagnostics}
            lspHover={displayEditorState.lspHover}
            onCloseLspHover={onCloseLspHover}
            lspRename={displayEditorState.lspRename}
            onCancelLspRename={onCancelLspRename}
            lspCodeActionMenu={displayEditorState.lspCodeActionMenu}
            onApplyLspCodeAction={onApplyLspCodeAction}
            onCloseLspCodeAction={onCloseLspCodeAction}
            customMatches={displayEditorState.customMatches}
            gitLineSigns={gitLineSigns}
            gitBlameLines={gitBlameLines}
            gitHunkPreview={displayEditorState.gitHunkPreview}
            onCloseGitHunkPreview={onCloseGitHunkPreview}
            onResetGitHunk={onResetGitHunk}
            onStageGitHunk={onStageGitHunk}
            flashJump={displayEditorState.flashJump}
            multiCursor={displayEditorState.multiCursor}
          />
        )}

        {/* 퀵픽스 분할 창 (Quickfix List: :copen, :cclose, :cn, :cp, :vimgrep) */}
        {displayEditorState.quickfix?.isOpen && (
          <QuickfixPanel
            type="quickfix"
            state={displayEditorState.quickfix}
            onJump={onJumpQuickfixItem}
            onClose={onCloseQuickfixWindow}
          />
        )}

        {/* 로케이션 리스트 분할 창 (Location List: :lopen, :lclose, :lne, :lp, :lvimgrep) */}
        {displayEditorState.locationList?.isOpen && (
          <QuickfixPanel
            type="locationList"
            state={displayEditorState.locationList}
            onJump={onJumpLocationListItem}
            onClose={onCloseLocationListWindow}
          />
        )}

        {/* trouble.nvim 프로젝트 진단·TODO 통합 허브 (:Trouble) */}
        {displayEditorState.troublePanel?.isOpen && (
          <Suspense fallback={null}>
            <TroublePanel
              state={displayEditorState.troublePanel}
              onJump={(idx) => onJumpTroubleItem?.(idx)}
              onChangeMode={(mode) => onChangeTroubleMode?.(mode)}
              onClose={() => onCloseTroublePanel?.()}
            />
          </Suspense>
        )}

        {/* mbbill/undotree 시각적 Undo Tree 분할 패널 (:UndotreeToggle) */}
        {displayEditorState.undotreePanel?.isOpen && (
          <Suspense fallback={null}>
            <UndotreePanel
              editorState={displayEditorState}
              onJumpSeq={(seq) => onJumpUndoSeq?.(seq)}
              onTravelOlder={() => onTravelUndoOlder?.()}
              onTravelNewer={() => onTravelUndoNewer?.()}
              onClose={() => onCloseUndotreePanel?.()}
            />
          </Suspense>
        )}

        {/* nvim-spectre 프로젝트 대화형 검색·치환 분할 패널 (:Spectre) */}
        {displayEditorState.spectrePanel?.isOpen && (
          <Suspense fallback={null}>
            <SpectrePanel
              state={displayEditorState.spectrePanel}
              onUpdateQuery={(s, r, ic) => onUpdateSpectreQuery?.(s, r, ic)}
              onToggleItem={(id) => onToggleSpectreItem?.(id)}
              onToggleAll={(en) => onToggleAllSpectreItems?.(en)}
              onJumpItem={(idx) => onJumpSpectreItem?.(idx)}
              onReplaceAll={() => onApplySpectreReplaceAll?.()}
              onClose={() => onCloseSpectrePanel?.()}
            />
          </Suspense>
        )}

        {/* vim-fugitive / LazyGit 스타일 인터랙티브 Git 분할 패널 (:Git / :LazyGit) */}
        {displayEditorState.gitPanel?.isOpen && (
          <Suspense fallback={null}>
            <GitPanel
              editorState={displayEditorState}
              onSelectIndex={(idx) => onSelectGitPanelIndex?.(idx)}
              onChangeTab={(tab) => onChangeGitPanelTab?.(tab)}
              onToggleHunkDiff={(id) => onToggleGitPanelHunkDiff?.(id)}
              onJumpHunk={(idx) => onJumpGitPanelHunk?.(idx)}
              onStageHunk={(idx) => onStageGitPanelHunk?.(idx)}
              onStageAll={() => onStageAllGitPanel?.()}
              onUnstage={() => onUnstageGitPanel?.()}
              onResetHunk={(idx) => onResetGitPanelHunk?.(idx)}
              onCommit={(message) => onCommitGitPanel?.(message)}
              onToggleBlame={() => onToggleGitBlame?.()}
              onClose={() => onCloseGitPanel?.()}
            />
          </Suspense>
        )}

        {/* Neovim :set inccommand=split 실시간 치환 미리보기 분할 창 */}
        {displayEditorState.options?.inccommand === 'split' &&
          displayEditorState.incCommandPreview &&
          displayEditorState.incCommandPreview.matches.length > 0 && (
            <div
              className="inccommand-split-preview"
              data-testid="inccommand-split-preview"
            >
              <div className="inccommand-split-header">
                <span className="inccommand-split-title">[Preview]</span>
                <span className="inccommand-split-meta">
                  :{displayEditorState.commandBuffer} ({displayEditorState.incCommandPreview.matches.length})
                </span>
              </div>
              <div className="inccommand-split-body">
                {Array.from(
                  new Set(displayEditorState.incCommandPreview.matches.map((m) => m.line))
                )
                  .slice(0, 8)
                  .map((lineNo) => (
                    <div
                      key={lineNo}
                      className="inccommand-split-row"
                      data-testid={`inccommand-split-row-${lineNo + 1}`}
                    >
                      <span className="inccommand-split-lnum">|{lineNo + 1}|</span>
                      <span className="inccommand-split-text">
                        {displayEditorState.incCommandPreview!.previewLines[lineNo] ?? ''}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
      </div>

      {/* 커맨드라인 윈도우 (Command-line Window: q:, q/, q?, Ctrl-f) */}
      {displayEditorState.cmdlineWindow && (
        <div className="cmdline-window-container" data-testid="cmdline-window">
          <div className="cmdline-window-header">
            <div className="cmdline-window-header-left">
              <span className="cmdline-window-title">Command-line Window</span>
              <div className="cmdline-type-tabs">
                <button
                  className={`cmdline-type-tab ${
                    displayEditorState.cmdlineWindow.type === ':' ? 'active' : ''
                  }`}
                  onClick={() => onSwitchCommandLineWindowType(':')}
                  title={t('명령어 히스토리 보기 (q:)')}
                  data-testid="cmdline-tab-commands"
                >
                  : {t('Ex 명령')}
                </button>
                <button
                  className={`cmdline-type-tab ${
                    displayEditorState.cmdlineWindow.type === '/' ? 'active' : ''
                  }`}
                  onClick={() => onSwitchCommandLineWindowType('/')}
                  title={t('검색어 히스토리 보기 (q/)')}
                  data-testid="cmdline-tab-search"
                >
                  / {t('검색어')}
                </button>
              </div>
              <span
                className={`cmdline-mode-badge ${
                  displayEditorState.cmdlineWindow.mode === 'INSERT' ? 'insert' : 'normal'
                }`}
              >
                {displayEditorState.cmdlineWindow.mode}
              </span>
            </div>

            <span className="cmdline-window-hint">
              {t('Enter/더블클릭: 실행 | Esc: 닫기 | k/j: 탐색 | i/cw/dd: 편집')}
            </span>

            <div className="cmdline-header-actions">
              <button
                className="cmdline-clear-btn"
                onClick={() =>
                  onClearCommandLineHistory(displayEditorState.cmdlineWindow!.type)
                }
                title={t('현재 히스토리 비우기')}
                data-testid="cmdline-clear-btn"
              >
                🗑️ {t('비우기')}
              </button>
              <button
                className="cmdline-window-close"
                onClick={onCloseCommandLineWindow}
                title={t('커맨드라인 윈도우 닫기 (Esc)')}
              >
                ✕
              </button>
            </div>
          </div>
          <div className="cmdline-window-body">
            {displayEditorState.cmdlineWindow.lines.map((line, lineIdx) => {
              const isCurrentLine = lineIdx === displayEditorState.cmdlineWindow!.cursor.line;
              const cursorCol = displayEditorState.cmdlineWindow!.cursor.col;
              const isInsert = displayEditorState.cmdlineWindow!.mode === 'INSERT';

              return (
                <div
                  key={lineIdx}
                  className={`cmdline-line ${isCurrentLine ? 'active' : ''}`}
                  onClick={() => onSelectCommandLineWindowLine(lineIdx)}
                  onDoubleClick={() => onExecuteCommandLineWindowLine(lineIdx)}
                  title={t('클릭: 이동 | 더블클릭: 즉시 실행')}
                  data-testid={`cmdline-line-${lineIdx}`}
                >
                  <span className="cmdline-prompt">{displayEditorState.cmdlineWindow!.type}</span>
                  <span className="cmdline-num">{lineIdx + 1}</span>
                  <div className="cmdline-text">
                    {isCurrentLine ? (
                      <>
                        {line.slice(0, cursorCol)}
                        <span
                          className={`cmdline-cursor ${
                            isInsert ? 'cursor-insert' : 'cursor-normal'
                          }`}
                        >
                          {line[cursorCol] || ' '}
                        </span>
                        {line.slice(cursorCol + 1)}
                      </>
                    ) : (
                      line || ' '
                    )}
                  </div>
                  <button
                    className="cmdline-run-chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExecuteCommandLineWindowLine(lineIdx);
                    }}
                    title={t('이 명령어 즉시 실행')}
                    tabIndex={-1}
                  >
                    ▶ {t('실행')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
