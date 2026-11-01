import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadUserAnalytics,
  recordKeyInputStats,
  recordAntiPatternDetection,
  saveArcadeRecord,
  saveDailyRecord,
  getTopCommands,
  calculateProficiency,
  getDefaultAnalytics,
} from './analyticsStorage';
import { LessonProgress } from './storage';

describe('analyticsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('기본 통계 객체를 올바르게 초기화 및 로드한다', () => {
    const data = loadUserAnalytics();
    expect(data.totalKeystrokes).toBe(0);
    expect(data.arcadeBestScore).toBe(0);
    expect(data.dailyStreak).toBe(0);
    expect(data.keyFrequencies).toEqual({});
  });

  it('recordKeyInputStats 호출 시 누적 키 타수와 빈도가 증가한다', () => {
    recordKeyInputStats('j');
    recordKeyInputStats('j');
    recordKeyInputStats('k');

    const data = loadUserAnalytics();
    expect(data.totalKeystrokes).toBe(3);
    expect(data.keyFrequencies['j']).toBe(2);
    expect(data.keyFrequencies['k']).toBe(1);
  });

  it('recordAntiPatternDetection 호출 시 패턴별로 집계된다', () => {
    recordAntiPatternDetection('Normal 모드에서 x, dw, 또는 ciw로 지우면 훨씬 빠릅니다!');
    recordAntiPatternDetection('대문자 A 키 하나로 줄 끝 이동과 입력 모드 진입을 한 번에 할 수 있습니다!');
    recordAntiPatternDetection('대문자 A 키 하나로 줄 끝 이동과 입력 모드 진입을 한 번에 할 수 있습니다!');

    const data = loadUserAnalytics();
    expect(data.totalAntiPatternsTriggered).toBe(3);
    expect(data.antiPatternCounts['Backspace 연타 (x/ciw 권장)']).toBe(1);
    expect(data.antiPatternCounts['$ 후 a (대문자 A 권장)']).toBe(2);
  });

  it('saveArcadeRecord가 최고 기록을 올바르게 갱신한다', () => {
    const res1 = saveArcadeRecord(1500, 3, 5);
    expect(res1.isNewBestScore).toBe(true);
    expect(res1.data.arcadeBestScore).toBe(1500);
    expect(res1.data.arcadeHighestWave).toBe(3);
    expect(res1.data.arcadeMaxCombo).toBe(5);

    const res2 = saveArcadeRecord(1200, 2, 3);
    expect(res2.isNewBestScore).toBe(false);
    expect(res2.data.arcadeBestScore).toBe(1500);
    expect(res2.data.arcadeGamesPlayed).toBe(2);
  });

  it('saveDailyRecord가 연속 출석 일수(Streak)를 계산한다', () => {
    const day1 = saveDailyRecord({
      date: '2026-11-01',
      completed: true,
      stars: 3,
      keystrokes: 12,
      elapsedSeconds: 5.4,
      par: 14,
      completedAt: '2026-11-01T12:00:00Z',
    });
    expect(day1.dailyStreak).toBe(1);

    const day2 = saveDailyRecord({
      date: '2026-11-02',
      completed: true,
      stars: 3,
      keystrokes: 11,
      elapsedSeconds: 4.8,
      par: 13,
      completedAt: '2026-11-02T12:00:00Z',
    });
    expect(day2.dailyStreak).toBe(2);

    // 날짜가 이틀 이상 건너뛴 경우 스트릭 리셋
    const day4 = saveDailyRecord({
      date: '2026-11-05',
      completed: true,
      stars: 2,
      keystrokes: 18,
      elapsedSeconds: 8.0,
      par: 13,
      completedAt: '2026-11-05T12:00:00Z',
    });
    expect(day4.dailyStreak).toBe(1);
  });

  it('getTopCommands가 빈도 순 정렬 및 한글 설명을 제공한다', () => {
    const data = getDefaultAnalytics();
    data.keyFrequencies = {
      j: 50,
      k: 30,
      ciw: 15,
      x: 45,
    };
    const top = getTopCommands(data, 3);
    expect(top).toHaveLength(3);
    expect(top[0].key).toBe('j');
    expect(top[0].label).toBe('아래 이동');
    expect(top[1].key).toBe('x');
    expect(top[1].label).toBe('글자 삭제');
    expect(top[2].key).toBe('k');
    expect(top[2].label).toBe('위로 이동');
  });

  it('calculateProficiency가 5개 축 점수를 10~100 사이로 계산한다', () => {
    const data = getDefaultAnalytics();
    data.keyFrequencies = {
      j: 100,
      k: 100,
      f: 20,
      t: 10,
      c: 15,
      d: 20,
      ':': 5,
    };
    const progress: LessonProgress = {
      1: { completed: true, bestStars: 3, minKeystrokes: 10 },
      13: { completed: true, bestStars: 3, minKeystrokes: 12 },
    };

    const axes = calculateProficiency(data, progress);
    expect(axes.navigation).toBeGreaterThanOrEqual(10);
    expect(axes.navigation).toBeLessThanOrEqual(100);
    expect(axes.targeting).toBeGreaterThanOrEqual(10);
    expect(axes.textObjects).toBeGreaterThanOrEqual(10);
    expect(axes.batchEditing).toBeGreaterThanOrEqual(10);
    expect(axes.efficiency).toBeGreaterThanOrEqual(10);
  });
});
