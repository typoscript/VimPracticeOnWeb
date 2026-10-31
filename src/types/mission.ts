import { ClipboardRegister, StateSnapshot, VimEditorState } from './vim';

export interface Mission {
  id: number;
  title: string;
  description: string;
  hint: string;
  par: number; // 최적 최소 타수 (Vim Golf 기준)
  initialLines: string[];
  initialCursor: { line: number; col: number };
  targetCursor?: { line: number; col: number };
  /** 목표 텍스트 상태 (Diff 비교 뷰용) */
  targetLines?: string[];
  initialUndoStack?: StateSnapshot[];
  initialClipboard?: ClipboardRegister;
  checkComplete: (state: VimEditorState) => boolean;
}
