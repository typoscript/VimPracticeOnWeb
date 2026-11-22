import { ClipboardRegister, StateSnapshot, VimEditorState, QuickfixItem, ChangeListItem, UndoTreeNode, FoldRange, RegisterEntry, LspDiagnostic, LspHoverSymbol, VirtualTestSpec, DapTraceStep } from '../vim-engine';

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
  initialUndoTreeNodes?: Record<number, UndoTreeNode>;
  initialCurrentUndoSeq?: number;
  initialMaxUndoSeq?: number;
  initialUndoTimeHistory?: number[];
  initialUndoTimeIndex?: number;
  initialClipboard?: ClipboardRegister;
  /** 초기 레지스터 상태 (매크로/클립보드 실전 편집 미션용) */
  initialRegisters?: Record<string, RegisterEntry>;
  /** 주 창 파일명 (기본: lesson_{id}.txt 또는 source.ts) */
  primaryFilename?: string;
  /** 보조 창 파일명 (예: target.ts) */
  secondaryFilename?: string;
  /** 보조 창 초기 줄 (다중 파일 미션용) */
  secondaryLines?: string[];
  /** 초기 창 분할 상태 */
  initialSplit?: 'none' | 'horizontal' | 'vertical';
  /** 초기 Diff 모드 활성화 여부 (:diffsplit 미션용) */
  initialDiffMode?: boolean;
  /** 초기 커맨드라인 히스토리 (: 명령 기록) */
  initialCommandHistory?: string[];
  /** 초기 검색 히스토리 (/, ? 패턴 기록) */
  initialSearchHistory?: string[];
  /** 초기 퀵픽스 목록 (:copen, :cn, :cp 미션용) */
  initialQuickfixItems?: QuickfixItem[];
  /** 초기 로케이션 리스트 (:lopen, :lnext, :lprev 미션용) */
  initialLocationListItems?: QuickfixItem[];
  /** 초기 체인지 리스트 (g;, g, 미션용) */
  initialChangeList?: ChangeListItem[];
  /** 초기 아규먼트 리스트 (:args, :argdo 미션용) */
  initialArgs?: string[];
  /** 초기 폴드 목록 (코드 폴딩 미션용) */
  initialFolds?: FoldRange[];
  /** 초기 가상 파일 시스템 맵 (Netrw / 프로젝트 탐색 미션용) */
  initialVirtualFiles?: Record<string, string[]>;
  /** Neovim 스타일 LSP 초기 진단 목록 ([d, ]d, :lopen 연계) */
  initialLspDiagnostics?: LspDiagnostic[];
  /** Neovim 스타일 LSP 호버 심볼 사전 (K) */
  initialLspSymbols?: Record<string, LspHoverSymbol>;
  /** gitsigns.nvim 기준선(HEAD) 스냅샷 (]h/[h, :Gitsigns 미션용) */
  initialGitBaseLines?: string[];
  /** harpoon.nvim 초기 핀 목록 */
  initialHarpoonList?: string[];
  /** 실무 캡스톤 가상 테스트 스위트 (:TestRun / npm test) */
  initialVirtualTests?: VirtualTestSpec[];
  /** nvim-dap 초기 커스텀 디버그 트레이스 */
  initialDapTrace?: DapTraceStep[];
  /** nvim-dap 초기 중단점 맵 */
  initialDapBreakpoints?: Record<string, number[]>;
  /** 캡스톤 프로젝트 ID */
  capstoneId?: string;
  /** 캡스톤 추천 도구 배지 목록 */
  recommendedTools?: string[];
  checkComplete: (state: VimEditorState) => boolean;
}
