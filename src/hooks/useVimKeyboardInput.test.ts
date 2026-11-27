import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVimKeyboardInput } from './useVimKeyboardInput';
import { HardcoreGuard } from '../utils/hardcoreGuard';

function fireKey(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe('useVimKeyboardInput', () => {
  let processKeyInput: Mock<(key: string) => void>;
  let handleStopGhostReplay: Mock<() => void>;
  let setIsEditorFocused: Mock<(focused: boolean) => void>;
  let triggerHardcoreViolation: Mock<(msg: string, suggestion?: string) => void>;
  let setCoachingMessage: Mock<(msg: string | null) => void>;

  beforeEach(() => {
    processKeyInput = vi.fn();
    handleStopGhostReplay = vi.fn();
    setIsEditorFocused = vi.fn();
    triggerHardcoreViolation = vi.fn();
    setCoachingMessage = vi.fn();
  });

  function mountHook(overrides: Partial<Parameters<typeof useVimKeyboardInput>[0]> = {}) {
    const hardcoreGuardRef = { current: new HardcoreGuard() };
    return renderHook((props: Partial<Parameters<typeof useVimKeyboardInput>[0]>) =>
      useVimKeyboardInput({
        isModalOrGameBlocked: false,
        isGhostReplaying: false,
        handleStopGhostReplay,
        isEditorFocused: true,
        setIsEditorFocused,
        editorMode: 'NORMAL',
        activePresets: {},
        hardcoreMode: false,
        hardcoreGuardRef,
        triggerHardcoreViolation,
        setCoachingMessage,
        processKeyInput,
        ...overrides,
        ...props,
      })
    );
  }

  it('window focus/blur 시 에디터 포커스 상태를 갱신한다', () => {
    mountHook();
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(setIsEditorFocused).toHaveBeenCalledWith(false);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(setIsEditorFocused).toHaveBeenCalledWith(true);
  });

  it('고스트 리플레이 중이면 리플레이를 중지하고, 모달/게임 차단 중이면 입력을 무시한다', () => {
    const first = mountHook({ isGhostReplaying: true });
    act(() => {
      fireKey('j');
    });
    expect(handleStopGhostReplay).toHaveBeenCalledTimes(1);
    expect(processKeyInput).not.toHaveBeenCalled();
    first.unmount();

    mountHook({ isModalOrGameBlocked: true });
    act(() => {
      fireKey('j');
    });
    expect(processKeyInput).not.toHaveBeenCalled();
  });

  it('Modifier 단축키와 ctrlWindowNav 프리셋을 Vim 키 시퀀스로 변환한다', () => {
    mountHook({ activePresets: { ctrlWindowNav: true }, editorMode: 'NORMAL' });

    act(() => {
      fireKey('r', { ctrlKey: true });
      fireKey('j', { ctrlKey: true });
      fireKey('f', { ctrlKey: true });
      fireKey('Shift');
    });

    expect(processKeyInput).toHaveBeenNthCalledWith(1, 'Ctrl-r');
    expect(processKeyInput).toHaveBeenNthCalledWith(2, 'Ctrl-j');
    expect(processKeyInput).toHaveBeenNthCalledWith(3, '/');
    expect(processKeyInput).toHaveBeenCalledTimes(3);
  });

  it('한글 IME 키 정규화 및 하드코어 모드 위반 차단을 처리한다', () => {
    const first = mountHook({ editorMode: 'NORMAL' });
    act(() => {
      fireKey('ㅓ', { code: 'KeyJ' }); // NORMAL 모드에서 물리 KeyJ -> 'j' 로 매핑
    });
    expect(processKeyInput).toHaveBeenCalledWith('j');
    expect(setCoachingMessage).toHaveBeenCalled();
    first.unmount();

    processKeyInput.mockClear();
    mountHook({ hardcoreMode: true });
    act(() => {
      fireKey('ArrowDown');
    });
    expect(triggerHardcoreViolation).toHaveBeenCalled();
    expect(processKeyInput).not.toHaveBeenCalled();
  });
});
