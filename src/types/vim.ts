export type VimMode = 'NORMAL' | 'INSERT' | 'VISUAL' | 'VISUAL_LINE' | 'COMMAND' | 'SEARCH';

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
}
