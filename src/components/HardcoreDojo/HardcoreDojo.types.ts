export type DojoDrillType =
  | 'relative-jump'
  | 'ft-sniper'
  | 'word-jump'
  | 'sudden-death'
  | 'pro-master'
  | 'weakness-custom';

export interface DojoLeaderboardEntry {
  id: string;
  playerName: string;
  clearTime: number; // seconds (e.g. 8.42)
  completedAt: string;
  tier: string;
  combo: number;
}

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

export interface ProMasterProblem {
  type: 'pro-master';
  index: number;
  prompt: string;
  lines: string[];
  initialCursor: { line: number; col: number };
  targetLines: string[];
  hint: string;
  optimalKeys: string;
}

export type DojoProblem =
  | RelativeJumpProblem
  | FTSniperProblem
  | WordJumpProblem
  | ProMasterProblem;

export interface DojoDrillMeta {
  id: DojoDrillType;
  title: string;
  badge: string;
  description: string;
  keyInstructions: string;
}
