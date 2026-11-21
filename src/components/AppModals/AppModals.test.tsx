import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppModals, AppModalsProps } from './AppModals';
import { VimEditorState } from '../../vim-engine';
import { setLocale } from '../../i18n';

function createBaseState(overrides: Partial<VimEditorState> = {}): VimEditorState {
  return {
    lines: ['hello world'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
    ...overrides,
  };
}

function createProps(overrides: Partial<AppModalsProps> = {}): AppModalsProps {
  return {
    editorState: createBaseState(),
    lesson: {
      isOpen: false,
      onClose: vi.fn(),
      currentMissionId: 1,
      progress: {},
      onSelectById: vi.fn(),
    },
    customMission: {
      isOpen: false,
      onClose: vi.fn(),
      onPlay: vi.fn(),
    },
    analytics: {
      isOpen: false,
      onClose: vi.fn(),
      onOpenDaily: vi.fn(),
      onStartWeaknessDrill: vi.fn(),
    },
    daily: {
      isOpen: false,
      onClose: vi.fn(),
      playKeySound: vi.fn(),
      playSuccessSound: vi.fn(),
    },
    config: {
      isOpen: false,
      onClose: vi.fn(),
      relativeLineNumbers: true,
      currentTheme: 'tokyo-night',
      leaderKey: ' ',
      activePresets: {},
      onTogglePreset: vi.fn(),
      onChangeLeaderKey: vi.fn(),
      customKeymaps: [],
      onAddCustomKeymap: vi.fn(),
      onDeleteCustomKeymap: vi.fn(),
      onRestoreBackup: vi.fn(),
    },
    byoc: {
      isOpen: false,
      onClose: vi.fn(),
      onPlay: vi.fn(),
    },
    fuzzyFinderHandlers: {
      onSelectAction: vi.fn(),
      onSelectItemIndex: vi.fn(),
      onClose: vi.fn(),
    },
    helpHandlers: {
      onJumpTag: vi.fn(),
      onPopTag: vi.fn(),
      onClose: vi.fn(),
    },
    ...overrides,
  };
}

describe('AppModals', () => {
  beforeEach(() => {
    setLocale('ko');
  });

  it('초기 닫힘 상태에서는 지연 모달/퍼지 파인더/도움말을 마운트하지 않으며 레슨 모달을 열고 닫는다', async () => {
    const base = createProps();
    const { rerender } = render(<AppModals {...base} />);

    expect(screen.queryByTestId('fuzzy-finder-modal')).toBeNull();
    expect(screen.queryByTestId('help-viewer-window')).toBeNull();

    const onClose = vi.fn();
    rerender(
      <AppModals
        {...base}
        lesson={{ ...base.lesson, isOpen: true, onClose }}
      />
    );
    expect(await screen.findByTestId('lesson-modal-content')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('modal-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('isDailyModalOpen 활성화 시 지연 로딩된 데일리 챌린지 모달을 마운트한다', async () => {
    const base = createProps();
    render(<AppModals {...base} daily={{ ...base.daily, isOpen: true }} />);
    expect(await screen.findByTestId('daily-modal')).toBeInTheDocument();
  });

  it('fuzzyFinder 와 helpSession 이 열려 있으면 오버레이를 렌더링한다', async () => {
    const state = createBaseState({
      fuzzyFinder: {
        isOpen: true,
        mode: 'files',
        query: '',
        selectedIndex: 0,
      },
      helpSession: {
        isOpen: true,
        topic: 'motion',
        title: 'motion.txt',
        lines: ['h j k l'],
        cursor: { line: 0, col: 0 },
        tagStack: [],
      },
    });
    render(<AppModals {...createProps({ editorState: state })} />);

    expect(await screen.findByTestId('fuzzy-finder-modal')).toBeInTheDocument();
    expect(await screen.findByTestId('help-viewer-window')).toBeInTheDocument();
  });
});
