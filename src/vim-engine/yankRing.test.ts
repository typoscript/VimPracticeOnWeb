import { describe, it, expect } from 'vitest';
import { createVimState, handleKey, runExCommand } from './index';

function press(state: ReturnType<typeof createVimState>, keys: string[]) {
  let s = state;
  for (const k of keys) s = handleKey(s, k);
  return s;
}

describe('yanky.nvim 스타일 Yank Ring', () => {
  it('y/d 복사 이력을 최신순으로 누적하고 블랙홀 레지스터는 제외한다', () => {
    let s = createVimState(['alpha', 'beta', 'gamma']);
    s = press(s, ['y', 'y', 'j', 'y', 'y']);
    expect(s.yankHistory?.map((c) => c.content)).toEqual(['beta', 'alpha']);

    // 같은 내용은 중복 없이 맨 앞으로 이동
    s = press(s, ['k', 'y', 'y']);
    expect(s.yankHistory?.map((c) => c.content)).toEqual(['alpha', 'beta']);

    // 블랙홀 레지스터는 기록하지 않음
    s = press(s, ['j', 'j', '"', '_', 'd', 'd']);
    expect(s.yankHistory?.map((c) => c.content)).toEqual(['alpha', 'beta']);
  });

  it('p 직후 Ctrl-p / Ctrl-n 으로 붙여넣은 텍스트를 제자리 교체하고 u 한 번에 원복한다', () => {
    let s = createVimState(['alpha', 'beta', 'gamma']);
    s = press(s, ['y', 'y', 'j', 'y', 'y', 'j']); // history: [beta, alpha], cursor on gamma
    s = handleKey(s, 'p');
    expect(s.lines).toEqual(['alpha', 'beta', 'gamma', 'beta']);
    expect(s.yankRing?.index).toBe(0);

    s = handleKey(s, 'Ctrl+p'); // 이전 복사본 (alpha)
    expect(s.lines).toEqual(['alpha', 'beta', 'gamma', 'alpha']);
    expect(s.commandMessage).toContain('[Yanky]');
    // 클립보드(무명 레지스터)는 그대로 유지
    expect(s.clipboard?.content).toBe('beta');

    s = handleKey(s, 'Ctrl+p'); // 링이 한 바퀴 순환 (beta)
    expect(s.lines).toEqual(['alpha', 'beta', 'gamma', 'beta']);

    s = handleKey(s, 'Ctrl+n'); // 다음 복사본 (alpha)
    expect(s.lines).toEqual(['alpha', 'beta', 'gamma', 'alpha']);

    // 단일 Undo 로 붙여넣기 전 상태 복원
    s = handleKey(s, 'u');
    expect(s.lines).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('다른 키를 누르면 링 세션이 종료되고 복사 기록이 하나뿐이면 순환하지 않는다', () => {
    let s = createVimState(['one', 'two']);
    s = press(s, ['y', 'y', 'p']);
    expect(s.yankRing).toBeTruthy();

    // 복사 기록이 하나뿐이면 bell
    const single = handleKey(s, 'Ctrl+p');
    expect(single.bell).toBe(true);
    expect(single.lines).toEqual(['one', 'one', 'two']);

    // 다른 키 입력 시 세션 종료
    s = handleKey(s, 'j');
    expect(s.yankRing).toBeFalsy();
  });

  it(':Yanks 팝업에서 j/k 로 고르고 Enter(뒤)·P(앞)로 붙여넣으며 d 로 삭제한다', () => {
    let s = createVimState(['alpha', 'beta', 'gamma']);
    s = press(s, ['y', 'y', 'j', 'y', 'y', 'j']); // history: [beta, alpha]

    s = runExCommand(s, ':Yanks');
    expect(s.yankyMenu?.isOpen).toBe(true);
    expect(s.yankyMenu?.selectedIndex).toBe(0);

    s = press(s, ['j']);
    expect(s.yankyMenu?.selectedIndex).toBe(1);

    s = handleKey(s, 'Enter'); // alpha 를 뒤에 붙여넣기
    expect(s.yankyMenu).toBeNull();
    expect(s.lines).toEqual(['alpha', 'beta', 'gamma', 'alpha']);
    expect(s.yankRing?.index).toBe(1);

    // 팝업 → P 로 앞에 붙여넣기, 1 키 즉시 붙여넣기
    let t = createVimState(['x', 'y']);
    t = press(t, ['y', 'y', 'j', 'y', 'y']);
    t = runExCommand(t, ':YankyRingHistory');
    t = handleKey(t, 'P');
    expect(t.lines).toEqual(['x', 'y', 'y']);

    // d 로 삭제, 모두 지우면 팝업 닫힘
    let u = createVimState(['x', 'y']);
    u = press(u, ['y', 'y', 'j', 'y', 'y']);
    u = runExCommand(u, ':Yanks');
    u = handleKey(u, 'd');
    expect(u.yankHistory).toHaveLength(1);
    u = handleKey(u, 'd');
    expect(u.yankyMenu).toBeNull();
    expect(u.yankHistory).toHaveLength(0);
  });

  it('기록이 없으면 :Yanks 가 bell 을 울리고 :YankyClearHistory 가 이력을 비운다', () => {
    let s = createVimState(['a']);
    const empty = runExCommand(s, ':Yanks');
    expect(empty.bell).toBe(true);
    expect(empty.yankyMenu).toBeFalsy();

    s = press(s, ['y', 'y']);
    expect(s.yankHistory).toHaveLength(1);
    s = runExCommand(s, ':YankyClearHistory');
    expect(s.yankHistory).toEqual([]);
  });
});
