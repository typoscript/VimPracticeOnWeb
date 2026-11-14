export type VimMode = 'NORMAL' | 'INSERT' | 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK' | 'COMMAND' | 'SEARCH' | 'REPLACE';

export interface CursorPosition {
  line: number; // 0-indexed 줄 번호
  col: number;  // 0-indexed 열 번호
}

/** Vim script 함수 참조 또는 람다 */
export interface VimScriptFuncref {
  kind: 'funcref';
  /** 함수 이름 (내장 함수 또는 사용자 정의 함수) */
  name?: string;
  /** 람다 정의 */
  lambda?: {
    params: string[];
    bodyExpr: string;
    closureVars?: Record<string, VimScriptValue>;
    closureArgs?: Record<string, VimScriptValue>;
  };
  /** 부분 적용 인자 (function('fn', [arg1])) */
  args?: VimScriptValue[];
  /** 바인딩된 딕셔너리 */
  dict?: VimScriptDict;
}

/** Vim script 값: 숫자, 문자열, 리스트, 딕셔너리, 함수 참조(람다) */
export type VimScriptValue =
  | number
  | string
  | VimScriptValue[]
  | VimScriptDict
  | VimScriptFuncref;

/** Vim script 딕셔너리 ({'key': value}). 키는 항상 문자열이며 입력 순서를 유지합니다. */
export interface VimScriptDict {
  kind: 'dict';
  items: Record<string, VimScriptValue>;
}

/** 사용자 정의 함수 (:function[!] Name(params) [range] [abort] ... :endfunction) */
export interface UserFunction {
  name: string;
  params: string[];
  /** 마지막 인자가 ... 인 가변 인자 함수 (a:0 = 추가 인자 개수, a:1 ...) */
  varargs: boolean;
  /** range 속성: [range]call 시 줄마다 호출하지 않고 한 번만 호출 (a:firstline, a:lastline) */
  range: boolean;
  /** abort 속성: 본문에서 에러가 나면 즉시 중단 */
  abort: boolean;
  body: string[];
}

/** 자동 명령 엔트리 (:autocmd [group] {event} {pat} [nested] {cmd}) */
export interface AutocmdEntry {
  id: number;
  group?: string;
  event: string;
  pattern: string;
  command: string;
  nested?: boolean;
  bufferId?: number;
}

/** 커맨드라인에서 :function 본문을 입력 중인 상태 (:endfunction 으로 확정) */
export interface FunctionDraft extends UserFunction {
  overwrite: boolean;
}

/** 사용자 정의 Ex 명령 (:command[!] [-nargs] [-range] [-bang] Name replacement) */
export interface UserCommand {
  name: string;
  /** 인자 개수: 0(없음), 1(정확히 1개), *(0개 이상), ?(0 또는 1개), +(1개 이상) */
  nargs: '0' | '1' | '*' | '?' | '+';
  /** 범위 허용 여부와 기본값: none(불허), line(현재 줄), file(-range=%, 전체) */
  range: 'none' | 'line' | 'file';
  /** ! 로 호출 가능 여부 (-bang) */
  bang: boolean;
  /** 실행할 Ex 명령 (<args>, <q-args>, <line1>, <line2>, <bang>, <lt> 치환) */
  replacement: string;
}

export interface AbbreviationEntry {
  mode: 'i' | 'c';
  lhs: string;
  rhs: string;
  noremap: boolean;
}

export interface ClipboardRegister {
  type: 'line' | 'text';
  content: string;
}

export interface StateSnapshot {
  lines: string[];
  cursor: CursorPosition;
}

export interface MarkPosition {
  row: number;
  col: number;
  bufferId?: number;
  filename?: string;
}

export interface SearchMatch {
  line: number;
  col: number;
  length: number;
}

export type SearchOffsetType = 'start' | 'end' | 'line';

export interface SearchOffset {
  type: SearchOffsetType;
  offset: number;
}

export interface ConfirmSubstituteMatch {
  line: number;
  col: number;
  length: number;
  matchedText: string;
  groups: (string | undefined)[];
  replacement: string;
}

export interface ConfirmSubstituteSession {
  range: { startLine: number; endLine: number };
  oldText: string;
  newText: string;
  flags: string;
  isGlobal: boolean;
  /** 'ignorecase'·'smartcase'·i/I 플래그를 반영해 확정한 대소문자 무시 여부 */
  isIgnoreCase: boolean;
  commandStr: string;
  substitutedCount: number;
  currentMatch: ConfirmSubstituteMatch;
  /** 패턴 안의 ~ 가 가리키는 직전 치환 문자열 */
  tildeText?: string;
}

