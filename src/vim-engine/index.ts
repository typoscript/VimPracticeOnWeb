/**
 * vim-engine — 순수 TypeScript Vim 에디터 엔진 (공개 API)
 *
 * 이 폴더 하나만 복사하면 다른 프로젝트에서 그대로 쓸 수 있습니다. 외부 라이브러리·React·DOM 에 의존하지 않습니다.
 * 바깥에서는 이 파일(index.ts)만 import 하세요. 사용법은 같은 폴더의 README.md 를 참고하세요.
 *
 *   import { createVimState, handleKey, sendKeys } from './vim-engine';
 *   let state = createVimState(['hello world']);
 *   state = sendKeys(state, 'dw');   // → ['world']
 */

// ---- 설정 ----
export { configureVimEngine, getVimEngineConfig } from './config';
export type { VimEngineConfig } from './config';

// ---- 핵심: 키 입력 → 새 상태 ----
export { handleKey, parsePending } from './vimEngine';
export { createVimState, sendKeys, runExCommand, evalVimExpression } from './api';
export { executeCommandLine, splitPipedCommands } from './commandLine';

// ---- 상태 타입 ----
export * from './types';

// ---- 화면(UI) 쪽에서 쓰는 보조 함수 ----
export { isPositionSelected } from './visual';
export { findMatches } from './search';
export { computeIncCommandPreview } from './exSubstitute';
export {
  ensureUndoTreeInitialized,
  jumpUndoSeq,
  travelUndoTime,
  buildUndotreeGraphRows,
  openUndotreePanel,
  closeUndotreePanel,
  toggleUndotreePanel,
} from './undoTreeEngine';
export type { UndotreeGraphRow } from './undoTreeEngine';
export { computeDiffHunks } from './diffEngine';
export {
  splitWindow,
  closeSplitWindow,
  closeOtherPanes,
  switchPaneFocus,
  executeWincmd,
  windo,
} from './splitWindow';
export {
  getEffectiveWindowTree,
  computePaneRects,
  findNeighborPane,
  toVimWinlayout,
  isSamePaneBuffer,
} from './windowTree';
export type { PaneRect } from './windowTree';
export { switchBuffer, ensureBuffers, syncCurrentBuffer, addBuffer, editBuffer, deleteBuffer } from './bufferEngine';
export { switchTab, openNewTab, closeTab, ensureTabPages, tabdo } from './tabEngine';
export { bufdo } from './bufferEngine';
export {
  openCommandLineWindow,
  closeCommandLineWindow,
  selectCommandLineWindowLine,
  switchCommandLineWindowType,
  clearCommandLineHistory,
  formatCommandHistory,
} from './cmdlineWindow';
export { closeQuickfixWindow, jumpToQuickfixItem, cdo, cfdo, cexprQuickfix, grepToQuickfix, parseQuickfixErrorLines } from './quickfixEngine';
export { closeLocationListWindow, jumpToLocationListItem, ldo, lfdo, lexprLocationList, grepToLocationList } from './locationListEngine';
export {
  sortDiagnostics,
  diagnosticsToQuickfixItems,
  jumpToDiagnostic,
  syncDiagnosticsToLocationList,
  syncLiveLspDiagnostics,
  openLspHover,
  closeLspHover,
} from './lspEngine';
export {
  findWholeWordMatchesInLine,
  openLspRename,
  applyLspRename,
  cancelLspRename,
  handleLspRenameKey,
  findLspReferences,
  collectCodeActionsAtCursor,
  openLspCodeActionMenu,
  closeLspCodeActionMenu,
  applyLspCodeAction,
  handleLspCodeActionKey,
  extractDocumentSymbols,
  openLspDocumentSymbols,
} from './lspRefactorEngine';
export type { LspDocumentSymbol } from './lspRefactorEngine';
export {
  DEFAULT_ERRORFORMAT,
  splitErrorformatEntries,
  compileErrorformatPattern,
  parseLinesWithErrorformat,
  runVfsGrep,
} from './errorformat';
export {
  startOrCycleCompletion,
  cancelCompletion,
  acceptCompletion,
  selectCompletionCandidate,
  findCompletionPrefix,
  scanBufferWords,
  startTagCompletion,
  startOmniCompletion,
} from './completion';
export {
  AVAILABLE_COMMANDS,
  AVAILABLE_OPTIONS,
  calculateCompletions,
  handleTabCompletion,
  selectWildmenuCandidate,
  cancelWildmenu,
  acceptWildmenu,
  listCmdlineCompletions,
} from './wildmenu';

