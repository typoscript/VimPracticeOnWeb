import {
  STORAGE_KEYS,
  readStorageBoolean,
  writeStorageBoolean,
  readStorageJson,
  writeStorageJson,
} from './localStorageClient';

export interface LessonRecord {
  completed: boolean;
  bestStars: number; // 1, 2, 3
  minKeystrokes: number; // 최저 타수 기록
}

export type LessonProgress = Record<number, LessonRecord>;

export const PROGRESS_STORAGE_KEY = STORAGE_KEYS.PROGRESS;
export const RELATIVE_LINE_STORAGE_KEY = STORAGE_KEYS.RELATIVE_LINE;
export const VIRTUAL_KEYBOARD_STORAGE_KEY = STORAGE_KEYS.VIRTUAL_KEYBOARD;
export const DIFF_VIEW_STORAGE_KEY = STORAGE_KEYS.DIFF_VIEW;
export const REGISTER_INSPECTOR_STORAGE_KEY = STORAGE_KEYS.REGISTER_INSPECTOR;
export const MARKS_VISUALIZER_STORAGE_KEY = STORAGE_KEYS.MARKS_VISUALIZER;
export const GRAMMAR_AST_STORAGE_KEY = STORAGE_KEYS.GRAMMAR_AST;
export const SPEEDRUN_RECORD_STORAGE_KEY = STORAGE_KEYS.SPEEDRUN_RECORD;
export const HARDCORE_MODE_STORAGE_KEY = STORAGE_KEYS.HARDCORE_MODE;
export const DOJO_HIGH_SCORES_STORAGE_KEY = STORAGE_KEYS.DOJO_HIGH_SCORES;
export const DOJO_LEADERBOARD_STORAGE_KEY = STORAGE_KEYS.DOJO_LEADERBOARD;

export interface SpeedrunRecord {
  /** 총 소요 시간 (초, 소수점 1자리) */
  bestTimeSeconds: number;
  /** 총 타수 */
  minKeystrokes: number;
  /** 클리어 시점 ISO 문자열 */
  completedAt: string;
}

/**
 * localStorage에서 사용자의 레슨 진도 및 최고 기록을 불러옵니다.
 */
export function loadProgress(): LessonProgress {
  return readStorageJson<LessonProgress>(PROGRESS_STORAGE_KEY, {});
}

/**
 * 레슨 완료 시 더 우수한 별점 또는 더 적은 타수일 경우 기록을 갱신하고 저장합니다.
 */
export function saveLessonRecord(
  lessonId: number,
  stars: number,
  keystrokes: number
): LessonProgress {
  const current = loadProgress();
  const prevRecord = current[lessonId];

  const bestStars = prevRecord ? Math.max(prevRecord.bestStars, stars) : stars;
  const minKeystrokes = prevRecord
    ? Math.min(prevRecord.minKeystrokes, keystrokes)
    : keystrokes;

  const updated: LessonProgress = {
    ...current,
    [lessonId]: {
      completed: true,
      bestStars,
      minKeystrokes,
    },
  };

  writeStorageJson(PROGRESS_STORAGE_KEY, updated);
  return updated;
}

/** 상대 라인 번호 설정값 조회/저장 */
export const loadRelativeLineSetting = (): boolean =>
  readStorageBoolean(RELATIVE_LINE_STORAGE_KEY, false);
export const saveRelativeLineSetting = (enabled: boolean): void => {
  writeStorageBoolean(RELATIVE_LINE_STORAGE_KEY, enabled);
};

/** 가상 키보드 패널 표시 여부 조회/저장 (기본값: true) */
export const loadVirtualKeyboardSetting = (): boolean =>
  readStorageBoolean(VIRTUAL_KEYBOARD_STORAGE_KEY, true);
export const saveVirtualKeyboardSetting = (enabled: boolean): void => {
  writeStorageBoolean(VIRTUAL_KEYBOARD_STORAGE_KEY, enabled);
};

/** 목표 Diff 비교 뷰 패널 표시 여부 조회/저장 (기본값: true) */
export const loadDiffViewSetting = (): boolean =>
  readStorageBoolean(DIFF_VIEW_STORAGE_KEY, true);
export const saveDiffViewSetting = (enabled: boolean): void => {
  writeStorageBoolean(DIFF_VIEW_STORAGE_KEY, enabled);
};

/** 레지스터 인스펙터 패널 표시 여부 조회/저장 (기본값: true) */
export const loadRegisterInspectorSetting = (): boolean =>
  readStorageBoolean(REGISTER_INSPECTOR_STORAGE_KEY, true);
export const saveRegisterInspectorSetting = (enabled: boolean): void => {
  writeStorageBoolean(REGISTER_INSPECTOR_STORAGE_KEY, enabled);
};

/** 마크 & 점프 리스트 비주얼 맵 패널 표시 여부 조회/저장 (기본값: false) */
export const loadMarksVisualizerSetting = (): boolean =>
  readStorageBoolean(MARKS_VISUALIZER_STORAGE_KEY, false);
export const saveMarksVisualizerSetting = (enabled: boolean): void => {
  writeStorageBoolean(MARKS_VISUALIZER_STORAGE_KEY, enabled);
};

/** Vim 문법 AST 인스펙터 패널 표시 여부 조회/저장 (기본값: false) */
export const loadGrammarASTSetting = (): boolean =>
  readStorageBoolean(GRAMMAR_AST_STORAGE_KEY, false);
export const saveGrammarASTSetting = (enabled: boolean): void => {
  writeStorageBoolean(GRAMMAR_AST_STORAGE_KEY, enabled);
};

/** 실시간 명령 복기 타임라인 & Vim X-Ray 패널 표시 여부 조회/저장 (기본값: true) */
export const loadActionTimelineSetting = (): boolean =>
  readStorageBoolean(STORAGE_KEYS.ACTION_TIMELINE, true);
