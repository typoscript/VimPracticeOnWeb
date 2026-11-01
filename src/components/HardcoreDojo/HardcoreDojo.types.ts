export type DojoDrillType = 'relative-jump' | 'ft-sniper' | 'word-jump';

export interface DojoHighScore {
  score: number;
  targetsHit: number;
  spm: number;
  apm: number;
  completedAt: string;
}

export interface RelativeJumpProblem {
  type: 'relative-jump';
  lines: string[];
  initialCursor: { line: number; col: number };
  targetLine: number;
  targetText: string;
}

export interface FTSniperProblem {
  type: 'ft-sniper';
  line: string;
  initialCursor: { line: number; col: number };
  targetCol: number;
  targetChar: string;
  hint: string;
}

export interface WordJumpProblem {
  type: 'word-jump';
  line: string;
  initialCursor: { line: number; col: number };
  targetStartCol: number;
  targetEndCol: number;
  targetToken: string;
  optimalKeyCount: number; // e.g. 2 for 2W
}

export type DojoProblem = RelativeJumpProblem | FTSniperProblem | WordJumpProblem;

export interface DojoDrillMeta {
  id: DojoDrillType;
  title: string;
  badge: string;
  description: string;
  keyInstructions: string;
}