export interface VimBuffer {
  id: number;
  name: string;
  lines: string[];
  cursor: CursorPosition;
  undoStack?: StateSnapshot[];
  redoStack?: StateSnapshot[];
  isModified?: boolean;
  /** 버퍼 로컬 옵션 (:setlocal) */
  localOptions?: Partial<VimOptions>;
  /** 버퍼 파일타입 */
  filetype?: string;
}

export interface VimTabPage {
  id: number;
  filename: string;
  lines: string[];
  cursor: CursorPosition;
  mode: VimMode;
  visualAnchor?: CursorPosition;
  undoStack?: StateSnapshot[];
  redoStack?: StateSnapshot[];
  splitDirection?: SplitDirection;
  activePaneIndex?: number;
  splitPanes?: [SplitPaneState, SplitPaneState];
  primaryFilename?: string;
  secondaryFilename?: string;
  currentBufferId?: number;
  alternateBufferId?: number;
}

export interface CommandLineWindowSession {
  type: ':' | '/' | '?';
  lines: string[];
  cursor: CursorPosition;
  mode: VimMode;
  visualAnchor?: CursorPosition;
  pendingKeys?: string;
  undoStack?: StateSnapshot[];
  redoStack?: StateSnapshot[];
}

export interface QuickfixItem {
  filename: string;
  bufferId?: number;
  line: number; // 1-based 라인 번호 (Vim 표준)
  col: number;  // 1-based 컬럼 번호 (Vim 표준)
  text: string;
  type?: 'E' | 'W' | 'I'; // Error, Warning, Info
}

export interface QuickfixState {
  items: QuickfixItem[];
  currentIndex: number; // 0-based 인덱스
  isOpen: boolean;
  height?: number;
}

export interface ArgListState {
  files: string[];
  currentIndex: number; // 0-based 인덱스
}

export interface NetrwState {
  isOpen: boolean;
  currentPath: string; // e.g. "" 또는 "src"
  returnBufferId?: number;
  returnFilename?: string;
  files: Record<string, string[]>; // 가상 파일 맵: 경로 -> 줄 목록
  pendingKey?: string; // 대기 중인 접두어 키 ('m', 'g' 등)
}

export interface FuzzyFinderState {
  isOpen: boolean;
  mode: 'files' | 'buffers';
  query: string;
  selectedIndex: number;
}

export interface VimOptions {
  /** 줄 번호 표시 여부 (:set nu / nonu) */
  number: boolean;
  /** 상대 줄 번호 표시 여부 (:set rnu / nornu) */
  relativenumber: boolean;
  /** 검색 대소문자 무시 여부 (:set ic / noic) */
  ignorecase: boolean;
  /** 스마트 대소문자 (대문자 포함 시 대소문자 구분) (:set scs / noscs) */
  smartcase: boolean;
  /** 검색어 하이라이트 여부 (:set hls / nohls) */
  hlsearch: boolean;
  /** 자동 줄바꿈 여부 (:set wrap / nowrap) */
  wrap: boolean;
  /** 현재 커서 라인 하이라이트 (:set cul / nocul) */
  cursorline: boolean;
  /** 탭 문자 너비 (:set ts=4) */
  tabstop: number;
  /** 들여쓰기 너비 (:set sw=4) */
  shiftwidth: number;
  /** 탭 대신 공백 사용 (:set et / noet) */
  expandtab: boolean;
  /** 자동 줄바꿈·gq 포맷 폭 (:set tw=40, 0 이면 gq 는 79열 기준) */
  textwidth?: number;
  /** 커서 위아래로 유지할 여유 줄 수 (:set so=5, :set scrolloff=5) */
  scrolloff?: number;
  /** 탭/공백 특수문자 표시 (:set list / nolist) */
  list: boolean;
  /** 명령행 완성 와일드메뉴 표시 여부 (:set wildmenu / nowildmenu) */
  wildmenu: boolean;
  /** 맞춤법 검사기 활성화 여부 (:set spell / nospell) */
  spell?: boolean;
  /** 현재 버퍼 파일타입 (:set ft=... / :set filetype=...) */
  filetype?: string;
  /** 구문 강조 활성화 여부 또는 지정 언어 (:syntax on / off, :set syntax=...) */
  syntax?: boolean | string;
  /** 폴딩 방식 (:set fdm=manual / indent / marker / syntax / expr, :set foldmethod=...) */
  foldmethod?: 'manual' | 'indent' | 'marker' | 'syntax' | 'expr';
  /** 폴드 레벨 (:set fdl=0 / :set foldlevel=...) */
  foldlevel?: number;
  /** 주석 포맷 문자열 (:set cms=//\ %s, :set commentstring=#\ %s) */
  commentstring?: string;
}

