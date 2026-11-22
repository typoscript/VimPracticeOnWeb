import React from 'react';
import {
  CursorPosition,
  VimMode,
  ViewportState,
  FoldRange,
  CompletionSession,
  ConfirmSubstituteSession,
  IncCommandPreview,
  BlockInsertSession,
  VimOptions,
  DiffHunk,
  LspDiagnostic,
  LspHoverState,
  LspRenameSession,
  LspCodeActionMenuState,
  CustomMatchEntry,
  GitHunkPreviewState,
  GitBlameInfo,
  GitConflictChoice,
  DapSessionState,
  FlashJumpSession,
  MultiCursorSession,
  getGitConflictLineKinds,
  getDapLineVirtualText,
} from '../../vim-engine';
import {
  findMatches,
  computeCustomMatchSpans,
  findSpellErrorsInLine,
  detectFiletype,
  parseListchars,
  parseColorcolumn,
} from '../../vim-engine';
import './Editor.css';
import { t } from '../../i18n';
import { renderLineContent } from './EditorLineRenderer';
import {
  computeActiveScopeIndent,
  computeIlluminatedWordMap,
  computeIndentGuideCols,
  computeMatchParenPair,
  computeRainbowDelimitersMap,
  computeSatelliteMarkers,
  computeTreesitterContextLines,
  computeWinbarBreadcrumbs,
  findColorizerSpans,
  findTodoCommentBadge,
} from './editorDecorations';

export interface EditorProps {
  lines: string[];
  cursor: CursorPosition;
  mode: VimMode;
  targetPosition?: CursorPosition;
  visualAnchor?: CursorPosition;
  /** VISUAL_BLOCK 모드에서 $ 로 줄 끝까지 확장 중인지 여부 */
  visualBlockEndOfLine?: boolean;
  /** 상대 라인 번호 (relativenumber) 활성화 여부 */
  relativeLineNumbers?: boolean;
  /** 현재 검색어 (실시간 하이라이트용) */
  searchQuery?: string;
  /** 에디터 포커스 활성화 여부 */
  isFocused?: boolean;
  /** 에디터 클릭 시 포커스 활성화 콜백 */
  onFocus?: () => void;
  /** 마크 위치 목록 (m{a-z}) */
  marks?: Record<string, { row: number; col: number; filename?: string }>;
  /** 점프 리스트 (Ctrl+o, Ctrl+i) */
  jumpList?: Array<{ row: number; col: number }>;
  /** 점프 리스트 현재 인덱스 */
  jumpIndex?: number;
  /** 거터 마크 클릭 시 점프 콜백 */
  onJumpToMark?: (markChar: string) => void;
  /** 화면 뷰포트 상태 */
  viewport?: ViewportState;
  /** 코드 폴딩 상태 (zc, zo, za, zR, zM) */
  folds?: FoldRange[];
  /** 버퍼 내 단어 자동완성 세션 (Ctrl+n, Ctrl+p) */
  completionSession?: CompletionSession | null;
  /** Insert 모드 일회성 Normal 명령 실행 세션 (Ctrl+o) */
  insertNormalSession?: boolean;
  /** Insert 모드 및 Command 모드 Ctrl+r 레지스터 입력 대기 상태 */
  insertRegisterPending?: boolean;
  /** :s/.../.../gc 대화형 치환 확인 세션 */
  confirmSubstitute?: ConfirmSubstituteSession | null;
  /** :s/pat/rep/ 입력 중 실시간 치환 미리보기 상태 (:set inccommand=nosplit|split) */
  incCommandPreview?: IncCommandPreview | null;
  /** 비주얼 블록(Ctrl+v) 다중 줄 동시 삽입 세션 (실시간 멀티커서/고스트 프리뷰용) */
  blockInsertSession?: BlockInsertSession | null;
  /** 순정 Vim 환경 옵션 설정 (:set nu, :set rnu, :set ic 등) */
  options?: VimOptions;
  /** 순정 Vim diff 차이점 목록 */
  diffHunks?: DiffHunk[];
  /** 현재 에디터가 분할 창의 몇 번째 창인지 (0 또는 1) */
  diffPaneIndex?: number;
  /** 키 실패(bell) 횟수 카운터. 값이 바뀔 때마다 에디터 테두리를 잠깐 깜빡입니다 (visualbell) */
  bellSignal?: number;
  /** 맞춤법 사용자 사전 (zg/zw) */
  spellGoodWords?: string[];
  spellWrongWords?: string[];
  /** 자동완성 팝업 메뉴 항목 선택 콜백 */
  onSelectCompletionItem?: (index: number) => void;
  /** 현재 버퍼 파일명 (구문 강조 및 표시용) */
  primaryFilename?: string;
  /** 명시적 파일타입 (:set ft=... / :set syntax=...) */
  filetype?: string;
  /** Neovim 스타일 LSP 진단 목록 */
  lspDiagnostics?: LspDiagnostic[];
  /** Neovim 스타일 LSP 호버 플로팅 창 */
  lspHover?: LspHoverState | null;
  /** LSP 호버 창 닫기 콜백 */
  onCloseLspHover?: () => void;
  /** Neovim 0.11 LSP 이름 변경 프롬프트 세션 (grn) */
  lspRename?: LspRenameSession | null;
  /** LSP 이름 변경 취소 콜백 */
  onCancelLspRename?: () => void;
  /** Neovim 0.11 LSP 코드 액션 선택 팝업 (gra) */
  lspCodeActionMenu?: LspCodeActionMenuState | null;
  /** LSP 코드 액션 적용 콜백 */
  onApplyLspCodeAction?: (index: number) => void;
  /** LSP 코드 액션 팝업 닫기 콜백 */
  onCloseLspCodeAction?: () => void;
  /** 커스텀 정규식 하이라이트 매치 (:match, matchadd()) */
  customMatches?: CustomMatchEntry[];
  /** Gitsigns 줄별 거터 사인 맵 (lineIdx -> 'add' | 'change' | 'delete') */
  gitLineSigns?: Map<number, 'add' | 'change' | 'delete'>;
  /** vim-fugitive 인라인 Git Blame 가상 텍스트 (:Gblame / :Git blame) */
  gitBlameLines?: GitBlameInfo[];
  /** Gitsigns Hunk 미리보기 팝업 세션 (:Gitsigns preview_hunk) */
  gitHunkPreview?: GitHunkPreviewState | null;
  /** Git Hunk 미리보기 닫기 콜백 */
  onCloseGitHunkPreview?: () => void;
  /** 현재 Git Hunk 되돌리기 콜백 */
  onResetGitHunk?: () => void;
  /** 현재 Git Hunk 스테이징 콜백 */
  onStageGitHunk?: () => void;
  /** flash.nvim 스타일 화면 라벨 점프 세션 (gs, :Flash) */
  flashJump?: FlashJumpSession | null;
  /** vim-visual-multi 스타일 다중 커서 세션 (g Ctrl-n, :MultiCursor) */
  multiCursor?: MultiCursorSession | null;
  /** git-conflict.nvim 인라인 충돌 해결 클릭 콜백 */
  onChooseGitConflict?: (lineIdx: number, choice: GitConflictChoice) => void;
  /** nvim-dap 현재 버퍼의 중단점 줄 목록 (0-based) */
  dapBreakpointLines?: number[];
  /** nvim-dap 활성 디버그 세션 (거터 실행 화살표 및 가상 변수 텍스트 표시용) */
  dapSession?: DapSessionState | null;
  /** 거터 클릭 시 중단점 토글 콜백 */
  onToggleDapBreakpointLine?: (lineIdx: number) => void;
}