// ---- 순정 Vim 정규식 → JavaScript RegExp ----
export {
  compileVimRegex,
  translateVimPattern,
  escapeVimPattern,
  computeSearchCount,
  computeCustomMatchSpans,
} from './vimRegex';
export type {
  CompileOptions,
  VimPatternInfo,
  ComputeSearchCountOptions,
  ComputedSearchCount,
  CustomMatchSpan,
} from './vimRegex';

// ---- Vim script 표현식 & 함수/람다/예외 처리 ----
export {
  evaluateVimScript,
  VimScriptError,
  formatValue,
  displayValue,
  isFuncref,
  makeFuncref,
  invokeFuncref,
} from './vimscriptEval';
export { runScriptLines, executeScriptBlock } from './vimscriptEngine';
export type { EvalContext } from './vimscriptEval';
export type { VimScriptFuncref } from './types';

// ---- 매크로 디버거 (매크로를 키 단위 상태 프레임으로 분해) & 레지스터 파싱 ----
export {
  buildMacroTrace,
  getMacroKeys,
  listMacroRegisters,
  clampFrameIndex,
  MACRO_PLAYBACK_SPEEDS,
  explainMacroKeyAction,
  getMacroFailureReason,
} from './macroDebugger';
export {
  formatMacroKeysToString,
  parseMacroStringToKeys,
  getRegisterContent,
  putFromRegister,
  setSystemClipboard,
} from './registers';
export type { PutOptions } from './registers';
export {
  getViewport,
  getScrolloff,
  adjustViewport,
  scrollFullPageDown,
  scrollFullPageUp,
  scrollLineDown,
  scrollLineUp,
  scrollHalfPageDown,
  scrollHalfPageUp,
  scrollToCenter,
  scrollToTop,
  scrollToBottom,
} from './viewport';
export type { MacroTrace, MacroFrame } from './macroDebugger';

// ---- 순정 맞춤법 검사기 (:set spell, ]s, [s, z=, zg, zw) ----
export {
  isWordMisspelled,
  findSpellErrorsInLine,
  findNextSpellError,
  findPrevSpellError,
  getSpellSuggestions,
  damerauLevenshtein,
} from './spellEngine';
export { DEFAULT_SPELL_WORDS } from './spellData';

// ---- 순정 Vim 마크 및 점프 리스트 엔진 (Marks & Jumps) ----
export {
  setMark,
  jumpToMark,
  formatMarksList,
  formatJumpsList,
  clearJumps,
  deleteMarks,
  deleteSingleMark,
  jumpToIndex,
  jumpOlder,
  jumpNewer,
  recordJump,
  executeMarkOperator,
  isValidMarkJumpChar,
  resolveMarkPosition,
} from './marks';

// ---- 순정 Vim 세션 관리자 (:mksession, :source Session.vim) ----
export {
  executeMakeSession,
  generateSessionScript,
  restoreSession,
  isSessionScript,
} from './sessionEngine';
export type { SessionMetadata } from './sessionEngine';

// ---- 순정 Vim 자동 명령 시스템 (:autocmd, :augroup, :doautocmd) ----
export {
  executeAutocmdCommand,
  executeAugroupCommand,
  executeDeleteAutocmd,
  executeDoAutocmd,
  triggerAutocmd,
  triggerWindowAndTabAutocmds,
  formatAutocmdList,
  normalizeEvent,
  matchAutocmdPattern,
} from './autocmdEngine';
export type { AutocmdEntry } from './types';

// ---- 순정 Vim 구문 강조 엔진 (:syntax, :syn) ----
export {
  executeSyntaxCommand,
  detectFiletype,
  tokenizeLine,
  getSyntaxTokensMap,
} from './syntaxEngine';
export type {
  SyntaxTokenType,
  SyntaxToken,
  SupportedLanguage,
} from './syntaxEngine';

// ---- 순정 Vim 환경 옵션 & 버퍼 로컬 시스템 (:set, :setlocal, :setglobal) ----
export {
  executeSetCommand,
  getOptions,
  getGlobalOptions,
  getLocalOptions,
  formatOptionsList,
  parseListchars,
  parseColorcolumn,
  DEFAULT_VIM_OPTIONS,
  OPTION_ALIASES,
} from './setEngine';
export type { ParsedListchars } from './setEngine';