/** 맞춤법 검사기 오탈자 정보 */
export interface SpellError {
  word: string;
  line: number;
  startCol: number;
  endCol: number;
}

/** z= 맞춤법 교체 추천 세션 */
export interface SpellSuggestSession {
  word: string;
  line: number;
  col: number;
  suggestions: string[];
  input: string;
}

export interface TagEntry {
  name: string;
  filename: string;
  line: number;
  col: number;
}

export interface TagStackItem {
  tag: string;
  filename: string;
  cursor: CursorPosition;
}

export interface WildmenuState {
  /** 와일드메뉴 활성 상태 */
  active: boolean;
  /** 현재 완성 후보 목록 */
  candidates: string[];
  /** 현재 선택된 후보 인덱스 (0 .. candidates.length - 1) */
  selectedIndex: number;
  /** Tab 키 누르기 직전의 원본 커맨드라인 텍스트 */
  originalBuffer: string;
  /** 완성 인수 앞부분 (예: "set " 또는 "e ") */
  prefix: string;
}

export interface RegisterEntry {
  type: 'char' | 'line' | 'macro';
  content: string | string[];
}

export interface MacroRecording {
  register: string;
  keys: string[];
}

export interface BlockInsertSession {
  lines: number[];         // 일괄 삽입이 적용될 행 번호 목록
  col: number;             // 삽입 기준 열 번호
  insertMode: 'I' | 'A' | 'c';
  typedChars: string[];    // INSERT 세션 중 입력된 문자 목록
}

export interface CompletionSession {
  prefix: string;
  prefixStartCol: number;
  candidates: string[];
  selectedIndex: number; // 0-indexed into candidates
  originalWord: string;
  /** 자동완성 종류: 단어(keyword), 파일 경로(file), 전체 라인(line) */
  type?: 'keyword' | 'file' | 'line';
}

export interface LastVisualSelection {
  mode: 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK';
  anchor: CursorPosition;
  cursor: CursorPosition;
}

export interface ChangeListItem {
  row: number;
  col: number;
  line: number;
}


export interface ViewportState {
  topRow: number;       // 현재 화면 최상단 행 번호 (0-indexed)
  visibleRows: number;  // 화면에 한 번에 표시되는 행 개수
}

export interface FoldRange {
  startRow: number; // 0-indexed 시작 행
  endRow: number;   // 0-indexed 종료 행
  closed: boolean;  // 접힘 여부
  manual?: boolean; // 수동 생성 폴드(zf) 여부
}

export type SplitDirection = 'none' | 'horizontal' | 'vertical';

export interface SplitPaneState {
  filename: string;
  lines: string[];
  cursor: CursorPosition;
  mode: VimMode;
  visualAnchor?: CursorPosition;
  viewport?: ViewportState;
  undoStack?: StateSnapshot[];
  redoStack?: StateSnapshot[];
  pendingKeys?: string;
  blockInsertSession?: BlockInsertSession | null;
  /** 해당 창이 diff 모드인지 여부 (:diffsplit, :diffthis) */
  diff?: boolean;
  /** 해당 분할 창의 로케이션 리스트 (:lopen, :lclose, :lnext, :lprev, :lvimgrep) */
  locationList?: QuickfixState | null;
}

export interface DiffHunk {
  id: number;
  pane0Start: number;
  pane0Count: number;
  pane1Start: number;
  pane1Count: number;
  type: 'change' | 'add' | 'delete';
}

export interface UndoTreeNode {
  seq: number;
  parentSeq: number | null;
  timestamp: number;
  lines: string[];
  cursor: CursorPosition;
  saveNumber?: number;
}

