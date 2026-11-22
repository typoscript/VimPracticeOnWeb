import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  createVimState,
  handleKey,
  sendKeys,
  selectCmpCompletionCandidate,
} from '../../vim-engine';
import { Editor } from '../Editor/Editor';
import { NoiceCmdline } from './NoiceCmdline';
import App from '../../App';

describe('nvim-cmp 통합 자동완성 (Ctrl-Space: 스니펫 + LSP 심볼 + 버퍼 단어)', () => {
  it('Ctrl-Space 가 스니펫·LSP 심볼·버퍼 단어를 메타데이터와 함께 통합 제안하고 Enter 로 스니펫을 확장한다', () => {
    let state = createVimState([
      'function formatUser(name: string) { return name; }',
      'const fallbackValue = 42;',
      '',
    ]);
    state = sendKeys(state, '2jo');
    state = sendKeys(state, 'f');
    state = handleKey(state, 'Ctrl-Space');

    expect(state.completionSession?.type).toBe('cmp');
    expect(state.completionSession?.candidates).toContain('fn');
    expect(state.completionSession?.candidates).toContain('for');
    expect(state.completionSession?.candidates).toContain('formatUser');
    expect(state.completionSession?.candidates).toContain('fallbackValue');

    const fnIdx = state.completionSession!.candidates.indexOf('fn');
    expect(state.completionSession!.items?.[fnIdx]?.kind).toBe('Snippet');
    expect(state.completionSession!.items?.[fnIdx]?.preview?.length).toBeGreaterThan(0);

    const symIdx = state.completionSession!.candidates.indexOf('formatUser');
    expect(state.completionSession!.items?.[symIdx]?.kind).toBe('Function');

    // 첫 항목이 fn 스니펫이므로 Enter 확정 시 LuaSnip 템플릿이 확장되어 SELECT 모드 진입
    state = handleKey(state, 'Enter');
    expect(state.mode).toBe('SELECT');
    expect(state.lines.join('\n')).toContain('function name(params) {');
  });

  it('Ctrl-n 순환 중에도 nvim-cmp 메타데이터가 유지되고 클릭 선택 시 스니펫이 확장된다', () => {
    let state = createVimState(['const alpha = 1;', '']);
    state = sendKeys(state, 'j0i');
    state = handleKey(state, 'Ctrl-Space');
    expect(state.completionSession?.type).toBe('cmp');

    const prevItemsLen = state.completionSession!.items!.length;
    state = handleKey(state, 'Ctrl-n');
    expect(state.completionSession?.selectedIndex).toBe(1);
    expect(state.completionSession?.items?.length).toBe(prevItemsLen);

    // clg 스니펫을 인덱스로 직접 선택 확정
    const clgIdx = state.completionSession!.candidates.indexOf('clg');
    expect(clgIdx).toBeGreaterThanOrEqual(0);
    state = selectCmpCompletionCandidate(state, clgIdx);
    expect(state.mode).toBe('SELECT');
    expect(state.lines[1]).toBe('console.log(value);');
  });

  it('Editor 에서 nvim-cmp 종류 배지와 코드 미리보기 박스를 렌더링한다', () => {
    let state = createVimState(['function fetchUser() {}', '']);
    state = sendKeys(state, 'j0if');
    state = handleKey(state, 'Ctrl-Space');

    render(
      <Editor
        lines={state.lines}
        cursor={state.cursor}
        mode={state.mode}
        completionSession={state.completionSession}
      />
    );

    expect(screen.getByTestId('vim-completion-menu')).toHaveTextContent('[nvim-cmp]');
    expect(screen.getByTestId('cmp-kind-0')).toHaveTextContent('Snip');
    expect(screen.getByTestId('cmp-preview-box')).toBeInTheDocument();
  });
});

describe('noice.nvim 스타일 플로팅 커맨드라인 (:set cmdlinepopup / :set noice)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it(':set noice / :set nocmdlinepopup 옵션 토글 및 NoiceCmdline 플로팅 렌더링이 동작한다', async () => {
    let state = createVimState(['hello world']);
    expect(state.options?.cmdlinepopup).toBeFalsy();
    state = sendKeys(state, ':set noice<CR>');
    expect(state.options?.cmdlinepopup).toBe(true);
    state = sendKeys(state, ':set nonoice<CR>');
    expect(state.options?.cmdlinepopup).toBe(false);

    // 독립 컴포넌트 렌더링 검증
    render(
      <NoiceCmdline
        mode="COMMAND"
        commandType=":"
        commandBuffer="set number"
        wildmenu={{
          active: true,
          candidates: ['number', 'nu'],
          selectedIndex: 0,
          originalBuffer: 'set n',
          prefix: 'set ',
        }}
      />
    );
    expect(screen.getByTestId('noice-cmdline-popup')).toBeInTheDocument();
    expect(screen.getByTestId('noice-cmdline-text')).toHaveTextContent('set number');
    expect(screen.getByTestId('noice-wildmenu-list')).toHaveTextContent('number');

    // App Sandbox 에서 :set noice 칩 클릭 시 플로팅 커맨드라인이 표시됨
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByTestId('tab-sandbox-btn'));
    fireEvent.click(screen.getByTestId('sandbox-chip-noice'));
    expect(await screen.findAllByTestId('noice-cmdline-popup')).toBeTruthy();
    unmount();
  });
});
