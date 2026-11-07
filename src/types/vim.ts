export type VimMode = 'NORMAL' | 'INSERT' | 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK' | 'COMMAND' | 'SEARCH' | 'REPLACE';

export interface CursorPosition {
  line: number; // 0-indexed 줄 번호
  col: number;  // 0-indexed 열 번호
}

export interface ClipboardRegister {
  type: 'line' | 'text';
  content: string;
}

export interface StateSnapshot {
  lines: string[];
  cursor: CursorPosition;
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
  isIgnoreCase: boolean;
  commandStr: string;
  substitutedCount: number;
  currentMatch: ConfirmSubstituteMatch;
}

export interface VimBuffer {
  id: number;
  name: string;
  lines: string[];
  cursor: CursorPosition;
  undoStack?: StateSnapshot[];
  redoStack?: StateSnapshot[];
  isModified?: boolean;
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
}

export interface VimEditorState {
  lines: string[];
  cursor: CursorPosition;
  mode: VimMode;
  visualAnchor?: CursorPosition; // VISUAL 모드 선택 시작점
  pendingKeys?: string; // gg, dd, dw 등 다중 키 입력을 위한 버퍼
  clipboard?: ClipboardRegister;
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
  /** 직전 줄 내 문자 탐색 정보 (';' 및 ',' 반복용) */
  lastCharSearch?: { type: 'f' | 'F' | 't' | 'T'; char: string } | null;
  /** 마크 위치 저장소 (m{a-z}) */
  marks?: Record<string, { row: number; col: number }>;
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
  /** Ctrl+r = 표현식 레지스터 계산 완료 후 복귀할 컨텍스트 */
  expressionReturnContext?: {
    mode: 'INSERT' | 'COMMAND';
    cursor?: CursorPosition;
    commandBuffer?: string;
  } | null;
  /** 버퍼 내 단어 자동완성 팝업 세션 (Ctrl+n, Ctrl+p) */
  completionSession?: CompletionSession | null;
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
  /** 아규먼트 리스트 (Arglist: :args, :argdo, :next, :prev) */
  argList?: ArgListState | null;
}


export type VimState = VimEditorState;
