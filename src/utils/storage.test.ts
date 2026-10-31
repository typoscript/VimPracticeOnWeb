import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadProgress,
  saveLessonRecord,
  loadRelativeLineSetting,
  saveRelativeLineSetting,
  PROGRESS_STORAGE_KEY,
} from './storage';

describe('storage utils', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('loadProgress', () => {
    it('저장된 데이터가 없으면 빈 객체를 반환한다', () => {
      expect(loadProgress()).toEqual({});
    });

    it('저장된 진도 데이터를 정상적으로 파싱하여 반환한다', () => {
      const mockData = {
        1: { completed: true, bestStars: 3, minKeystrokes: 4 },
      };
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(mockData));

      expect(loadProgress()).toEqual(mockData);
    });

    it('JSON 파싱 에러 발생 시 빈 객체를 반환한다', () => {
      localStorage.setItem(PROGRESS_STORAGE_KEY, 'invalid-json{');
      expect(loadProgress()).toEqual({});
    });
  });

  describe('saveLessonRecord', () => {
    it('새로운 레슨 완료 기록을 저장한다', () => {
      const updated = saveLessonRecord(1, 3, 5);

      expect(updated[1]).toEqual({
        completed: true,
        bestStars: 3,
        minKeystrokes: 5,
      });
      expect(JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY)!)).toEqual({
        1: { completed: true, bestStars: 3, minKeystrokes: 5 },
      });
    });

    it('기존 기록보다 더 우수한 별점과 적은 타수를 갱신한다', () => {
      saveLessonRecord(1, 2, 8);
      const updated = saveLessonRecord(1, 3, 5);

      expect(updated[1]).toEqual({
        completed: true,
        bestStars: 3,
        minKeystrokes: 5,
      });
    });

    it('기존 기록보다 낮은 별점과 더 많은 타수는 유지하고 최고 기록을 보존한다', () => {
      saveLessonRecord(1, 3, 4);
      const updated = saveLessonRecord(1, 1, 10);

      expect(updated[1]).toEqual({
        completed: true,
        bestStars: 3,
        minKeystrokes: 4,
      });
    });
  });

  describe('relative line setting', () => {
    it('기본값은 false를 반환한다', () => {
      expect(loadRelativeLineSetting()).toBe(false);
    });

    it('설정을 저장하고 다시 불러올 수 있다', () => {
      saveRelativeLineSetting(true);
      expect(loadRelativeLineSetting()).toBe(true);

      saveRelativeLineSetting(false);
      expect(loadRelativeLineSetting()).toBe(false);
    });

    it('localStorage 예외 발생 시 안전하게 기본값을 반환한다', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage access denied');
      });
      expect(loadRelativeLineSetting()).toBe(false);
    });
  });
});
