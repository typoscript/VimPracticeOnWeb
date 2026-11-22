import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createVimState, sendKeys } from '../../vim-engine';
import { NEOVIM_MASTER_PROBLEMS, DOJO_DRILL_METAS } from './drillGenerators';
import { HardcoreDojo } from './HardcoreDojo';

describe('Hardcore Dojo — Modern Neovim 10연타 (neovim-master)', () => {
  it('10개 문제가 모두 등록되어 있고 optimalKeys 로 정확히 targetLines 에 도달한다', () => {
    expect(NEOVIM_MASTER_PROBLEMS).toHaveLength(10);
    expect(DOJO_DRILL_METAS['neovim-master']).toBeDefined();

    for (const problem of NEOVIM_MASTER_PROBLEMS) {
      const initial = createVimState([...problem.lines], { ...problem.initialCursor });
      const result = sendKeys(initial, problem.optimalKeys);
      expect(result.lines, `Problem failed: ${problem.prompt}`).toEqual(problem.targetLines);
    }
  });

  it('HardcoreDojo UI 에서 Modern Neovim 10연타 탭을 선택하고 시작할 수 있다', () => {
    render(<HardcoreDojo />);
    const tab = screen.getByRole('button', { name: /Modern Neovim 10연타 챌린지/ });
    fireEvent.click(tab);

    const startBtn = screen.getByRole('button', {
      name: /Modern Neovim 도전 시작 \(10연타\)/,
    });
    expect(startBtn).toBeInTheDocument();
    fireEvent.click(startBtn);

    expect(screen.getByText(/\[mini\.ai\]/)).toBeInTheDocument();
  });
});
