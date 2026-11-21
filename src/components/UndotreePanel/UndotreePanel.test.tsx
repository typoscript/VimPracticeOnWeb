import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UndotreePanel } from './UndotreePanel';
import { createVimState, sendKeys } from '../../vim-engine';

describe('UndotreePanel', () => {
  it('분기형 Undo 노드 목록과 Diff 미리보기를 렌더링하고 클릭·시간 여행 콜백을 호출한다', () => {
    let state = createVimState(['line one']);
    state = sendKeys(state, 'A_v1<Esc>');
    state = sendKeys(state, 'u');
    state = sendKeys(state, 'A_v2<Esc>');

    const onJumpSeq = vi.fn();
    const onTravelOlder = vi.fn();
    const onTravelNewer = vi.fn();
    const onClose = vi.fn();

    render(
      <UndotreePanel
        editorState={state}
        onJumpSeq={onJumpSeq}
        onTravelOlder={onTravelOlder}
        onTravelNewer={onTravelNewer}
        onClose={onClose}
      />
    );

    expect(screen.getByTestId('undotree-panel')).toBeInTheDocument();
    expect(screen.getByTestId('undotree-stats')).toHaveTextContent('3개 노드 · 2개 브랜치');

    // 노드 #1 클릭 시 onJumpSeq(1) 호출
    fireEvent.click(screen.getByTestId('undotree-node-1'));
    expect(onJumpSeq).toHaveBeenCalledWith(1);

    // Diff 미리보기에 변경된 줄이 표시됨
    expect(screen.getByTestId('undotree-diff-pane')).toHaveTextContent('line one_v2');

    // g- / g+ / 닫기 버튼 동작
    fireEvent.click(screen.getByTestId('undotree-older-btn'));
    expect(onTravelOlder).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('undotree-newer-btn'));
    expect(onTravelNewer).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('undotree-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
