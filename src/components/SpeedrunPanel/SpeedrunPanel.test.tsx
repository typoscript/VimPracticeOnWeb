import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpeedrunPanel } from './SpeedrunPanel';

describe('SpeedrunPanel Component', () => {
  it('ready 상태에서 규칙 설명과 시작 버튼을 렌더링한다', () => {
    const handleStart = vi.fn();
    render(
      <SpeedrunPanel
        status="ready"
        currentStageIndex={0}
        totalStages={5}
        elapsedSeconds={0}
        totalKeystrokes={0}
        bestRecord={null}
        onStart={handleStart}
        onRestart={vi.fn()}
      />
    );

    expect(screen.getByTestId('speedrun-ready-view')).toBeInTheDocument();
    const startBtn = screen.getByTestId('speedrun-start-btn');
    fireEvent.click(startBtn);
    expect(handleStart).toHaveBeenCalled();
  });

  it('running 상태에서 스테이지 번호, 실시간 타이머 및 타수를 렌더링한다', () => {
    render(
      <SpeedrunPanel
        status="running"
        currentStageIndex={2}
        totalStages={5}
        currentMissionTitle="레슨 6: 한 줄 삭제"
        elapsedSeconds={14.5}
        totalKeystrokes={32}
        bestRecord={{ bestTimeSeconds: 22.0, minKeystrokes: 40, completedAt: '' }}
        onStart={vi.fn()}
        onRestart={vi.fn()}
      />
    );

    expect(screen.getByTestId('speedrun-stage-indicator')).toHaveTextContent('3 / 5');
    expect(screen.getByTestId('speedrun-timer')).toHaveTextContent('00:14.5');
    expect(screen.getByTestId('speedrun-keystrokes')).toHaveTextContent('32타');
    expect(screen.getByText('레슨 6: 한 줄 삭제')).toBeInTheDocument();
  });

  it('completed 상태에서 최종 결과와 재도전 버튼을 렌더링한다', () => {
    const handleRestart = vi.fn();
    render(
      <SpeedrunPanel
        status="completed"
        currentStageIndex={4}
        totalStages={5}
        elapsedSeconds={19.2}
        totalKeystrokes={28}
        bestRecord={{ bestTimeSeconds: 19.2, minKeystrokes: 28, completedAt: '' }}
        isNewRecord={true}
        onStart={vi.fn()}
        onRestart={handleRestart}
      />
    );

    expect(screen.getByTestId('speedrun-completed-view')).toBeInTheDocument();
    expect(screen.getByTestId('speedrun-new-record')).toBeInTheDocument();
    expect(screen.getByTestId('final-time')).toHaveTextContent('00:19.2');
    expect(screen.getByTestId('final-keystrokes')).toHaveTextContent('28타');

    const restartBtn = screen.getByTestId('speedrun-restart-btn');
    fireEvent.click(restartBtn);
    expect(handleRestart).toHaveBeenCalled();
  });
});
