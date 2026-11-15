import { describe, it, expect } from 'vitest';
import {
  buildMissionInitialState,
  buildCustomInitialState,
  buildSandboxInitialState,
  resolveStatusFilename,
} from './missionInitialState';
import { Mission } from '../types/mission';

const baseMission: Mission = {
  id: 101,
  title: 'Test Mission',
  description: 'desc',
  hint: 'hint',
  par: 3,
  optimalKeys: ['j'],
  initialLines: ['one', 'two'],
  initialCursor: { line: 0, col: 0 },
  targetLines: ['one', 'two'],
  checkComplete: () => false,
  primaryFilename: 'app.ts',
  secondaryFilename: 'app.test.ts',
  secondaryLines: ['one', 'two edited'],
  initialSplit: 'vertical',
  initialDiffMode: true,
};

const keymapSettings = {
  activePresets: {},
  leaderKey: '\\',
  customKeymaps: [],
};

describe('missionInitialState', () => {
  it('buildMissionInitialState 는 split/diff/quickfix 등 미션 초기 구성을 반영한다', () => {
    const state = buildMissionInitialState(baseMission, keymapSettings);
    expect(state.splitDirection).toBe('vertical');
    expect(state.splitPanes).toHaveLength(2);
    expect(state.splitPanes?.[0].filename).toBe('app.ts');
    expect(state.splitPanes?.[1].filename).toBe('app.test.ts');
    expect(state.diffMode).toBe(true);
    expect(state.diffHunks?.length).toBeGreaterThan(0);
  });

  it('buildCustomInitialState 와 buildSandboxInitialState 를 생성하고 파일명을 판별한다', () => {
    const customState = buildCustomInitialState(baseMission, keymapSettings);
    expect(customState.lines).toEqual(['one', 'two']);
    expect(customState.leaderKey).toBe('\\');

    const sandboxState = buildSandboxInitialState(keymapSettings);
    expect(sandboxState.lines.length).toBeGreaterThan(0);
    expect(resolveStatusFilename(sandboxState, 'sandbox', baseMission, 0)).toBe('sandbox.ts');
    expect(resolveStatusFilename(sandboxState, 'course', baseMission, 0)).toBe('app.ts');
    expect(resolveStatusFilename(sandboxState, 'custom', baseMission, 0)).toBe('custom_golf.txt');
    expect(resolveStatusFilename(sandboxState, 'speedrun', baseMission, 2)).toBe(
      'speedrun_stage_3.txt'
    );
  });
});
