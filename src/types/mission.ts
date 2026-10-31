import { ClipboardRegister, StateSnapshot, VimEditorState } from './vim';

export interface Mission {
  id: number;
  title: string;
  description: string;
  hint: string;
  initialLines: string[];
  initialCursor: { line: number; col: number };
  targetCursor?: { line: number; col: number };
  initialUndoStack?: StateSnapshot[];
  initialClipboard?: ClipboardRegister;
  checkComplete: (state: VimEditorState) => boolean;
}
