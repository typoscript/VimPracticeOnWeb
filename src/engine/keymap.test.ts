import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';
import { VimEditorState } from '../types/vim';

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
});
