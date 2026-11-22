import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createVimState } from '../../vim-engine';
import {
  formatReplayKey,
  buildGolfReplayTrace,
  compareGolfRuns,
} from '../../utils/golfComparator';
import { GolfComparatorModal } from './GolfComparatorModal';
import { MISSIONS } from '../../data/missions';
import App from '../../App';

describe('golfComparator 유틸리티', () => {
  it('키 표기 포맷팅과 1:1 프레임 트레이스 생성이 정확히 동작한다', () => {
    expect(formatReplayKey('Escape')).toBe('<Esc>');
    expect(formatReplayKey('Enter')).toBe('<CR>');
    expect(formatReplayKey('Ctrl-a')).toBe('<C-a>');
    expect(formatReplayKey('Alt-j')).toBe('<A-j>');
    expect(formatReplayKey(' ')).toBe('<Space>');

    const init = createVimState(['hello world'], { line: 0, col: 0 });
    const trace = buildGolfReplayTrace(init, ['d', 'w']);
    expect(trace).toHaveLength(3);
    expect(trace[0].lines).toEqual(['hello world']);
    expect(trace[2].lines).toEqual(['world']);
    expect(trace[2].changedLines).toEqual([0]);
  });

  it('사용자 풀이와 최적 해법의 타수 차이·효율·첫 분기점·연타 습관을 계산한다', () => {
    const summary = compareGolfRuns(
      ['l', 'l', 'l', 'l', 'x'],
      ['w', 'x']
    );
    expect(summary.userKeystrokes).toBe(5);
    expect(summary.optimalKeystrokes).toBe(2);
    expect(summary.delta).toBe(3);
    expect(summary.efficiencyPct).toBe(40);
    expect(summary.firstDivergenceStep).toBe(1);
    expect(summary.userRedundantMotionStreaks).toBe(1);

    const exact = compareGolfRuns(['d', 'w'], ['d', 'w']);
    expect(exact.delta).toBe(0);
    expect(exact.efficiencyPct).toBe(100);
    expect(exact.firstDivergenceStep).toBeNull();
  });
});

describe('GolfComparatorModal 컴포넌트 및 App 연동', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1:1 비교 모달에서 스텝 이동, 첫 분기점 점프, 닫기가 동작한다', () => {
    const onClose = vi.fn();
    const init = createVimState(['foo bar baz'], { line: 0, col: 0 });

    render(
      <GolfComparatorModal
        missionTitle="단어 삭제 연습"
        par={2}
        initialState={init}
        userKeys={['l', 'l', 'l', 'x']}
        optimalKeys={['d', 'w']}
        onClose={onClose}
      />
    );

    expect(screen.getByTestId('golf-comparator-modal')).toBeInTheDocument();
    expect(screen.getByTestId('golf-tip-banner')).toBeInTheDocument();
    expect(screen.getByTestId('golf-step-counter')).toHaveTextContent('Step 0 / 4');

    // 다음 스텝 버튼으로 1:1 진행
    fireEvent.click(screen.getByTestId('golf-step-next'));
    expect(screen.getByTestId('golf-step-counter')).toHaveTextContent('Step 1 / 4');

    // 끝까지 이동 시 최적 해법 쪽 결과가 표시됨
    fireEvent.click(screen.getByTestId('golf-step-end'));
    expect(screen.getByTestId('golf-step-counter')).toHaveTextContent('Step 4 / 4');
    expect(screen.getByTestId('golf-optimal-editor')).toHaveTextContent('bar baz');

    // 첫 분기점 이동 버튼
    fireEvent.click(screen.getByTestId('golf-jump-divergence-btn'));
    expect(screen.getByTestId('golf-step-counter')).toHaveTextContent('Step 1 / 4');

    // 닫기 버튼
    fireEvent.click(screen.getByTestId('golf-comparator-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('App 에서 레슨 1 완료 후 "내 풀이 vs 최적 해법 비교" 버튼으로 모달을 열 수 있다', async () => {
    render(<App />);

    // 레슨 1 최적 키 시퀀스로 정확히 완료
    for (const key of MISSIONS[0].optimalKeys ?? []) {
      fireEvent.keyDown(window, { key });
    }

    const compareBtn = await screen.findByTestId('open-golf-compare-btn');
    fireEvent.click(compareBtn);

    expect(await screen.findByTestId('golf-comparator-modal')).toBeInTheDocument();
  });
});
