import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';
import { VimEditorState } from './types';

describe('Vim Engine Custom Keymapping & Leader Key', () => {
  it('Insert 모드에서 jk 입력 시 직전 j를 제거하고 Normal 모드로 탈출한다', () => {
    let state: VimEditorState = {
      lines: [''],
      cursor: { line: 0, col: 0 },
      mode: 'INSERT',
      userKeymaps: { 'i:jk': '<Esc>' },
    };

    state = handleKey(state, 'j');
    expect(state.mode).toBe('INSERT');
    expect(state.lines[0]).toBe('j');
    expect(state.cursor.col).toBe(1);
    expect(state.pendingKeys).toBe('j');

    state = handleKey(state, 'k');
    expect(state.mode).toBe('NORMAL');
    expect(state.lines[0]).toBe('');
    expect(state.cursor.col).toBe(0);
    expect(state.pendingKeys).toBeUndefined();
  });

  it('Insert 모드에서 jj 입력 시 직전 j를 제거하고 Normal 모드로 탈출한다', () => {
    let state: VimEditorState = {
      lines: ['test '],
      cursor: { line: 0, col: 5 },
      mode: 'INSERT',
      userKeymaps: { 'i:jj': '<Esc>' },
    };

    state = handleKey(state, 'j');
    expect(state.lines[0]).toBe('test j');
    expect(state.pendingKeys).toBe('j');

    state = handleKey(state, 'j');
    expect(state.mode).toBe('NORMAL');
    expect(state.lines[0]).toBe('test ');
    expect(state.pendingKeys).toBeUndefined();
  });

  it('Insert 모드에서 매핑되지 않은 키 입력 시 일반 문자로 입력되고 pendingKeys가 해제된다', () => {
    let state: VimEditorState = {
      lines: [''],
      cursor: { line: 0, col: 0 },
      mode: 'INSERT',
      userKeymaps: { 'i:jk': '<Esc>' },
    };

    state = handleKey(state, 'j');
    expect(state.pendingKeys).toBe('j');

    state = handleKey(state, 'a');
    expect(state.mode).toBe('INSERT');
    expect(state.lines[0]).toBe('ja');
    expect(state.pendingKeys).toBeUndefined();
  });

  it('Insert 모드에서 Timeout 입력 시 대기 상태가 초기화된다', () => {
    let state: VimEditorState = {
      lines: [''],
      cursor: { line: 0, col: 0 },
      mode: 'INSERT',
      userKeymaps: { 'i:jk': '<Esc>' },
    };

    state = handleKey(state, 'j');
    expect(state.pendingKeys).toBe('j');

    state = handleKey(state, 'Timeout');
    expect(state.pendingKeys).toBeUndefined();
    expect(state.lines[0]).toBe('j');
  });

  it('Normal 모드에서 <Space>w (리더 키)로 빠른 저장(:w)이 실행된다', () => {
    let state: VimEditorState = {
      lines: ['hello world'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      leaderKey: ' ',
      userKeymaps: { 'n:<leader>w': ':w' },
    };

    state = handleKey(state, ' ');
    expect(state.pendingKeys).toBe('<leader>');

    state = handleKey(state, 'w');
    expect(state.mode).toBe('NORMAL');
    expect(state.pendingKeys).toBeUndefined();
    expect(state.commandMessage).toContain('가상 저장 완료');
  });

  it('Normal 모드에서 <Space>d (블랙홀 삭제) 매핑 시 "_d 가 실행된다', () => {
    let state: VimEditorState = {
      lines: ['first line', 'second line'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      clipboard: { type: 'text', content: 'preserved' },
      leaderKey: ' ',
      userKeymaps: { 'n:<leader>d': '"_d' },
    };

    state = handleKey(state, ' ');
    state = handleKey(state, 'd'); // "_d 실행 -> pendingKeys: 'd', activeRegister: '_'
    expect(state.activeRegister).toBe('_');

    state = handleKey(state, 'd'); // 한 줄 삭제 실행
    expect(state.lines).toEqual(['second line']);
    // 기존 클립보드 레지스터 내용이 덮어쓰여지지 않고 보존됨
    expect(state.clipboard?.content).toBe('preserved');
  });

  it('Normal 모드에서 H -> ^ (첫 비공백 문자), L -> $ (줄 끝) 매핑이 작동한다', () => {
    let state: VimEditorState = {
      lines: ['   hello world!'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      userKeymaps: { 'n:H': '^', 'n:L': '$' },
    };

    state = handleKey(state, 'H');
    expect(state.cursor.col).toBe(3); // 'h' 위치

    state = handleKey(state, 'L');
    expect(state.cursor.col).toBe(14); // '!' 위치
  });

  it('Normal 모드에서 Ctrl-h -> Ctrl-w h 로 분할 창 포커스 이동이 작동한다', () => {
    let state: VimEditorState = {
      lines: ['source'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      splitDirection: 'vertical',
      splitPanes: [
        { filename: 'source.ts', lines: ['source'], cursor: { line: 0, col: 0 }, mode: 'NORMAL' },
        { filename: 'target.ts', lines: ['target'], cursor: { line: 0, col: 0 }, mode: 'NORMAL' },
      ],
      activePaneIndex: 1, // 현재 오른쪽 창
      userKeymaps: { 'n:Ctrl-h': 'Ctrl-w h' },
    };

    state = handleKey(state, 'Ctrl-h');
    expect(state.activePaneIndex).toBe(0); // 왼쪽 창으로 포커스 이동
  });

  it(':imap 및 :nnoremap 커맨드로 런타임에 키매핑을 등록할 수 있다', () => {
    let state: VimEditorState = {
      lines: ['initial text'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    // :imap jk <Esc> 실행
    state = executeCommandLine(state, 'imap jk <Esc>');
    expect(state.userKeymaps?.['i:jk']).toBe('<Esc>');
    expect(state.commandMessage).toContain('[키매핑 등록]');

    // :nnoremap <leader>d "_d 실행
    state = executeCommandLine(state, 'nnoremap <leader>d "_d');
    expect(state.userKeymaps?.['n:<leader>d']).toBe('"_d');
  });

  it(':let mapleader = "\\" 커맨드로 리더 키를 변경할 수 있다', () => {
    let state: VimEditorState = {
      lines: ['sample'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = executeCommandLine(state, 'let mapleader = "\\"');
    expect(state.leaderKey).toBe('\\');
    expect(state.commandMessage).toContain('[리더 키 설정]');
  });

  it('<Cmd>...<CR> 매핑이 Normal·Insert·Visual 모드를 깨지 않고 Ex 명령을 실행한다', () => {
    let state: VimEditorState = {
      lines: ['line 1', 'line 2'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    // Normal: <Cmd> + 키 시퀀스 혼합 + <silent>
    state = executeCommandLine(state, 'nnoremap <silent> <leader>m <Cmd>let g:n1 = 10<CR>j<Cmd>let g:n2 = 20<CR>');
    state = handleKey(state, ' ');
    state = handleKey(state, 'm');
    expect(state.mode).toBe('NORMAL');
    expect(state.cursor.line).toBe(1);
    expect(state.globalVars?.n1).toBe(10);
    expect(state.globalVars?.n2).toBe(20);

    // Insert: <Cmd>w<CR> 실행 후에도 INSERT 모드와 커서 위치가 그대로 유지됨
    state = executeCommandLine(state, 'inoremap <C-s> <Cmd>let g:saved_in_insert = 1<CR>');
    state = handleKey(state, 'i');
    state = handleKey(state, 'X');
    expect(state.mode).toBe('INSERT');
    state = handleKey(state, 'Ctrl-s');
    expect(state.mode).toBe('INSERT');
    expect(state.globalVars?.saved_in_insert).toBe(1);
    state = handleKey(state, 'Y');
    expect(state.lines[1]).toBe('XYline 2');
    state = handleKey(state, 'Escape');

    // Visual: <Cmd> 실행 후에도 VISUAL 모드와 visualAnchor 가 그대로 유지됨
    state = executeCommandLine(state, 'xnoremap <leader>v <Cmd>let g:vis_hit = 1<CR>');
    state = handleKey(state, 'v');
    state = handleKey(state, 'l');
    const anchorBefore = { ...state.visualAnchor! };
    state = handleKey(state, ' ');
    state = handleKey(state, 'v');
    expect(state.mode).toBe('VISUAL');
    expect(state.visualAnchor).toEqual(anchorBefore);
    expect(state.globalVars?.vis_hit).toBe(1);
  });

  it('<unique> 수식어는 이미 존재하는 매핑 덮어쓰기를 E227 에러로 차단한다', () => {
    let state: VimEditorState = {
      lines: ['hello'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = executeCommandLine(state, 'nnoremap <unique> Q :let g:q = 1<CR>');
    expect(state.bell).toBeFalsy();
    expect(state.userKeymaps?.['n:Q']).toBe(':let g:q = 1<CR>');

    const dup = executeCommandLine(state, 'nnoremap <unique> Q :let g:q = 2<CR>');
    expect(dup.bell).toBe(true);
    expect(dup.commandMessage).toContain('E227');
    expect(dup.userKeymaps?.['n:Q']).toBe(':let g:q = 1<CR>');
  });

  it('<nowait> 수식어는 더 긴 접두 매핑이 있어도 대기하지 않고 즉시 실행한다', () => {
    let state: VimEditorState = {
      lines: ['alpha', 'beta'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    // 1. <nowait> 없이 짧은 매핑(,)과 긴 매핑(,a)이 공존 -> , 입력 시 대기 후 Timeout 에서 짧은 매핑 실행
    state = executeCommandLine(state, 'nnoremap ,a <Cmd>let g:hit = "long"<CR>');
    state = executeCommandLine(state, 'nnoremap , <Cmd>let g:hit = "short"<CR>');
    let waiting = handleKey(state, ',');
    expect(waiting.pendingKeymapPrefix).toBe(',');
    expect(waiting.globalVars?.hit).toBeUndefined();
    const afterLong = handleKey(waiting, 'a');
    expect(afterLong.globalVars?.hit).toBe('long');
    const afterTimeout = handleKey(waiting, 'Timeout');
    expect(afterTimeout.globalVars?.hit).toBe('short');

    // 2. <buffer> <nowait> 등록 시 , 입력 즉시 발화
    state = executeCommandLine(state, 'nnoremap <buffer> <nowait> , <Cmd>let g:hit = "nowait"<CR>');
    const immediate = handleKey(state, ',');
    expect(immediate.pendingKeymapPrefix).toBeUndefined();
    expect(immediate.globalVars?.hit).toBe('nowait');
  });

  it(':nmap {lhs} 단일 키 필터 조회와 <buffer> 필터 조회를 지원한다', () => {
    let state: VimEditorState = {
      lines: ['code'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = executeCommandLine(state, 'nnoremap <leader>w :w<CR>');
    state = executeCommandLine(state, 'nnoremap <leader>q :q<CR>');
    state = executeCommandLine(state, 'nnoremap <buffer> K <Cmd>let g:k = 1<CR>');

    const onlyW = executeCommandLine(state, 'nmap <leader>w');
    expect(onlyW.commandMessage).toContain('<leader>w');
    expect(onlyW.commandMessage).not.toContain('<leader>q');

    const bufOnly = executeCommandLine(state, 'nmap <buffer> K');
    expect(bufOnly.commandMessage).toContain('@K');

    const missing = executeCommandLine(state, 'nmap ZZZ');
    expect(missing.commandMessage).toContain('매핑을 찾을 수 없습니다');
  });

  it('Vimscript maparg() (문자열/딕셔너리/약어) 와 mapcheck() (접두어 조회) 를 지원한다', () => {
    let state: VimEditorState = {
      lines: ['text'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = executeCommandLine(state, 'nnoremap <buffer> <silent> <nowait> <leader>x <Cmd>w<CR>');
    state = executeCommandLine(state, 'iabbrev teh the');

    state = executeCommandLine(state, 'echo maparg("<leader>x", "n")');
    expect(state.commandMessage).toBe('<Cmd>w<CR>');

    state = executeCommandLine(state, 'let g:info = maparg("<leader>x", "n", 0, 1) | echo [g:info.rhs, g:info.silent, g:info.nowait, g:info.buffer, g:info.noremap]');
    expect(state.commandMessage).toBe("['<Cmd>w<CR>', 1, 1, 1, 1]");

    state = executeCommandLine(state, 'echo [maparg("teh", "i", 1), mapcheck("<leader>", "n"), maparg("nope", "n")]');
    expect(state.commandMessage).toBe("['the', '<Cmd>w<CR>', '']");
  });
});
