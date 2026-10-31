import { describe, it, expect } from 'vitest';

describe('VimPracticeOnWeb Sample Test Suite', () => {
  it('should verify basic environment math and assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should verify application name configuration', () => {
    const appName = 'VimPracticeOnWeb';
    expect(appName).toBe('VimPracticeOnWeb');
  });
});
