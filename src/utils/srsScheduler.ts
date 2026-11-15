import { Mission } from '../types/mission';
import { UserAnalyticsData } from '../types/game';
import { LessonProgress } from './storage';
import { analyzeWeaknesses, WeaknessCategoryId, WeaknessFocus } from './weaknessDrillAnalyzer';
import { i18nKey } from '../i18n';

export const SRS_STORAGE_KEY = 'vim_srs_schedule_v1';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SrsLessonCard {
  lessonId: number;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  lastReviewAt: number;
  nextReviewAt: number;
  lastStars: number;
}

export type SrsScheduleMap = Record<number, SrsLessonCard>;

export interface SrsReviewItem {
  mission: Mission;
  stars: number;
  minKeystrokes: number;
  isDue: boolean;
  overdueDays: number;
  dueInDays: number;
  intervalDays: number;
  reasonKey: string;
  reasonParams?: Record<string, string | number>;
  weaknessLabel?: string;
  priorityScore: number;
}

export interface SrsReviewPlan {
  dueCount: number;
  items: SrsReviewItem[];
  topWeaknesses: WeaknessFocus[];
}

const WEAKNESS_TO_LESSON_IDS: Record<WeaknessCategoryId, number[]> = {
  navigation: [1, 2, 7, 10, 20, 27, 60],
  targeting: [13, 16, 47, 77, 86],
  textObjects: [14, 25, 52, 54, 58, 76],
  lineEndOps: [3, 11, 12, 83],
  lineStartOps: [11, 21, 79],
  wordReplace: [7, 12, 14, 15, 30],
};

