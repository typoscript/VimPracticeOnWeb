import { describe, it, expect } from 'vitest';
import { createVimState, handleKey } from './index';
import { executeCommandLine } from './commandLine';

function execEx(state: any, cmd: string) {
  return executeCommandLine(state, cmd, (s, k) => handleKey(s, k));
}

describe('Vim Pure Session Engine (:mksession, :source Session.vim)', () => {
  it(':mksession 기본 실행 시 Session.vim 파일이 생성되고 v:this_session 이 설정된다', () => {
    let state = createVimState(['const a = 1;', 'const b = 2;']);
    state = execEx(state, 'set nu');
    state = execEx(state, 'mksession');

    expect(state.commandMessage).toContain('"Session.vim" 세션이 저장되었습니다');
    expect(state.virtualFiles?.['Session.vim']).toBeDefined();
    expect(state.virtualFiles?.['Session.vim'].length).toBeGreaterThan(5);
    expect(state.globalVars?.['v:this_session']).toBe('Session.vim');
  });

  it('파일명 지정 (:mks custom.vim) 및 중복 저장 시 E139 에러와 ! 덮어쓰기를 지원한다', () => {
    let state = createVimState(['let x = 10']);
    state = execEx(state, 'mks custom.vim');
    expect(state.commandMessage).toContain('"custom.vim" 세션이 저장되었습니다');
    expect(state.virtualFiles?.['custom.vim']).toBeDefined();

    // 덮어쓰기 없이 재실행 시 E139 에러 발생 및 bell 울림
    state = execEx(state, 'mks custom.vim');
    expect(state.bell).toBe(true);
    expect(state.commandMessage).toContain('E139: 파일이 이미 존재합니다');

    // ! 를 붙이면 정상 덮어쓰기
    state = execEx(state, 'mks! custom.vim');
    expect(state.bell).toBeFalsy();
    expect(state.commandMessage).toContain('"custom.vim" 세션이 저장되었습니다');
  });

  it(':wincmd 명령어가 정상 동작한다 (wincmd w, 1wincmd w, wincmd v 등)', () => {
    let state = createVimState(['main buffer']);
    state = execEx(state, 'vsplit helper.ts');
    expect(state.splitDirection).toBe('vertical');
    expect(state.activePaneIndex).toBe(0);

    // 2wincmd w 로 두 번째 창 포커스
    state = execEx(state, '2wincmd w');
    expect(state.activePaneIndex).toBe(1);

    // 1wincmd w 로 첫 번째 창 포커스
    state = execEx(state, '1wincmd w');
    expect(state.activePaneIndex).toBe(0);

    // wincmd w 로 포커스 토글
    state = execEx(state, 'wincmd w');
    expect(state.activePaneIndex).toBe(1);
  });

  it(':badd 로 버퍼를 추가하면 현재 버퍼를 전환하지 않고 버퍼 목록에 등록된다', () => {
    let state = createVimState(['current file']);
    state = execEx(state, 'badd +5 another.ts');

    expect(state.primaryFilename).not.toBe('another.ts');
    expect(state.buffers?.some((b) => b.name === 'another.ts')).toBe(true);
    const added = state.buffers?.find((b) => b.name === 'another.ts');
    expect(added?.cursor.line).toBe(4);
  });

  it('복합 분할 창, 옵션, 레지스터, 커서 위치가 :source Session.vim 으로 완벽히 복원된다', () => {
    let state = createVimState(['first line in app.ts', 'second line']);
    state = { ...state, primaryFilename: 'app.ts' };

    // 1. 설정 변경 (:set nu, :set rnu, :set ic)
    state = execEx(state, 'set nu');
    state = execEx(state, 'set rnu');
    state = execEx(state, 'set ic');

    // 2. 레지스터 저장
    state = {
      ...state,
      registers: {
        ...(state.registers ?? {}),
        a: { type: 'char', content: 'saved_macro_a' },
      },
    };

    // 3. 수직 창 분할 및 보조 파일 편집
    state = execEx(state, 'vsplit utils.ts');
    state = execEx(state, '2wincmd w');
    expect(state.activePaneIndex).toBe(1);
    state = {
      ...state,
      lines: ['export const add = (a, b) => a + b;'],
      cursor: { line: 0, col: 13 },
    };

    // 4. 주 창으로 포커스 이동 후 커서 위치 조정
    state = execEx(state, '1wincmd w');
    expect(state.activePaneIndex).toBe(0);
    state = {
      ...state,
      cursor: { line: 1, col: 4 },
    };

    // 5. 세션 저장
    state = execEx(state, 'mksession! my_session.vim');
    expect(state.virtualFiles?.['my_session.vim']).toBeDefined();

    // 6. 에디터 상태를 임의로 초기화 (창 닫기, 옵션 끄기 등)
    let freshState = createVimState(['completely different content']);
    freshState = {
      ...freshState,
      virtualFiles: state.virtualFiles,
    };
    expect(freshState.splitDirection).toBeUndefined();
    expect(freshState.options?.number).toBeFalsy();

    // 7. 세션 복원 (:source my_session.vim)
    freshState = execEx(freshState, 'source my_session.vim');

    // 검증: 옵션 복원
    expect(freshState.options?.number).toBe(true);
    expect(freshState.options?.relativenumber).toBe(true);
    expect(freshState.options?.ignorecase).toBe(true);

    // 검증: 창 분할 상태 복원
    expect(freshState.splitDirection).toBe('vertical');
    expect(freshState.activePaneIndex).toBe(0);
    expect(freshState.primaryFilename).toBe('app.ts');
    expect(freshState.cursor.line).toBe(1);
    expect(freshState.cursor.col).toBe(4);

    // 검증: 보조 창 내용 및 레지스터 복원
    expect(freshState.splitPanes?.[1].lines[0]).toBe('export const add = (a, b) => a + b;');
    expect(freshState.registers?.a?.content).toBe('saved_macro_a');
    expect(freshState.commandMessage).toContain('"my_session.vim" 세션이 복원되었습니다');
  });

  it('외부 Vim 스타일의 스크립트도 라인별 Ex 명령으로 순차 실행되어 상태를 복원한다', () => {
    let state = createVimState(['blank']);
    const externalSessionLines = [
      'let SessionLoad = 1',
      'set nu',
      'set ic',
      'badd +1 file1.ts',
      'badd +1 file2.ts',
      'edit file1.ts',
      'vsplit file2.ts',
      '1wincmd w',
      'unlet SessionLoad',
    ];

    state = {
      ...state,
      virtualFiles: {
        'external.vim': externalSessionLines,
      },
    };

    state = execEx(state, 'so external.vim');

    expect(state.options?.number).toBe(true);
    expect(state.options?.ignorecase).toBe(true);
    expect(state.splitDirection).toBe('vertical');
    expect(state.activePaneIndex).toBe(0);
  });
});
