export interface LessonRecord {
  completed: boolean;
  bestStars: number; // 1, 2, 3
  minKeystrokes: number; // 최저 타수 기록
}

export type LessonProgress = Record<number, LessonRecord>;

export const PROGRESS_STORAGE_KEY = 'vim_practice_progress_v1';
export const RELATIVE_LINE_STORAGE_KEY = 'vim_relative_line_numbers_v1';
export const VIRTUAL_KEYBOARD_STORAGE_KEY = 'vim_virtual_keyboard_v1';
export const DIFF_VIEW_STORAGE_KEY = 'vim_diff_view_v1';
export const SPEEDRUN_RECORD_STORAGE_KEY = 'vim_speedrun_record_v1';

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
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as LessonProgress;
  } catch {
    return {};
  }
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

  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // 저장 실패 시 무시
  }

  return updated;
}

/**
 * 상대 라인 번호 설정값을 불러옵니다.
 */
export function loadRelativeLineSetting(): boolean {
  try {
    const raw = localStorage.getItem(RELATIVE_LINE_STORAGE_KEY);
    return raw === 'true';
  } catch {
    return false;
  }
}

/**
 * 상대 라인 번호 설정값을 저장합니다.
 */
export function saveRelativeLineSetting(enabled: boolean): void {
  try {
    localStorage.setItem(RELATIVE_LINE_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // 저장 실패 시 무시
  }
}

/**
 * 가상 키보드 패널 표시 여부 설정값을 불러옵니다. (기본값: true)
 */
export function loadVirtualKeyboardSetting(): boolean {
  try {
    const raw = localStorage.getItem(VIRTUAL_KEYBOARD_STORAGE_KEY);
    return raw !== null ? raw === 'true' : true;
  } catch {
    return true;
  }
}

/**
 * 가상 키보드 패널 표시 여부 설정값을 저장합니다.
 */
export function saveVirtualKeyboardSetting(enabled: boolean): void {
  try {
    localStorage.setItem(VIRTUAL_KEYBOARD_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // 무시
  }
}

/**
 * 목표 Diff 비교 뷰 패널 표시 여부 설정값을 불러옵니다. (기본값: true)
 */
export function loadDiffViewSetting(): boolean {
  try {
    const raw = localStorage.getItem(DIFF_VIEW_STORAGE_KEY);
    return raw !== null ? raw === 'true' : true;
  } catch {
    return true;
  }
}

/**
 * 목표 Diff 비교 뷰 패널 표시 여부 설정값을 저장합니다.
 */
export function saveDiffViewSetting(enabled: boolean): void {
  try {
    localStorage.setItem(DIFF_VIEW_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // 무시
  }
}

/**
 * 스피드런 최고 기록을 불러옵니다.
 */
export function loadSpeedrunRecord(): SpeedrunRecord | null {
  try {
    const raw = localStorage.getItem(SPEEDRUN_RECORD_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SpeedrunRecord;
  } catch {
    return null;
  }
}

/**
 * 스피드런 완료 시 최고 기록(더 짧은 시간 또는 동일 시간 시 더 적은 타수)을 갱신합니다.
 */
export function saveSpeedrunRecord(
  timeSeconds: number,
  keystrokes: number
): { record: SpeedrunRecord; isNewRecord: boolean } {
  const current = loadSpeedrunRecord();
  let isNewRecord = false;

  if (!current) {
    isNewRecord = true;
  } else if (timeSeconds < current.bestTimeSeconds) {
    isNewRecord = true;
  } else if (timeSeconds === current.bestTimeSeconds && keystrokes < current.minKeystrokes) {
    isNewRecord = true;
  }

  const recordToSave: SpeedrunRecord = isNewRecord
    ? {
        bestTimeSeconds: Number(timeSeconds.toFixed(1)),
        minKeystrokes: keystrokes,
        completedAt: new Date().toISOString(),
      }
    : current!;

  try {
    localStorage.setItem(SPEEDRUN_RECORD_STORAGE_KEY, JSON.stringify(recordToSave));
  } catch {
    // 무시
  }

  return { record: recordToSave, isNewRecord };
}
