import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createVimState, handleKey, executeCommandLine, getGitLineSigns } from '../../vim-engine';
import { WhichKeyPopup } from './WhichKeyPopup';
import { resolveWhichKeyData } from './whichKeyCatalog';
import { Editor } from '../Editor/Editor';
import { HarpoonMenu } from '../HarpoonMenu/HarpoonMenu';
import { TroublePanel } from '../TroublePanel/TroublePanel';
import { StatusBar } from '../StatusBar/StatusBar';

describe('which-key.nvim 스타일 실시간 키 가이드 팝업', () => {
  it('g / gr / z / ] / [ / Ctrl-w / d / di / Insert Ctrl-x 대기 시 적절한 후보 목록을 생성한다', () => {
    const base = createVimState(['function hello(a, b) {', '  return a + b;', '}']);

    const afterG = handleKey(base, 'g');
    const gData = resolveWhichKeyData(afterG);
    expect(gData?.prefix).toBe('g');
    expect(gData?.items.some((i) => i.key === 'r')).toBe(true);

    const afterGr = handleKey(afterG, 'r');
    const grData = resolveWhichKeyData(afterGr);
    expect(grData?.prefix).toBe('gr');
    expect(grData?.items.map((i) => i.key)).toContain('n');

    const afterBracket = handleKey(base, ']');
    const brData = resolveWhichKeyData(afterBracket);
    expect(brData?.items.some((i) => i.key === 'h')).toBe(true);
    expect(brData?.items.some((i) => i.key === 'f')).toBe(true);

    const afterDi = handleKey(handleKey(base, 'd'), 'i');
    const diData = resolveWhichKeyData(afterDi);
    expect(diData?.prefix).toBe('di');
    expect(diData?.items.some((i) => i.key === 'f')).toBe(true);
    expect(diData?.items.some((i) => i.key === 'a')).toBe(true);
    expect(diData?.items.some((i) => i.key === 'n')).toBe(true);
    expect(diData?.items.some((i) => i.key === 'l')).toBe(true);

    const afterDin = handleKey(afterDi, 'n');
    const dinData = resolveWhichKeyData(afterDin);
    expect(dinData?.prefix).toBe('din');
    expect(dinData?.items.some((i) => i.key === '"')).toBe(true);
    expect(dinData?.items.some((i) => i.key === '(')).toBe(true);

    const insertCtrlX = handleKey({ ...base, mode: 'INSERT' }, 'Ctrl-x');
    const cxData = resolveWhichKeyData(insertCtrlX);
    expect(cxData?.prefix).toBe('Ctrl-x');
    expect(cxData?.items.some((i) => i.key === 'Ctrl-v')).toBe(true);
    expect(cxData?.items.some((i) => i.key === 's')).toBe(true);
  });

  it('사용자 정의 :nmap <leader> 다중 키 매핑도 Which-Key 팝업에 동적 표시한다', () => {
    let s = createVimState(['hello']);
    s = executeCommandLine(s, ':nnoremap <leader>w :w<CR>', handleKey);
    s = executeCommandLine(s, ':nnoremap <leader>f :Files<CR>', handleKey);
    s = handleKey(s, ' '); // leader = Space

    const data = resolveWhichKeyData(s);
    expect(data?.prefix).toBe('<leader>');
    expect(data?.items.some((i) => i.key === 'w' && i.custom)).toBe(true);
    expect(data?.items.some((i) => i.key === 'f' && i.custom)).toBe(true);
  });

  it('WhichKeyPopup 렌더링·항목 클릭 키 전달·비활성화 동작을 검증한다', () => {
    const onPressKey = vi.fn();
    const onDisable = vi.fn();
    const state = handleKey(createVimState(['hello world']), ']');

    render(
      <WhichKeyPopup
        editorState={state}
        enabled={true}
        onPressKey={onPressKey}
        onDisable={onDisable}
      />
    );

    expect(screen.getByTestId('which-key-popup')).toBeInTheDocument();
    expect(screen.getByTestId('which-key-prefix')).toHaveTextContent(']');

    fireEvent.click(screen.getByTestId('which-key-item-h'));
    expect(onPressKey).toHaveBeenCalledWith('h');

    fireEvent.click(screen.getByTestId('which-key-disable-btn'));
    expect(onDisable).toHaveBeenCalledTimes(1);
  });

  it('Editor 에서 Gitsigns 거터 사인(+/~/_)과 인라인 Hunk 미리보기 팝업(Reset/Stage)을 렌더링한다', () => {
    const onReset = vi.fn();
    const onStage = vi.fn();
    let s = createVimState(
      ['const a = 2;', 'const b = 2;', 'const c = 3;'],
      { line: 0, col: 0 },
      { gitBaseLines: ['const a = 1;', 'const b = 2;'] }
    );
    s = executeCommandLine(s, ':Gitsigns preview_hunk', handleKey);
    const gitSigns = getGitLineSigns(s);

    render(
      <Editor
        lines={s.lines}
        cursor={s.cursor}
        mode={s.mode}
        gitLineSigns={gitSigns}
        gitHunkPreview={s.gitHunkPreview}
        onResetGitHunk={onReset}
        onStageGitHunk={onStage}
      />
    );

    expect(screen.getByTestId('git-sign-1')).toHaveTextContent('~');
    expect(screen.getByTestId('git-sign-3')).toHaveTextContent('+');
    expect(screen.getByTestId('git-hunk-preview-popup')).toBeInTheDocument();
    expect(screen.getByText('- const a = 1;')).toBeInTheDocument();
    expect(screen.getByText('+ const a = 2;')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('git-hunk-stage-btn'));
    expect(onStage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('git-hunk-reset-btn'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('Editor 에서 Flash 라벨 배지(flash-label-*)와 WhichKey gs 항목을 렌더링한다', () => {
    const base = createVimState(['const alpha = 1;', 'const beta = 2;']);
    const afterG = handleKey(base, 'g');
    const gData = resolveWhichKeyData(afterG);
    expect(gData?.items.some((i) => i.key === 's')).toBe(true);

    let s = handleKey(afterG, 's');
    s = handleKey(s, 'c');
    s = handleKey(s, 'o');
    expect(s.flashJump?.matches.length).toBe(2);

    render(
      <Editor
        lines={s.lines}
        cursor={s.cursor}
        mode={s.mode}
        flashJump={s.flashJump}
      />
    );

    const firstLabel = s.flashJump!.matches[0].label;
    const secondLabel = s.flashJump!.matches[1].label;
    expect(screen.getByTestId(`flash-label-${firstLabel}`)).toHaveTextContent(firstLabel);
    expect(screen.getByTestId(`flash-label-${secondLabel}`)).toHaveTextContent(secondLabel);
  });

  it('HarpoonMenu 팝업 렌더링·슬롯 클릭·닫기 및 StatusBar 핀 배지를 검증한다', () => {
    const onPressKey = vi.fn();
    let s = createVimState(['export const a = 1;'], { line: 0, col: 0 }, {
      primaryFilename: 'workspace/a.ts',
      virtualFiles: {
        'workspace/a.ts': ['export const a = 1;'],
        'workspace/b.ts': ['export const b = 2;'],
      },
    });
    s = executeCommandLine(s, ':HarpoonAdd', handleKey);
    s = executeCommandLine(s, ':HarpoonAdd workspace/b.ts', handleKey);
    s = executeCommandLine(s, ':HarpoonMenu', handleKey);

    render(
      <>
        <HarpoonMenu editorState={s} onPressKey={onPressKey} />
        <StatusBar mode={s.mode} cursor={s.cursor} harpoonSlot={1} />
      </>
    );

    expect(screen.getByTestId('harpoon-menu-panel')).toBeInTheDocument();
    expect(screen.getByTestId('harpoon-menu-count')).toHaveTextContent('2');
    expect(screen.getByTestId('status-harpoon-badge')).toHaveTextContent('[⚓ #1]');

    fireEvent.click(screen.getByTestId('harpoon-item-2'));
    expect(onPressKey).toHaveBeenCalledWith('2');

    fireEvent.click(screen.getByTestId('harpoon-menu-close'));
    expect(onPressKey).toHaveBeenCalledWith('Escape');
  });

  it('TroublePanel 트리 렌더링·모드 필터·점프·닫기와 다중 커서 Editor/StatusBar 렌더링을 검증한다', () => {
    const onJump = vi.fn();
    const onChangeMode = vi.fn();
    const onClose = vi.fn();

    let s = createVimState(['// TODO: fix bug', 'const foo = foo;'], { line: 1, col: 6 }, {
      primaryFilename: 'src/demo.ts',
    });
    s = executeCommandLine(s, ':Trouble todo', handleKey);
    s = handleKey(handleKey(s, 'g'), 'Ctrl-n');
    s = handleKey(s, 'Ctrl-n');

    render(
      <>
        <Editor lines={s.lines} cursor={s.cursor} mode={s.mode} multiCursor={s.multiCursor} />
        <StatusBar
          mode={s.mode}
          cursor={s.cursor}
          multiCursorInfo={{ count: 2, submode: 'select' }}
        />
        <TroublePanel
          state={s.troublePanel!}
          onJump={onJump}
          onChangeMode={onChangeMode}
          onClose={onClose}
        />
      </>
    );

    expect(screen.getByTestId('status-mode')).toHaveTextContent('-- MULTI (2) --');
    expect(screen.getAllByTestId('multi-cursor-selection').length).toBeGreaterThan(0);
    expect(screen.getByTestId('trouble-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('trouble-mode-diagnostics'));
    expect(onChangeMode).toHaveBeenCalledWith('diagnostics');

    fireEvent.click(screen.getByTestId('trouble-item-0'));
    expect(onJump).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByTestId('trouble-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