export interface VimEditorState {
  lines: string[];
  cursor: CursorPosition;
  mode: VimMode;
  visualAnchor?: CursorPosition; // VISUAL 모드 선택 시작점
  pendingKeys?: string; // gg, dd, dw 등 다중 키 입력을 위한 버퍼
  clipboard?: ClipboardRegister;
  /** 실제 시스템/OS 클립보드 연동용 문자열 버퍼 ("+, "* 레지스터) */
  systemClipboard?: string;
  undoStack?: StateSnapshot[];
  redoStack?: StateSnapshot[];
  /** 마지막으로 완료된 버퍼 변경 명령어 키 시퀀스 ('.' 반복용) */
  lastChangeKeys?: string[];
  /** 현재 진행 중인 변경 명령어 키 시퀀스 버퍼 */
  currentChangeKeys?: string[];
  /** 커맨드라인(:) 또는 검색(/) 입력 버퍼 */
  commandBuffer?: string;
  /** 커맨드라인 종류 (':' | '/' | '=') */
  commandType?: ':' | '/' | '=';
  /** 마지막 검색어 ('n', 'N', '*' 재검색용) */
  lastSearchQuery?: string;
  /** 커맨드라인 또는 검색 실행 결과 피드백 메시지 (예: '10번째 줄로 이동', 'E492: 알 수 없는 명령어') */
  commandMessage?: string;
  /** 멀티 레지스터 저장소 */
  registers?: Record<string, { type: 'char' | 'line' | 'macro'; content: string | string[] }>;
  /** 현재 선택된 대상 레지스터 ("a~"z, "0, "_ 등) */
  activeRegister?: string | null;
  /** 현재 매크로 녹화 상태 */
  recordingMacro?: { register: string; keys: string[] } | null;
  /** 가장 마지막에 실행했던 매크로 레지스터 이름 (@@ 재실행용) */
  lastPlayedMacro?: string | null;
  /** 직전 키가 실패했음을 나타내는 일시적 신호 (Vim의 벨/에러). 매 키 입력 시작 시 제거되며, 매크로·`.`·`:normal`·키매핑 재생은 이 신호에서 중단됩니다. */
  bell?: boolean;
  /** 직전 줄 내 문자 탐색 정보 (';' 및 ',' 반복용) */
  lastCharSearch?: { type: 'f' | 'F' | 't' | 'T'; char: string } | null;
  /** 마크 위치 저장소 (m{a-zA-Z}, 전역 마크 A-Z는 파일/버퍼 위치 포함) */
  marks?: Record<string, MarkPosition>;
  /** 점프 리스트 (Ctrl+o, Ctrl+i) */
  jumpList?: Array<{ row: number; col: number }>;
  /** 점프 리스트 현재 인덱스 */
  jumpIndex?: number;
  /** 비주얼 블록(Ctrl+v) 다중 줄 동시 삽입 세션 */
  blockInsertSession?: BlockInsertSession | null;
  /** 화면 뷰포트 상태 (zz, zt, zb, H, M, L, Ctrl+d/u 스크롤용) */
  viewport?: ViewportState;
  /** 창 분할 방향 (:sp, :vsp, Ctrl+w) */
  splitDirection?: SplitDirection;
  /** 현재 활성 포커스 창 인덱스 (0: 주 창, 1: 보조 창) */
  activePaneIndex?: number;
  /** 분할된 윈도우 페인 목록 */
  splitPanes?: [SplitPaneState, SplitPaneState];
  /** 분할 창 크기 비율 (기본 50: 50%) */
  splitRatio?: number;
  /** 직전에 활성화되었던 창 인덱스 (Ctrl-w p 용) */
  previousPaneIndex?: number;
  /** 주 창 파일명 (예: source.ts) */
  primaryFilename?: string;
  /** 보조 창 파일명 (예: target.ts) */
  secondaryFilename?: string;
  /** 보조 창 초기 줄 내용 (미션 로드용) */
  secondaryLines?: string[];
  /** 사용자 정의 키매핑 테이블 (예: { 'i:jk': '<Esc>', 'n:<leader>w': ':w' }) */
  userKeymaps?: Record<string, string>;
  /** 사용자 정의 입력/명령행 약어 (:iabbrev, :cabbrev, :abbrev, 키: 'i:teh' | 'c:W') */
  abbreviations?: Record<string, AbbreviationEntry>;
  /** Insert/Command 모드 Ctrl-v 직후 다음 키를 리터럴로 처리할지 여부 */
  literalNextPending?: boolean;
  /** 사용자 정의 Ex 명령 (:command! Name ...) */
  userCommands?: Record<string, UserCommand>;
  /** :nohlsearch 로 검색 하이라이트를 잠시 끈 상태 (다음 검색·n·N·*·# 에서 해제) */
  hlsearchSuppressed?: boolean;
  /** 직전 :s 의 패턴·치환 문자열·플래그 (:&, :&&, &, g&, ~, 빈 패턴 :s//new/ 에 사용) */
  lastSubstitute?: { pattern: string; replacement: string; flags: string };
  /** 사용자 정의 함수 (:function) */
  userFunctions?: Record<string, UserFunction>;
  /** 전역 변수 (:let g:x = ..., 함수 밖의 :let x = ...) */
  globalVars?: Record<string, VimScriptValue>;
  /** 커맨드라인에서 입력 중인 함수 정의 */
  functionDraft?: FunctionDraft | null;
  /** 리더 키 (Leader Key, 기본값: ' ') */
  leaderKey?: string;
  /** $ 키 입력 후 j/k 수직 이동 시 줄 끝 유지 여부 (Vim sticky end-of-line) */
  stickyDollar?: boolean;
  /** 코드 폴딩 목록 (zc, zo, za, zR, zM) */
  folds?: FoldRange[];
  /** Insert 모드 일회성 Normal 명령 실행 세션 (Ctrl+o) */
  insertNormalSession?: boolean;
  /** Insert 모드 및 Command 모드 Ctrl+r 레지스터 입력 대기 상태 */
  insertRegisterPending?: boolean;
  /** Ctrl+r = 또는 "= 표현식 레지스터 계산 완료 후 복귀할 컨텍스트 */
  expressionReturnContext?: {
    mode: 'INSERT' | 'COMMAND' | 'NORMAL';
    cursor?: CursorPosition;
    commandBuffer?: string;
  } | null;
  /** 버퍼 내 단어 자동완성 팝업 세션 (Ctrl+n, Ctrl+p) */
  completionSession?: CompletionSession | null;
  /** Insert 모드 Ctrl+x 자동완성 서브모드 활성 여부 (^X mode) */
  insertCtrlXMode?: boolean;
  /** 마지막 INSERT 모드 종료 시점의 커서 위치 (gi용) */
  lastInsertPos?: { row: number; col: number; line: number } | null;
  /** 직전 비주얼 모드 선택 영역 정보 (gv 복구용) */
  lastVisualSelection?: LastVisualSelection | null;
  /** 버퍼 텍스트 변경 위치 히스토리 목록 (g;, g, 순회용) */
  changeList?: ChangeListItem[];
  /** changeList 현재 인덱스 */
  changeIndex?: number;
  /** 마지막 검색 시 사용된 커서 오프셋 (/pattern/e, /pattern/+1 등) */
  lastSearchOffset?: SearchOffset | null;
  /** 검색 모드 진입 전 대기 중이던 연산자 정보 (예: d/pattern/e) */
  searchOperator?: {
    op: string;
    count?: number;
    initialCursor: CursorPosition;
  } | null;
  /** :s/.../.../gc 대화형 치환 확인 세션 */
  confirmSubstitute?: ConfirmSubstituteSession | null;
  /** REPLACE (R) 모드에서 백스페이스 시 복원할 원래 문자 스택 */
  replaceStack?: { char: string; line: number; col: number }[];
  /** 열려 있는 버퍼 목록 (:ls, :b, :bn, :bp, :bd) */
  buffers?: VimBuffer[];
  /** 현재 활성화된 버퍼 ID */
  currentBufferId?: number;
  /** 직전 대안 버퍼 ID ('#' 및 Ctrl-^용) */
  alternateBufferId?: number;
  /** 열려 있는 탭 페이지 목록 (:tabnew, :tabc, :tabn, gt, gT) */
  tabPages?: VimTabPage[];
  /** 현재 활성화된 탭 페이지 ID */
  currentTabId?: number;
  /** Ex 커맨드 실행 히스토리 목록 */
  commandHistory?: string[];
  /** 검색어 히스토리 목록 */
  searchHistory?: string[];
  /** 현재 커맨드라인 히스토리 탐색 인덱스 */
  historyIndex?: number;
  /** 히스토리 탐색 시작 전 원래 타이핑 중이던 임시 버퍼 */
  historyDraft?: string;
  /** 커맨드라인 윈도우(q:, q/, Ctrl-f) 활성 세션 */
  cmdlineWindow?: CommandLineWindowSession | null;
  /** 퀵픽스(Quickfix) 목록 및 윈도우 상태 (:copen, :cn, :cp, :vimgrep) */
  quickfix?: QuickfixState | null;
  /** 로케이션 리스트 (Location List: :lopen, :lclose, :lnext, :lprev, :lvimgrep) */
  locationList?: QuickfixState | null;
  /** 아규먼트 리스트 (Arglist: :args, :argdo, :next, :prev) */
  argList?: ArgListState | null;
  /** Netrw 순정 파일 탐색기 상태 (:Explore, :edit ., :E) */
  netrw?: NetrwState | null;
  /** Netrw 디렉터리 북마크 목록 (mb, gb, :Bookmark) */
  netrwBookmarks?: string[];
  /** 현재 활성 Netrw 북마크 인덱스 (gb 순환 이동용) */
  netrwBookmarkIndex?: number;
  /** 가상 파일 시스템 맵 (Netrw % 파일 생성, d 디렉터리 생성 반영) */
  virtualFiles?: Record<string, string[]>;
  /** 레지스터 인스펙터 패널 표시 여부 (:reg, :registers) */
  showRegisterInspector?: boolean;
  /** 마크 & 점프 리스트 비주얼 맵 패널 표시 여부 (:marks, :jumps) */
  showMarksVisualizer?: boolean;
  /** 커스텀 설정 및 .vimrc 내보내기/다운로드 모달 표시 여부 (:vimrc, :export, :config) */
  showConfigModal?: boolean;
  /** 퍼지 파일 & 버퍼 검색 팝업 상태 (:find, :Files, :Buffers) */
  fuzzyFinder?: FuzzyFinderState | null;
  /** 순정 Vim 환경 옵션 설정 (:set nu, :set rnu, :set ic 등) */
  options?: VimOptions;
  /** 전역 기본 옵션 설정 (:setglobal, :set) */
  globalOptions?: VimOptions;
  /** 버퍼별 로컬 옵션 맵 (bufferId -> localOptions) */
  bufferLocalOptions?: Record<number, Partial<VimOptions>>;
  /** 파일타입 감지 및 플러그인/인덴트 활성화 설정 (:filetype on, :filetype plugin indent on) */
  filetypeSettings?: {
    detect?: boolean;
    plugin?: boolean;
    indent?: boolean;
  };
  /** 명령행 와일드메뉴 자동완성 세션 상태 */
  wildmenu?: WildmenuState | null;
  /** ctags 태그 스택 (Ctrl+], Ctrl+t, :tag, :pop) */
  tagStack?: TagStackItem[];
  /** 수동 또는 외부 정의 태그 목록 */
  tags?: TagEntry[];
  /** 다중 태그 일치 목록 (:tselect, :tjump, :tnext, :tprev) */
  tagMatches?: TagEntry[];
  /** 현재 활성 태그 일치 인덱스 */
  tagMatchIndex?: number;
  /** 순정 Vim Diff 모드 활성화 여부 (:diffsplit, :diffthis, :diffoff) */
  diffMode?: boolean;
  /** 현재 계산된 Diff Hunk 목록 */
  diffHunks?: DiffHunk[];
  /** 순정 Vim Undo Tree 노드 맵 (seq -> UndoTreeNode) */
  undoTreeNodes?: Record<number, UndoTreeNode>;
  /** 현재 활성화된 변경 시퀀스 번호 */
  currentUndoSeq?: number;
  /** 가장 큰(최신 생성) 변경 시퀀스 번호 */
  maxUndoSeq?: number;
  /** 시간 순서대로 생성된 seq 목록 (g-, g+ 순회용) */
  undoTimeHistory?: number[];
  /** 현재 시간 기록 인덱스 (undoTimeHistory 내 위치) */
  undoTimeIndex?: number;
  /** 파일 저장(:w) 횟수 카운터 */
  saveCounter?: number;
  /** 맞춤법 검사기 세션 (z= 추천/교체 대화형 세션) */
  spellSuggest?: SpellSuggestSession | null;
  /** 사용자 추가 양호 단어 (zg) */
  spellGoodWords?: string[];
  /** 사용자 추가 오탈자 단어 (zw) */
  spellWrongWords?: string[];
  /** 자동 명령 목록 (:autocmd, :au) */
  autocmds?: AutocmdEntry[];
  /** 현재 활성화된 augroup (:augroup {name}) */
  activeAugroup?: string;
  /** autocmd 재귀 실행 깊이 (무한 루프 방지) */
  autocmdDepth?: number;
  /** 순정 Vim 내장 도움말 세션 (:help, K, F1) */
  helpSession?: HelpSession | null;
}

/** 순정 Vim 도움말 세션 (:help, K, F1) */
export interface HelpSession {
  isOpen: boolean;
  topic: string;
  title: string;
  lines: string[];
  cursor: CursorPosition;
  tagStack: Array<{ topic: string; cursor: CursorPosition }>;
}


export type VimState = VimEditorState;
