import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  VimEditorState,
  createVimState,
  handleKey,
  runExCommand,
  buildNeotreeNodes,
} from '../../vim-engine';
import { NeotreeSidebar } from './NeotreeSidebar';

describe('neo-tree.nvim 파일 트리 사이드바 (:Neotree / :NvimTreeToggle)', () => {
  it(':Neotree 명령으로 사이드바를 열고 a(생성)·r(이름변경)·d(삭제)·Enter(열기)·s(분할)를 키보드로 수행한다', () => {
    let state: VimEditorState = {
      ...createVimState(['export const app = "v1";']),
      primaryFilename: 'src/index.ts',
      virtualFiles: {
        'src/index.ts': ['export const app = "v1";'],
        'src/old.ts': ['export const msg = "hello";'],
        'src/removeMe.ts': ['export const dead = true;'],
      },
    };

    // 1. :Neotree 열기 -> src/index.ts 가 reveal 되어 선택됨
    state = runExCommand(state, 'Neotree');
    expect(state.neotree?.isOpen).toBe(true);
    expect(state.neotree?.isFocused).toBe(true);

    let nodes = buildNeotreeNodes(state);
    expect(nodes.map((n) => n.path)).toEqual([
      'src',
      'src/index.ts',
      'src/old.ts',
      'src/removeMe.ts',
    ]);
    expect(nodes[state.neotree!.selectedIndex].path).toBe('src/index.ts');

    // 2. a 키로 새 파일 src/utils.ts 생성
    for (const k of ['a', ...'utils.ts'.split(''), 'Enter']) {
      state = handleKey(state, k);
    }
    expect(state.virtualFiles?.['src/utils.ts']).toEqual(['']);

    // 3. src/removeMe.ts 로 이동해 d 로 삭제
    nodes = buildNeotreeNodes(state);
    const removeIdx = nodes.findIndex((n) => n.path === 'src/removeMe.ts');
    expect(removeIdx).toBeGreaterThan(0);
    while (state.neotree!.selectedIndex > removeIdx) {
      state = handleKey(state, 'k');
    }
    while (state.neotree!.selectedIndex < removeIdx) {
      state = handleKey(state, 'j');
    }
    state = handleKey(state, 'd');
    expect('src/removeMe.ts' in (state.virtualFiles ?? {})).toBe(false);

    // 4. src/old.ts 를 r 키로 src/newMsg.ts 로 이름 변경 후 Enter 로 열기
    nodes = buildNeotreeNodes(state);
    const oldIdx = nodes.findIndex((n) => n.path === 'src/old.ts');
    while (state.neotree!.selectedIndex > oldIdx) {
      state = handleKey(state, 'k');
    }
    while (state.neotree!.selectedIndex < oldIdx) {
      state = handleKey(state, 'j');
    }
    for (const k of ['r', ...'newMsg.ts'.split(''), 'Enter']) {
      state = handleKey(state, k);
    }
    expect('src/newMsg.ts' in (state.virtualFiles ?? {})).toBe(true);
    expect('src/old.ts' in (state.virtualFiles ?? {})).toBe(false);

    // Enter 로 파일 열기 -> 사이드바는 열린 채 포커스만 에디터로 이동
    state = handleKey(state, 'Enter');
    expect(state.primaryFilename).toBe('src/newMsg.ts');
    expect(state.lines).toEqual(['export const msg = "hello";']);
    expect(state.neotree?.isOpen).toBe(true);
    expect(state.neotree?.isFocused).toBe(false);
  });

  it('NeotreeSidebar 컴포넌트가 트리 노드·Git 상태 배지·인라인 프롬프트·클릭 액션을 렌더링한다', () => {
    let state: VimEditorState = {
      ...createVimState(['export const modified = true;']),
      primaryFilename: 'src/app.ts',
      gitBaseLines: ['export const modified = false;'],
      virtualFiles: {
        'src/app.ts': ['export const modified = true;'],
        'src/helper.ts': ['export const help = 1;'],
      },
    };
    state = runExCommand(state, 'Neotree');

    const onSelectIndex = vi.fn();
    const onOpenNode = vi.fn();
    const onToggleDir = vi.fn();
    const onStartAdd = vi.fn();
    const onStartRename = vi.fn();
    const onUpdatePrompt = vi.fn();
    const onConfirmPrompt = vi.fn();
    const onCancelPrompt = vi.fn();
    const onDeleteNode = vi.fn();
    const onFocusNeotree = vi.fn();
    const onClose = vi.fn();

    render(
      <NeotreeSidebar
        editorState={state}
        onSelectIndex={onSelectIndex}
        onOpenNode={onOpenNode}
        onToggleDir={onToggleDir}
        onStartAdd={onStartAdd}
        onStartRename={onStartRename}
        onUpdatePrompt={onUpdatePrompt}
        onConfirmPrompt={onConfirmPrompt}
        onCancelPrompt={onCancelPrompt}
        onDeleteNode={onDeleteNode}
        onFocusNeotree={onFocusNeotree}
        onClose={onClose}
      />
    );

    expect(screen.getByTestId('neotree-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('neotree-git-src/app.ts')).toHaveTextContent('M');

    fireEvent.click(screen.getByTestId('neotree-node-src/helper.ts'));
    expect(onOpenNode).toHaveBeenCalledWith(2, 'edit');

    fireEvent.click(screen.getByTestId('neotree-vsplit-src/helper.ts'));
    expect(onOpenNode).toHaveBeenCalledWith(2, 'vsplit');
  });
});
