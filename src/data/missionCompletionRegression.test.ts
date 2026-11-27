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
});
