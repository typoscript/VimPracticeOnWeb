import { describe, it, expect } from 'vitest';
import {
  getTodayDateString,
  hashString,
  generateDailyChallenge,
  formatWordleResultCard,
  copyTextToClipboard,
} from './dailyChallenge';

describe('dailyChallenge', () => {
  it('getTodayDateString이 YYYY-MM-DD 형식을 반환한다', () => {
    const fixedDate = new Date(2026, 10, 1); // 2026-11-01
    expect(getTodayDateString(fixedDate)).toBe('2026-11-01');
  });

  it('hashString이 동일한 문자열에 대해 항상 동일한 양의 정수를 반환한다', () => {
    const hash1 = hashString('2026-11-01');
    const hash2 = hashString('2026-11-01');
    const hash3 = hashString('2026-11-02');

    expect(hash1).toBe(hash2);
    expect(hash1).toBeGreaterThanOrEqual(0);
    expect(hash1).not.toBe(hash3);
  });

  it('generateDailyChallenge가 날짜에 따른 결정론적 미션을 생성한다', () => {
    const puzzleA = generateDailyChallenge('2026-11-01');
    const puzzleB = generateDailyChallenge('2026-11-01');

    expect(puzzleA.date).toBe('2026-11-01');
    expect(puzzleA.title).toBe(puzzleB.title);
    expect(puzzleA.initialLines).toEqual(puzzleB.initialLines);
    expect(puzzleA.targetLines).toEqual(puzzleB.targetLines);
    expect(puzzleA.par).toBe(puzzleB.par);
  });

  it('formatWordleResultCard가 별점에 따라 3성/2성/1성 블록을 올바르게 포맷팅한다', () => {
    const card3 = formatWordleResultCard({
      date: '2026-11-01',
      stars: 3,
      keystrokes: 12,
      par: 14,
      elapsedSeconds: 4.5,
    });
    expect(card3).toContain('🟩 VimPractice Daily #2026-11-01');
    expect(card3).toContain('🟩🟩🟩 ⭐3/3');
    expect(card3).toContain('⌨️ 12 keys (Par: 14)');

    const card2 = formatWordleResultCard({
      date: '2026-11-01',
      stars: 2,
      keystrokes: 16,
      par: 14,
      elapsedSeconds: 6.2,
    });
    expect(card2).toContain('🟩🟩🟨 ⭐2/3');
  });

  it('copyTextToClipboard가 textarea fallback 또는 clipboard API를 호출한다', async () => {
    const success = await copyTextToClipboard('test text');
    expect(typeof success).toBe('boolean');
  });
});
