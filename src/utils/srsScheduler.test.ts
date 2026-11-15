import { describe, it, expect, beforeEach } from 'vitest';
import {
  SRS_STORAGE_KEY,
  loadSrsSchedule,
  computeNextSrsCard,
  recordLessonSrsReview,
  buildSrsReviewQueue,
} from './srsScheduler';
import { MISSIONS } from '../data/missions';
import { getDefaultAnalytics } from './analyticsStorage';
import { LessonProgress } from './storage';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('srsScheduler (약점 기반 간격 반복 복습 큐)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('별점(1★ / 2★ / 3★)에 따라 SM-2 복습 간격과 반복 횟수를 정확히 산출한다', () => {
    const now = 1_700_000_000_000;

    // 3★ 첫 완료 -> 3일 뒤, 두 번째 3★ -> 7일 뒤
    const c1 = computeNextSrsCard(undefined, 14, 3, now);
    expect(c1.repetitions).toBe(1);
    expect(c1.intervalDays).toBe(3);
    expect(c1.nextReviewAt).toBe(now + 3 * DAY_MS);

    const c2 = computeNextSrsCard(c1, 14, 3, now + 3 * DAY_MS);
    expect(c2.repetitions).toBe(2);
    expect(c2.intervalDays).toBe(7);

    // 1★ 실패/고전 -> repetitions 리셋, 0.5일(12시간) 뒤 재복습
    const cFail = computeNextSrsCard(c2, 14, 1, now + 10 * DAY_MS);
    expect(cFail.repetitions).toBe(0);
    expect(cFail.intervalDays).toBe(0.5);
    expect(cFail.easeFactor).toBeLessThan(c2.easeFactor);
  });

  it('recordLessonSrsReview 호출 시 localStorage 에 스케줄을 영구 저장한다', () => {
    const now = 1_700_000_000_000;
    const saved = recordLessonSrsReview(13, 2, now);
    expect(saved[13].intervalDays).toBe(1);
    expect(saved[13].lastStars).toBe(2);

    const reloaded = loadSrsSchedule();
    expect(reloaded[13]).toEqual(saved[13]);
    expect(localStorage.getItem(SRS_STORAGE_KEY)).toBeTruthy();
  });

  it('복습 기한 도래·낮은 별점·안티패턴 약점을 종합해 우선순위 복습 큐를 생성한다', () => {
    const now = 1_700_000_000_000;
    const progress: LessonProgress = {
      1: { completed: true, bestStars: 3, minKeystrokes: 5 },
      13: { completed: true, bestStars: 1, minKeystrokes: 22 }, // 저효율 완료
      14: { completed: true, bestStars: 2, minKeystrokes: 10 },
    };

    const analytics = getDefaultAnalytics();
    analytics.totalKeystrokes = 120;
    analytics.antiPatternCounts['Backspace 연타 (x/ciw 권장)'] = 6;

    const schedule = {
      1: computeNextSrsCard(undefined, 1, 3, now - 1 * DAY_MS), // 2일 남음 (not due)
      13: computeNextSrsCard(undefined, 13, 1, now - 2 * DAY_MS), // 기한 초과 (due)
      14: computeNextSrsCard(undefined, 14, 2, now - 3 * DAY_MS), // 기한 초과 + Backspace/wordReplace 약점
    };

    const plan = buildSrsReviewQueue(MISSIONS, progress, analytics, schedule, now, 5);
    expect(plan.dueCount).toBeGreaterThanOrEqual(2);

    const ids = plan.items.map((item) => item.mission.id);
    expect(ids).toContain(13);
    expect(ids).toContain(14);
    // 1★ + 기한 초과인 레슨 13 또는 약점 매칭 레슨 14가 모두 due 상태로 앞쪽에 위치
    const item14 = plan.items.find((i) => i.mission.id === 14)!;
    expect(item14.isDue).toBe(true);
    expect(item14.weaknessLabel).toBeTruthy();
  });
});
