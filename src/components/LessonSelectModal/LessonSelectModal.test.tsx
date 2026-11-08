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

  it('레슨 카드를 클릭하면 해당 레슨이 선택되고 모달이 받힌다', () => {
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

  it('검색어 입력 시 일치하는 레슨만 실시간 필터링된다', () => {
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

    const searchInput = screen.getByTestId('lesson-search-input');
    fireEvent.change(searchInput, { target: { value: 'Netrw' } });

    // 레슨 39와 64는 렌더링되어야 함
    expect(screen.getByTestId('lesson-card-39')).toBeInTheDocument();
    expect(screen.getByTestId('lesson-card-64')).toBeInTheDocument();
    // 레슨 1은 필터링되어 없어야 함
    expect(screen.queryByTestId('lesson-card-1')).toBeNull();

    // 초기화 버튼 클릭 시 검색어 제거되고 전체 레슨 복원
    const clearBtn = screen.getByTestId('search-clear-btn');
    fireEvent.click(clearBtn);
    expect(screen.getByTestId('lesson-card-1')).toBeInTheDocument();
  });

  it('카테고리 태그 버튼 클릭 시 해당 카테고리 레슨만 필터링된다', () => {
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

    const textObjectTagBtn = screen.getByTestId('tag-btn-textobject');
    fireEvent.click(textObjectTagBtn);

    expect(screen.getByTestId('lesson-card-14')).toBeInTheDocument();
    expect(screen.getByTestId('lesson-card-54')).toBeInTheDocument();
    expect(screen.queryByTestId('lesson-card-1')).toBeNull();

    // '전체' 태그 클릭 시 복원
    const allTagBtn = screen.getByTestId('tag-btn-all');
    fireEvent.click(allTagBtn);
    expect(screen.getByTestId('lesson-card-1')).toBeInTheDocument();
  });

  it('미완료만 보기 토글 시 완료되지 않은 레슨만 필터링된다', () => {
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

    const toggleBtn = screen.getByTestId('status-toggle-btn');
    fireEvent.click(toggleBtn);

    // mockProgress 에서 1과 2는 완료됨 -> 표시되지 않아야 함
    expect(screen.queryByTestId('lesson-card-1')).toBeNull();
    expect(screen.queryByTestId('lesson-card-2')).toBeNull();
    // 3은 미완료 -> 표시되어야 함
    expect(screen.getByTestId('lesson-card-3')).toBeInTheDocument();
  });

  it('일치하는 레슨이 없을 때 빈 화면과 필터 초기화 버튼이 작동한다', () => {
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

    const searchInput = screen.getByTestId('lesson-search-input');
    fireEvent.change(searchInput, { target: { value: '존재하지않는키워드xyz999' } });

    expect(screen.getByTestId('empty-search-state')).toBeInTheDocument();
    expect(screen.getByText('일치하는 레슨이 없습니다.')).toBeInTheDocument();

    const resetBtn = screen.getByTestId('reset-filter-btn');
    fireEvent.click(resetBtn);

    expect(screen.queryByTestId('empty-search-state')).toBeNull();
    expect(screen.getByTestId('lesson-card-1')).toBeInTheDocument();
  });
});
