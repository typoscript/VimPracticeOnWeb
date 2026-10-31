import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LessonSelectModal } from './LessonSelectModal';
import { MISSIONS } from '../../data/missions';
import { LessonProgress } from '../../utils/storage';

describe('LessonSelectModal Component', () => {
  const mockProgress: LessonProgress = {
    1: { completed: true, bestStars: 3, minKeystrokes: 6 },
    2: { completed: true, bestStars: 2, minKeystrokes: 7 },
  };

  it('isOpen이 false이면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(
      <LessonSelectModal
        isOpen={false}
        onClose={vi.fn()}
        missions={MISSIONS}
        currentMissionId={1}
        progress={mockProgress}
        onSelectLesson={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('isOpen이 true이면 모달 타이틀과 레슨 목록, 진행도 통계를 렌더링한다', () => {
    render(
      <LessonSelectModal
        isOpen={true}
        onClose={vi.fn()}
        missions={MISSIONS}
        currentMissionId={1}
        progress={mockProgress}
        onSelectLesson={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Vim 커리큘럼 레슨 목록/)).toBeInTheDocument();

    // 통계 확인: 2개 완료, 3+2=5 별점
    expect(screen.getByTestId('modal-stats-bar')).toHaveTextContent(
      `2 / ${MISSIONS.length} 완료`
    );
    expect(screen.getByTestId('modal-stats-bar')).toHaveTextContent(
      `★ 5 / ${MISSIONS.length * 3}`
    );

    // 현재 레슨 배지 확인
    expect(screen.getByTestId('current-badge-1')).toHaveTextContent('현재 학습 중');
  });

  it('닫기 버튼 클릭 시 onClose가 호출된다', () => {
    const onClose = vi.fn();
    render(
      <LessonSelectModal
        isOpen={true}
        onClose={onClose}
        missions={MISSIONS}
        currentMissionId={1}
        progress={mockProgress}
        onSelectLesson={vi.fn()}
      />
    );

    const closeBtn = screen.getByTestId('modal-close-btn');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('배경(Backdrop) 클릭 시 onClose가 호출된다', () => {
    const onClose = vi.fn();
    render(
      <LessonSelectModal
        isOpen={true}
        onClose={onClose}
        missions={MISSIONS}
        currentMissionId={1}
        progress={mockProgress}
        onSelectLesson={vi.fn()}
      />
    );

    const backdrop = screen.getByTestId('lesson-modal-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape 키 누름 시 onClose가 호출된다', () => {
    const onClose = vi.fn();
    render(
      <LessonSelectModal
        isOpen={true}
        onClose={onClose}
        missions={MISSIONS}
        currentMissionId={1}
        progress={mockProgress}
        onSelectLesson={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('레슨 카드를 클릭하면 해당 레슨이 선택되고 모달이 닫힌다', () => {
    const onSelectLesson = vi.fn();
    const onClose = vi.fn();

    render(
      <LessonSelectModal
        isOpen={true}
        onClose={onClose}
        missions={MISSIONS}
        currentMissionId={1}
        progress={mockProgress}
        onSelectLesson={onSelectLesson}
      />
    );

    const lessonCard3 = screen.getByTestId('lesson-card-3');
    fireEvent.click(lessonCard3);

    expect(onSelectLesson).toHaveBeenCalledWith(3);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
