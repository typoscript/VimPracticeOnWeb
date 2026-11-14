import { describe, it, expect } from 'vitest';
import {
  analyzeWeaknesses,
  buildWeaknessDrillPlan,
  ANTI_PATTERN_DRILL_BANK,
} from './weaknessDrillAnalyzer';
import { getDefaultAnalytics } from './analyticsStorage';
import { createVimState, sendKeys } from '../vim-engine';

describe('weaknessDrillAnalyzer 약점 분석 및 맞춤 드릴 생성기', () => {
  it('누적 데이터가 없을 때도 5축 최저 점수 기준으로 10문제 균형 세트를 생성한다', () => {
    const analytics = getDefaultAnalytics();
    const { hasAnalyticsData, focuses } = analyzeWeaknesses(analytics, {});
    expect(hasAnalyticsData).toBe(false);
    expect(focuses.length).toBeGreaterThanOrEqual(3);

    const plan = buildWeaknessDrillPlan(analytics, {});
    expect(plan.hasAnalyticsData).toBe(false);
    expect(plan.topWeaknesses).toHaveLength(3);
    expect(plan.queue).toHaveLength(10);
  });

  it('Backspace 연타 안티패턴이 많으면 wordReplace 약점을 1순위로 선정하고 5문제를 배정한다', () => {
    const analytics = {
      ...getDefaultAnalytics(),
      totalKeystrokes: 120,
      totalAntiPatternsTriggered: 4,
      antiPatternCounts: {
        'Backspace 연타 (x/ciw 권장)': 4,
      },
    };
    const plan = buildWeaknessDrillPlan(analytics, {});
    expect(plan.hasAnalyticsData).toBe(true);
    expect(plan.topWeaknesses[0].id).toBe('wordReplace');
    const wordReplaceCount = plan.queue.filter((q) => q.focusId === 'wordReplace').length;
    expect(wordReplaceCount).toBe(5);
  });

  it('방향키/hjkl 연타 및 $+a 안티패턴 감지 시 해당 약점 맞춤 교정 문제를 생성한다', () => {
    const analytics = {
      ...getDefaultAnalytics(),
      totalKeystrokes: 180,
      keyFrequencies: { w: 40, b: 40, j: 60, k: 40 },
      totalAntiPatternsTriggered: 6,
      antiPatternCounts: {
        '$ 후 a (대문자 A 권장)': 3,
        '0 후 i (대문자 I 권장)': 2,
        '방향키/hjkl 연타 (w/b/숫자 이동 권장)': 1,
      },
    };
    const plan = buildWeaknessDrillPlan(analytics, {});
    expect(plan.topWeaknesses[0].id).toBe('lineEndOps');
    expect(plan.topWeaknesses[1].id).toBe('lineStartOps');
    expect(plan.topWeaknesses[2].id).toBe('navigation');
    expect(plan.queue.some((q) => q.focusId === 'lineEndOps')).toBe(true);
    expect(plan.queue.some((q) => q.focusId === 'lineStartOps')).toBe(true);
    expect(plan.queue.some((q) => q.focusId === 'navigation')).toBe(true);
  });

  it('ANTI_PATTERN_DRILL_BANK의 모든 교정 문제가 optimalKeys 실행 시 정확히 목표 코드로 수렴한다', () => {
    for (const item of ANTI_PATTERN_DRILL_BANK) {
      const init = createVimState(item.lines, item.initialCursor);
      const after = sendKeys(init, item.optimalKeys);
      expect(after.mode).toBe('NORMAL');
      expect(after.lines).toEqual(item.targetLines);
    }
  });
});
