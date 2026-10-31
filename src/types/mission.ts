import { VimEditorState } from './vim';

export interface Mission {
  id: number;
  title: string;
  description: string;
  hint: string;
  initialLines: string[];
  initialCursor: { line: number; col: number };
  targetCursor?: { line: number; col: number };
  checkComplete: (state: VimEditorState) => boolean;
}
