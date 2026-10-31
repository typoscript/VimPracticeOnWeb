import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MissionPanel } from './MissionPanel';
import { Mission } from '../../types/mission';

const mockMission: Mission = {
  id: 1,
  title: '레슨 1: 기본 방향 이동',
  description: 'h, j, k, l을 사용해 목표로 이동하세요.',
  hint: 'j로 내려간 뒤 l을 누르세요.',
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
        onSelectMission={vi.fn()}
        onResetMission={vi.fn()}
      />
    );

    expect(screen.getByTestId('mission-title')).toHaveTextContent('레슨 1: 기본 방향 이동');
    expect(screen.getByTestId('mission-desc')).toHaveTextContent('h, j, k, l을 사용해 목표로 이동하세요.');
    expect(screen.getByText('MISSION 1 / 5')).toBeInTheDocument();
    expect(screen.getByText('진행 중')).toBeInTheDocument();

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

  it('displays success banner and handles next lesson click when completed', () => {
    const handleSelectMission = vi.fn();

    render(
      <MissionPanel
        mission={mockMission}
        missionIndex={0}
        totalMissions={5}
        isCompleted={true}
        onSelectMission={handleSelectMission}
        onResetMission={vi.fn()}
      />
    );

    expect(screen.getByTestId('mission-completed-badge')).toHaveTextContent('✓ 성공!');
    expect(screen.getByTestId('mission-success-banner')).toBeInTheDocument();

    const nextLessonBtn = screen.getByRole('button', { name: /다음 레슨 도전하기/i });
    fireEvent.click(nextLessonBtn);

    expect(handleSelectMission).toHaveBeenCalledWith(1);
  });

  it('calls onResetMission when reset button is clicked', () => {
    const handleReset = vi.fn();

    render(
      <MissionPanel
        mission={mockMission}
        missionIndex={1}
        totalMissions={5}
        isCompleted={false}
        onSelectMission={vi.fn()}
        onResetMission={handleReset}
      />
    );

    const resetBtn = screen.getByRole('button', { name: /처음부터/i });
    fireEvent.click(resetBtn);

    expect(handleReset).toHaveBeenCalledTimes(1);
  });
});
