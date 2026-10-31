export interface LessonRecord {
  completed: boolean;
  bestStars: number; // 1, 2, 3
  minKeystrokes: number; // 최저 타수 기록
}

export type LessonProgress = Record<number, LessonRecord>;

export const PROGRESS_STORAGE_KEY = 'vim_practice_progress_v1';
export const RELATIVE_LINE_STORAGE_KEY = 'vim_relative_line_numbers_v1';

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
