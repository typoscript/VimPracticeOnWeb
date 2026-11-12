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
export { computeDiffHunks } from './diffEngine';
export { switchPaneFocus, executeWincmd } from './splitWindow';
export { switchBuffer, ensureBuffers, syncCurrentBuffer, addBuffer, editBuffer, deleteBuffer } from './bufferEngine';
export { switchTab, openNewTab, closeTab, ensureTabPages, tabdo } from './tabEngine';
export { bufdo } from './bufferEngine';
export { closeCommandLineWindow } from './cmdlineWindow';
export { closeQuickfixWindow, jumpToQuickfixItem, cdo, cfdo } from './quickfixEngine';
export { closeLocationListWindow, jumpToLocationListItem, ldo, lfdo } from './locationListEngine';
export {
  startOrCycleCompletion,
  cancelCompletion,
  acceptCompletion,
  selectCompletionCandidate,
  findCompletionPrefix,
  scanBufferWords,
} from './completion';

// ---- 순정 Vim 정규식 → JavaScript RegExp ----
export { compileVimRegex, translateVimPattern, escapeVimPattern } from './vimRegex';
export type { CompileOptions, VimPatternInfo } from './vimRegex';

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
} from './macroDebugger';
export {
  formatMacroKeysToString,
  parseMacroStringToKeys,
  getRegisterContent,
} from './registers';
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
  DEFAULT_VIM_OPTIONS,
  OPTION_ALIASES,
} from './setEngine';

// ---- 파일타입 플러그인 & 들여쓰기 시스템 (:filetype, ftplugin) ----
export {
  executeFiletypeCommand,
  applyFiletypeIndent,
  getFiletypeIndentPreset,
  FILETYPE_INDENT_PRESETS,
} from './ftpluginEngine';
export type { FiletypeIndentConfig } from './ftpluginEngine';

// ---- 개발용 불변성 검사 ----
export { withInvariantCheck, assertValidVimState, deepFreeze } from './invariants';
