import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { YankyMenu } from './YankyMenu';
import { createVimState, handleKey, runExCommand } from '../../vim-engine';

describe('YankyMenu', () => {
  it('복사 이력 목록을 렌더링하고 클릭·닫기 시 키를 전달한다', () => {
    let s = createVimState(['alpha', 'beta']);
    for (const k of ['y', 'y', 'j', 'y', 'y']) s = handleKey(s, k);
    s = runExCommand(s, ':Yanks');

    const onPressKey = vi.fn();
    render(<YankyMenu editorState={s} onPressKey={onPressKey} />);

    expect(screen.getByTestId('yanky-menu-panel')).toBeInTheDocument();
    expect(screen.getByTestId('yanky-menu-count')).toHaveTextContent('2');
    expect(screen.getByTestId('yanky-item-1')).toHaveTextContent('beta');
    expect(screen.getByTestId('yanky-item-2')).toHaveTextContent('alpha');

    fireEvent.click(screen.getByTestId('yanky-item-2'));
    expect(onPressKey.mock.calls.map((c) => c[0])).toEqual(['j', 'Enter']);

    fireEvent.click(screen.getByTestId('yanky-menu-close'));
    expect(onPressKey).toHaveBeenLastCalledWith('Escape');
  });

  it('메뉴가 닫혀 있으면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(
      <YankyMenu editorState={createVimState(['a'])} onPressKey={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });
});
