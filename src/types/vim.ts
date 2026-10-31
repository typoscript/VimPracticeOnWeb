export type VimMode = 'NORMAL' | 'INSERT' | 'VISUAL' | 'VISUAL_LINE' | 'COMMAND';

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
}
