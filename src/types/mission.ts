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
  /** 3성(Par) 기준 모범 키 입력 시퀀스 (고스트 리플레이용) */
  optimalKeys?: string[];
  initialUndoStack?: StateSnapshot[];
  initialClipboard?: ClipboardRegister;
  /** 주 창 파일명 (기본: lesson_{id}.txt 또는 source.ts) */
  primaryFilename?: string;
  /** 보조 창 파일명 (예: target.ts) */
  secondaryFilename?: string;
  /** 보조 창 초기 줄 (다중 파일 미션용) */
  secondaryLines?: string[];
  /** 초기 창 분할 상태 */
  initialSplit?: 'none' | 'horizontal' | 'vertical';
  checkComplete: (state: VimEditorState) => boolean;
}
