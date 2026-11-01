import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App';

describe('ActionTimelinePanel & Live Engine X-Ray Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders ActionTimelinePanel by default and updates steps on user command input', () => {
    render(<App />);

    // 타임라인 패널 및 헤더 확인
    expect(screen.getByTestId('action-timeline-panel')).toBeInTheDocument();
    expect(screen.getByTestId('xray-pending-badge')).toBeInTheDocument();
    expect(screen.getByTestId('xray-clipboard-badge')).toBeInTheDocument();
    expect(screen.getByTestId('xray-dot-badge')).toBeInTheDocument();

    // 초기 스텝 #0 존재 확인
    expect(screen.getByTestId('timeline-step-0')).toBeInTheDocument();

    // 키 입력: 'w' (단어 이동)
    fireEvent.keyDown(window, { key: 'w' });

    // 스텝 #1 생성 확인
    const step1 = screen.getByTestId('timeline-step-1');
    expect(step1).toBeInTheDocument();
    expect(step1).toHaveTextContent('w');
    expect(step1).toHaveTextContent('다음 단어');
  });

  it('supports time-travel preview and branching ("이 시점부터 이어서 치기")', () => {
    render(<App />);

    // 키 입력: w 입력 후 l 입력
    fireEvent.keyDown(window, { key: 'w' });
    fireEvent.keyDown(window, { key: 'l' });

    // 2개의 스텝 생성 확인
    expect(screen.getByTestId('timeline-step-1')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-step-2')).toBeInTheDocument();

    // 스텝 1 클릭 (과거 시점 미리보기)
    fireEvent.click(screen.getByTestId('timeline-step-1'));

    // 미리보기 배너 노출 확인
    expect(screen.getByTestId('timeline-preview-banner')).toBeInTheDocument();
    expect(screen.getByText(/미리보기 중:/)).toBeInTheDocument();

    // "이 시점부터 이어서 치기" 분기 버튼 클릭
    const branchBtn = screen.getByTestId('branch-resume-btn');
    fireEvent.click(branchBtn);

    // 미리보기 배너 사라지고 스텝 2가 잘려나가 1번 스텝까지만 유지됨 확인
    expect(screen.queryByTestId('timeline-preview-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-step-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-step-1')).toBeInTheDocument();
  });

  it('updates X-Ray badge when pending keys exist', () => {
    render(<App />);

    // '2' 입력 시 반복 카운트 대기 배지로 갱신
    fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByText(/반복 카운트 \[2\]/)).toBeInTheDocument();

    // 'd' 입력 시 삭제 연산 대기 배지로 갱신
    fireEvent.keyDown(window, { key: 'd' });
    expect(screen.getByText(/명령 대기 \[2d\]/)).toBeInTheDocument();
  });

  it('toggles ActionTimelinePanel via toolbar button', () => {
    render(<App />);

    const toggleBtn = screen.getByTestId('toggle-action-timeline-btn');
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.getByTestId('action-timeline-panel')).toBeInTheDocument();

    // 토글 OFF
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId('action-timeline-panel')).not.toBeInTheDocument();

    // 토글 ON
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('action-timeline-panel')).toBeInTheDocument();
  });

  it('copies failing test reproduction snippet to clipboard when clicking export button', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: 'w' });

    const exportBtn = screen.getByTestId('export-test-btn');
    fireEvent.click(exportBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const code = (navigator.clipboard.writeText as any).mock.calls[0][0];
    expect(code).toContain("it('reproduce issue in mission:");
    expect(code).toContain('const keys = ["w"];');
  });
});
