import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDungeonRPG } from './useDungeonRPG';
import { DUNGEON_STAGES } from '../../data/dungeonStages';

/** 실제 훅(useDungeonRPG)에 키를 보내 스테이지 판정을 검사합니다. 경로는 게임 콘텐츠 점검 때 찾은 최단 풀이입니다. */
function playStage(stageId: number, keys: string[]) {
  const { result } = renderHook(() =>
    useDungeonRPG({ onPlayKeySound: vi.fn(), onPlaySuccessSound: vi.fn() })
  );
  act(() => result.current.loadStage(DUNGEON_STAGES.findIndex((s) => s.id === stageId)));
  for (const key of keys) {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    });
    if (result.current.isCompleted) break;
  }
  return result.current;
}

const keysOf = (text: string) => text.split('');

describe('던전 스테이지 판정', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each([
    [1, keysOf('llxjjhhjjlllll')],
    [3, keysOf('j%ww%wwweej')],
    [4, keysOf('wyiwjeeepwwwwll')],
    [5, keysOf('jf"di"jjjwlw')],
    [6, keysOf('jf"di"wwfE')],
  ])('스테이지 %i 는 par 이내로 클리어할 수 있다', (id, keys) => {
    const stage = DUNGEON_STAGES.find((s) => s.id === id)!;
    const result = playStage(id, keys);
    expect(result.isCompleted).toBe(true);
    expect(result.keystrokes).toBeLessThanOrEqual(stage.par);
  });

  it('스테이지 1: 바위(X)를 x 로 부수기 전에는 아래로 지나갈 수 없다', () => {
    const result = playStage(1, keysOf('lljj'));
    expect(result.editorState.cursor).toEqual({ line: 1, col: 3 });
    expect(result.toastMessage).toContain('X');
  });

  it('스테이지 3: 안내대로 f( 를 쓸 수 있다', () => {
    const result = playStage(3, keysOf('jf('));
    expect(result.editorState.cursor).toEqual({ line: 1, col: 3 });
  });

  it.each([
    [2, '지도 밖 단어(ISLE)의 E 에 착지', keysOf('je')],
    [5, '보스 줄을 dj 로 통째로 삭제', keysOf('jedj')],
    [6, '드래곤 줄을 d} 로 통째로 삭제', keysOf('%d}')],
  ])('스테이지 %i: 편법(%s)으로는 클리어되지 않는다', (id, _label, keys) => {
    expect(playStage(id, keys).isCompleted).toBe(false);
  });
});
