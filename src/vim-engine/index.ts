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
export { executeCommandLine } from './commandLine';

// ---- 상태 타입 ----
export * from './types';

// ---- 화면(UI) 쪽에서 쓰는 보조 함수 ----
export { isPositionSelected } from './visual';
export { findMatches } from './search';
export { computeDiffHunks } from './diffEngine';
export { switchPaneFocus } from './splitWindow';
export { switchBuffer, ensureBuffers, syncCurrentBuffer } from './bufferEngine';
export { switchTab, openNewTab, closeTab, ensureTabPages } from './tabEngine';
export { closeCommandLineWindow } from './cmdlineWindow';
export { closeQuickfixWindow, jumpToQuickfixItem } from './quickfixEngine';
export { closeLocationListWindow, jumpToLocationListItem } from './locationListEngine';

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
export { runScriptLines } from './vimscriptEngine';
export type { EvalContext } from './vimscriptEval';
export type { VimScriptFuncref } from './types';

// ---- 매크로 디버거 (매크로를 키 단위 상태 프레임으로 분해) ----
export {
  buildMacroTrace,
  getMacroKeys,
  listMacroRegisters,
  clampFrameIndex,
  MACRO_PLAYBACK_SPEEDS,
} from './macroDebugger';
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

// ---- 개발용 불변성 검사 ----
export { withInvariantCheck, assertValidVimState, deepFreeze } from './invariants';
