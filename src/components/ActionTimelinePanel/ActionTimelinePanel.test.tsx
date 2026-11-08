import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionTimelinePanel } from './ActionTimelinePanel';
import { VimEditorState } from '../../vim-engine';
import { ActionTimelineStep } from '../../utils/actionTimeline';

describe('ActionTimelinePanel Component', () => {
  const mockInitialState: VimEditorState = {
    lines: ['hello world', 'second line'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
    clipboard: { type: 'text', content: 'copied text' },
    lastChangeKeys: ['c', 'w'],
  };

  const mockSteps: ActionTimelineStep[] = [
    {
      stepIndex: 0,
      command: 'START',
      description: '미션 초기 상태',
      keys: [],
      keystrokesSoFar: 0,
      snapshot: mockInitialState,
    },
    {
      stepIndex: 1,
      command: '2w',
      description: '다음 단어로 2회 이동',
      keys: ['2', 'w'],
      keystrokesSoFar: 2,
      snapshot: { ...mockInitialState, cursor: { line: 0, col: 6 } },
    },
    {
      stepIndex: 2,
      command: 'dw',
      description: '단어 앞부분 삭제 (dw)',
      keys: ['d', 'w'],
      keystrokesSoFar: 4,
      snapshot: { ...mockInitialState, lines: ['hello line'], cursor: { line: 0, col: 6 } },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Clipboard mock
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders timeline title, step counter, and X-Ray badges', () => {
    render(
      <ActionTimelinePanel
        steps={mockSteps}
        previewStepIndex={null}
        editorState={mockInitialState}
        missionTitle="테스트 미션"
        initialText="hello world\nsecond line"
        initialCursor={{ line: 0, col: 0 }}
        allKeysSoFar={['2', 'w', 'd', 'w']}
        onSelectStep={vi.fn()}
        onBranchFromStep={vi.fn()}
        onCancelPreview={vi.fn()}
      />
    );

    expect(screen.getByText(/명령 복기 타임라인 & Vim X-Ray/)).toBeInTheDocument();
    expect(screen.getByText('2 / 2 스텝')).toBeInTheDocument();

    // X-Ray 배지 검증
    expect(screen.getByTestId('xray-pending-badge')).toBeInTheDocument();
    expect(screen.getByTestId('xray-clipboard-badge')).toBeInTheDocument();
    expect(screen.getByText(/"copied text"/)).toBeInTheDocument();
    expect(screen.getByTestId('xray-dot-badge')).toBeInTheDocument();
    expect(screen.getByText('cw')).toBeInTheDocument();
  });

  it('renders all step chips and allows selecting a past step', () => {
    const handleSelectStep = vi.fn();

    render(
      <ActionTimelinePanel
        steps={mockSteps}
        previewStepIndex={null}
        editorState={mockInitialState}
        initialText="hello world"
        initialCursor={{ line: 0, col: 0 }}
        allKeysSoFar={['2', 'w', 'd', 'w']}
        onSelectStep={handleSelectStep}
        onBranchFromStep={vi.fn()}
        onCancelPreview={vi.fn()}
      />
    );

    // 스텝 1 칩 클릭
    const step1Btn = screen.getByTestId('timeline-step-1');
    expect(step1Btn).toBeInTheDocument();
    expect(screen.getByText('2w')).toBeInTheDocument();

    fireEvent.click(step1Btn);
    expect(handleSelectStep).toHaveBeenCalledWith(1);
  });

  it('renders preview banner when previewing a past step and triggers branching', () => {
    const handleBranchFromStep = vi.fn();
    const handleCancelPreview = vi.fn();

    render(
      <ActionTimelinePanel
        steps={mockSteps}
        previewStepIndex={1} // Past step preview!
        editorState={mockSteps[1].snapshot}
        initialText="hello world"
        initialCursor={{ line: 0, col: 0 }}
        allKeysSoFar={['2', 'w', 'd', 'w']}
        onSelectStep={vi.fn()}
        onBranchFromStep={handleBranchFromStep}
        onCancelPreview={handleCancelPreview}
      />
    );

    // 미리보기 배너 노출 확인
    expect(screen.getByTestId('timeline-preview-banner')).toBeInTheDocument();
    expect(screen.getByText(/스텝 #1/)).toBeInTheDocument();

    // 분기 버튼 클릭
    const branchBtn = screen.getByTestId('branch-resume-btn');
    fireEvent.click(branchBtn);
    expect(handleBranchFromStep).toHaveBeenCalledWith(1);

    // 복귀 버튼 클릭
    const cancelBtn = screen.getByTestId('cancel-preview-btn');
    fireEvent.click(cancelBtn);
    expect(handleCancelPreview).toHaveBeenCalled();
  });

  it('copies Vitest reproduction code on clicking the export button', async () => {
    render(
      <ActionTimelinePanel
        steps={mockSteps}
        previewStepIndex={null}
        editorState={mockInitialState}
        missionTitle="버그 발생 미션"
        initialText="hello world"
        initialCursor={{ line: 0, col: 0 }}
        allKeysSoFar={['2', 'w', 'd', 'w']}
        onSelectStep={vi.fn()}
        onBranchFromStep={vi.fn()}
        onCancelPreview={vi.fn()}
      />
    );

    const exportBtn = screen.getByTestId('export-test-btn');
    fireEvent.click(exportBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const writtenCode = (navigator.clipboard.writeText as any).mock.calls[0][0];
    expect(writtenCode).toContain("it('reproduce issue in mission: 버그 발생 미션'");
    expect(writtenCode).toContain('const keys = ["2","w","d","w"];');

    // 토스트 노출 확인
    expect(
      await screen.findByText(/Vitest 재현 코드가 클립보드에 복사되었습니다/)
    ).toBeInTheDocument();
  });

  it('handles prev and next navigation buttons correctly', () => {
    const handleSelectStep = vi.fn();

    render(
      <ActionTimelinePanel
        steps={mockSteps}
        previewStepIndex={1}
        editorState={mockSteps[1].snapshot}
        initialText="hello world"
        initialCursor={{ line: 0, col: 0 }}
        allKeysSoFar={['2', 'w', 'd', 'w']}
        onSelectStep={handleSelectStep}
        onBranchFromStep={vi.fn()}
        onCancelPreview={vi.fn()}
      />
    );

    const prevBtn = screen.getByTestId('timeline-prev-step-btn');
    const nextBtn = screen.getByTestId('timeline-next-step-btn');

    fireEvent.click(prevBtn);
    expect(handleSelectStep).toHaveBeenCalledWith(0);

    fireEvent.click(nextBtn);
    expect(handleSelectStep).toHaveBeenCalledWith(2);
  });
});
