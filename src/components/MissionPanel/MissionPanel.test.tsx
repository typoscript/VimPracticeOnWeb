import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MissionPanel } from './MissionPanel';
import { Mission } from '../../types/mission';

const mockMission: Mission = {
  id: 1,
  title: '레슨 1: 기본 방향 이동',
  description: 'h, j, k, l을 사용해 목표로 이동하세요.',
  hint: 'j로 내려간 뒤 l을 누르세요.',
  par: 5,
  initialLines: ['Line 1', 'Line 2'],
  initialCursor: { line: 0, col: 0 },
  checkComplete: () => false,
};

describe('MissionPanel Component', () => {
  it('renders mission title, step badge, description, and navigation buttons', () => {
    render(
      <MissionPanel
        mission={mockMission}
        missionIndex={0}
        totalMissions={5}
        isCompleted={false}
        keystrokeCount={3}
        onSelectMission={vi.fn()}
        onResetMission={vi.fn()}
      />
    );

    expect(screen.getByTestId('mission-title')).toHaveTextContent('레슨 1: 기본 방향 이동');
    expect(screen.getByTestId('mission-desc')).toHaveTextContent('h, j, k, l을 사용해 목표로 이동하세요.');
    expect(screen.getByText('MISSION 1 / 5')).toBeInTheDocument();
    expect(screen.getByText('진행 중')).toBeInTheDocument();
    expect(screen.getByTestId('mission-par-badge')).toHaveTextContent('타수: 3 / 목표(Par): 5');

    const prevBtn = screen.getByRole('button', { name: /previous mission/i });
    const nextBtn = screen.getByRole('button', { name: /next mission/i });

    expect(prevBtn).toBeDisabled(); // first mission
    expect(nextBtn).not.toBeDisabled();
  });

  it('toggles hint visibility on hint button click', () => {
    render(
      <MissionPanel
        mission={mockMission}
        missionIndex={0}
        totalMissions={5}
        isCompleted={false}
        keystrokeCount={0}
        onSelectMission={vi.fn()}
        onResetMission={vi.fn()}
      />
    );

    expect(screen.queryByTestId('mission-hint')).not.toBeInTheDocument();

    const hintToggleBtn = screen.getByRole('button', { name: /힌트 보기/i });
    fireEvent.click(hintToggleBtn);

    expect(screen.getByTestId('mission-hint')).toHaveTextContent('j로 내려간 뒤 l을 누르세요.');

    fireEvent.click(hintToggleBtn);
    expect(screen.queryByTestId('mission-hint')).not.toBeInTheDocument();
  });

  it('displays success banner with 3-star rating when keystrokes <= par', () => {
    const handleSelectMission = vi.fn();

    render(
      <MissionPanel
        mission={mockMission}
        missionIndex={0}
        totalMissions={5}
        isCompleted={true}
        keystrokeCount={4} // 4 <= 5 (par) -> 3 stars!
        onSelectMission={handleSelectMission}
        onResetMission={vi.fn()}
      />
    );

    expect(screen.getByTestId('mission-completed-badge')).toHaveTextContent('✓ 성공!');
    expect(screen.getByTestId('mission-success-banner')).toBeInTheDocument();
    expect(screen.getByTestId('rating-stars')).toHaveTextContent('★★★');
    expect(screen.getByText(/완벽한 최적 타수/)).toBeInTheDocument();

    const nextLessonBtn = screen.getByRole('button', { name: /다음 레슨 도전하기/i });
    fireEvent.click(nextLessonBtn);

    expect(handleSelectMission).toHaveBeenCalledWith(1);
  });

  it('displays 2-star rating when keystrokes exceed par but within 1.5x par', () => {
    render(
      <MissionPanel
        mission={mockMission}
        missionIndex={0}
        totalMissions={5}
        isCompleted={true}
        keystrokeCount={7} // 7 <= Math.ceil(5 * 1.5) = 8 -> 2 stars!
        onSelectMission={vi.fn()}
        onResetMission={vi.fn()}
      />
    );

    expect(screen.getByTestId('rating-stars')).toHaveTextContent('★★☆');
    expect(screen.getByText(/우수한 타수/)).toBeInTheDocument();
  });

  it('calls onResetMission when reset button is clicked', () => {
    const handleReset = vi.fn();

    render(
      <MissionPanel
        mission={mockMission}
        missionIndex={1}
        totalMissions={5}
        isCompleted={false}
        keystrokeCount={2}
        onSelectMission={vi.fn()}
        onResetMission={handleReset}
      />
    );

    const resetBtn = screen.getByRole('button', { name: /처음부터/i });
    fireEvent.click(resetBtn);

    expect(handleReset).toHaveBeenCalledTimes(1);
  });

  it('renders optimal replay button when completed and optimalKeys exist', () => {
    const handleStartGhostReplay = vi.fn();
    const missionWithOptimal: Mission = {
      ...mockMission,
      optimalKeys: ['j', 'j', 'w'],
    };

    render(
      <MissionPanel
        mission={missionWithOptimal}
        missionIndex={0}
        totalMissions={5}
        isCompleted={true}
        keystrokeCount={6}
        onSelectMission={vi.fn()}
        onResetMission={vi.fn()}
        onStartGhostReplay={handleStartGhostReplay}
      />
    );

    const replayBtn = screen.getByTestId('play-optimal-replay-btn');
    expect(replayBtn).toBeInTheDocument();
    expect(replayBtn).toHaveTextContent(/최적 타수\(Par\) 모범 답안 보기 \(3타\)/);

    fireEvent.click(replayBtn);
    expect(handleStartGhostReplay).toHaveBeenCalledTimes(1);
  });

  it('renders ghost replay banner when isGhostReplaying is true and stops on click', () => {
    const handleStopGhostReplay = vi.fn();

    render(
      <MissionPanel
        mission={mockMission}
        missionIndex={0}
        totalMissions={5}
        isCompleted={true}
        keystrokeCount={0}
        onSelectMission={vi.fn()}
        onResetMission={vi.fn()}
        isGhostReplaying={true}
        ghostReplayProgress={{ current: 2, total: 5 }}
        onStopGhostReplay={handleStopGhostReplay}
      />
    );

    expect(screen.getByTestId('ghost-replay-banner')).toHaveTextContent(/2\/5타/);
    const stopBtn = screen.getByTestId('stop-optimal-replay-btn');
    fireEvent.click(stopBtn);

    expect(handleStopGhostReplay).toHaveBeenCalledTimes(1);
  });
});
