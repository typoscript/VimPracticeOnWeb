import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CustomMissionModal } from './CustomMissionModal';

describe('CustomMissionModal component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CustomMissionModal isOpen={false} onClose={() => {}} onPlayMission={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders inputs and buttons when isOpen is true', () => {
    render(
      <CustomMissionModal isOpen={true} onClose={() => {}} onPlayMission={() => {}} />
    );
    expect(screen.getByTestId('custom-mission-modal')).toBeDefined();
    expect(screen.getByTestId('custom-input-title')).toBeDefined();
    expect(screen.getByTestId('custom-input-par')).toBeDefined();
    expect(screen.getByTestId('custom-input-initial-text')).toBeDefined();
    expect(screen.getByTestId('custom-input-target-text')).toBeDefined();
    expect(screen.getByTestId('share-url-input')).toBeDefined();
    expect(screen.getByTestId('copy-link-btn')).toBeDefined();
    expect(screen.getByTestId('play-custom-mission-btn')).toBeDefined();
  });

  it('copies generated link to clipboard on button click', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <CustomMissionModal isOpen={true} onClose={() => {}} onPlayMission={() => {}} />
    );

    const copyBtn = screen.getByTestId('copy-link-btn');
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
      expect(screen.getByText('✅ 복사 완료!')).toBeDefined();
    });
  });

  it('calls onPlayMission and onClose when "지금 바로 플레이" is clicked', () => {
    const onPlayMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <CustomMissionModal
        isOpen={true}
        onClose={onCloseMock}
        onPlayMission={onPlayMock}
      />
    );

    const playBtn = screen.getByTestId('play-custom-mission-btn');
    fireEvent.click(playBtn);

    expect(onPlayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.any(String),
        initialText: expect.any(String),
        targetText: expect.any(String),
        par: expect.any(Number),
      })
    );
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('applies preset templates and supports JSON/URL import with validation feedback', () => {
    localStorage.clear();
    render(
      <CustomMissionModal
        isOpen={true}
        onClose={vi.fn()}
        onPlayMission={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('preset-btn-regex-log-cleanup'));
    expect((screen.getByTestId('custom-input-title') as HTMLInputElement).value).toBe('로그 태그 일괄 정규화');

    const importInput = screen.getByTestId('custom-import-input') as HTMLInputElement;
    fireEvent.change(importInput, { target: { value: '{broken' } });
    fireEvent.click(screen.getByTestId('custom-import-btn'));
    expect(screen.getByTestId('custom-import-feedback').textContent).toContain('올바른 공유 URL');

    const payload = JSON.stringify({
      title: 'JSON 임포트 테스트',
      description: '설명',
      initialText: 'foo',
      targetText: 'bar',
      par: 5,
    });
    fireEvent.change(importInput, { target: { value: payload } });
    fireEvent.click(screen.getByTestId('custom-import-btn'));

    expect(screen.getByTestId('custom-import-feedback').textContent).toContain('성공적으로 불러왔습니다');
    expect((screen.getByTestId('custom-input-title') as HTMLInputElement).value).toBe('JSON 임포트 테스트');
    expect((screen.getByTestId('custom-input-par') as HTMLInputElement).value).toBe('5');
  });

  it('saves custom missions to library, plays saved mission, deletes, and copies JSON', async () => {
    localStorage.clear();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    const onPlayMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <CustomMissionModal
        isOpen={true}
        onClose={onCloseMock}
        onPlayMission={onPlayMock}
      />
    );

    fireEvent.change(screen.getByTestId('custom-input-title'), {
      target: { value: '저장 테스트 미션' },
    });
    fireEvent.click(screen.getByTestId('save-custom-mission-btn'));

    const savedTitleEl = screen.getByText('저장 테스트 미션');
    expect(savedTitleEl).toBeDefined();

    fireEvent.click(screen.getByTestId('copy-json-btn'));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('"title": "저장 테스트 미션"'));
    });

    const playSavedBtn = screen.getByText('플레이');
    fireEvent.click(playSavedBtn);
    expect(onPlayMock).toHaveBeenCalledWith(expect.objectContaining({ title: '저장 테스트 미션' }));

    fireEvent.click(screen.getByText('삭제'));
    expect(screen.queryByText('저장 테스트 미션')).toBeNull();
  });
});