export const Editor: React.FC<EditorProps> = ({
  lines,
  cursor,
  mode,
  targetPosition,
  visualAnchor,
  visualBlockEndOfLine,
  relativeLineNumbers = false,
  searchQuery,
  isFocused = true,
  onFocus,
  marks,
  jumpList,
  jumpIndex,
  onJumpToMark,
  viewport,
  folds,
  completionSession,
  insertNormalSession,
  insertRegisterPending,
  confirmSubstitute,
  incCommandPreview,
  blockInsertSession,
  options,
  diffHunks,
  diffPaneIndex = 0,
  bellSignal,
  spellGoodWords,
  spellWrongWords,
  onSelectCompletionItem,
  primaryFilename,
  filetype,
  lspDiagnostics,
  lspHover,
  onCloseLspHover,
  lspRename,
  onCancelLspRename,
  lspCodeActionMenu,
  onApplyLspCodeAction,
  onCloseLspCodeAction,
  customMatches,
  gitLineSigns,
  gitBlameLines,
  gitHunkPreview,
  onCloseGitHunkPreview,
  onResetGitHunk,
  onStageGitHunk,
  flashJump,
  multiCursor,
  onChooseGitConflict,
  dapBreakpointLines,
  dapSession,
  onToggleDapBreakpointLine,
}) => {
  const explicitFt =
    options?.filetype ||
    (typeof options?.syntax === 'string' ? options.syntax : undefined) ||
    filetype;
  const detectedLanguage = detectFiletype(primaryFilename, explicitFt);
  const isSyntaxEnabled = options?.syntax !== false;
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const selectedItemRef = React.useRef<HTMLDivElement>(null);
  const [isBellFlashing, setIsBellFlashing] = React.useState(false);

  // 완성 팝업 메뉴에서 선택 항목이 변경될 때 스크롤 뷰 내로 자동 정렬
  React.useEffect(() => {
    if (selectedItemRef.current && typeof selectedItemRef.current.scrollIntoView === 'function') {
      selectedItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [completionSession?.selectedIndex]);

  // visualbell: 키가 실패할 때마다 짧게 깜빡임 (연속 실패 시 애니메이션 재시작)
  React.useEffect(() => {
    if (!bellSignal) return;
    setIsBellFlashing(false);
    const start = requestAnimationFrame(() => setIsBellFlashing(true));
    const stop = setTimeout(() => setIsBellFlashing(false), 220);
    return () => {
      cancelAnimationFrame(start);
      clearTimeout(stop);
    };
  }, [bellSignal]);

  const isWrap = options?.wrap ?? true;
  const leftCol = viewport?.leftCol ?? 0;

  React.useEffect(() => {
    if (scrollerRef.current && viewport) {
      const rowHeight = 24;
      const colWidth = 9;
      scrollerRef.current.scrollTop = viewport.topRow * rowHeight;
      scrollerRef.current.scrollLeft = isWrap ? 0 : leftCol * colWidth;
    }
  }, [viewport?.topRow, leftCol, isWrap]);

  const showLineNumbers = options?.number ?? true;
  const isRelative = options?.relativenumber ?? relativeLineNumbers;
  const isHlSearch = options?.hlsearch ?? true;
  const isListMode = options?.list ?? false;
  const isCursorColumn = options?.cursorcolumn ?? false;
  const colorColumnIndices = parseColorcolumn(options?.colorcolumn, options?.textwidth ?? 0);
  const listcharsConfig = isListMode ? parseListchars(options?.listchars) : undefined;
  const tabstop = Math.max(1, options?.tabstop ?? 2);
  const indentUnit = Math.max(1, options?.shiftwidth || tabstop || 2);
  const showIndentLines = options?.indentline !== false;
  const showMatchParen = options?.matchparen !== false;
  const showRainbow = options?.rainbow !== false && isSyntaxEnabled;
  const showTSContext = options?.tscontext !== false;
  const showWinbar = options?.winbar !== false;
  const showColorizer = options?.colorizer !== false;
  const showIlluminate = options?.illuminate !== false;
  const activeScopeIndent = showIndentLines
    ? computeActiveScopeIndent(lines, cursor.line, indentUnit, tabstop)
    : null;
  const matchParenPair = React.useMemo(
    () =>
      showMatchParen
        ? computeMatchParenPair(lines, cursor, mode, options?.matchpairs)
        : null,
    [lines, cursor.line, cursor.col, mode, showMatchParen, options?.matchpairs]
  );
  const rainbowDelimitersMap = React.useMemo(
    () => (showRainbow ? computeRainbowDelimitersMap(lines) : null),
    [lines, showRainbow]
  );
  const tsContextLines = React.useMemo(
    () =>
      showTSContext ? computeTreesitterContextLines(lines, cursor.line, tabstop) : [],
    [lines, cursor.line, tabstop, showTSContext]
  );
  const winbarBreadcrumbs = React.useMemo(
    () =>
      showWinbar && primaryFilename
        ? computeWinbarBreadcrumbs(primaryFilename, lines, cursor.line, tabstop)
        : [],
    [showWinbar, primaryFilename, lines, cursor.line, tabstop]
  );
  const illuminatedWordMap = React.useMemo(
    () => (showIlluminate ? computeIlluminatedWordMap(lines, cursor) : null),
    [lines, cursor.line, cursor.col, showIlluminate]
  );
  const gitConflictKinds = React.useMemo(() => getGitConflictLineKinds(lines), [lines]);
  const dapBreakpointSet = React.useMemo(
    () => (dapBreakpointLines && dapBreakpointLines.length > 0 ? new Set(dapBreakpointLines) : null),
    [dapBreakpointLines]
  );
  const searchOpts = options ? { ignorecase: options.ignorecase, smartcase: options.smartcase } : undefined;

  // 전체 검색 일치 항목 수집
  const allMatches = searchQuery && searchQuery.length > 0 && isHlSearch
    ? findMatches(lines, searchQuery, searchOpts)
    : [];
  const allCustomMatchSpans =
    customMatches && customMatches.length > 0
      ? computeCustomMatchSpans(lines, customMatches, searchOpts)
      : [];
  const showSatellite = options?.satellite !== false && lines.length > 0;
  const satelliteMarkers = React.useMemo(
    () =>
      showSatellite
        ? computeSatelliteMarkers({
            lineCount: lines.length,
            cursorLine: cursor.line,
            searchMatchLines: allMatches.map((m) => m.line),
            diagnostics: lspDiagnostics,
            gitLineSigns,
            marks,
          })
        : [],
    [showSatellite, lines.length, cursor.line, allMatches, lspDiagnostics, gitLineSigns, marks]
  );

  return (
    <div
      className={`editor-container ${isWrap ? 'editor-wrap' : 'editor-nowrap'} ${isListMode ? 'editor-list-mode' : ''} ${!isFocused ? 'editor-unfocused' : ''} ${isBellFlashing ? 'editor-bell' : ''} ${flashJump?.isOpen ? 'editor-flash-active' : ''}`}
      data-testid="editor-container"
      data-wrap={String(isWrap)}
      data-left-col={leftCol}
      data-list={isListMode ? 'true' : undefined}
      data-cursorcolumn={isCursorColumn ? 'true' : undefined}
      data-colorcolumn={
        colorColumnIndices.length > 0
          ? colorColumnIndices.map((c) => c + 1).join(',')
          : undefined
      }
      onClick={onFocus}
    >
      {!isFocused && (
        <div
          className="editor-blur-overlay"
          data-testid="editor-blur-overlay"
          title={t('클릭하여 에디터 포커스를 활성화하세요')}
        >
          <div className="blur-overlay-pill">
            <span className="blur-icon">🖱️</span>
            <span className="blur-text">{t('클릭하여 에디터 포커스 활성화')}</span>
          </div>
        </div>
      )}

      {winbarBreadcrumbs.length > 0 && (
        <div
          className="editor-winbar"
          data-testid="editor-winbar"
          aria-hidden="true"
        >
          {winbarBreadcrumbs.map((seg, idx) => (
            <React.Fragment key={`${seg.kind}-${seg.label}-${idx}`}>
              {idx > 0 && <span className="winbar-sep">›</span>}
              <span
                className={`winbar-segment kind-${seg.kind}`}
                data-testid={`winbar-seg-${idx}`}
              >
                <span className="winbar-icon">
                  {seg.kind === 'dir'
                    ? '📁'
                    : seg.kind === 'file'
                      ? '📄'
                      : seg.kind === 'class'
                        ? '◈'
                        : seg.kind === 'interface'
                          ? '◆'
                          : 'ƒ'}
                </span>
                <span className="winbar-label">{seg.label}</span>
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {tsContextLines.length > 0 && (
        <div
          className="editor-ts-context"
          data-testid="editor-ts-context"
          aria-hidden="true"
        >
          {tsContextLines.map((item) => (
            <div
              key={`tsc-${item.line}`}
              className={`ts-context-row kind-${item.kind}`}
              data-testid={`ts-context-row-${item.line + 1}`}
            >
              <span className="ts-context-lnum">{item.line + 1}</span>
              <span className="ts-context-text">{item.text}</span>
            </div>
          ))}
        </div>
      )}

      <div ref={scrollerRef} className="editor-scroller">
        <div className="editor-lines">
          {lines.map((lineText, lineIdx) => {
            const closedFolds = (folds ?? []).filter((f) => f.closed);
            // 닫힌 폴드의 숨겨진 행(startRow < lineIdx <= endRow)은 렌더링하지 않음
            if (closedFolds.some((f) => f.startRow < lineIdx && lineIdx <= f.endRow)) {
              return null;
            }

            const foldStartingHere = closedFolds.find((f) => f.startRow === lineIdx);
            const isFoldedHeader = !!foldStartingHere;
            const foldedLineCount = foldStartingHere
              ? foldStartingHere.endRow - foldStartingHere.startRow + 1
              : 0;

            const isCursorLine = cursor.line === lineIdx;
            const isCursorLineActive = isCursorLine && (options?.cursorline ?? true);
            const targetCol =
              targetPosition && targetPosition.line === lineIdx
                ? targetPosition.col
                : null;

            const lineNumberDisplay = !showLineNumbers
              ? ''
              : isRelative
              ? isCursorLine
                ? lineIdx + 1
                : Math.abs(lineIdx - cursor.line)
              : lineIdx + 1;

            const lineMatches = allMatches.filter((m) => m.line === lineIdx);
            const lineCustomMatches =
              allCustomMatchSpans.length > 0
                ? allCustomMatchSpans.filter((m) => m.line === lineIdx)
                : undefined;
            const lineIncMatches = incCommandPreview
              ? incCommandPreview.matches.filter((m) => m.line === lineIdx)
              : undefined;
            const lineFlashMatches = flashJump?.isOpen
              ? flashJump.matches.filter((m) => m.line === lineIdx)
              : undefined;
            const lineMultiSelections = multiCursor?.isOpen
              ? multiCursor.selections.filter((s) => s.line === lineIdx)
              : undefined;
            const lineMultiCursorCols = multiCursor?.isOpen
              ? multiCursor.cursors.filter((c) => c.line === lineIdx).map((c) => c.col)
              : undefined;
            const marksOnLine = marks
              ? Object.entries(marks)
                  .filter(([_, pos]) => pos.row === lineIdx)
                  .map(([name]) => ({
                    name,
                    isGlobal: /^[A-Z]$/.test(name),
                  }))
              : [];

            const jumpsOnLine = jumpList
              ? jumpList.filter((j) => j.row === lineIdx)
              : [];
            const lineDiagnostics = lspDiagnostics
              ? lspDiagnostics.filter((d) => d.line === lineIdx)
              : [];
            const primaryLineDiagnostic = lineDiagnostics[0] ?? null;
            const hasCurrentJumpPointer =
              jumpList &&
              jumpIndex !== undefined &&
              jumpList[jumpIndex]?.row === lineIdx;

            let diffLineType: 'change' | 'add' | 'delete' | null = null;
            if (diffHunks && diffHunks.length > 0) {
              for (const h of diffHunks) {
                const hStart = diffPaneIndex === 0 ? h.pane0Start : h.pane1Start;
                const hCount = diffPaneIndex === 0 ? h.pane0Count : h.pane1Count;
                if (hCount > 0 && lineIdx >= hStart && lineIdx < hStart + hCount) {
                  diffLineType = h.type;
                  break;
                }
              }
            }

            const conflictKind = gitConflictKinds.get(lineIdx);
            const hasDapBp = Boolean(dapBreakpointSet?.has(lineIdx));
            const effectiveDapFile = primaryFilename || 'main.ts';
            const isDapActiveLine = Boolean(
              dapSession?.isActive &&
                dapSession.isPaused &&
                dapSession.filename === effectiveDapFile &&
                dapSession.currentLine === lineIdx
            );
            const dapVirtualText = isDapActiveLine
              ? getDapLineVirtualText(dapSession, effectiveDapFile, lineIdx)
              : null;

            return (
              <div
                key={lineIdx}
                className={`editor-row ${isCursorLineActive ? 'active-row' : ''} ${isFoldedHeader ? 'folded-row' : ''} ${diffLineType ? `diff-row diff-row-${diffLineType}` : ''} ${conflictKind ? `git-conflict-row git-conflict-${conflictKind}` : ''} ${isDapActiveLine ? 'dap-active-row' : ''}`}
                data-testid={`editor-row-${lineIdx + 1}`}
              >
                <div
                  className={`line-number ${isCursorLine ? 'active-line-number' : ''}`}
                  data-testid={`line-number-${lineIdx + 1}`}
                  aria-hidden="true"
                >
                  {isDapActiveLine && (
                    <span
                      className="gutter-dap-active"
                      data-testid={`dap-active-sign-${lineIdx + 1}`}
                      title={t('현재 디버그 실행 위치')}
                    >
                      ▶
                    </span>
                  )}
                  {hasDapBp && (
                    <span
                      className="gutter-dap-bp"
                      data-testid={`dap-bp-sign-${lineIdx + 1}`}
                      title={t('중단점 (클릭하여 해제)')}
                      onClick={(e) => {
                        if (onToggleDapBreakpointLine) {
                          e.stopPropagation();
                          onToggleDapBreakpointLine(lineIdx);
                        }
                      }}
                    >
                      ●
                    </span>
                  )}
                  {marksOnLine.length > 0 && (
                    <span className="gutter-marks">
                      {marksOnLine.map(({ name, isGlobal }) => (
                        <span
                          key={name}
                          className={`gutter-mark-badge ${isGlobal ? 'gutter-mark-global' : 'gutter-mark-local'}`}
                          data-testid={`mark-badge-${name}`}
                          onClick={(e) => {
                            if (onJumpToMark) {
                              e.stopPropagation();
                              onJumpToMark(name);
                            }
                          }}
                          title={`'${name}`}
                        >
                          [{name}]
                        </span>
                      ))}
                    </span>
                  )}
                  {jumpsOnLine.length > 0 && (
                    <span
                      className={`gutter-jump-indicator ${hasCurrentJumpPointer ? 'active-jump' : ''}`}
                      data-testid={`gutter-jump-${lineIdx + 1}`}
                      title={hasCurrentJumpPointer ? '▶ 현재 점프 포인터 (v:jump)' : '📍 점프 위치'}
                    >
                      {hasCurrentJumpPointer ? '▶' : '•'}
                    </span>
                  )}
                  {primaryLineDiagnostic && (
                    <span
                      className={`gutter-diag-sign diag-${primaryLineDiagnostic.severity}`}
                      data-testid={`diag-sign-${lineIdx + 1}`}
                      title={primaryLineDiagnostic.message}
                    >
                      {primaryLineDiagnostic.severity === 'error'
                        ? 'E'
                        : primaryLineDiagnostic.severity === 'warning'
                        ? 'W'
                        : primaryLineDiagnostic.severity === 'info'
                        ? 'I'
                        : 'H'}
                    </span>
                  )}
                  <span className="line-num-text">{lineNumberDisplay}</span>
                  {gitLineSigns?.get(lineIdx) && (
                    <span
                      className={`gutter-git-sign git-sign-${gitLineSigns.get(lineIdx)}`}
                      data-testid={`git-sign-${lineIdx + 1}`}
                      title={`Git: ${gitLineSigns.get(lineIdx)}`}
                    >
                      {gitLineSigns.get(lineIdx) === 'add'
                        ? '+'
                        : gitLineSigns.get(lineIdx) === 'delete'
                          ? '_'
                          : '~'}
                    </span>
                  )}
                </div>
                <div className="line-content">
                  {!isFoldedHeader &&
                    showIndentLines &&
                    computeIndentGuideCols(lines, lineIdx, indentUnit, tabstop).map((guideCol) => {
                      const isScopeActive =
                        activeScopeIndent !== null &&
                        guideCol === activeScopeIndent.col &&
                        lineIdx >= activeScopeIndent.startLine &&
                        lineIdx <= activeScopeIndent.endLine;
                      return (
                        <span
                          key={`ibl-${guideCol}`}
                          className={`indent-guide ${isScopeActive ? 'indent-guide-active' : ''}`}
                          data-testid={`indent-guide-${lineIdx + 1}-${guideCol}`}
                          style={{ left: `${guideCol}ch` }}
                          aria-hidden="true"
                        />
                      );
                    })}
                  {colorColumnIndices.map((ccIdx) => (
                    <span
                      key={`cc-${ccIdx}`}
                      className="colorcolumn-guide"
                      data-testid={`colorcolumn-guide-${ccIdx + 1}`}
                      style={{ left: `${ccIdx}ch` }}
                      aria-hidden="true"
                    />
                  ))}
                  {isFoldedHeader ? (
                    <div
                      className="folded-summary"
                      data-testid={`fold-summary-${lineIdx + 1}`}
                    >
                      {`+--- [${foldedLineCount} lines folded] --- ${lineText.trim()}`}
                    </div>
                  ) : (
                    <>
                      {renderLineContent({
                        text: lineText,
                        lineIdx,
                        cursor,
                        mode,
                        targetCol,
                        visualAnchor,
                        visualBlockEndOfLine,
                        lineMatches,
                        lineCustomMatches,
                        isFocused,
                        insertNormalSession,
                        insertRegisterPending,
                        confirmSubstitute,
                        incCommandMatches: lineIncMatches,
                        incCommandHasReplacement: incCommandPreview?.hasReplacement,
                        flashMatches: lineFlashMatches,
                        multiSelections: lineMultiSelections,
                        multiCursorCols: lineMultiCursorCols,
                        blockInsertSession,
                        spellErrors: options?.spell
                          ? findSpellErrorsInLine(lineText, lineIdx, { spellGoodWords, spellWrongWords })
                          : undefined,
                        lineDiagnostics,
                        syntaxLanguage: detectedLanguage,
                        isSyntaxEnabled,
                        listMode: isListMode,
                        listchars: listcharsConfig,
                        tabstop,
                        cursorColumnCol: isCursorColumn ? cursor.col : null,
                        todoBadge: isSyntaxEnabled ? findTodoCommentBadge(lineText) : null,
                        matchParenCols: (() => {
                          if (!matchParenPair) return undefined;
                          const cols: number[] = [];
                          if (matchParenPair.open.line === lineIdx) cols.push(matchParenPair.open.col);
                          if (matchParenPair.close.line === lineIdx) cols.push(matchParenPair.close.col);
                          return cols.length > 0 ? cols : undefined;
                        })(),
                        rainbowCols: rainbowDelimitersMap?.get(lineIdx) ?? null,
                        colorizerSpans: showColorizer ? findColorizerSpans(lineText) : undefined,
                        illuminatedSpans: illuminatedWordMap?.get(lineIdx),
                      })}
                      {primaryLineDiagnostic && (
                        <span
                          className={`lsp-virtual-text diag-${primaryLineDiagnostic.severity}`}
                          data-testid={`diag-virtual-${lineIdx + 1}`}
                        >
                          {'  ■ '}
                          {primaryLineDiagnostic.code ? `[${primaryLineDiagnostic.code}] ` : ''}
                          {primaryLineDiagnostic.message}
                        </span>
                      )}
                      {gitBlameLines?.[lineIdx] && (
                        <span
                          className={`git-blame-virtual ${gitBlameLines[lineIdx].uncommitted ? 'uncommitted' : ''}`}
                          data-testid={`git-blame-${lineIdx + 1}`}
                        >
                          {`  ${gitBlameLines[lineIdx].hash} · ${gitBlameLines[lineIdx].author} — ${gitBlameLines[lineIdx].message}`}
                        </span>
                      )}
                      {dapVirtualText && (
                        <span
                          className="dap-virtual-text"
                          data-testid={`dap-virtual-${lineIdx + 1}`}
                        >
                          {dapVirtualText}
                        </span>
                      )}
                      {conflictKind === 'marker-ours' && onChooseGitConflict && (
                        <span
                          className="git-conflict-lens"
                          data-testid={`git-conflict-lens-${lineIdx + 1}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="git-conflict-lens-btn ours"
                            data-testid={`git-conflict-choose-ours-${lineIdx + 1}`}
                            onClick={() => onChooseGitConflict(lineIdx, 'ours')}
                          >
                            Ours (co)
                          </button>
                          <button
                            type="button"
                            className="git-conflict-lens-btn theirs"
                            data-testid={`git-conflict-choose-theirs-${lineIdx + 1}`}
                            onClick={() => onChooseGitConflict(lineIdx, 'theirs')}
                          >
                            Theirs (ct)
                          </button>
                          <button
                            type="button"
                            className="git-conflict-lens-btn both"
                            data-testid={`git-conflict-choose-both-${lineIdx + 1}`}
                            onClick={() => onChooseGitConflict(lineIdx, 'both')}
                          >
                            Both (cb)
                          </button>
                          <button
                            type="button"
                            className="git-conflict-lens-btn none"
                            data-testid={`git-conflict-choose-none-${lineIdx + 1}`}
                            onClick={() => onChooseGitConflict(lineIdx, 'none')}
                          >
                            None (c0)
                          </button>
                        </span>
                      )}
                      {lspHover?.isOpen && lspHover.line === lineIdx && (
                        <div
                          className={`lsp-hover-popup ${lines.length - 1 - lineIdx < 6 && lineIdx >= 4 ? 'open-upward' : ''}`}
                          data-testid="lsp-hover-popup"
                          style={{ left: `calc(${Math.min(cursor.col, 36)} * 1ch)` }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="lsp-hover-header">
                            <span className="lsp-hover-kind">{lspHover.kind}</span>
                            <span className="lsp-hover-symbol">{lspHover.symbol}</span>
                            {lspHover.source && (
                              <span className="lsp-hover-source">{lspHover.source}</span>
                            )}
                            <button
                              type="button"
                              className="lsp-hover-close"
                              onClick={() => onCloseLspHover?.()}
                              aria-label={t('호버 닫기')}
                            >
                              Esc
                            </button>
                          </div>
                          <pre className="lsp-hover-signature">{lspHover.signature}</pre>
                          <p className="lsp-hover-doc">{lspHover.documentation}</p>
                        </div>
                      )}
                      {lspRename?.isOpen && lspRename.line === lineIdx && (
                        <div
                          className={`lsp-hover-popup lsp-rename-popup ${lines.length - 1 - lineIdx < 6 && lineIdx >= 4 ? 'open-upward' : ''}`}
                          data-testid="lsp-rename-popup"
                          style={{ left: `calc(${Math.min(cursor.col, 36)} * 1ch)` }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="lsp-hover-header">
                            <span className="lsp-hover-kind lsp-rename-badge">RENAME</span>
                            <span className="lsp-hover-symbol">{lspRename.oldName}</span>
                            <span className="lsp-hover-source">
                              {t('{count}개 위치 · {files}개 파일', {
                                count: lspRename.occurrenceCount,
                                files: lspRename.fileCount,
                              })}
                            </span>
                            <button
                              type="button"
                              className="lsp-hover-close"
                              onClick={() => onCancelLspRename?.()}
                              aria-label={t('이름 변경 닫기')}
                            >
                              Esc
                            </button>
                          </div>
                          <div className="lsp-rename-input" data-testid="lsp-rename-input">
                            <span className="lsp-rename-arrow">→</span>
                            <span className="lsp-rename-value">{lspRename.newName}</span>
                            <span className="lsp-rename-caret" />
                          </div>
                          <div className="lsp-popup-hint">{t('Enter 적용 · Esc 취소')}</div>
                        </div>
                      )}
                      {lspCodeActionMenu?.isOpen && lspCodeActionMenu.line === lineIdx && (
                        <div
                          className={`lsp-hover-popup lsp-code-action-popup ${lines.length - 1 - lineIdx < 6 && lineIdx >= 4 ? 'open-upward' : ''}`}
                          data-testid="lsp-code-action-popup"
                          style={{ left: `calc(${Math.min(cursor.col, 36)} * 1ch)` }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="lsp-hover-header">
                            <span className="lsp-hover-kind lsp-action-badge">CODE ACTION</span>
                            <button
                              type="button"
                              className="lsp-hover-close"
                              onClick={() => onCloseLspCodeAction?.()}
                              aria-label={t('코드 액션 닫기')}
                            >
                              Esc
                            </button>
                          </div>
                          <div className="lsp-code-action-list">
                            {lspCodeActionMenu.actions.map((act, idx) => (
                              <button
                                key={act.id}
                                type="button"
                                className={`lsp-code-action-item ${idx === lspCodeActionMenu.selectedIndex ? 'selected' : ''}`}
                                data-testid={`lsp-code-action-${idx}`}
                                onClick={() => onApplyLspCodeAction?.(idx)}
                              >
                                <span className="lsp-action-num">{idx + 1}.</span>
                                {act.kind && (
                                  <span className={`lsp-action-kind kind-${act.kind}`}>
                                    {act.kind}
                                  </span>
                                )}
                                <span className="lsp-action-title">{act.title}</span>
                              </button>
                            ))}
                          </div>
                          <div className="lsp-popup-hint">{t('숫자/Enter 선택 · Esc 취소')}</div>
                        </div>
                      )}
                      {gitHunkPreview?.isOpen && gitHunkPreview.line === lineIdx && (
                        <div
                          className={`lsp-hover-popup git-hunk-preview-popup ${lines.length - 1 - lineIdx < 6 && lineIdx >= 4 ? 'open-upward' : ''}`}
                          data-testid="git-hunk-preview-popup"
                          style={{ left: `calc(${Math.min(cursor.col, 24)} * 1ch)` }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="lsp-hover-header">
                            <span className={`lsp-hover-kind git-hunk-badge type-${gitHunkPreview.hunk.type}`}>
                              GIT {gitHunkPreview.hunk.type.toUpperCase()}
                            </span>
                            <span className="lsp-hover-symbol">
                              Hunk #{gitHunkPreview.hunk.id}
                            </span>
                            <div className="git-hunk-popup-actions">
                              {onStageGitHunk && (
                                <button
                                  type="button"
                                  className="git-hunk-action-btn stage"
                                  data-testid="git-hunk-stage-btn"
                                  onClick={() => onStageGitHunk()}
                                >
                                  Stage
                                </button>
                              )}
                              {onResetGitHunk && (
                                <button
                                  type="button"
                                  className="git-hunk-action-btn reset"
                                  data-testid="git-hunk-reset-btn"
                                  onClick={() => onResetGitHunk()}
                                >
                                  Reset
                                </button>
                              )}
                              <button
                                type="button"
                                className="lsp-hover-close"
                                onClick={() => onCloseGitHunkPreview?.()}
                                aria-label={t('Git 미리보기 닫기')}
                              >
                                Esc
                              </button>
                            </div>
                          </div>
                          <div className="git-hunk-diff-body">
                            {gitHunkPreview.hunk.removedLines.map((rl, idx) => (
                              <div key={`rem-${idx}`} className="git-hunk-line removed">
                                - {rl}
                              </div>
                            ))}
                            {gitHunkPreview.hunk.addedLines.map((al, idx) => (
                              <div key={`add-${idx}`} className="git-hunk-line added">
                                + {al}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {isCursorLine &&
                        completionSession &&
                        completionSession.candidates.length > 0 && (
                          <div
                            className={`vim-completion-menu ${lines.length - 1 - lineIdx < 6 && lineIdx >= 5 ? 'open-upward' : ''}`}
                            data-testid="vim-completion-menu"
                            style={{ left: `calc(${cursor.col} * 1ch)` }}
                          >
                            <div className="completion-header">
                              <span className="completion-prefix-tag">
                                {completionSession.type === 'cmp'
                                  ? `⚡ [nvim-cmp] ${completionSession.prefix || '*'}`
                                  : completionSession.type === 'file'
                                  ? `📁 [FILE] ${completionSession.prefix || '/'}`
                                  : completionSession.type === 'line'
                                  ? `📄 [LINE] ${completionSession.prefix.trim().slice(0, 16)}`
                                  : `🔤 [ID] ${completionSession.prefix}`}
                              </span>
                              <span className="completion-count-tag">
                                {completionSession.selectedIndex + 1}/
                                {completionSession.candidates.length}
                              </span>
                            </div>
                            <div className="completion-list">
                              {completionSession.candidates.map((cand, idx) => {
                                const isLineType = completionSession.type === 'line';
                                const cmpMeta =
                                  completionSession.type === 'cmp'
                                    ? completionSession.items?.[idx]
                                    : undefined;
                                return (
                                  <div
                                    key={`${cand}-${idx}`}
                                    ref={idx === completionSession.selectedIndex ? selectedItemRef : undefined}
                                    className={`completion-item ${
                                      idx === completionSession.selectedIndex ? 'selected' : ''
                                    }`}
                                    data-testid={`completion-item-${idx}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectCompletionItem?.(idx);
                                    }}
                                  >
                                    {cmpMeta && (
                                      <span
                                        className={`cmp-kind-badge kind-${cmpMeta.kind.toLowerCase()}`}
                                        data-testid={`cmp-kind-${idx}`}
                                      >
                                        {cmpMeta.kind === 'Snippet'
                                          ? '✂ Snip'
                                          : cmpMeta.kind === 'Function'
                                            ? 'ƒ Func'
                                            : cmpMeta.kind === 'Class'
                                              ? '◈ Class'
                                              : cmpMeta.kind === 'Property'
                                                ? '◆ Prop'
                                                : cmpMeta.kind === 'Variable'
                                                  ? '𝑥 Var'
                                                  : '𝐓 Text'}
                                      </span>
                                    )}
                                    {isLineType ? (
                                      <span className="cand-remainder">
                                        {cand.length > 50 ? `${cand.slice(0, 50)}...` : cand}
                                      </span>
                                    ) : (
                                      <>
                                        <span className="cand-match-prefix">
                                          {cand.slice(0, completionSession.prefix.length)}
                                        </span>
                                        <span className="cand-remainder">
                                          {cand.slice(completionSession.prefix.length)}
                                        </span>
                                      </>
                                    )}
                                    {cmpMeta?.detail && (
                                      <span className="cmp-item-detail">{cmpMeta.detail}</span>
                                    )}
                                    {idx === completionSession.selectedIndex && (
                                      <span className="cand-selected-indicator">⏎</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {completionSession.type === 'cmp' &&
                              completionSession.items?.[completionSession.selectedIndex]?.preview && (
                                <div className="cmp-preview-box" data-testid="cmp-preview-box">
                                  {completionSession.items[
                                    completionSession.selectedIndex
                                  ].preview!.slice(0, 5).map((pLine, pIdx) => (
                                    <div key={pIdx} className="cmp-preview-line">
                                      {pLine}
                                    </div>
                                  ))}
                                </div>
                              )}
                            <div className="completion-footer">
                              <span>
                                {completionSession.type === 'cmp'
                                  ? t('Ctrl-n/p: 이동 | Enter/Tab: 확정·스니펫 확장 | Ctrl-e: 취소')
                                  : t('Ctrl+n: 다음 | Ctrl+p: 이전 | Enter/Ctrl+y: 선택')}
                              </span>
                            </div>
                          </div>
                        )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {showSatellite && satelliteMarkers.length > 0 && (
        <div
          className="editor-satellite-bar"
          data-testid="editor-satellite-bar"
          aria-hidden="true"
        >
          {satelliteMarkers.map((marker) => (
            <span
              key={marker.id}
              className={`satellite-marker kind-${marker.kind}`}
              data-testid={
                marker.kind === 'cursor'
                  ? 'satellite-cursor-marker'
                  : `satellite-marker-${marker.kind}-${marker.line + 1}`
              }
              style={{ top: `${marker.topPercent}%` }}
              title={marker.label}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Editor;
