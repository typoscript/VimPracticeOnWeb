export type VimMode = 'NORMAL' | 'INSERT' | 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK' | 'COMMAND' | 'SEARCH';

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

export interface ViewportState {
  topRow: number;       // 현재 화면 최상단 행 번호 (0-indexed)
  visibleRows: number;  // 화면에 한 번에 표시되는 행 개수
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
  /** 커맨드라인 종류 (':' | '/') */
  commandType?: ':' | '/';
  /** 마지막 검색어 ('n', 'N', '*' 재검색용) */
  lastSearchQuery?: string;
  /** 커맨드라인 또는 검색 실행 결과 피드백 메시지 (예: '10번째 줄로 이동', 'E492: 알 수 없는 명령어') */
  commandMessage?: string;
  /** 멀티 레지스터 저장소 */
  registers?: Record<string, { type: 'char' | 'line' | 'macro'; content: string | string[] }>;
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
}

export type VimState = VimEditorState;
