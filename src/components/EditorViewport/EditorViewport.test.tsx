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

  it('3개 이상의 중첩 멀티 윈도우 트리를 재귀적으로 렌더링하고 클릭 전환을 호출한다', () => {
    const nestedState = makeBaseState({
      splitDirection: 'vertical',
      activePaneIndex: 0,
      splitPanes: [
        { winId: 1000, filename: 'leftTop.ts', lines: ['lt'], cursor: { line: 0, col: 0 }, mode: 'NORMAL' },
        { winId: 1002, filename: 'leftBottom.ts', lines: ['lb'], cursor: { line: 0, col: 0 }, mode: 'NORMAL' },
        { winId: 1001, filename: 'right.ts', lines: ['r'], cursor: { line: 0, col: 0 }, mode: 'NORMAL' },
      ],
      windowLayout: {
        kind: 'split',
        direction: 'vertical',
        weights: [50, 50],
        children: [
          {
            kind: 'split',
            direction: 'horizontal',
            weights: [50, 50],
            children: [
              { kind: 'leaf', paneIndex: 0 },
              { kind: 'leaf', paneIndex: 1 },
            ],
          },
          { kind: 'leaf', paneIndex: 2 },
        ],
      },
    });
    const props = createProps({ editorState: nestedState, displayEditorState: nestedState });
    render(<EditorViewport {...props} />);

    expect(screen.getByTestId('editor-split-container')).toHaveClass('split-vertical');
    expect(screen.getByTestId('split-branch-horizontal')).toBeInTheDocument();
    expect(screen.getByTestId('split-pane-0')).toHaveTextContent('#1');
    expect(screen.getByTestId('split-pane-1')).toHaveTextContent('#2');
    expect(screen.getByTestId('split-pane-2')).toHaveTextContent('#3');

    fireEvent.click(screen.getByTestId('split-pane-2'));
    expect(props.onSwitchPane).toHaveBeenCalledWith(2);
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

  it('inccommand=split 상태에서 실시간 치환 미리보기 인라인 배지와 하단 프리뷰 분할 창을 렌더링한다', () => {
    const base = makeBaseState({
      lines: ['const oldVal = 1;', 'return oldVal;'],
      mode: 'COMMAND',
      commandType: ':',
      commandBuffer: '%s/oldVal/newVal/g',
      options: {
        number: true,
        relativenumber: false,
        ignorecase: false,
        smartcase: false,
        hlsearch: true,
        incsearch: true,
        inccommand: 'split',
        wrap: true,
        cursorline: true,
        tabstop: 2,
        shiftwidth: 2,
        expandtab: true,
        list: false,
        wildmenu: true,
      },
      incCommandPreview: {
        range: { startLine: 0, endLine: 1 },
        pattern: 'oldVal',
        replacement: 'newVal',
        flags: 'g',
        hasReplacement: true,
        previewLines: ['const newVal = 1;', 'return newVal;'],
        matches: [
          { line: 0, col: 6, length: 6, matchedText: 'oldVal', replacement: 'newVal' },
          { line: 1, col: 7, length: 6, matchedText: 'oldVal', replacement: 'newVal' },
        ],
      },
    });
    const props = createProps({ editorState: base, displayEditorState: base });
    render(<EditorViewport {...props} />);

    expect(screen.getAllByTestId('inccommand-replacement')).toHaveLength(2);
    expect(screen.getByTestId('inccommand-split-preview')).toBeInTheDocument();
    expect(screen.getByTestId('inccommand-split-row-1')).toHaveTextContent('const newVal = 1;');
    expect(screen.getByTestId('inccommand-split-row-2')).toHaveTextContent('return newVal;');
  });

  it(':match / matchadd() 커스텀 하이라이트 매치가 에디터 문자에 그룹 클래스로 렌더링된다', () => {
    const base = makeBaseState({
      lines: ['TODO: fix bug'],
      customMatches: [{ id: 1, group: 'Todo', pattern: 'TODO', priority: 10 }],
    });
    const props = createProps({ editorState: base, displayEditorState: base });
    const { container } = render(<EditorViewport {...props} />);
    expect(container.querySelectorAll('.custom-match-todo')).toHaveLength(4);
  });

  it(':set colorcolumn=10 및 :set cursorcolumn 시 세로 가이드선과 커서 열 셀을 렌더링한다', () => {
    const base = makeBaseState({
      lines: ['abcdefghijkl', '0123456789ab'],
      cursor: { line: 0, col: 3 },
      options: {
        number: true,
        relativenumber: false,
        ignorecase: false,
        smartcase: false,
        hlsearch: true,
        incsearch: true,
        wrap: true,
        cursorline: true,
        cursorcolumn: true,
        colorcolumn: '10',
        tabstop: 2,
        shiftwidth: 2,
        expandtab: true,
        list: false,
        wildmenu: true,
      },
    });
    const props = createProps({ editorState: base, displayEditorState: base });
    const { container } = render(<EditorViewport {...props} />);

    const editorEl = screen.getByTestId('editor-container');
    expect(editorEl).toHaveAttribute('data-cursorcolumn', 'true');
    expect(editorEl).toHaveAttribute('data-colorcolumn', '10');
    expect(screen.getAllByTestId('colorcolumn-guide-10')).toHaveLength(2);
    expect(container.querySelectorAll('.cursor-column-cell')).toHaveLength(1);
  });
});