// ---- 순정 텍스트 폴딩 엔진 (Folding: za, zo, zc, zM, zR, zf, zd, zD, zE) ----
export {
  foldClose,
  foldOpen,
  foldToggle,
  foldCloseAll,
  foldOpenAll,
  createFold,
  deleteFoldAtCursor,
  deleteAllFoldsAtCursor,
  eliminateAllFolds,
  detectFoldBlocks,
  detectIndentFoldBlocks,
  detectExprFoldBlocks,
  detectMarkerFoldBlocks,
  findFoldForCursor,
  jumpToNextFold,
  jumpToPrevFold,
  jumpToFoldEdge,
  getNextVisibleLine,
  getPrevVisibleLine,
  generateFoldText,
} from './folding';

// ---- 파일타입 플러그인 & 들여쓰기 시스템 (:filetype, ftplugin) ----
export {
  executeFiletypeCommand,
  applyFiletypeIndent,
  getFiletypeIndentPreset,
  getFiletypeCommentString,
  FILETYPE_INDENT_PRESETS,
  FILETYPE_COMMENTSTRING_PRESETS,
} from './ftpluginEngine';
export type { FiletypeIndentConfig } from './ftpluginEngine';

// ---- 순정 주석 토글 엔진 (gcc, gc{motion}, Visual gc, commentstring) ----
export {
  parseCommentString,
  resolveCommentString,
  isLineCommented,
  toggleCommentRange,
  getCommentTextObjectRange,
} from './commentEngine';
export type { ParsedCommentString } from './commentEngine';

// ---- 순정 텍스트 포매팅 엔진 (gq, gw, :set textwidth, :retab) ----
export {
  DEFAULT_FORMAT_WIDTH,
  formatLineRange,
  formatRange,
  getFormatOptions,
  retabLine,
  retabRange,
  displayWidth,
} from './formatEngine';
export type { FormatOptions, FormatResult, FormatCursor } from './formatEngine';

// ---- 커서 아래 파일 점프 엔진 (gf, gF, Ctrl-w f) ----
export {
  extractFileTargetAtCursor,
  resolveFileFromProject,
  gotoFileUnderCursor,
} from './gotoFileEngine';
export type { ExtractedFileTarget } from './gotoFileEngine';

// ---- 순정 Vim ctags 심볼 탐색 및 태그 스택 (:tag, :pop, :tags, :tselect, :tjump, :tnext, :tprev) ----
export {
  findTags,
  findTag,
  jumpToTag,
  popTagStack,
  formatTagStack,
  tselectTag,
  tjumpTag,
  cycleTagMatch,
  formatTagMatches,
} from './tagEngine';

// ---- 순정 Netrw 파일 탐색기 & 북마크 시스템 (:Explore, :Bookmark, mb, gb) ----
export {
  openNetrw,
  closeNetrw,
  handleNetrwKey,
  generateNetrwLines,
  addNetrwBookmark,
  removeNetrwBookmark,
  goToNetrwBookmark,
  formatNetrwBookmarks,
} from './netrwEngine';

// ---- 순정 파일 & 버퍼 퍼지 파인더 (:find, :Files, :Buffers) ----
export {
  fuzzyMatch,
  searchFilesFuzzy,
  searchBuffersFuzzy,
  openFuzzyFinder,
  closeFuzzyFinder,
  updateFuzzyFinderQuery,
  moveFuzzyFinderSelection,
  selectFuzzyFinderItem,
  executeFindFileCommand,
  handleFuzzyFinderKey,
  searchGrepMatches,
  sendGrepToQuickfix,
  LIVE_GREP_MAX_RESULTS,
} from './fuzzyFinder';
export type {
  FuzzyMatchResult,
  FuzzyFileItem,
  FuzzyBufferItem,
  GrepMatchItem,
} from './fuzzyFinder';

// ---- 순정 Vim 내장 도움말 시스템 (:help, K, F1, 태그 점프) ----
export {
  openHelp,
  closeHelp,
  jumpHelpTag,
  popHelpTag,
  handleHelpKey,
} from './helpEngine';
export {
  HELP_TOPICS,
  resolveHelpTag,
} from './helpData';
export type {
  HelpDocTopic,
  HelpTagMatch,
} from './helpData';

// ---- 순정 Vim 약어 엔진 (:iabbrev, :cabbrev, :abbrev, :unabbrev, :abclear, Ctrl-]) ----
export {
  isAbbrevWordChar,
  isAbbrevTriggerKey,
  findMatchingAbbrev,
  isAbbrevManagementCmd,
  formatAbbrevsList,
  registerAbbrev,
  unregisterAbbrev,
  clearAbbrevs,
  executeAbbrevCommand,
  expandCmdlineAbbrev,
} from './abbrevEngine';
export type { AbbrevMode, AbbrevMatch } from './abbrevEngine';
export type { AbbreviationEntry } from './types';

