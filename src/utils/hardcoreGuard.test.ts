import { describe, it, expect, beforeEach } from 'vitest';
import { HardcoreGuard } from './hardcoreGuard';

describe('HardcoreGuard', () => {
  let guard: HardcoreGuard;

  beforeEach(() => {
    guard = new HardcoreGuard();
  });

  it('blocks all arrow keys and returns appropriate warning message', () => {
    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

    for (const key of arrowKeys) {
      const res = guard.checkKey(key);
      expect(res.blocked).toBe(true);
      expect(res.reason).toBe('arrow');
      expect(res.message).toContain('방향키 대신');
    }
  });

  it('blocks mouse clicks inside editor', () => {
    const res = guard.checkMouseClick();
    expect(res.blocked).toBe(true);
    expect(res.reason).toBe('mouse');
    expect(res.message).toContain('마우스 대신');
  });

  it('allows normal keys and up to 3 consecutive spam keys within 1.5s', () => {
    const t0 = 1000;
    // 1st press of 'j'
    expect(guard.checkKey('j', t0).blocked).toBe(false);
    // 2nd press of 'j' (200ms later)
    expect(guard.checkKey('j', t0 + 200).blocked).toBe(false);
    // 3rd press of 'j' (400ms later)
    expect(guard.checkKey('j', t0 + 400).blocked).toBe(false);

    // 4th press of 'j' (600ms later, within 1500ms) -> BLOCKED!
    const res4 = guard.checkKey('j', t0 + 600);
    expect(res4.blocked).toBe(true);
    expect(res4.reason).toBe('spam');
    expect(res4.suggestion).toContain('5j');

    // 5th press still blocked
    const res5 = guard.checkKey('j', t0 + 800);
    expect(res5.blocked).toBe(true);
  });

  it('resets spam counter if 1.5 seconds elapse between keys', () => {
    const t0 = 1000;
    expect(guard.checkKey('k', t0).blocked).toBe(false);
    expect(guard.checkKey('k', t0 + 300).blocked).toBe(false);
    expect(guard.checkKey('k', t0 + 600).blocked).toBe(false);

    // Wait 1600ms
    const tNext = t0 + 600 + 1600;
    // The previous 3 presses are older than 1500ms, so filtered out
    expect(guard.checkKey('k', tNext).blocked).toBe(false);
  });

  it('resets spam counter when an allowed non-spam key is typed', () => {
    const t0 = 1000;
    expect(guard.checkKey('l', t0).blocked).toBe(false);
    expect(guard.checkKey('l', t0 + 100).blocked).toBe(false);
    expect(guard.checkKey('l', t0 + 200).blocked).toBe(false);

    // User types 'w' (not a spam key)
    expect(guard.checkKey('w', t0 + 300).blocked).toBe(false);

    // User types 'l' again -> new streak
    expect(guard.checkKey('l', t0 + 400).blocked).toBe(false);
    expect(guard.checkKey('l', t0 + 500).blocked).toBe(false);
  });

  it('resets spam counter when switching between different spam keys', () => {
    const t0 = 1000;
    expect(guard.checkKey('h', t0).blocked).toBe(false);
    expect(guard.checkKey('h', t0 + 100).blocked).toBe(false);
    expect(guard.checkKey('h', t0 + 200).blocked).toBe(false);

    // Switching to 'j'
    expect(guard.checkKey('j', t0 + 300).blocked).toBe(false);
    expect(guard.checkKey('j', t0 + 400).blocked).toBe(false);
    expect(guard.checkKey('j', t0 + 500).blocked).toBe(false);
    // 4th 'j' blocked
    expect(guard.checkKey('j', t0 + 600).blocked).toBe(true);
  });

  it('blocks Backspace and x spamming with proper suggestions', () => {
    const t0 = 1000;
    for (let i = 0; i < 3; i++) {
      expect(guard.checkKey('x', t0 + i * 100).blocked).toBe(false);
    }
    const xRes = guard.checkKey('x', t0 + 400);
    expect(xRes.blocked).toBe(true);
    expect(xRes.suggestion).toContain('dw');

    guard.reset();

    for (let i = 0; i < 3; i++) {
      expect(guard.checkKey('Backspace', t0 + i * 100).blocked).toBe(false);
    }
    const bsRes = guard.checkKey('Backspace', t0 + 400);
    expect(bsRes.blocked).toBe(true);
    expect(bsRes.suggestion).toContain('dw');
  });
});
