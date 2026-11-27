import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CheatsheetModal } from './CheatsheetModal';
import { createVimState, sendKeys } from '../../vim-engine';

describe('인터랙티브 Vim/Neovim 단축키 치트시트 모달 (CheatsheetModal & :Cheatsheet)', () => {
  it(':Cheatsheet 및 :Cheat Ex 커맨드가 showCheatsheetModal 플래그를 활성화한다', () => {
    let state = createVimState(['hello']);
    state = sendKeys(state, ':Cheatsheet<CR>');
    expect(state.showCheatsheetModal).toBe(true);
    expect(state.commandMessage).toContain('Cheatsheet');
  });

  it('카테고리 필터링·실시간 검색·[▶ 실행] 원클릭 키 디스패치가 동작한다', () => {
    const onClose = vi.fn();
    const onExecuteKeys = vi.fn();

    render(
      <CheatsheetModal
        isOpen={true}
        onClose={onClose}
        onExecuteKeys={onExecuteKeys}
      />
    );

    expect(screen.getByTestId('cheatsheet-modal')).toBeInTheDocument();

    // 카테고리 필터링
    fireEvent.click(screen.getByTestId('cheatsheet-cat-neovim'));
    expect(screen.getByTestId('cheatsheet-card-lsp-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('cheatsheet-card-word-motions')).not.toBeInTheDocument();

    // 전체 탭 복귀 후 검색어 입력
    fireEvent.click(screen.getByTestId('cheatsheet-cat-all'));
    const input = screen.getByTestId('cheatsheet-search-input');
    fireEvent.change(input, { target: { value: 'treesj' } });
    expect(screen.getByTestId('cheatsheet-card-treesj-split')).toBeInTheDocument();

    // [▶ 실행] 클릭 시 모달을 닫고 tryKeys 전달
    fireEvent.click(screen.getByTestId('cheatsheet-try-treesj-split'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onExecuteKeys).toHaveBeenCalledWith(['Escape', 'o', ...'f(a, b, c)'.split(''), 'Escape', 'g', 'S']);
  });
});