export const saveActionTimelineSetting = (enabled: boolean): void => {
  writeStorageBoolean(STORAGE_KEYS.ACTION_TIMELINE, enabled);
};

/** 스피드런 최고 기록 조회 */
export function loadSpeedrunRecord(): SpeedrunRecord | null {
  return readStorageJson<SpeedrunRecord | null>(SPEEDRUN_RECORD_STORAGE_KEY, null);
}

/**
 * 스피드런 완료 시 최고 기록(더 짧은 시간 또는 동일 시간 시 더 적은 타수)을 갱신합니다.
 */
export function saveSpeedrunRecord(
  timeSeconds: number,
  keystrokes: number
): { record: SpeedrunRecord; isNewRecord: boolean } {
  const current = loadSpeedrunRecord();
  const isNewRecord =
    !current ||
    timeSeconds < current.bestTimeSeconds ||
    (timeSeconds === current.bestTimeSeconds && keystrokes < current.minKeystrokes);

  const recordToSave: SpeedrunRecord = isNewRecord
    ? {
        bestTimeSeconds: Number(timeSeconds.toFixed(1)),
        minKeystrokes: keystrokes,
        completedAt: new Date().toISOString(),
      }
    : current;

  writeStorageJson(SPEEDRUN_RECORD_STORAGE_KEY, recordToSave);
  return { record: recordToSave, isNewRecord };
}

export interface DojoLeaderboardEntry {
  id: string;
  playerName: string;
  clearTime: number;
  completedAt: string;
  tier: string;
  combo: number;
}

export const DEFAULT_DOJO_LEADERBOARD: DojoLeaderboardEntry[] = [
  { id: 'lb-1', playerName: 'VimValkyrie', clearTime: 8.92, completedAt: '2026-11-01T12:00:00Z', tier: '👑 GODSPEED', combo: 10 },
  { id: 'lb-2', playerName: 'NeoMaster', clearTime: 11.45, completedAt: '2026-11-02T15:30:00Z', tier: '👑 GODSPEED', combo: 10 },
  { id: 'lb-3', playerName: 'MotionSniper', clearTime: 14.20, completedAt: '2026-11-03T09:15:00Z', tier: '🥇 ONE-STRIKE', combo: 10 },
  { id: 'lb-4', playerName: 'HjklHater', clearTime: 17.80, completedAt: '2026-11-04T18:40:00Z', tier: '🥇 ONE-STRIKE', combo: 10 },
  { id: 'lb-5', playerName: 'BufferNinja', clearTime: 22.35, completedAt: '2026-11-05T21:10:00Z', tier: '🥈 DOJO-MASTER', combo: 10 },
];

export interface DojoHighScore {
  score: number;
  targetsHit: number;
  spm: number;
  apm: number;
  completedAt: string;
}

/** 하드코어 모드 활성화 여부 조회/저장 (기본값: false) */
export const loadHardcoreMode = (): boolean =>
  readStorageBoolean(HARDCORE_MODE_STORAGE_KEY, false);
export const saveHardcoreMode = (enabled: boolean): void => {
  writeStorageBoolean(HARDCORE_MODE_STORAGE_KEY, enabled);
};

/** 도장(Dojo) 미니 드릴 최고 기록 목록 조회 */
export function loadDojoHighScores(): Record<string, DojoHighScore> {
  return readStorageJson<Record<string, DojoHighScore>>(DOJO_HIGH_SCORES_STORAGE_KEY, {});
}

/** 특정 드릴의 최고 기록을 저장하고 갱신 여부를 반환합니다. */
export function saveDojoHighScore(
  drillId: string,
  record: { score: number; targetsHit: number; spm: number; apm: number }
): { isNewRecord: boolean; currentBest: DojoHighScore } {
  const all = loadDojoHighScores();
  const existing = all[drillId];
  const isNewRecord = !existing || record.score > existing.score;

  const updatedRecord: DojoHighScore = isNewRecord
    ? {
        score: record.score,
        targetsHit: record.targetsHit,
        spm: record.spm,
        apm: record.apm,
        completedAt: new Date().toISOString(),
      }
    : existing;

  all[drillId] = updatedRecord;
  writeStorageJson(DOJO_HIGH_SCORES_STORAGE_KEY, all);
  return { isNewRecord, currentBest: updatedRecord };
}

/** 도장 서든데스 명예의 전당 (Leaderboard) 랭킹 목록 조회 */
export function loadDojoLeaderboard(): DojoLeaderboardEntry[] {
  const parsed = readStorageJson<unknown>(DOJO_LEADERBOARD_STORAGE_KEY, null);
  if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_DOJO_LEADERBOARD;
  return parsed as DojoLeaderboardEntry[];
}

/** 서든데스 클리어 기록을 랭킹에 저장하고 순위를 반환합니다. */
export function saveDojoLeaderboardEntry(
  entry: Omit<DojoLeaderboardEntry, 'id' | 'completedAt'>
): {
  leaderboard: DojoLeaderboardEntry[];
  rank: number;
} {
  const current = loadDojoLeaderboard();
  const newEntry: DojoLeaderboardEntry = {
    ...entry,
    id: `lb-${Date.now()}`,
    completedAt: new Date().toISOString(),
  };

  const updated = [...current, newEntry].sort((a, b) => a.clearTime - b.clearTime).slice(0, 10);
  const rank = updated.findIndex((e) => e.id === newEntry.id) + 1;
  writeStorageJson(DOJO_LEADERBOARD_STORAGE_KEY, updated);

  return { leaderboard: updated, rank: rank > 0 ? rank : updated.length + 1 };
}
