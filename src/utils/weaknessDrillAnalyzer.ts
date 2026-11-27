import { UserAnalyticsData } from '../types/game';
import { LessonProgress } from './storage';
import { calculateProficiency } from './analyticsStorage';
import { i18nKey, t } from '../i18n';
import type { DojoProblem } from '../components/HardcoreDojo/HardcoreDojo.types';

export type WeaknessCategoryId =
  | 'navigation'
  | 'targeting'
  | 'textObjects'
  | 'lineEndOps'
  | 'lineStartOps'
  | 'wordReplace';

export interface WeaknessFocus {
  id: WeaknessCategoryId;
  label: string;
  reason: string;
  recommendedDrillLabel: string;
  severityScore: number;
}

export interface WeaknessDrillQueueItem {
  problem: DojoProblem;
  focusId: WeaknessCategoryId;
  focusBadge: string;
  focusHint: string;
}

export interface WeaknessDrillPlan {
  hasAnalyticsData: boolean;
  topWeaknesses: WeaknessFocus[];
  queue: WeaknessDrillQueueItem[];
}

export function getCategoryMeta(id: WeaknessCategoryId): {
  labelKey: string;
  drillLabelKey: string;
  badgeKey: string;
  hintKey: string;
} {
  switch (id) {
    case 'navigation':
      return {
        labelKey: i18nKey('단어·라인 점프 (W / [N]j)'),
        drillLabelKey: i18nKey('상대 라인 & WORD 점프'),
        badgeKey: i18nKey('이동 습관 교정'),
        hintKey: i18nKey('hjkl 연타 대신 숫자 점프([N]jdd)와 W를 사용하세요'),
      };
    case 'targeting':
      return {
        labelKey: i18nKey('인라인 문자 저격 (f / t / ;)'),
        drillLabelKey: i18nKey('인라인 f/t 저격'),
        badgeKey: i18nKey('정밀 타겟팅 강화'),
        hintKey: i18nKey('f/t 와 ; 로 한 번에 목표 문자로 이동하세요'),
      };
    case 'textObjects':
      return {
        labelKey: i18nKey('텍스트 객체 & 연산자 (ci" / di()'),
        drillLabelKey: i18nKey('텍스트 객체 & 연산자'),
        badgeKey: i18nKey('텍스트 객체 숙련'),
        hintKey: i18nKey('괄호/따옴표/단어 객체로 한 번에 편집하세요'),
      };
    case 'lineEndOps':
      return {
        labelKey: i18nKey('줄 끝 단축 연산 (A / C / D)'),
        drillLabelKey: i18nKey('대문자 A·C·D 교정'),
        badgeKey: i18nKey('줄 끝 연산 교정'),
        hintKey: i18nKey('$+a, c$, d$ 대신 대문자 A / C / D 를 쓰세요'),
      };
    case 'lineStartOps':
      return {
        labelKey: i18nKey('줄 앞 즉시 입력 (I)'),
        drillLabelKey: i18nKey('대문자 I 교정'),
        badgeKey: i18nKey('줄 앞 입력 교정'),
        hintKey: i18nKey('0+i 대신 대문자 I 로 첫 비공백 앞에서 바로 입력하세요'),
      };
    case 'wordReplace':
      return {
        labelKey: i18nKey('단어 단위 치환·삭제 (ciw / dw)'),
        drillLabelKey: i18nKey('Backspace 연타 교정'),
        badgeKey: i18nKey('단어 편집 교정'),
        hintKey: i18nKey('Backspace 연타 대신 Normal 모드 dw / ciw 를 활용하세요'),
      };
  }
}

/**
 * 사용자의 타건 통계, 안티패턴 내역, 레슨 숙련도를 분석해 우선순위 약점 목록을 반환합니다.
 */
export function analyzeWeaknesses(
  analytics: UserAnalyticsData,
  progress: LessonProgress
): { hasAnalyticsData: boolean; focuses: WeaknessFocus[] } {
  const proficiency = calculateProficiency(analytics, progress);
  const ap = analytics.antiPatternCounts ?? {};

  const bsCount = ap['Backspace 연타 (x/ciw 권장)'] ?? 0;
  const repeatMoveCount = ap['방향키/hjkl 연타 (w/b/숫자 이동 권장)'] ?? 0;
  const dollarACount = ap['$ 후 a (대문자 A 권장)'] ?? 0;
  const zeroICount = ap['0 후 i (대문자 I 권장)'] ?? 0;
  const cDollarCount = ap['c$ 입력 (대문자 C 권장)'] ?? 0;
  const dDollarCount = ap['d$ 입력 (대문자 D 권장)'] ?? 0;

  const lineEndHabitCount = dollarACount + cDollarCount + dDollarCount;
  const hasAnalyticsData =
    analytics.totalKeystrokes > 0 || analytics.totalAntiPatternsTriggered > 0;

  const candidates: Array<{
    id: WeaknessCategoryId;
    score: number;
    reason: string;
  }> = [
    {
      id: 'navigation',
      score:
        (repeatMoveCount > 0 ? 45 + repeatMoveCount * 25 : 0) +
        Math.max(0, 75 - proficiency.navigation),
      reason:
        repeatMoveCount > 0
          ? t('이동 키 연타 안티패턴 {n}회 감지', { n: repeatMoveCount })
          : t('기본 이동 숙련도 {score}점 (목표 75점)', { score: proficiency.navigation }),
    },
    {
      id: 'targeting',
      score: Math.max(5, 80 - proficiency.targeting),
      reason: t('정밀 타겟팅 숙련도 {score}점 (f/t/; 강화 추천)', {
        score: proficiency.targeting,
      }),
    },
    {
      id: 'textObjects',
      score: Math.max(5, 80 - proficiency.textObjects),
      reason: t('텍스트 객체 숙련도 {score}점 (ci"/di( 강화 추천)', {
        score: proficiency.textObjects,
      }),
    },
    {
      id: 'lineEndOps',
      score:
        (lineEndHabitCount > 0 ? 50 + lineEndHabitCount * 30 : 0) +
        Math.max(0, 65 - proficiency.efficiency) * 0.8,
      reason:
        lineEndHabitCount > 0
          ? t('$+a / c$ / d$ 비효율 습관 {n}회 감지', { n: lineEndHabitCount })
          : t('타수 효율성 {score}점 (A/C/D 단축키 추천)', {
              score: proficiency.efficiency,
            }),
    },
    {
      id: 'lineStartOps',
      score: zeroICount > 0 ? 50 + zeroICount * 30 : Math.max(0, 50 - proficiency.efficiency) * 0.6,
      reason:
        zeroICount > 0
          ? t('0+i 비효율 습관 {n}회 감지 (대문자 I 권장)', { n: zeroICount })
          : t('줄 앞 즉시 입력(I) 반사 신경 보강'),
    },
    {
      id: 'wordReplace',
      score: bsCount > 0 ? 50 + bsCount * 30 : Math.max(0, 60 - proficiency.textObjects) * 0.7,
      reason:
        bsCount > 0
          ? t('Backspace 연타 {n}회 감지 (ciw/dw 교정)', { n: bsCount })
          : t('Normal 모드 단어 단위 수정(ciw/dw) 보강'),
    },
  ];

  candidates.sort((a, b) => b.score - a.score);

  const focuses: WeaknessFocus[] = candidates.map((c) => {
    const meta = getCategoryMeta(c.id);
    return {
      id: c.id,
      label: meta.labelKey,
      reason: c.reason,
      recommendedDrillLabel: meta.drillLabelKey,
      severityScore: Math.round(c.score),
    };
  });

  return { hasAnalyticsData, focuses };
}
