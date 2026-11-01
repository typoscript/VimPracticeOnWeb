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
});
