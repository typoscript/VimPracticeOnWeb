import { describe, it, expect } from 'vitest';
import { analyzeAndGenerateBYOC } from './byocGenerator';

describe('byocGenerator', () => {
  it('detects var_to_const rule and transforms code correctly', () => {
    const input = `var userId = 100;\nvar userName = "Alice";`;
    const res = analyzeAndGenerateBYOC(input);

    expect(res.detectedRules.some((r) => r.id === 'var_to_const')).toBe(true);
    const rule = res.detectedRules.find((r) => r.id === 'var_to_const')!;
    expect(rule.matchCount).toBe(2);
    expect(rule.targetText).toBe(`const userId = 100;\nconst userName = "Alice";`);
    expect(rule.estimatedPar).toBeGreaterThan(0);
    expect(rule.hint).toContain(':%s/var/const/g');
  });

  it('detects remove_debug_logs and eliminates console.log lines', () => {
    const input = `function add(a, b) {\n  console.log("adding", a, b);\n  return a + b;\n}`;
    const res = analyzeAndGenerateBYOC(input);

    const logRule = res.detectedRules.find((r) => r.id === 'remove_debug_logs');
    expect(logRule).toBeDefined();
    expect(logRule!.targetText).not.toContain('console.log');
    expect(logRule!.hint).toContain(':g/console\\.log/d');
  });

  it('detects single_to_double_quotes and transforms quotes', () => {
    const input = `const greeting = 'hello world';`;
    const res = analyzeAndGenerateBYOC(input);

    const quoteRule = res.detectedRules.find((r) => r.id === 'single_to_double_quotes');
    expect(quoteRule).toBeDefined();
    expect(quoteRule!.targetText).toBe(`const greeting = "hello world";`);
  });

  it('detects snake_to_camel and transforms identifiers', () => {
    const input = `const user_id = 1;\nconst total_price = 500;`;
    const res = analyzeAndGenerateBYOC(input);

    const camelRule = res.detectedRules.find((r) => r.id === 'snake_to_camel');
    expect(camelRule).toBeDefined();
    expect(camelRule!.targetText).toContain('userId');
    expect(camelRule!.targetText).toContain('totalPrice');
  });

  it('detects semicolon_enforce and appends missing semicolons', () => {
    const input = `const a = 10\nconst b = 20`;
    const res = analyzeAndGenerateBYOC(input);

    const semiRule = res.detectedRules.find((r) => r.id === 'semicolon_enforce');
    expect(semiRule).toBeDefined();
    expect(semiRule!.targetText).toBe(`const a = 10;\nconst b = 20;`);
  });

  it('handles empty or arbitrary fallback text gracefully', () => {
    const res = analyzeAndGenerateBYOC('Just a plain sentence with no code keywords.');
    expect(res.detectedRules.length).toBeGreaterThan(0);
    expect(res.primaryRule.targetText.length).toBeGreaterThan(0);
    expect(res.primaryRule.estimatedPar).toBeGreaterThan(0);
  });
});
