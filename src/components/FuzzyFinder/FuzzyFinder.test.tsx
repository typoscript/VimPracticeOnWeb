import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FuzzyFinder } from './FuzzyFinder';
import { createVimState, openFuzzyFinder, updateFuzzyFinderQuery } from '../../vim-engine';

describe('FuzzyFinder Component', () => {
  it('fuzzyFinder 가 없거나 닫혀 있으면 렌더링되지 않는다', () => {
    const state = createVimState(['hello world']);
    const { container } = render(
      <FuzzyFinder
        state={state}
        onSelectAction={() => {}}
        onClose={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('files 모드에서 가상 파일 목록과 검색어를 렌더링한다', () => {
    let state = createVimState(['line 1']);
    state = {
      ...state,
      virtualFiles: {
        'src/App.tsx': ['const App = () => null;'],
        'src/components/Header.tsx': ['const Header = () => null;'],
      },
    };
    state = openFuzzyFinder(state, 'files');

    const handleSelectAction = vi.fn();
    const handleClose = vi.fn();

    render(
      <FuzzyFinder
        state={state}
        onSelectAction={handleSelectAction}
        onClose={handleClose}
      />
    );

    expect(screen.getByText('FILES')).toBeInTheDocument();
    expect(screen.getByText('src/App.tsx')).toBeInTheDocument();
    expect(screen.getByText('src/components/Header.tsx')).toBeInTheDocument();
    expect(screen.getByText(/2 개/)).toBeInTheDocument();

    // 항목 클릭 시 open 액션 호출
    fireEvent.click(screen.getByText('src/App.tsx'));
    expect(handleSelectAction).toHaveBeenCalledWith('open');

    // backdrop 클릭 시 onClose 호출
    fireEvent.click(screen.getByTestId('fuzzy-finder-backdrop'));
    expect(handleClose).toHaveBeenCalled();
  });

  it('vsp 버튼 클릭 시 세로 분할 액션이 호출된다', () => {
    let state = createVimState(['line 1']);
    state = {
      ...state,
      virtualFiles: {
        'src/utils/math.ts': ['export const add = () => 0;'],
      },
    };
    state = openFuzzyFinder(state, 'files');

    const handleSelectAction = vi.fn();
    render(
      <FuzzyFinder
        state={state}
        onSelectAction={handleSelectAction}
        onClose={() => {}}
      />
    );

    const vspButton = screen.getByTitle('세로 분할');
    fireEvent.click(vspButton);
    expect(handleSelectAction).toHaveBeenCalledWith('vsplit');
  });

  it('buffers 모드에서 버퍼 목록을 올바르게 렌더링한다', () => {
    let state = createVimState(['line 1']);
    state = {
      ...state,
      buffers: [
        { id: 1, name: 'buf1.ts', lines: ['1'], cursor: { line: 0, col: 0 }, isModified: false },
        { id: 2, name: 'buf2.ts', lines: ['2'], cursor: { line: 0, col: 0 }, isModified: true },
      ],
    };
    state = openFuzzyFinder(state, 'buffers');
    state = updateFuzzyFinderQuery(state, 'buf2');

    render(
      <FuzzyFinder
        state={state}
        onSelectAction={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('BUFFERS')).toBeInTheDocument();
    expect(screen.getByText('buf2.ts')).toBeInTheDocument();
    expect(screen.getByText('[+]')).toBeInTheDocument();
  });
});
