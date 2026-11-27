import { describe, it, expect } from 'vitest';
import { rng, genLabel, init, step, minimize } from './windowBufferFuzzHarness';

describe('창·탭·버퍼·UI 클릭 조합 퍼즈', () => {
  it('불변성·파일 왕복·undo·UI 준비 상태가 깨지지 않는다', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 250 && failures.length === 0; seed++) {
      const r = rng(seed);
      let s = init();
      const trace: string[] = [];
      for (let i = 0; i < 60; i++) {
        const label = genLabel(r);
        trace.push(label);
        const res = step(s, label);
        if (res.fail) {
          failures.push(`seed=${seed} ${res.fail}\n  최소 재현: ${minimize(trace, res.fail).join(' | ')}`);
          break;
        }
        s = res.s;
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
