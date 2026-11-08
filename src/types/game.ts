import { CursorPosition, VimEditorState } from '../vim-engine';

export interface ProficiencyAxes {
  navigation: number;   // ① 기본 이동 (hjkl, w, b, e, 0, $, ^, gg, G)
  targeting: number;    // ② 정밀 타겟팅 (f, t, F, T, ;, ,, %, marks, jumps)
  textObjects: number;  // ③ 텍스트 객체 (ciw, diw, ya", da(, etc.)
  batchEditing: number; // ④ 대량 편집 (:s, :g, :norm, macros, visual block, splits)
  efficiency: number;   // ⑤ 타수 효율성 (Golf Par 달성률, 평균 별점)
}

export interface CommandFrequency {
  key: string;
  count: number;
  label?: string;
}

export interface AntiPatternStat {
  type: string;
  name: string;
  count: number;
}

export interface UserAnalyticsData {
  totalKeystrokes: number;
  keyFrequencies: Record<string, number>;
  antiPatternCounts: Record<string, number>;
  totalAntiPatternsTriggered: number;
  arcadeBestScore: number;
  arcadeHighestWave: number;
  arcadeMaxCombo: number;
  arcadeGamesPlayed: number;
  dailyStreak: number;
  lastDailyDate?: string;
  dailyRecords: Record<string, DailyRecord>;
}

export interface ArcadeBugMission {
  id: number;
  title: string;
  instruction: string;
  initialLines: string[];
  targetLines: string[];
  initialCursor: CursorPosition;
  par: number;
  timeLimit: number; // 초 단위 제한 시간
  bugType: 'typo' | 'tag' | 'quote' | 'line' | 'block';
  checkComplete?: (state: VimEditorState) => boolean;
}

export interface DailyChallengePuzzle {
  date: string;
  id: number;
  title: string;
  templateTitle?: string;
  description: string;
  hint: string;
  initialLines: string[];
  targetLines: string[];
  initialCursor: CursorPosition;
  par: number;
}

export interface DailyRecord {
  date: string;
  completed: boolean;
  stars: number;
  keystrokes: number;
  elapsedSeconds: number;
  par: number;
  completedAt: string;
}