// ---- 가상 POSIX 셸 파이프·필터링 (:!cmd, :[range]!cmd, :r !cmd, :w !cmd) ----
export {
  expandShellCommand,
  splitShellPipeline,
  runShellPipeline,
  executeShellCommand,
  executeFilterRange,
  executeReadShell,
  executeWriteShell,
} from './shellEngine';
export type { ShellExecResult } from './shellEngine';

// ---- 다이그래프(Ctrl-k) & UTF-8 바이트 조회(g8) ----
export { COMMON_DIGRAPHS, lookupDigraph, formatDigraphsList, executeDigraphCommand } from './digraphs';
export { getCmdlineCursorCol } from './cmdlineEdit';
export { describeCharAt, describeCharUtf8Bytes } from './engineHelpers';
export {
  DEFAULT_VISIBLE_ROWS,
  DEFAULT_VISIBLE_COLS,
  scrollColsLeft,
  scrollColsRight,
  scrollHalfColsLeft,
  scrollHalfColsRight,
  scrollCursorToRight,
  scrollCursorToLeft,
  handleHorizontalViewportKey,
} from './viewport';

// ---- 개발용 불변성 검사 ----
export { withInvariantCheck, assertValidVimState, deepFreeze } from './invariants';

// ---- Treesitter 스타일 구조적 텍스트 객체 (af/if, ac/ic, aa/ia) 및 함수 점프 (]f/[f/]F/[F) ----
export {
  getTreesitterObjectRange,
  detectFunctions,
  detectClasses,
  findFunctionJumpTarget,
} from './treesitterTextObjects';
export type { TreesitterObjectType, StructuralNode } from './treesitterTextObjects';

// ---- gitsigns.nvim 스타일 Git Hunk 거터·탐색(]h/[h)·미리보기·리셋·스테이징 (:Gitsigns) ----
export {
  getEffectiveGitBaseLines,
  computeGitHunks,
  getGitHunks,
  getGitLineSigns,
  findGitHunkAtLine,
  jumpGitHunk,
  previewGitHunk,
  closeGitHunkPreview,
  resetGitHunk,
  resetGitBuffer,
  stageGitHunk,
  undoStageGitHunk,
  executeGitsignsCommand,
} from './gitSignsEngine';
export type { GitHunk, GitHunkPreviewState } from './types';

// ---- Neovim Lua 미니 레이어 (:lua, :=expr, :luafile, :source init.lua) ----
export {
  executeLuaChunk,
  executeLuaPrintExpr,
  executeLuaFile,
  formatLuaValue,
} from './luaEngine';

// ---- flash.nvim 스타일 화면 전체 라벨 점프 (gs, dgs/cgs/ygs, :Flash) ----
export {
  computeFlashMatches,
  openFlashJump,
  cancelFlashJump,
  executeFlashJumpToMatch,
  handleFlashJumpKey,
} from './flashJumpEngine';
export type { FlashJumpMatch, FlashJumpSession } from './types';

// ---- oil.nvim 스타일 버퍼 기반 파일시스템 편집 (:Oil, Enter, -, :w) ----
export {
  buildOilDirectoryEntries,
  openOilBuffer,
  closeOilBuffer,
  applyOilBufferChanges,
  handleOilNavigationKey,
} from './oilEngine';
export type { OilEntrySnapshot, OilSessionState } from './types';

// ---- harpoon.nvim 스타일 파일 핀 & 원키 프로젝트 전환 (:HarpoonAdd, :HarpoonMenu, :Harpoon [N]) ----
export {
  addHarpoonFile,
  removeHarpoonFile,
  clearHarpoonList,
  openHarpoonMenu,
  closeHarpoonMenu,
  selectHarpoonSlot,
  cycleHarpoonFile,
  handleHarpoonMenuKey,
  executeHarpoonCommand,
} from './harpoonEngine';
export type { HarpoonMenuState } from './types';

// ---- yanky.nvim 스타일 Yank Ring (p/P 직후 Ctrl-p/Ctrl-n, :YankyRingHistory, :Yanks) ----
export {
  YANK_HISTORY_LIMIT,
  pushYankHistory,
  openYankyMenu,
  closeYankyMenu,
  clearYankHistory,
  cycleYankRing,
  handleYankyMenuKey,
  executeYankyCommand,
} from './yankRingEngine';
export type { YankyMenuState, YankRingSession } from './types';

