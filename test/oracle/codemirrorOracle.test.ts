import { describe, it, expect } from 'vitest';
import { runDifferentialCheck } from './codemirrorOracle';

describe('Differential Oracle Adapter', () => {
  it('cross-validates basic word motion w and b', () => {
    const text = 'hello beautiful world';
    const keys = ['w', 'w', 'b'];
    const result = runDifferentialCheck(text, keys);
    if (!result.passed) {
      console.error(result.mismatch?.diffReport);
    }
    expect(result.passed).toBe(true);
  });

  it('cross-validates delete word dw', () => {
    const text = 'const foo = 42;';
    const keys = ['d', 'w'];
    const result = runDifferentialCheck(text, keys);
    if (!result.passed) {
      console.error(result.mismatch?.diffReport);
    }
    expect(result.passed).toBe(true);
  });

  it('cross-validates x char delete and $ motion', () => {
    const text = 'abcdef';
    const keys = ['$', 'x'];
    const result = runDifferentialCheck(text, keys);
    if (!result.passed) {
      console.error(result.mismatch?.diffReport);
    }
    expect(result.passed).toBe(true);
  });
});
