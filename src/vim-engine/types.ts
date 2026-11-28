export type VimMode =
  | 'NORMAL'
  | 'INSERT'
  | 'VISUAL'
  | 'VISUAL_LINE'
  | 'VISUAL_BLOCK'
  | 'SELECT'
  | 'SELECT_LINE'
  | 'SELECT_BLOCK'
  | 'COMMAND'
  | 'SEARCH'
  | 'REPLACE'
  | 'TERMINAL';

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
  /** dict 속성: 딕셔너리 메서드로 호출 시 self 바인딩 허용 */
  dict?: boolean;
  /** closure 속성: 바깥 함수 스코프 변수 캡처 허용 */
  closure?: boolean;
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
  expr?: boolean;
  silent?: boolean;
  buffer?: boolean;
}

export interface ClipboardRegister {
  type: 'line' | 'text' | 'block';
  content: string;
  /** 블록 레지스터(Ctrl-v)의 열 너비 */
  blockWidth?: number;
}

export interface StateSnapshot {
  lines: string[];
  cursor: CursorPosition;
  /**
   * Vim 이 이 변경을 한 번의 u_save 로 기록한 줄 범위(변경 전 버퍼 기준, 0부터, 끝 포함). `:sort`·`:>`·`:j` 처럼
   * 범위 전체를 한 항목으로 저장하는 명령에서, 실행 취소 커서가 '저장한 커서가 바뀐 범위 안인지'를 이 범위로 판정합니다.
   */
  savedRange?: { start: number; end: number };
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

export interface SearchCountResult {
  current: number;
  total: number;
  exact_match: number;
  incomplete: number;
  maxcount: number;
}

export interface CustomMatchEntry {
  id: number;
  group: string;
  pattern: string;
  priority: number;
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

export interface IncCommandPreviewMatch {
  line: number;
  col: number;
  length: number;
  matchedText: string;
  replacement: string;
}

export interface IncCommandPreview {
  range: { startLine: number; endLine: number };
  pattern: string;
  replacement: string;
  flags: string;
  /** 두 번째 구분자(/old/new)가 입력되어 치환 문자열 미리보기가 활성화되었는지 여부 */
  hasReplacement: boolean;
  /** 미리보기 치환이 반영된 전체 버퍼 줄 목록 */
  previewLines: string[];
  /** 각 매치 및 치환 정보 목록 */
  matches: IncCommandPreviewMatch[];
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
  /** 마지막 저장 시점 스냅샷 (수정 여부 판정용) */
  savedLines?: string[];
  /** Git HEAD 원본 스냅샷 (Gitsigns Hunk 계산용) */
  gitBaseLines?: string[];
}

export interface VimTabPage {
  id: number;
  filename: string;
  lines: string[];
  cursor: CursorPosition;
  mode: VimMode;
  visualAnchor?: CursorPosition;
  /** VISUAL_BLOCK 모드에서 $ 로 줄 끝까지 확장 중인지 여부 */
  visualBlockEndOfLine?: boolean;
  undoStack?: StateSnapshot[];
  redoStack?: StateSnapshot[];
  splitDirection?: SplitDirection;
  activePaneIndex?: number;
  splitPanes?: SplitPaneState[];
  windowLayout?: WindowLayoutNode;
  splitRatio?: number;
  primaryFilename?: string;
  secondaryFilename?: string;
  currentBufferId?: number;
  alternateBufferId?: number;
  /** 탭 로컬 작업 디렉터리 (:tcd) */
  cwd?: string;
  /** 탭 로컬 직전 작업 디렉터리 (:tcd -) */
  prevCwd?: string;
}

export interface CommandLineWindowSession {
  type: ':' | '/' | '?';
  lines: string[];
  cursor: CursorPosition;
  mode: VimMode;
  visualAnchor?: CursorPosition;
  /** VISUAL_BLOCK 모드에서 $ 로 줄 끝까지 확장 중인지 여부 */
  visualBlockEndOfLine?: boolean;
  pendingKeys?: string;
  commandBuffer?: string;
  commandType?: ':' | '/' | '?' | '=';
  lastSearchQuery?: string;
  lastSearchDirection?: 'forward' | 'backward';
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
  mode: 'files' | 'buffers' | 'grep';
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
  /** 증분 검색 활성화 여부 (:set is / nois, :set incsearch / noincsearch) */
  incsearch?: boolean;
  /** 실시간 치환 미리보기 모드 (:set icm=nosplit / split / "", :set inccommand=...) */
  inccommand?: '' | 'nosplit' | 'split';
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
  /** 자동 포매팅·주석 연속 옵션 (:set fo=tcqj, :set formatoptions+=ro) */
  formatoptions?: string;
  /** 커서 위아래로 유지할 여유 줄 수 (:set so=5, :set scrolloff=5) */
  scrolloff?: number;
  /** 수평 스크롤 시 한 번에 이동할 열 수 (:set ss=5, :set sidescroll=5) */
  sidescroll?: number;
  /** 커서 좌우로 유지할 여유 열 수 (:set siso=5, :set sidescrolloff=5) */
  sidescrolloff?: number;
  /** 탭/공백 특수문자 표시 (:set list / nolist) */
  list: boolean;
  /** list 모드에서 불가시 문자 표기 형식 (:set listchars=eol:$,tab:▸\ ,trail:·) */
  listchars?: string;
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
  /** 표현식 폴딩 수식 (:set fde=..., :set foldexpr=...) */
  foldexpr?: string;
  /** 마커 폴딩 구분 기호 (:set fmr={{{,}}}, :set foldmarker=...) */
  foldmarker?: string;
  /** 폴드 레벨 (:set fdl=0 / :set foldlevel=...) */
  foldlevel?: number;
  /** 폴딩 활성화 여부 (:set fen / nofen, zi 토글, :set foldenable) */
  foldenable?: boolean;
  /** 주석 포맷 문자열 (:set cms=//\ %s, :set commentstring=#\ %s) */
  commentstring?: string;
  /** 에러 파싱 포맷 (:set efm=%f:%l:%c:%m, :set errorformat=...) */
  errorformat?: string;
  /** 외부 grep 프로그램 설정 (:set grepprg=...) */
  grepprg?: string;
  /** 분할 창 동기 스크롤 여부 (:set scb / noscb, :set scrollbind) */
  scrollbind?: boolean;
  /** Ctrl-a / Ctrl-x 숫자 증감 시 인식할 진법/형식 (:set nrformats=bin,hex,octal,alpha,unsigned) */
  nrformats?: string;
  /** 버퍼 내용 수정 허용 여부 (:set ma / noma, :set modifiable / nomodifiable) */
  modifiable?: boolean;
  /** 읽기 전용 버퍼 여부 (:set ro / noro, :set readonly / noreadonly) */
  readonly?: boolean;
  /** 단어 구성 문자 집합 (:set isk=..., :set iskeyword+=...) */
  iskeyword?: string;
  /** 줄 끝 너머 가상 커서 이동 허용 모드 (:set ve=block,onemore,all,insert) */
  virtualedit?: string;
  /** 새 줄 생성 시 이전 줄 들여쓰기 자동 유지 (:set ai / noai, :set autoindent) */
  autoindent?: boolean;
  /** C/JS 스타일 블록({ / }) 스마트 자동 들여쓰기 (:set si / nosi, :set smartindent) */
  smartindent?: boolean;
  /** >> / << 들여쓰기 시 shiftwidth 배수로 정렬 (:set sr / nosr, :set shiftround) */
  shiftround?: boolean;
  /** % 괄호 매칭 쌍 정의 (:set mps=(:),{:},[:],<:>, :set matchpairs) */
  matchpairs?: string;
  /** 상태 메시지 축약 플래그 (:set shm=filnxtToOF, S 포함 시 검색 카운트 숨김) */
  shortmess?: string;
  /** 세로 컬럼 가이드선 (:set cc=80,100 또는 :set cc=+1, :set colorcolumn) */
  colorcolumn?: string;
  /** 커서 위치 세로 열 강조 여부 (:set cuc / nocuc, :set cursorcolumn) */
  cursorcolumn?: boolean;
  /** 와일드메뉴 자동완성 단계 모드 (:set wim=longest:full,full, :set wildmode) */
  wildmode?: string;
  /** 검색이 버퍼 끝에 도달하면 반대쪽 끝으로 순환할지 여부 (:set ws / nows, :set wrapscan) */
  wrapscan?: boolean;
  /** 줄 경계를 넘어 이동할 수 있는 키 목록 (:set ww=b,s,h,l,<,>,~,[,], :set whichwrap) */
  whichwrap?: string;
  /** Insert 모드 Tab/Backspace 소프트 탭 정지 폭 (:set sts=4, -1이면 shiftwidth, :set softtabstop) */
  softtabstop?: number;
  /** G / gg / [count]% / Ctrl-f / Ctrl-b 이동 시 첫 공백 아닌 문자로 이동할지 여부 (:set sol / nosol, :set startofline) */
  startofline?: boolean;
  /** 줄 앞 Tab/Backspace 시 shiftwidth 단위를 적용할지 여부 (:set sta / nosta, :set smarttab) */
  smarttab?: boolean;
  /** nvim-autopairs 스타일 Insert 모드 괄호·따옴표 자동 닫기 (:set autopairs / noautopairs, :set ap) */
  autopairs?: boolean;
  /** noice.nvim 스타일 에디터 상단 중앙 플로팅 커맨드라인 (:set cmdlinepopup / :set noice) */
  cmdlinepopup?: boolean;
  /** indent-blankline.nvim 스타일 세로 들여쓰기 가이드선 표시 여부 (:set indentline / :set ibl) */
  indentline?: boolean;
  /** 순정 matchparen 실시간 짝 괄호 강조 표시 여부 (:set matchparen / :set mp) */
  matchparen?: boolean;
  /** rainbow-delimiters.nvim 스타일 중첩 괄호 깊이별 컬러 강조 (:set rainbow / :set rb) */
  rainbow?: boolean;
  /** bufferline.nvim 스타일 상단 버퍼 탭바 표시 여부 (:set bufferline / :set bl) */
  bufferline?: boolean;
  /** satellite.nvim 스타일 우측 스크롤바 미니맵 마커 표시 여부 (:set satellite / :set sat) */
  satellite?: boolean;
  /** nvim-treesitter-context 스타일 상단 Sticky Scope 헤더 고정 표시 여부 (:set tscontext / :set tsc) */
  tscontext?: boolean;
  /** 상단 파일 경로 › 심볼 계층 브레드크럼 Winbar 표시 여부 (:set winbar / :set wb) */
  winbar?: boolean;
  /** nvim-colorizer.lua 스타일 인라인 #hex/rgb()/hsl() 컬러 프리뷰 표시 여부 (:set colorizer / :set col) */
  colorizer?: boolean;
  /** vim-illuminate 스타일 커서 아래 동일 심볼 자동 강조 표시 여부 (:set illuminate / :set ill) */
  illuminate?: boolean;
}

/** 맞춤법 검사기 오탈자 정보 */
export interface SpellError {
  word: string;
  line: number;
  startCol: number;
  endCol: number;
}

/** z= 맞춤법 교체 추천 세션 */
/**
 * vim-surround 태그 입력 프롬프트 (cst<, ysiw<, yss<, Visual S<, 대상 `t` 도 동일).
 * `>` 또는 Enter 로 끝나고 Esc 로 취소됩니다.
 */
export interface SurroundTagPrompt {
  /** 프롬프트가 끝나면 실행할 서라운드 동작 */
  action: 'cs' | 'ys' | 'yss' | 'S';
  /** cs: 바꿀 대상 문자, ys: 모션 문자열 */
  arg: string;
  /** 지금까지 입력한 태그 텍스트 (`<` 제외) */
  text: string;
  /** 프롬프트를 연 키 (`<` 또는 `t`, `.` 반복 기록용) */
  openKey: string;
}

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
  bufferId?: number;
  cursor: CursorPosition;
  matchnr?: number;
}

export interface JumpListItem {
  row: number;
  col: number;
  bufferId?: number;
  filename?: string;
}

export interface WildmenuState {
  /** 와일드메뉴 활성 상태 */
  active: boolean;
  /** 현재 완성 후보 목록 */
  candidates: string[];
  /** 현재 선택된 후보 인덱스 (0 .. candidates.length - 1, longest 단계에서는 -1) */
  selectedIndex: number;
  /** Tab 키 누르기 직전의 원본 커맨드라인 텍스트 */
  originalBuffer: string;
  /** 완성 인수 앞부분 (예: "set " 또는 "e ") */
  prefix: string;
  /** 현재 wildmode 진행 단계 ('longest' | 'full') */
  phase?: 'longest' | 'full';
  /** wildmode 쉼표 구분 단계 인덱스 */
  step?: number;
}

export interface RegisterEntry {
  type: 'char' | 'line' | 'block' | 'macro';
  content: string | string[];
  /** 블록 레지스터(Ctrl-v)의 열 너비 */
  blockWidth?: number;
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
  endOfLine?: boolean;     // Ctrl-v $ 이후 A / c 실행 시 각 줄의 끝 기준 처리 여부
  minCol?: number;         // 블록 왼쪽 경계 열 번호 (짧은 줄 필터링용)
  maxCol?: number;         // 블록 오른쪽 경계 열 번호 (. 반복 및 블록 크기 복원용)
  count?: number;          // [count]I / [count]A / [count]c 반복 횟수 (기본 1)
  skippedLines?: number[]; // 블록 범위(minCol)에 도달하지 않아 제외된 짧은 줄 목록
}

export type CompletionItemKind =
  | 'Snippet'
  | 'Function'
  | 'Variable'
  | 'Class'
  | 'Property'
  | 'Text'
  | 'Keyword';

export interface CompletionItemMeta {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
  preview?: string[];
  snippetTrigger?: string;
}

export interface CompletionSession {
  prefix: string;
  prefixStartCol: number;
  candidates: string[];
  selectedIndex: number; // 0-indexed into candidates
  originalWord: string;
  /** 자동완성 종류: 단어(keyword), 파일 경로(file), 전체 라인(line), 사전(dictionary), 태그(tag), 옴니(omni), Vim 명령/함수(vim), 맞춤법(spell), nvim-cmp 통합(cmp) */
  type?: 'keyword' | 'file' | 'line' | 'dictionary' | 'tag' | 'omni' | 'vim' | 'spell' | 'cmp';
  /** nvim-cmp 통합 자동완성 항목별 종류·상세·스니펫 미리보기 메타데이터 */
  items?: CompletionItemMeta[];
}

export interface LastVisualSelection {
  mode: 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK';
  anchor: CursorPosition;
  cursor: CursorPosition;
  endOfLine?: boolean;
}

export interface ChangeListItem {
  row: number;
  col: number;
  line: number;
}


export interface ViewportState {
  topRow: number;       // 현재 화면 최상단 행 번호 (0-indexed)
  visibleRows: number;  // 화면에 한 번에 표시되는 행 개수
  leftCol?: number;     // 현재 화면 최좌단 열 번호 (0-indexed, nowrap 모드)
  visibleCols?: number; // 화면에 한 번에 표시되는 열 개수 (기본 80)
}

export interface FoldRange {
  startRow: number; // 0-indexed 시작 행
  endRow: number;   // 0-indexed 종료 행
  closed: boolean;  // 접힘 여부
  manual?: boolean; // 수동 생성 폴드(zf) 여부
}

export type SplitDirection = 'none' | 'horizontal' | 'vertical';

export type SplitPlacement = 'default' | 'aboveleft' | 'belowright' | 'topleft' | 'botright';

export type WindowLayoutNode =
  | { kind: 'leaf'; paneIndex: number }
  | {
      kind: 'split';
      direction: 'horizontal' | 'vertical';
      children: WindowLayoutNode[];
      weights: number[];
    };

export interface SplitPaneState {
  /** 고유 윈도우 ID (win_getid / win_gotoid 용, 1000 이상) */
  winId?: number;
  /** 이 창이 표시 중인 버퍼 ID (동일 버퍼 다중 창 실시간 동기화용) */
  bufferId?: number;
  filename: string;
  lines: string[];
  cursor: CursorPosition;
  mode: VimMode;
  visualAnchor?: CursorPosition;
  /** VISUAL_BLOCK 모드에서 $ 로 줄 끝까지 확장 중인지 여부 */
  visualBlockEndOfLine?: boolean;
  viewport?: ViewportState;
  undoStack?: StateSnapshot[];
  redoStack?: StateSnapshot[];
  pendingKeys?: string;
  blockInsertSession?: BlockInsertSession | null;
  /** 해당 창이 diff 모드인지 여부 (:diffsplit, :diffthis) */
  diff?: boolean;
  /** 해당 분할 창의 동기 스크롤 여부 (:set scb / :setlocal scb) */
  scrollbind?: boolean;
  /** 해당 분할 창의 윈도우 로컬 옵션 (:setlocal nu, rnu, wrap, list, cul, fdm 등) */
  localOptions?: Partial<VimOptions>;
  /** 해당 분할 창의 로케이션 리스트 (:lopen, :lclose, :lnext, :lprev, :lvimgrep) */
  locationList?: QuickfixState | null;
  /** 해당 분할 창의 창 로컬 작업 디렉터리 (:lcd) */
  cwd?: string;
  /** 해당 분할 창의 직전 작업 디렉터리 (:lcd -) */
  prevCwd?: string;
  /** 해당 분할 창의 창 로컬 아규먼트 리스트 (:arglocal). undefined 이면 전역 아규먼트 리스트를 공유 */
  localArgList?: ArgListState | null;
}

export interface DiffHunk {
  id: number;
  pane0Start: number;
  pane0Count: number;
  pane1Start: number;
  pane1Count: number;
  type: 'change' | 'add' | 'delete';
}

export interface GitHunk {
  id: number;
  type: 'add' | 'change' | 'delete';
  /** 현재 버퍼 기준 시작 0-based 행 인덱스 */
  startLine: number;
  /** 현재 버퍼 기준 끝 0-based 행 인덱스 */
  endLine: number;
  /** 원본(HEAD/base) 시작 0-based 행 인덱스 */
  baseStart: number;
  /** 원본(HEAD/base) 줄 수 */
  baseCount: number;
  /** 현재 버퍼 기준 실제 치환 시작 0-based 행 인덱스 */
  currentStart: number;
  /** 현재 버퍼 줄 수 */
  currentCount: number;
  /** 원본(HEAD/base)에서 제거·변경된 줄 목록 */
  removedLines: string[];
  /** 현재 버퍼에 추가·변경된 줄 목록 */
  addedLines: string[];
}

export interface GitHunkPreviewState {
  isOpen: boolean;
  hunk: GitHunk;
  line: number;
}

export interface FlashJumpMatch {
  line: number;
  col: number;
  length: number;
  label: string;
}

export interface FlashJumpSession {
  isOpen: boolean;
  query: string;
  matches: FlashJumpMatch[];
  operator?: 'd' | 'c' | 'y';
  visualMode?: 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK';
}

export interface OilEntrySnapshot {
  id: string;
  originalPath: string;
  originalName: string;
  isDir: boolean;
}

export interface OilSessionState {
  isOpen: boolean;
  currentDir: string;
  returnBufferId?: number;
  returnFilename?: string;
  returnLines?: string[];
  returnCursor?: CursorPosition;
  entries: OilEntrySnapshot[];
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
  visualAnchor?: CursorPosition;
  /** VISUAL_BLOCK 모드에서 $ 로 줄 끝까지 확장 중인지 여부 */
  visualBlockEndOfLine?: boolean; // VISUAL 모드 선택 시작점
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
  commandType?: ':' | '/' | '?' | '=';
  /** 커맨드라인(:) 또는 검색(/, ?) 내 커서 위치 (undefined 이면 버퍼 끝) */
  commandCursorCol?: number;
  /** 사용자 등록 다이그래프 테이블 (:digraph {c1}{c2} {code}) */
  userDigraphs?: Record<string, string>;
  /** 마지막 검색어 ('n', 'N', '*' 재검색용) */
  lastSearchQuery?: string;
  /** 커맨드라인 또는 검색 실행 결과 피드백 메시지 (예: '10번째 줄로 이동', 'E492: 알 수 없는 명령어') */
  commandMessage?: string;
  /** 멀티 레지스터 저장소 */
  registers?: Record<string, RegisterEntry>;
  /** 현재 선택된 대상 레지스터 ("a~"z, "0, "_ 등) */
  activeRegister?: string | null;
  /** 레지스터 앞에 입력한 count (`2"a3dd` 의 2). 레지스터 뒤 count 와 곱해집니다 (Vim 규칙). */
  countBeforeRegister?: number;
  /** 현재 매크로 녹화 상태 */
  recordingMacro?: { register: string; keys: string[] } | null;
  /** 가장 마지막에 실행했던 매크로 레지스터 이름 (@@ 재실행용) */
  /** 마지막 실행한 매크로 레지스터 (@@, Q 반복용) */
  lastPlayedMacro?: string | null;
  /** 마지막으로 녹화를 완료한 매크로 레지스터 (Q 반복용) */
  lastRecordedMacro?: string | null;
  /** 현재 줄 단위 실행 취소(U) 스냅샷 */
  lineUndoSnapshot?: {
    line: number;
    originalText: string;
    originalCol?: number;
    toggledText?: string;
    toggledCol?: number;
    bufferId?: number;
  } | null;
  /** 직전 키가 실패했음을 나타내는 일시적 신호 (Vim의 벨/에러). 매 키 입력 시작 시 제거되며, 매크로·`.`·`:normal`·키매핑 재생은 이 신호에서 중단됩니다. */
  bell?: boolean;
  /** 직전 줄 내 문자 탐색 정보 (';' 및 ',' 반복용) */
  lastCharSearch?: { type: 'f' | 'F' | 't' | 'T'; char: string } | null;
  /** 현재 버퍼 로컬 상태(마크·변경 목록·gv·gi·폴드)가 속한 파일명 */
  bufferLocalOwner?: string;
  /** 다른 파일에 보관해 둔 버퍼 로컬 상태 (파일명 → 스냅샷, bufferLocalState.ts) */
  bufferLocalSnapshots?: Record<
    string,
    Pick<
      VimEditorState,
      | 'marks'
      | 'changeList'
      | 'changeIndex'
      | 'lastInsertPos'
      | 'lastChangeMark'
      | 'lastBracketMarks'
      | 'lastVisualSelection'
      | 'folds'
    >
  >;
  /** 마크 위치 저장소 (m{a-zA-Z}, 전역 마크 A-Z는 파일/버퍼 위치 포함) */
  marks?: Record<string, MarkPosition>;
  /** 점프 리스트 (Ctrl+o, Ctrl+i) */
  jumpList?: JumpListItem[];
  /** 점프 리스트 현재 인덱스 */
  jumpIndex?: number;
  /** 비주얼 블록(Ctrl+v) 다중 줄 동시 삽입 세션 */
  blockInsertSession?: BlockInsertSession | null;
  /** 화면 뷰포트 상태 (zz, zt, zb, H, M, L, Ctrl+d/u 스크롤용) */
  viewport?: ViewportState;
  /** 창 분할 방향 (:sp, :vsp, Ctrl+w) */
  splitDirection?: SplitDirection;
  /** 현재 활성 포커스 창 인덱스 (0 .. splitPanes.length - 1) */
  activePaneIndex?: number;
  /** 분할된 윈도우 페인 목록 (트리 DFS 좌→우, 상→하 순서) */
  splitPanes?: SplitPaneState[];
  /** 중첩 가로/세로 분할 레이아웃 트리 */
  windowLayout?: WindowLayoutNode;
  /** 다음에 발급할 고유 윈도우 ID (기본 1000부터 증가) */
  nextWindowId?: number;
  /** 분할 창 크기 비율 (2분할 호환용, 기본 50: 50%) */
  splitRatio?: number;
  /** 직전에 활성화되었던 창 인덱스 (Ctrl-w p 용) */
  previousPaneIndex?: number;
  /** 현재 작업 디렉터리 (:pwd, :cd, :lcd, :tcd 용, 기본값: '/workspace') */
  cwd?: string;
  /** 전역 작업 디렉터리 (:cd 기준, 탭 전환 시 탭 로컬 :tcd가 없는 탭에 복원) */
  globalCwd?: string;
  /** 단일 창 상태의 창 로컬 작업 디렉터리 (:lcd) */
  windowCwd?: string;
  /** 직전 작업 디렉터리 (:cd -, :lcd -, :tcd -) */
  prevCwd?: string;
  /** 연산자 대기 중 모션 강제 지정 (dv / dV / d<C-v> — :help o_v / o_V / o_CTRL-V) */
  forcedMotionwise?: 'char' | 'line' | 'block';
  /** Virtual Replace 모드(gR) 활성 여부 (mode === 'REPLACE' 와 함께 사용) */
  virtualReplace?: boolean;
  /** 주 창 파일명 (예: source.ts) */
  primaryFilename?: string;
  /** 보조 창 파일명 (예: target.ts) */
  secondaryFilename?: string;
  /** 보조 창 초기 줄 내용 (미션 로드용) */
  secondaryLines?: string[];
  /** 사용자 정의 키매핑 테이블 (예: { 'i:jk': '<Esc>', 'n:<leader>w': ':w' }) */
  userKeymaps?: Record<string, string>;
  /** 버퍼별 로컬 키매핑 (:nmap <buffer> ...) */
  bufferKeymaps?: Record<number, Record<string, string>>;
  /** 키매핑 메타데이터 (<silent>, <expr>, <nowait>, noremap 여부) */
  keymapMeta?: Record<string, { silent?: boolean; expr?: boolean; noremap?: boolean; nowait?: boolean }>;
  /** :normal! 실행 중 사용자 키매핑 우회 여부 */
  keymapsDisabled?: boolean;
  /** 다중 키 키매핑(:omap/:xmap/:cmap 등) 중간 입력 접두 버퍼 */
  pendingKeymapPrefix?: string;
  /** 사용자 정의 입력/명령행 약어 (:iabbrev, :cabbrev, :abbrev, 키: 'i:teh' | 'c:W') */
  abbreviations?: Record<string, AbbreviationEntry>;
  /** 버퍼별 로컬 약어 (:iabbrev <buffer>, :cabbrev <buffer>, bufferId -> map) */
  bufferAbbreviations?: Record<number, Record<string, AbbreviationEntry>>;
  /** Insert/Command 모드 Ctrl-v 리터럴 및 uXXXX/UXXXXXXXX 유니코드 입력 대기 상태 */
  literalNextPending?: boolean | { kind: 'hex4' | 'hex8'; digits: string };
  /** Insert 모드 Ctrl-k 다이그래프 대기 상태 (null/undefined: 비활성, '': 1번째 키 대기, 'x': 2번째 키 대기) */
  digraphPending?: string | null;
  /** 현재 INSERT 세션 동안 입력된 텍스트 누적 (Ctrl-a / ". 레지스터용) */
  currentInsertText?: string;
  /** 직전 완료된 INSERT 세션에서 입력된 텍스트 (Insert Ctrl-a, Ctrl-@, ". 레지스터용) */
  lastInsertedText?: string;
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
  /** :const / :lockvar 로 잠긴 변수 테이블 (키: `${scope}:${name}` 또는 `b:${id}:${name}`) */
  lockedVars?: Record<string, 'const' | 'lock'>;
  /** :echohl 로 지정된 마지막 하이라이트 그룹 */
  lastEchoHl?: string;
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
  /** Select 모드 일회성 Visual 명령 실행 세션 (Ctrl+o) */
  selectVisualOneShot?: boolean;
  /** Insert 모드 및 Command 모드 Ctrl+r 레지스터 입력 대기 상태 */
  insertRegisterPending?: boolean;
  /** Insert 모드 Ctrl+r 세부 삽입 모드 ('normal' | 'literal'(Ctrl-o/Ctrl-r) | 'indent'(Ctrl-p)) */
  insertRegisterMode?: 'normal' | 'literal' | 'indent';
  /** Ctrl+r = 또는 "= 표현식 레지스터 계산 완료 후 복귀할 컨텍스트 */
  expressionReturnContext?: {
    mode: 'INSERT' | 'COMMAND' | 'NORMAL' | 'SEARCH';
    cursor?: CursorPosition;
    commandBuffer?: string;
    commandType?: ':' | '/' | '?';
    commandCursorCol?: number;
  } | null;
  /** 버퍼 내 단어 자동완성 팝업 세션 (Ctrl+n, Ctrl+p) */
  completionSession?: CompletionSession | null;
  /** Insert 모드 Ctrl+x 자동완성 서브모드 활성 여부 (^X mode) */
  insertCtrlXMode?: boolean;
  /** 마지막 INSERT 모드 종료 시점의 커서 위치 (gi, '^, `^ 용) */
  lastInsertPos?: { row: number; col: number; line: number } | null;
  /** 직전 큰 점프 직전의 커서 위치 ('', `` 용) */
  lastJumpPos?: { row: number; col: number } | null;
  /** 마지막 버퍼 변경 위치 ('., `. 용) */
  lastChangeMark?: { row: number; col: number } | null;
  /** 마지막 변경 또는 복사(yank)된 텍스트의 시작/끝 경계 ('[, '], `[, `] 용) */
  lastBracketMarks?: { start: { row: number; col: number }; end: { row: number; col: number } } | null;
  /** 직전 비주얼 모드 선택 영역 정보 (gv, '<, '> 복구용) */
  lastVisualSelection?: LastVisualSelection | null;
  /** 버퍼 텍스트 변경 위치 히스토리 목록 (g;, g, 순회용) */
  changeList?: ChangeListItem[];
  /** changeList 현재 인덱스 */
  changeIndex?: number;
  /** 마지막 검색 시 사용된 커서 오프셋 (/pattern/e, /pattern/+1 등) */
  lastSearchOffset?: SearchOffset | null;
  /** 마지막 검색 방향 (/ = forward, ? = backward). n/N 이 따릅니다 */
  lastSearchDirection?: 'forward' | 'backward';
  /** 검색 모드 진입 전 대기 중이던 연산자 정보 (예: d/pattern/e) */
  /**
   * Vim curswant: j/k 등 세로 이동이 돌아가려는 열. 짧은 줄을 지나도 원래 열을 기억합니다.
   * `$` 뒤에는 CURSWANT_EOL(줄 끝). 다른 명령이 끝나면 현재 열로 다시 정해집니다.
   */
  curswant?: number;
  /**
   * Ex 명령이 커서를 이 위치에 두면서 curswant 를 바꾸지 않았다는 표시 (Vim 은 `beginline(BL_SOL)`·`set_indent` 처럼
   * `w_set_curswant` 를 켜지 않는 커서 이동 뒤 기억한 열을 유지합니다). 키 하나를 처리한 뒤 applyCurswant 가 지웁니다.
   */
  keepCurswantAt?: CursorPosition;
  /** [count]/pattern 의 count (연산자 없이 검색을 시작할 때) */
  searchCount?: number;
  searchOperator?: {
    op: string;
    count?: number;
    initialCursor: CursorPosition;
  } | null;
  /** 검색(/, ?) 진입 시점의 원래 커서 위치 (incsearch 및 Esc 복원용) */
  searchOriginCursor?: CursorPosition;
  /** 검색(/, ?) 진입 시점의 원래 뷰포트 (incsearch 취소 시 복원용) */
  searchOriginViewport?: ViewportState;
  /** incsearch 입력 중 Ctrl-g / Ctrl-t 로 순회한 매치 오프셋 */
  incsearchStepOffset?: number;
  /** :s/pat/rep/ 입력 중 실시간 치환 미리보기 상태 (:set inccommand=nosplit|split) */
  incCommandPreview?: IncCommandPreview | null;
  /** :s/.../.../gc 대화형 치환 확인 세션 */
  confirmSubstitute?: ConfirmSubstituteSession | null;
  /** REPLACE (R) / Virtual Replace (gR) 모드에서 백스페이스 시 복원할 원래 문자/줄 스택 */
  replaceStack?: { char: string; line: number; col: number; prevLine?: string }[];
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
  /** 전역 아규먼트 리스트 (:argglobal 공유 저장소) */
  globalArgList?: ArgListState | null;
  /** 현재 활성 창이 로컬 아규먼트 리스트(:arglocal)를 사용 중인지 여부 */
  usesLocalArgList?: boolean;
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
  /** 인터랙티브 단축키 치트시트 모달 표시 여부 (:Cheatsheet, :Cheat) */
  showCheatsheetModal?: boolean;
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
  /** pop 이후 인자 없는 :tag 재전진 및 gettagstack() 조회를 위해 보존되는 전체 태그 히스토리 */
  tagStackHistory?: TagStackItem[];
  /** 현재 태그 스택 포인터 인덱스 (0 .. tagStackHistory.length) */
  tagStackIndex?: number;
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
  /** Gitsigns 기준 원본 스냅샷 (최초 편집 시 자동 캡처 또는 외부 주입) */
  gitBaseLines?: string[];
  /** gitBaseLines 가 속한 파일명 (버퍼·특수 버퍼 전환 시 기준선이 다른 파일로 새지 않도록 구분) */
  gitBaseFilename?: string;
  /** :Gitsigns stage_hunk 취소를 위한 이전 gitBaseLines 스택 */
  gitBaseHistory?: string[][];
  /** :Gitsigns preview_hunk 플로팅 미리보기 세션 */
  gitHunkPreview?: GitHunkPreviewState | null;
  /** vim-fugitive 스타일 가상 Git 커밋 로그 (:Git commit / :Git log) */
  gitCommitLog?: GitCommitEntry[];
  /** 현재 버퍼 변경사항의 스테이징 여부 (:Git add / :Git status) */
  gitStaged?: boolean;
  /** 인라인 Git Blame 표시 활성화 여부 (:Git blame / :Gblame) */
  gitBlameVisible?: boolean;
  /** LuaSnip 스타일 활성 스니펫 탭스톱 세션 */
  snippetSession?: SnippetSession | null;
  /** flash.nvim 스타일 화면 전체 라벨 점프 세션 (gs / :Flash) */
  flashJump?: FlashJumpSession | null;
  /** oil.nvim 스타일 버퍼 기반 파일시스템 편집 세션 (:Oil) */
  oilSession?: OilSessionState | null;
  /** harpoon.nvim 스타일 고정 파일 목록 (:HarpoonAdd, :HarpoonMenu, :Harpoon [N]) */
  harpoonList?: string[];
  /** harpoon.nvim 빠른 파일 전환 팝업 메뉴 상태 */
  harpoonMenu?: HarpoonMenuState | null;
  /** yanky.nvim 스타일 복사 이력 링 버퍼 (최신 항목이 index 0, 최대 30건) */
  yankHistory?: ClipboardRegister[];
  /** yanky.nvim p/P 직후 Ctrl-p/Ctrl-n 순환 붙여넣기 세션 */
  yankRing?: YankRingSession | null;
  /** yanky.nvim 복사 이력 팝업 메뉴 상태 (:YankyRingHistory / :Yanks) */
  yankyMenu?: YankyMenuState | null;
  /** trouble.nvim 스타일 프로젝트 진단·TODO·퀵픽스 통합 패널 상태 (:Trouble) */
  troublePanel?: TroubleSessionState | null;
  /** mbbill/undotree 스타일 시각적 Undo Tree 분할 패널 상태 (:UndotreeToggle) */
  undotreePanel?: { isOpen: boolean } | null;
  /** nvim-spectre 스타일 프로젝트 대화형 검색·치환 분할 패널 상태 (:Spectre) */
  spectrePanel?: SpectreSessionState | null;
  /** zen-mode.nvim 스타일 몰입형 집중 모드 활성화 여부 (:ZenMode / :Zen) */
  zenMode?: boolean;
  /** Neovim 내장 가상 터미널 버퍼 세션 (:terminal / :term / :ToggleTerm) */
  terminalSession?: TerminalSessionState | null;
  /** 실무 캡스톤 시나리오용 가상 테스트 스위트 (:TestRun / npm test) */
  virtualTests?: VirtualTestSpec[];
  /** 마지막 가상 테스트 실행 결과 */
  lastTestRun?: VirtualTestRunResult | null;
  /** vim-visual-multi 스타일 다중 커서 선택·동시 편집 세션 (g Ctrl-n / :MultiCursor) */
  multiCursor?: MultiCursorSession | null;
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
  /** vim-surround 태그 입력 프롬프트 (cst<p>, ysiw<em> 등) */
  surroundTagPrompt?: SurroundTagPrompt | null;
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
  /** 직전에 실행한 셸 명령어 (:!!, ! 재확장용) */
  lastShellCommand?: string;
  /** Normal !{motion} / !! 에서 COMMAND 모드로 넘어갈 때 . 반복을 위해 보관하는 연산자 키 시퀀스 */
  filterOperatorKeys?: string[];
  /** Neovim 스타일 LSP 진단 목록 ([d, ]d, [D, ]D, :lopen 연계) */
  lspDiagnostics?: LspDiagnostic[];
  /** 커서 호버 문서 심볼 사전 (K) */
  lspSymbols?: Record<string, LspHoverSymbol>;
  /** 현재 열린 LSP 호버 플로팅 창 (K) */
  lspHover?: LspHoverState | null;
  /** 현재 열린 LSP 심볼 이름 변경 프롬프트 세션 (grn, :LspRename) */
  lspRename?: LspRenameSession | null;
  /** 버퍼/미션별 사용자 정의 LSP 코드 액션 목록 (gra, :LspCodeAction) */
  lspCodeActions?: LspCodeAction[];
  /** 현재 열린 LSP 코드 액션 선택 팝업 메뉴 (gra) */
  lspCodeActionMenu?: LspCodeActionMenuState | null;
  /** :echom / :echomsg 로 기록된 메시지 이력 (:messages 조회용) */
  messageHistory?: string[];
  /** 직전 Ex 명령의 마지막 출력 메시지 (Normal g< 재표시용) */
  lastCommandOutput?: string;
  /** :redir 출력 리디렉션 세션 (:redir => g:var / :redir END) */
  redirSession?: { target: string; append: boolean } | null;
  /** :noautocmd 모디파이어 실행 중 자동 명령 억제 여부 */
  noautocmdSuppressed?: boolean;
  /** 버퍼별 변수 저장소 (b:var, bufferId -> vars) */
  bufferVars?: Record<number, Record<string, VimScriptValue>>;
  /** 창별 변수 저장소 (w:var, paneIndex -> vars) */
  windowVars?: Record<number, Record<string, VimScriptValue>>;
  /** 탭별 변수 저장소 (t:var, tabId -> vars) */
  tabVars?: Record<number, Record<string, VimScriptValue>>;
  /** 스크립트 로컬 변수 저장소 (s:var) */
  scriptVars?: Record<string, VimScriptValue>;
  /** 환경 변수 저장소 ($VAR) */
  envVars?: Record<string, string>;
  /** :source 실행 중 :finish 로 조기 종료 요청되었는지 여부 */
  scriptFinished?: boolean;
  /** 현재 :source 실행 중첩 깊이 (:finish 검증용) */
  scriptSourcingDepth?: number;
  /** 커스텀 정규식 하이라이트 매치 목록 (:match, :2match, :3match, matchadd()) */
  customMatches?: CustomMatchEntry[];
  /** matchadd() 다음 자동 할당 ID (기본 4부터 시작; 1~3은 :match/:2match/:3match 예약) */
  nextMatchId?: number;
  /** Insert 모드 Ctrl-g 대기 상태 (Ctrl-g u / Ctrl-g j / Ctrl-g k) */
  insertCtrlGPending?: boolean;
  /** 현재 Insert 세션 진입 시 시작 열 (Ctrl-g j / k 열 정렬용) */
  insertStartCol?: number;
  /** [count]i / [count]a / [count]I / [count]A / [count]o / [count]O 반복 삽입 카운트 */
  insertRepeatCount?: number;
  /** [count]o / [count]O 처럼 줄 단위로 반복 삽입할지 여부 */
  insertRepeatNewline?: boolean;
  /** :undojoin 실행 후 다음 변경을 직전 Undo 블록에 병합할지 여부 */
  pendingUndoJoin?: boolean;
  /** :undojoin 병합이 방금 적용되어 Undo Tree 현재 노드를 제자리 갱신해야 하는지 여부 */
  undoJoinMerged?: boolean;
  /** 직전 작업이 undo 였는지 여부 (:undojoin E790 검증용) */
  lastActionWasUndo?: boolean;
  /** vim-fugitive / LazyGit 스타일 인터랙티브 Git 분할 패널 (:Git / :LazyGit) */
  gitPanel?: GitPanelState | null;
  /** init.lua (vim.snippets.add) 로 등록된 사용자 커스텀 스니펫 목록 */
  customSnippets?: CustomSnippetDefinition[];
  /** neo-tree.nvim / nvim-tree 스타일 좌측 영구 파일 트리 사이드바 (:Neotree / :NvimTreeToggle) */
  neotree?: NeotreeSessionState | null;
  /** git-conflict.nvim 스타일 충돌 해결 카운터 */
  gitConflictResolvedCount?: number;
  /** nvim-dap 파일별 중단점 줄 목록 (filename -> sorted 0-based line numbers) */
  dapBreakpoints?: Record<string, number[]>;
  /** nvim-dap 커스텀 디버그 실행 트레이스 (미션/캡스톤 시나리오용) */
  dapScenarioTrace?: DapTraceStep[];
  /** nvim-dap 활성 디버깅 세션 및 nvim-dap-ui 패널 상태 */
  dapSession?: DapSessionState | null;
}

export type LspDiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface LspDiagnostic {
  id: string;
  line: number;
  col: number;
  endCol: number;
  severity: LspDiagnosticSeverity;
  code?: string;
  source?: string;
  message: string;
  /** 줄 텍스트 기반 실시간 재평가 규칙 (수정 시 자동으로 진단 해제) */
  rule?: {
    matchPattern: string;
    highlightGroup?: number;
  };
}

export interface LspHoverSymbol {
  symbol: string;
  kind: string;
  signature: string;
  documentation: string;
  source?: string;
}

export interface LspHoverState {
  isOpen: boolean;
  symbol: string;
  kind: string;
  signature: string;
  documentation: string;
  source?: string;
  line: number;
  col: number;
}

export interface LspRenameSession {
  isOpen: boolean;
  oldName: string;
  newName: string;
  line: number;
  col: number;
  occurrenceCount: number;
  fileCount: number;
}

export interface LspCodeActionEdit {
  /** 0-based 대상 줄 번호 */
  line: number;
  /** 새 줄 내용 (null 이면 해당 줄 삭제) */
  newText: string | null;
}

export interface LspCodeAction {
  id: string;
  title: string;
  kind?: 'quickfix' | 'refactor' | 'source';
  /** 지정 시 해당 0-based 줄에서만 노출 */
  line?: number;
  /** 지정 시 해당 ID 의 진단이 존재하는 줄에서 노출 */
  diagnosticId?: string;
  edits: LspCodeActionEdit[];
}

export interface LspCodeActionMenuState {
  isOpen: boolean;
  line: number;
  col: number;
  selectedIndex: number;
  actions: LspCodeAction[];
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


export interface HarpoonMenuState {
  isOpen: boolean;
  selectedIndex: number;
}

export interface YankyMenuState {
  isOpen: boolean;
  selectedIndex: number;
}

export interface YankRingSession {
  /** 현재 붙여넣은 복사 이력 index (0 = 가장 최근) */
  index: number;
  /** 붙여넣기에 사용한 키 */
  key: string;
  /** 붙여넣기 직전 상태 (교체 시 이 상태에서 다시 붙여넣어 단일 Undo 유지) */
  base: VimEditorState;
}

export type TroubleMode = 'all' | 'diagnostics' | 'todo' | 'quickfix';
export type TroubleSeverity = 'error' | 'warning' | 'info' | 'todo';

export interface TroubleItem {
  id: string;
  filename: string;
  line: number;
  col: number;
  severity: TroubleSeverity;
  tag?: string;
  message: string;
  source: 'diagnostics' | 'todo' | 'quickfix';
}

export interface TroubleSessionState {
  isOpen: boolean;
  mode: TroubleMode;
  selectedIndex: number;
  items: TroubleItem[];
}

export interface SpectreMatchItem {
  id: string;
  filename: string;
  line: number;
  col: number;
  lineText: string;
  previewText: string;
  enabled: boolean;
}

export interface SpectreSessionState {
  isOpen: boolean;
  searchQuery: string;
  replaceQuery: string;
  ignoreCase: boolean;
  items: SpectreMatchItem[];
}

export interface MultiCursorSelection {
  line: number;
  startCol: number;
  endCol: number;
}

export interface MultiCursorSession {
  isOpen: boolean;
  submode: 'select' | 'insert';
  query: string;
  selections: MultiCursorSelection[];
  cursors: CursorPosition[];
}

export interface TerminalSessionState {
  isOpen: boolean;
  cwd: string;
  prompt: string;
  inputBuffer: string;
  history: string[];
  historyIndex: number;
  promptLine: number;
  isSplit: boolean;
  returnFilename?: string;
  returnLines?: string[];
  returnCursor?: CursorPosition;
  returnBufferId?: number;
  ctrlBackslashPending?: boolean;
}

export interface VirtualTestSpec {
  id: string;
  name: string;
  file: string;
  mustContain?: string[];
  mustNotContain?: string[];
  exactLines?: string[];
  minLines?: number;
  /** 최소 1회 :Git commit 기록이 있고 미커밋 Hunk 가 없어야 통과 */
  requireGitCommit?: boolean;
}

export interface VirtualTestCaseResult {
  id: string;
  name: string;
  file: string;
  passed: boolean;
  reason?: string;
}

export interface VirtualTestRunResult {
  suiteName?: string;
  passedCount: number;
  totalCount: number;
  allPassed: boolean;
  results: VirtualTestCaseResult[];
  runCount: number;
}

export interface SnippetTabstop {
  index: number;
  line: number;
  col: number;
  length: number;
  placeholder: string;
}

export interface SnippetSession {
  trigger: string;
  tabstops: SnippetTabstop[];
  currentIndex: number;
}

export interface CustomSnippetDefinition {
  trigger: string;
  description: string;
  body: string[];
}

export interface GitCommitEntry {
  hash: string;
  author: string;
  message: string;
  filename: string;
  added: number;
  removed: number;
}

export interface GitBlameInfo {
  hash: string;
  author: string;
  message: string;
  uncommitted: boolean;
}

export interface GitPanelState {
  isOpen: boolean;
  selectedIndex: number;
  expandedHunkIds: number[];
  activeTab: 'changes' | 'log';
}

export type NeotreeGitStatus = 'M' | 'S' | 'U';

export interface NeotreeNode {
  path: string;
  name: string;
  depth: number;
  isDir: boolean;
  isExpanded?: boolean;
  isActiveBuffer?: boolean;
  isModified?: boolean;
  gitStatus?: NeotreeGitStatus;
  errorCount?: number;
  warningCount?: number;
}

export interface NeotreePromptState {
  type: 'add' | 'rename';
  targetDir: string;
  targetPath?: string;
  isDir?: boolean;
  value: string;
}

export interface NeotreeSessionState {
  isOpen: boolean;
  isFocused: boolean;
  selectedIndex: number;
  collapsedDirs: string[];
  prompt?: NeotreePromptState | null;
  initialFilePaths?: string[];
}

export type GitConflictChoice = 'ours' | 'theirs' | 'both' | 'none' | 'base';

export type GitConflictLineKind =
  | 'marker-ours'
  | 'ours'
  | 'marker-base'
  | 'base'
  | 'separator'
  | 'theirs'
  | 'marker-theirs';

export interface GitConflictBlock {
  id: number;
  /** 0-based `<<<<<<< ...` 줄 인덱스 */
  startLine: number;
  /** 0-based optional `||||||| ...` (diff3 base) 줄 인덱스 */
  baseMarkerLine?: number;
  /** 0-based `=======` 줄 인덱스 */
  separatorLine: number;
  /** 0-based `>>>>>>> ...` 줄 인덱스 */
  endLine: number;
  oursLabel: string;
  baseLabel?: string;
  theirsLabel: string;
  oursLines: string[];
  baseLines?: string[];
  theirsLines: string[];
}

export interface DapVariable {
  name: string;
  value: string;
  type: string;
  changed?: boolean;
}

export interface DapStackFrame {
  id: number;
  name: string;
  filename: string;
  line: number;
  variables: DapVariable[];
}

export interface DapTraceStep {
  filename: string;
  line: number;
  functionName: string;
  variables: DapVariable[];
  callStack?: Array<{ name: string; filename: string; line: number }>;
  output?: string;
}

export interface DapWatchResult {
  expression: string;
  value: string;
  error?: boolean;
}

export interface DapSessionState {
  isActive: boolean;
  isPaused: boolean;
  uiOpen: boolean;
  filename: string;
  currentLine: number;
  stepIndex: number;
  selectedFrameIndex: number;
  steps: DapTraceStep[];
  frames: DapStackFrame[];
  watches: string[];
  consoleOutput: string[];
  terminatedReason?: string;
}

export type VimState = VimEditorState;
