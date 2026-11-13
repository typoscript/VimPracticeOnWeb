import { describe, it, expect } from 'vitest';
import { createVimState, handleKey } from './index';
import { executeCommandLine } from './commandLine';

function execEx(state: any, cmd: string) {
  return executeCommandLine(state, cmd, (s, k) => handleKey(s, k));
}

describe('Vim Pure Autocommand Engine (:autocmd, :augroup, :doautocmd)', () => {
  it(':autocmd 등록 후 목록 조회(:autocmd)가 정상 동작한다', () => {
    let state = createVimState(['hello world']);
    state = execEx(state, 'autocmd BufWritePost *.ts :let g:saved = 1');

    expect(state.autocmds).toBeDefined();
    expect(state.autocmds?.length).toBe(1);
    expect(state.autocmds?.[0].event).toBe('BufWritePost');
    expect(state.autocmds?.[0].pattern).toBe('*.ts');
    expect(state.autocmds?.[0].command).toBe('let g:saved = 1');

    // 목록 조회
    state = execEx(state, 'autocmd');
    expect(state.commandMessage).toContain('--- Auto-Commands ---');
    expect(state.commandMessage).toContain('BufWritePost');
    expect(state.commandMessage).toContain('*.ts');
  });

  it('파일 저장(:w) 시 BufWritePost 이벤트가 트리거되어 등록된 명령어가 자동 실행된다', () => {
    let state = createVimState(['const a = 1;']);
    state = { ...state, primaryFilename: 'app.ts' };

    state = execEx(state, 'autocmd BufWritePost *.ts :let g:saved_file = 1');
    expect(state.globalVars?.['saved_file']).toBeUndefined();

    // :w 저장 실행
    state = execEx(state, 'w');
    expect(state.globalVars?.['saved_file']).toBe(1);
  });

  it('파일 저장(:w) 직전 BufWritePre 이벤트로 끝 공백을 자동 치환할 수 있다', () => {
    let state = createVimState(['const a = 1;   ', 'const b = 2;  ']);
    state = { ...state, primaryFilename: 'app.ts' };

    state = execEx(state, 'autocmd BufWritePre * :%s/\\s\\+$//e');
    state = execEx(state, 'w');

    expect(state.lines).toEqual(['const a = 1;', 'const b = 2;']);
  });

  it('파일명 패턴 불일치 시 실행되지 않는다 (*.js vs app.ts)', () => {
    let state = createVimState(['const a = 1;']);
    state = { ...state, primaryFilename: 'app.ts' };

    state = execEx(state, 'autocmd BufWritePost *.js :let g:saved_js = 1');
    state = execEx(state, 'w');

    expect(state.globalVars?.['saved_js']).toBeUndefined();
  });

  it(':set ft=... 옵션 변경 시 FileType 이벤트가 트리거된다', () => {
    let state = createVimState(['def main(): pass']);
    state = execEx(state, 'autocmd FileType python :set sw=4');
    expect(state.options?.shiftwidth).not.toBe(4);

    // 파일타입 python 설정
    state = execEx(state, 'set ft=python');
    expect(state.options?.shiftwidth).toBe(4);
    expect(state.options?.filetype).toBe('python');
  });

  it(':augroup {name} ... :augroup END 및 :augroup! {name} 그룹 관리가 동작한다', () => {
    let state = createVimState(['line 1']);

    // 그룹 진입 후 등록
    state = execEx(state, 'augroup MyGroup');
    expect(state.activeAugroup).toBe('MyGroup');

    state = execEx(state, 'autocmd BufEnter * :let g:entered = 1');
    expect(state.autocmds?.[0].group).toBe('MyGroup');

    // augroup END 로 기본 그룹 복귀
    state = execEx(state, 'augroup END');
    expect(state.activeAugroup).toBeUndefined();

    // augroup! 로 해당 그룹 전체 삭제
    state = execEx(state, 'augroup! MyGroup');
    expect(state.autocmds?.length).toBe(0);
    expect(state.commandMessage).toContain('"MyGroup" 자동 명령 그룹이 삭제되었습니다');
  });

  it(':autocmd! 명령으로 특정 그룹이나 이벤트의 자동 명령을 일괄 삭제한다', () => {
    let state = createVimState(['test']);
    state = execEx(state, 'autocmd BufWritePost * :let g:a = 1');
    state = execEx(state, 'autocmd InsertEnter * :let g:b = 1');
    expect(state.autocmds?.length).toBe(2);

    // BufWritePost 만 삭제
    state = execEx(state, 'autocmd! BufWritePost');
    expect(state.autocmds?.length).toBe(1);
    expect(state.autocmds?.[0].event).toBe('InsertEnter');

    // 전체 삭제
    state = execEx(state, 'autocmd!');
    expect(state.autocmds?.length).toBe(0);
  });

  it('InsertEnter / InsertLeave 이벤트가 실시간 키 입력(i, Esc) 시 자동 트리거된다', () => {
    let state = createVimState(['text line']);
    state = execEx(state, 'autocmd InsertEnter * :set nu');
    state = execEx(state, 'autocmd InsertLeave * :set nonu');

    expect(state.options?.number).toBeFalsy();

    // i 입력 -> INSERT 모드 진입 (InsertEnter 트리거)
    state = handleKey(state, 'i');
    expect(state.mode).toBe('INSERT');
    expect(state.options?.number).toBe(true);

    // Escape 입력 -> NORMAL 모드 복귀 (InsertLeave 트리거)
    state = handleKey(state, 'Escape');
    expect(state.mode).toBe('NORMAL');
    expect(state.options?.number).toBe(false);
  });

  it('CursorMoved 이벤트가 커서 이동 키(j, k, l 등) 시 자동 트리거된다', () => {
    let state = createVimState(['line 1', 'line 2', 'line 3']);
    state = execEx(state, 'autocmd CursorMoved * :let g:cursor_moved = 1');

    expect(state.globalVars?.['cursor_moved']).toBeUndefined();

    // j 키로 한 줄 아래로 이동
    state = handleKey(state, 'j');
    expect(state.cursor.line).toBe(1);
    expect(state.globalVars?.['cursor_moved']).toBe(1);
  });

  it(':doautocmd 명령으로 특정 이벤트를 수동으로 강제 트리거할 수 있다', () => {
    let state = createVimState(['hello']);
    state = execEx(state, 'autocmd User TestEvent :let g:manual = 42');
    expect(state.globalVars?.['manual']).toBeUndefined();

    // :doautocmd User TestEvent
    state = execEx(state, 'doautocmd User TestEvent');
    expect(state.globalVars?.['manual']).toBe(42);
  });

  it('쉼표로 연결된 다중 이벤트(BufRead,BufNewFile) 및 다중 확장자(*.ts,*.js) 등록을 지원한다', () => {
    let state = createVimState(['code']);
    state = execEx(state, 'autocmd BufRead,BufWritePost *.ts,*.tsx :let g:multi = 1');

    expect(state.autocmds?.length).toBe(2);
    expect(state.autocmds?.[0].event).toBe('BufReadPost');
    expect(state.autocmds?.[1].event).toBe('BufWritePost');
  });

  it('재귀적 autocmd 실행 시 최대 깊이 제한(5)으로 무한 루프를 방지한다', () => {
    let state = createVimState(['loop']);
    // BufWritePost 에서 다시 :w 를 호출하는 재귀 autocmd
    state = execEx(state, 'autocmd BufWritePost * :w');

    // 무한 루프로 멈추지 않고 안전하게 종료되어야 함
    expect(() => {
      state = execEx(state, 'w');
    }).not.toThrow();
  });
});
