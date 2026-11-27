import { describe, it, expect } from 'vitest';
import { MISSIONS } from './missions';
import { VimEditorState, handleKey } from '../vim-engine';
import { buildMissionInitialState } from '../utils/missionInitialState';

function missionState(id: number, leaderKey = ' '): VimEditorState {
  const mission = MISSIONS.find((m) => m.id === id)!;
  return buildMissionInitialState(mission, { activePresets: {}, leaderKey, customKeymaps: [] });
}

function run(state: VimEditorState, keys: string[]): VimEditorState {
  return keys.reduce((s, k) => handleKey(s, k), state);
}

describe('레슨 완료 판정 회귀', () => {
  it('레슨 67 은 :mks 로 저장만 하고 :only · :so 를 하지 않으면 완료되지 않는다', () => {
    const lesson = MISSIONS.find((m) => m.id === 67)!;
    const keys = lesson.optimalKeys!;
    const onlyStart = keys.indexOf('o', keys.indexOf('Enter', keys.indexOf('m')) + 1) - 1;
    const afterSave = run(missionState(67), keys.slice(0, onlyStart));
    expect(afterSave.virtualFiles?.['dev.vim']).toBeDefined();
    expect(lesson.checkComplete(afterSave)).toBe(false);

    const sourceStart = keys.lastIndexOf(':');
    const afterOnly = run(missionState(67), keys.slice(0, sourceStart));
    expect(lesson.checkComplete(afterOnly)).toBe(false);

    expect(lesson.checkComplete(run(missionState(67), keys))).toBe(true);
  });

  it('레슨 67 은 저장 후 :so dev.vim 을 다시 해야 하며, 그 뒤에 다시 저장만 하면 완료가 아니다', () => {
    const lesson = MISSIONS.find((m) => m.id === 67)!;
    const done = run(missionState(67), lesson.optimalKeys!);
    const resaved = run(done, [...':mks! dev.vim'.split(''), 'Enter']);
    expect(lesson.checkComplete(resaved)).toBe(false);
  });

  it.each(['\\', ',', ' '])('레슨 70 은 사용자 리더 키가 %j 여도 안내대로 <Space>dd 로 풀린다', (leader) => {
    const lesson = MISSIONS.find((m) => m.id === 70)!;
    const initial = missionState(70, leader);
    expect(initial.leaderKey).toBe(' ');
    expect(lesson.checkComplete(run(initial, lesson.optimalKeys!))).toBe(true);
  });

  it('fixedLeaderKey 가 없는 레슨은 사용자 리더 키를 그대로 쓴다', () => {
    expect(missionState(1, ',').leaderKey).toBe(',');
  });

  // 시작하자마자 완료되거나(레슨 8), 핵심 단계를 건너뛰어도 완료되는(레슨 16·27·67 등) 판정을 막습니다.
  // 모범 풀이 끝에 남은 Escape 는 모드 정리일 뿐이라 그 전에 완료되어도 허용합니다.
  describe.each(MISSIONS.map((m) => [m.id, m] as const))('레슨 %i', (_id, mission) => {
    it('시작 상태에서는 완료가 아니고, optimalKeys 의 마지막 핵심 키를 쳐야 완료된다', () => {
      const keys = mission.optimalKeys ?? [];
      let lastEssential = keys.length;
      while (lastEssential > 0 && keys[lastEssential - 1] === 'Escape') lastEssential--;

      let state = missionState(mission.id);
      expect(mission.checkComplete(state)).toBe(false);
      const completedEarlyAt: number[] = [];
      keys.forEach((key, idx) => {
        state = handleKey(state, key);
        if (idx < lastEssential - 1 && mission.checkComplete(state)) completedEarlyAt.push(idx + 1);
      });
      expect(completedEarlyAt).toEqual([]);
      expect(mission.checkComplete(state)).toBe(true);
    });
  });

  // 힌트·설명에 적힌 경로대로 입력해도 레슨이 완료되는지 (모범 풀이와 다른 경로만)
  const keysOf = (text: string) => text.split('');
  const HINT_PATHS: Array<[number, string[]]> = [
    [5, ['$', 'a', ...keysOf(' rocks'), 'Escape']],
    [7, ['w', 'w', 'd', 'w']],
    [18, ['%', '%', 'j', 'q', 'a', 'I', '"', 'Escape', 'A', '"', ',', 'Escape', 'j', '0', 'q', '2', '@', 'a']],
    [28, [...keysOf(':%s/\\vget_(\\w+)/get\\u\\1/g'), 'Enter']],
    [
      128,
      [
        ...keysOf(':TSContextToggle'), 'Enter',
        ...keysOf(':ColorizerToggle'), 'Enter',
        ...keysOf(':IlluminateToggle'), 'Enter',
        'f', '"', 'c', 'i', '"', ...keysOf('#7aa2f7'), 'Escape',
        ...keysOf(':%s/accentColor/primaryColor/g'), 'Enter',
      ],
    ],
  ];
  it.each(HINT_PATHS)('레슨 %i 은 힌트에 적힌 경로로도 완료된다', (id, keys) => {
    const mission = MISSIONS.find((m) => m.id === id)!;
    expect(mission.checkComplete(run(missionState(id), keys))).toBe(true);
  });
});
