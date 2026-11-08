import { describe, it, expect } from 'vitest';
import {
  escapeRegExp,
  findMatches,
  findNextMatch,
  findPrevMatch,
  getWordAtCursor,
} from './search';

describe('search module', () => {
  describe('escapeRegExp', () => {
    it('정규식 특수문자들을 안전하게 이스케이프한다', () => {
      expect(escapeRegExp('hello.world*?')).toBe('hello\\.world\\*\\?');
      expect(escapeRegExp('([{}])')).toBe('\\(\\[\\{\\}\\]\\)');
    });
  });

  describe('findMatches', () => {
    const lines = [
      'const value = 10;',
      'const count = value + 20;',
      'console.log(value);',
    ];

    it('지정한 단어의 모든 일치 위치를 정확히 수집한다', () => {
      const matches = findMatches(lines, 'value');
      expect(matches).toEqual([
        { line: 0, col: 6, length: 5 },
        { line: 1, col: 14, length: 5 },
        { line: 2, col: 12, length: 5 },
      ]);
    });

    it('검색어가 빈 문자열이거나 일치하는 항목이 없으면 빈 배열을 반환한다', () => {
      expect(findMatches(lines, '')).toEqual([]);
      expect(findMatches(lines, 'notFound')).toEqual([]);
    });

    it('특수문자가 포함된 검색어도 안전하게 매칭한다', () => {
      const matchSpecial = findMatches(['(test) and (test)'], '(test)');
      expect(matchSpecial).toHaveLength(2);
      expect(matchSpecial[0].col).toBe(0);
      expect(matchSpecial[1].col).toBe(11);
    });
  });

  describe('findNextMatch & findPrevMatch (Wrap-around)', () => {
    const matches = [
      { line: 0, col: 5, length: 3 },
      { line: 1, col: 10, length: 3 },
      { line: 2, col: 2, length: 3 },
    ];

    it('findNextMatch: 현재 커서 이후의 다음 매치로 이동하고, 마지막 이후에는 첫 번째로 순환한다', () => {
      // 0행 0열 -> 다음은 0행 5열
      expect(findNextMatch(matches, { line: 0, col: 0 })).toEqual(matches[0]);
      // 0행 5열 -> 다음은 1행 10열
      expect(findNextMatch(matches, { line: 0, col: 5 })).toEqual(matches[1]);
      // 2행 5열(마지막 매치 이후) -> 첫 번째(0행 5열)로 순환
      expect(findNextMatch(matches, { line: 2, col: 5 })).toEqual(matches[0]);
    });

    it('findPrevMatch: 현재 커서 이전의 매치로 이동하고, 첫 번째 이전에는 마지막으로 순환한다', () => {
      // 2행 5열 -> 이전은 2행 2열
      expect(findPrevMatch(matches, { line: 2, col: 5 })).toEqual(matches[2]);
      // 1행 10열 -> 이전은 0행 5열
      expect(findPrevMatch(matches, { line: 1, col: 10 })).toEqual(matches[0]);
      // 0행 2열(첫 번째 이전) -> 마지막(2행 2열)로 순환
      expect(findPrevMatch(matches, { line: 0, col: 2 })).toEqual(matches[2]);
    });
  });

  describe('getWordAtCursor', () => {
    it('커서가 위치한 단어를 정확히 추출한다', () => {
      const line = 'function calculateSum(a, b) {';
      // 'calculateSum' 내부 (index 9)
      expect(getWordAtCursor(line, 9)).toBe('calculateSum');
      // 'function' 내부 (index 2)
      expect(getWordAtCursor(line, 2)).toBe('function');
    });

    it('커서가 공백에 있으면 null을 반환한다', () => {
      const line = 'hello world';
      expect(getWordAtCursor(line, 5)).toBeNull();
    });
  });
});