export function loadSrsSchedule(): SrsScheduleMap {
  try {
    const raw = localStorage.getItem(SRS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as SrsScheduleMap;
  } catch {
    return {};
  }
}

export function saveSrsSchedule(schedule: SrsScheduleMap): void {
  try {
    localStorage.setItem(SRS_STORAGE_KEY, JSON.stringify(schedule));
  } catch {
    // 저장 공간 부족 등 예외 무시
  }
}

/**
 * SM-2 기반 간격 반복 계산: 완료 별점(1~3)에 따라 다음 복습 간격과 난이도 계수를 갱신합니다.
 */
export function computeNextSrsCard(
  prev: SrsLessonCard | undefined,
  lessonId: number,
  stars: number,
  now = Date.now()
): SrsLessonCard {
  const prevRep = prev?.repetitions ?? 0;
  const prevInterval = prev?.intervalDays ?? 1;
  const prevEase = prev?.easeFactor ?? 2.5;

  let repetitions = prevRep;
  let intervalDays = prevInterval;
  let easeFactor = prevEase;

  if (stars >= 3) {
    if (prevRep === 0) {
      intervalDays = 3;
    } else if (prevRep === 1) {
      intervalDays = 7;
    } else {
      intervalDays = Math.max(1, Math.round(prevInterval * prevEase));
    }
    repetitions = prevRep + 1;
    easeFactor = Math.min(3.0, Number((prevEase + 0.1).toFixed(2)));
  } else if (stars === 2) {
    if (prevRep === 0) {
      intervalDays = 1;
    } else if (prevRep === 1) {
      intervalDays = 4;
    } else {
      intervalDays = Math.max(1, Math.round(prevInterval * Math.max(1.3, prevEase - 0.1)));
    }
    repetitions = prevRep + 1;
    easeFactor = Math.max(1.3, Number((prevEase - 0.05).toFixed(2)));
  } else {
    // 1★: 타수 초과가 컸으므로 반나절(12시간) 뒤 재복습 권장
    repetitions = 0;
    intervalDays = 0.5;
    easeFactor = Math.max(1.3, Number((prevEase - 0.2).toFixed(2)));
  }

  return {
    lessonId,
    repetitions,
    intervalDays,
    easeFactor,
    lastReviewAt: now,
    nextReviewAt: now + Math.round(intervalDays * DAY_MS),
    lastStars: stars,
  };
}

/**
 * 레슨 완료 시 해당 레슨의 SRS 스케줄을 갱신해 localStorage에 저장합니다.
 */
export function recordLessonSrsReview(
  lessonId: number,
  stars: number,
  now = Date.now()
): SrsScheduleMap {
  const current = loadSrsSchedule();
  const nextCard = computeNextSrsCard(current[lessonId], lessonId, stars, now);
  const updated: SrsScheduleMap = {
    ...current,
    [lessonId]: nextCard,
  };
  saveSrsSchedule(updated);
  return updated;
}

/**
 * 완료 기록(별점), SRS 복습 도래 시점, 안티패턴/숙련도 약점을 종합해 개인화된 복습 큐를 생성합니다.
 */
export function buildSrsReviewQueue(
  missions: Mission[],
  progress: LessonProgress,
  analytics: UserAnalyticsData,
  schedule: SrsScheduleMap,
  now = Date.now(),
  limit = 6
): SrsReviewPlan {
  const { focuses } = analyzeWeaknesses(analytics, progress);
  const topWeaknesses = focuses.slice(0, 2);

  // 각 레슨 ID별 최고 약점 매핑 계산
  const lessonWeaknessMap = new Map<number, { focus: WeaknessFocus; rankScore: number }>();
  topWeaknesses.forEach((focus, rankIdx) => {
    const ids = WEAKNESS_TO_LESSON_IDS[focus.id] ?? [];
    ids.forEach((id) => {
      if (!lessonWeaknessMap.has(id)) {
        lessonWeaknessMap.set(id, {
          focus,
          rankScore: rankIdx === 0 ? 40 : 24,
        });
      }
    });
  });

  const items: SrsReviewItem[] = [];

  for (const mission of missions) {
    const rec = progress[mission.id];
    const card = schedule[mission.id];
    const weaknessInfo = lessonWeaknessMap.get(mission.id);

    // 아직 한 번도 완료하지 않았지만 상위 약점과 직접 연결되지 않은 레슨은 복습 큐에서 제외
    if (!rec?.completed && !weaknessInfo) {
      continue;
    }

    const stars = rec?.bestStars ?? 0;
    const minKeystrokes = rec?.minKeystrokes ?? 0;

    let isDue = false;
    let overdueDays = 0;
    let dueInDays = 0;
    let intervalDays = card?.intervalDays ?? (stars >= 3 ? 3 : stars === 2 ? 1 : 0.5);

    if (card) {
      const diffMs = now - card.nextReviewAt;
      isDue = diffMs >= 0;
      if (isDue) {
        overdueDays = Math.max(0, Number((diffMs / DAY_MS).toFixed(1)));
      } else {
        dueInDays = Math.max(0.1, Number(((-diffMs) / DAY_MS).toFixed(1)));
      }
    } else if (rec?.completed) {
      // 기존 완료 레슨 중 3★ 미만은 즉시 보강 복습 대상으로 분류
      isDue = stars < 3;
      overdueDays = stars <= 1 ? 2 : stars === 2 ? 1 : 0;
      dueInDays = isDue ? 0 : 3;
    } else if (weaknessInfo) {
      // 미완료 약점 보강 추천
      isDue = true;
      overdueDays = 0.5;
    }

    let reasonKey: string;
    let reasonParams: Record<string, string | number> | undefined;

    if (!rec?.completed && weaknessInfo) {
      reasonKey = i18nKey('약점 보강 추천 ({label})');
      reasonParams = { label: weaknessInfo.focus.label };
    } else if (isDue && stars <= 1) {
      reasonKey = i18nKey('{stars}★ 보강 복습 필요');
      reasonParams = { stars };
    } else if (isDue && overdueDays >= 1) {
      reasonKey = i18nKey('복습 기한 {days}일 경과');
      reasonParams = { days: Math.floor(overdueDays) };
    } else if (isDue) {
      reasonKey = i18nKey('오늘 복습 권장');
    } else if (weaknessInfo) {
      reasonKey = i18nKey('약점 집중 연계 · {days}일 후 복습');
      reasonParams = { days: Math.ceil(dueInDays) };
    } else {
      reasonKey = i18nKey('{days}일 후 복습 예정');
      reasonParams = { days: Math.ceil(dueInDays) };
    }

    const starPenalty = rec?.completed ? (3 - stars) * 28 : 18;
    const dueBonus = isDue ? 60 + Math.min(40, overdueDays * 8) : -Math.min(30, dueInDays * 4);
    const weaknessBonus = weaknessInfo?.rankScore ?? 0;
    const priorityScore = Number((dueBonus + starPenalty + weaknessBonus).toFixed(2));

    // 복습 필요 항목이거나 약점 연계 항목, 또는 최근 완료된 항목만 후보에 포함
    if (isDue || weaknessInfo || stars < 3) {
      items.push({
        mission,
        stars,
        minKeystrokes,
        isDue,
        overdueDays,
        dueInDays,
        intervalDays,
        reasonKey,
        reasonParams,
        weaknessLabel: weaknessInfo?.focus.label,
        priorityScore,
      });
    }
  }

  items.sort((a, b) => {
    if (a.isDue !== b.isDue) return a.isDue ? -1 : 1;
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return a.mission.id - b.mission.id;
  });

  const dueCount = items.filter((item) => item.isDue).length;

  return {
    dueCount,
    items: items.slice(0, limit),
    topWeaknesses,
  };
}
