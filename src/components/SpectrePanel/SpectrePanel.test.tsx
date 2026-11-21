import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpectrePanel } from './SpectrePanel';
import { createVimState, runExCommand } from '../../vim-engine';

describe('SpectrePanel', () => {
  it('파일별 매치와 인라인 Diff 미리보기를 렌더링하고 검색·치환·체크·닫기 콜백을 호출한다', () => {
    let s = createVimState(['const api = "v1";']);
    s = {
      ...s,
      primaryFilename: 'src/api.ts',
      virtualFiles: {
        'src/api.ts': ['const api = "v1";'],
        'src/worker.ts': ['const worker = "v1";'],
      },
    };
    s = runExCommand(s, ':Spectre v1 v2');

    const onUpdateQuery = vi.fn();
    const onToggleItem = vi.fn();
    const onToggleAll = vi.fn();
    const onJumpItem = vi.fn();
    const onReplaceAll = vi.fn();
    const onClose = vi.fn();

    render(
      <SpectrePanel
        state={s.spectrePanel!}
        onUpdateQuery={onUpdateQuery}
        onToggleItem={onToggleItem}
        onToggleAll={onToggleAll}
        onJumpItem={onJumpItem}
        onReplaceAll={onReplaceAll}
        onClose={onClose}
      />
    );

    expect(screen.getByTestId('spectre-panel')).toBeInTheDocument();
    expect(screen.getByTestId('spectre-counts')).toHaveTextContent('2 / 2');

    fireEvent.change(screen.getByTestId('spectre-replace-input'), {
      target: { value: 'v3' },
    });
    expect(onUpdateQuery).toHaveBeenCalledWith('v1', 'v3', false);

    fireEvent.click(screen.getByTestId('spectre-check-0'));
    expect(onToggleItem).toHaveBeenCalledWith('src/api.ts:0');

    fireEvent.click(screen.getByTestId('spectre-item-1'));
    expect(onJumpItem).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByTestId('spectre-replace-all-btn'));
    expect(onReplaceAll).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('spectre-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
