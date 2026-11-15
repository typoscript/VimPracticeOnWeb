import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorViewport } from './EditorViewport';
import { VimEditorState } from '../../vim-engine';
import { setLocale } from '../../i18n';

function makeBaseState(overrides: Partial<VimEditorState> = {}): VimEditorState {
  return {
    lines: ['const a = 1;', 'const b = 2;'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
    ...overrides,
  };
}

function createProps(overrides: Partial<React.ComponentProps<typeof EditorViewport>> = {}) {
  const base = makeBaseState();
  return {
    editorState: base,
    displayEditorState: base,
    isEditorShaking: false,
    isEditorFocused: true,
    relativeLineNumbers: false,
    bellCount: 0,
    onFocusEditor: vi.fn(),
    onEditorAreaClick: vi.fn(),
    onSwitchPane: vi.fn(),
    onSelectCompletionCandidate: vi.fn(),
    onSwitchBuffer: vi.fn(),
    onSwitchTabPage: vi.fn(),
    onCloseTabPage: vi.fn(),
    onNewTabPage: vi.fn(),
    onJumpToMark: vi.fn(),
    onCloseLspHover: vi.fn(),
    onJumpQuickfixItem: vi.fn(),
    onCloseQuickfixWindow: vi.fn(),
    onJumpLocationListItem: vi.fn(),
    onCloseLocationListWindow: vi.fn(),
    onSwitchCommandLineWindowType: vi.fn(),
    onClearCommandLineHistory: vi.fn(),
    onCloseCommandLineWindow: vi.fn(),
    onSelectCommandLineWindowLine: vi.fn(),
    onExecuteCommandLineWindowLine: vi.fn(),
    ...overrides,
  };
}

describe('EditorViewport', () => {
  beforeEach(() => {
    setLocale('ko');
  });

  it('탭 페이지와 버퍼 바를 렌더링하고 클릭 시 전환/생성/닫기 콜백을 호출한다', () => {
    const state = makeBaseState({
      tabPages: [
        {
          id: 1,
          filename: 'one.ts',
          lines: ['one'],
          cursor: { line: 0, col: 0 },
          mode: 'NORMAL',
        },
        {
          id: 2,
          filename: 'two.ts',
          lines: ['two'],
          cursor: { line: 0, col: 0 },
          mode: 'NORMAL',
        },
      ],
      currentTabId: 1,
      buffers: [
        { id: 1, name: 'one.ts', lines: ['one'], cursor: { line: 0, col: 0 }, isModified: true },
        { id: 2, name: 'two.ts', lines: ['two'], cursor: { line: 0, col: 0 }, isModified: false },
      ],
      currentBufferId: 1,
      alternateBufferId: 2,
    });
    const props = createProps({ editorState: state, displayEditorState: state });
    render(<EditorViewport {...props} />);

    expect(screen.getByTestId('editor-tab-bar')).toBeInTheDocument();
    expect(screen.getByTestId('editor-buffer-bar')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-page-2'));
    expect(props.onSwitchTabPage).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByTestId('buffer-tab-2'));
    expect(props.onSwitchBuffer).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByTitle('새 탭 열기 (:tabnew)'));
    expect(props.onNewTabPage).toHaveBeenCalledTimes(1);
  });

  it('분할 창 모드에서 두 개의 split pane 과 diff 배지를 렌더링하고 클릭 전환을 호출한다', () => {
    const splitState = makeBaseState({
      splitDirection: 'vertical',
      activePaneIndex: 0,
      diffMode: true,
      splitPanes: [
        { filename: 'left.ts', lines: ['a'], cursor: { line: 0, col: 0 }, mode: 'NORMAL' },
        { filename: 'right.ts', lines: ['b'], cursor: { line: 0, col: 0 }, mode: 'NORMAL' },
      ],
    });
    const props = createProps({ editorState: splitState, displayEditorState: splitState });
    render(<EditorViewport {...props} />);

    expect(screen.getByTestId('editor-split-container')).toHaveClass('split-vertical');
    expect(screen.getByTestId('diff-badge-0')).toBeInTheDocument();
    expect(screen.getByTestId('diff-badge-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('split-pane-1'));
    expect(props.onSwitchPane).toHaveBeenCalledWith(1);
  });

  it('커맨드라인 윈도우가 열려 있으면 히스토리 줄 선택·즉시 실행·초기화·닫기 핸들러를 동작시킨다', () => {
    const cmdWinState = makeBaseState({
      cmdlineWindow: {
        type: ':',
        lines: ['%s/foo/bar/g', 'set number'],
        cursor: { line: 1, col: 0 },
        mode: 'NORMAL',
      },
    });
    const props = createProps({ editorState: cmdWinState, displayEditorState: cmdWinState });
    render(<EditorViewport {...props} />);

    expect(screen.getByTestId('cmdline-window')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cmdline-line-0'));
    expect(props.onSelectCommandLineWindowLine).toHaveBeenCalledWith(0);

    fireEvent.doubleClick(screen.getByTestId('cmdline-line-1'));
    expect(props.onExecuteCommandLineWindowLine).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByTestId('cmdline-tab-search'));
    expect(props.onSwitchCommandLineWindowType).toHaveBeenCalledWith('/');

    fireEvent.click(screen.getByTestId('cmdline-clear-btn'));
    expect(props.onClearCommandLineHistory).toHaveBeenCalledWith(':');

    fireEvent.click(screen.getByTitle('커맨드라인 윈도우 닫기 (Esc)'));
    expect(props.onCloseCommandLineWindow).toHaveBeenCalledTimes(1);
  });
});