// ---- nvim-spectre 스타일 프로젝트 대화형 검색·치환 분할 패널 (:Spectre) ----
export {
  collectSpectreMatches,
  openSpectrePanel,
  closeSpectrePanel,
  toggleSpectrePanel,
  updateSpectreQuery,
  toggleSpectreItem,
  toggleAllSpectreItems,
  jumpToSpectreItem,
  applySpectreReplaceAll,
  executeSpectreCommand,
} from './spectreEngine';
export type { SpectreMatchItem, SpectreSessionState } from './types';

// ---- mini.move 스타일 줄·선택 블록 즉시 이동 (Alt-h/j/k/l) ----
export {
  parseMiniMoveDirection,
  handleMiniMoveNormal,
  handleMiniMoveVisual,
} from './miniMoveEngine';
export type { MiniMoveDirection } from './miniMoveEngine';

// ---- mini.ai 스타일 Next/Last 텍스트 객체 (in/an/il/al) ----
export { getMiniAiNextLastRange } from './textObjects';
export type { MiniAiScope } from './textObjects';

// ---- trouble.nvim 스타일 프로젝트 진단·TODO·퀵픽스 통합 허브 (:Trouble) ----
export {
  collectTroubleItems,
  openTroublePanel,
  closeTroublePanel,
  toggleTroublePanel,
  setTroubleMode,
  jumpToTroubleItem,
  executeTroubleCommand,
} from './troubleEngine';
export type {
  TroubleMode,
  TroubleSeverity,
  TroubleItem,
  TroubleSessionState,
} from './types';

// ---- vim-visual-multi 스타일 다중 커서 선택·동시 편집 (g Ctrl-n / :MultiCursor) ----
export {
  startMultiCursor,
  exitMultiCursor,
  handleMultiCursorKey,
} from './multiCursorEngine';
export type { MultiCursorSelection, MultiCursorSession } from './types';

// ---- dial.nvim 스타일 스마트 토글·증감 (Ctrl-a / Ctrl-x / :DialInc / :DialDec) ----
export {
  findIsoDateTokenAtOrAfter,
  findDialToken,
  applyDialMatch,
  executeDialCommand,
  DIAL_VALUE_CYCLES,
  DIAL_OPERATOR_CYCLES,
  DIAL_KEYWORD_CYCLES,
} from './dialEngine';
export type { DialTokenMatch } from './dialEngine';

// ---- vim-abolish 스타일 식별자 케이스 변환 (crs / crc / crm / cru / cr- / cr. / :Coerce) ----
export {
  ABOLISH_KEY_TO_VARIANT,
  splitIdentifierWords,
  coerceIdentifierCase,
  findIdentifierRangeAtCursor,
  applyAbolishCoerce,
  executeAbolishCommand,
} from './abolishEngine';
export type { AbolishCaseVariant } from './abolishEngine';

// ---- treesj 스타일 구조적 Split/Join (gS / :TSJToggle / :TSJSplit / :TSJJoin) ----
export {
  splitTopLevelItems,
  executeTreesj,
} from './treesjEngine';
export type { TreesjAction } from './treesjEngine';

// ---- Neovim 내장 가상 터미널 버퍼 (:terminal / :term / :ToggleTerm / Ctrl-\ Ctrl-n) ----
export {
  openTerminalBuffer,
  toggleTerminalBuffer,
  closeTerminalBuffer,
  enterTerminalInsertMode,
  handleTerminalModeKey,
} from './terminalEngine';
export type { TerminalSessionState } from './types';

// ---- 실무 캡스톤 가상 테스트 러너 (:TestRun / 터미널 npm test) ----
export {
  evaluateVirtualTests,
  formatVirtualTestOutput,
  runVirtualTests,
} from './testRunnerEngine';
export type {
  VirtualTestSpec,
  VirtualTestCaseResult,
  VirtualTestRunResult,
} from './types';

// ---- nvim-autopairs & LuaSnip 스타일 스니펫 엔진 (:set autopairs, :Snippets) ----
export {
  handleAutopairsChar,
  handleAutopairsBackspace,
  handleAutopairsEnter,
} from './autopairsEngine';
export {
  BUILTIN_SNIPPETS,
  tryExpandSnippetOnTab,
  jumpSnippetTabstop,
  formatSnippetsList,
} from './snippetEngine';
export type { SnippetDefinition } from './snippetEngine';
export type { SnippetTabstop, SnippetSession } from './types';

// ---- vim-fugitive 스타일 미니 Git 워크플로 (:Git / :Gstatus / :Gblame / :Glog) ----
export {
  computeGitBlameLines,
  executeGitCommand,
} from './gitFugitiveEngine';
export type { GitCommitEntry, GitBlameInfo } from './types';
