import { describe, it, expect } from 'vitest';
import {
  createVimState,
  sendKeys,
  computeGitBlameLines,
  getGitHunks,
  BUILTIN_SNIPPETS,
} from './index';

describe('nvim-autopairs (:set autopairs / :set ap)', () => {
  it('기본값은 off 여서 기존 순정 Vim 입력과 100% 동일하게 동작한다', () => {
    const state = sendKeys(createVimState(['']), 'i(<Esc>');
    expect(state.lines).toEqual(['(']);
  });

  it(':set autopairs 활성화 시 괄호·따옴표 자동 닫기와 닫는 문자 스킵이 동작한다', () => {
    let state = createVimState(['']);
    state = sendKeys(state, ':set autopairs<CR>');
    expect(state.options?.autopairs).toBe(true);

    // ( 입력 시 () 자동 생성 + 커서 중앙
    state = sendKeys(state, 'i(hello)');
    expect(state.lines).toEqual(['(hello)']);
    expect(state.cursor).toEqual({ line: 0, col: 7 });

    // 따옴표 자동 닫기 및 스킵
    state = sendKeys(state, ' "world"<Esc>');
    expect(state.lines).toEqual(['(hello) "world"']);
  });

  it('빈 쌍 사이에서 Backspace 누르면 양쪽 기호를 함께 삭제한다', () => {
    let state = createVimState(['']);
    state = sendKeys(state, ':set ap<CR>');
    state = sendKeys(state, 'i[<BS><Esc>');
    expect(state.lines).toEqual(['']);
  });

  it('{|} 사이에서 Enter 시 들여쓰기된 본문 줄을 생성하고 닫는 중괄호를 다음 줄로 내린다', () => {
    let state = createVimState(['  function run() ']);
    state = sendKeys(state, ':set autopairs<CR>');
    state = sendKeys(state, 'A{<CR>return 1;<Esc>');
    expect(state.lines).toEqual([
      '  function run() {',
      '    return 1;',
      '  }',
    ]);
  });

  it(':set noautopairs 로 다시 비활성화할 수 있다', () => {
    let state = createVimState(['']);
    state = sendKeys(state, ':set ap<CR>:set noap<CR>i{<Esc>');
    expect(state.lines).toEqual(['{']);
  });
});

describe('LuaSnip 스타일 스니펫 엔진 (<Tab> / <S-Tab> / :Snippets)', () => {
  it('내장 스니펫 목록을 :Snippets 커맨드로 조회할 수 있다', () => {
    const state = sendKeys(createVimState(['']), ':Snippets<CR>');
    expect(BUILTIN_SNIPPETS.length).toBeGreaterThanOrEqual(9);
    expect(state.commandMessage).toContain('fn<Tab>');
    expect(state.commandMessage).toContain('clg<Tab>');
  });

  it('fn<Tab> 확장 후 SELECT 모드에서 플레이스홀더를 치환하고 Tab 으로 다음 탭스톱 점프한다', () => {
    let state = createVimState(['']);
    state = sendKeys(state, 'ifn<Tab>');

    expect(state.mode).toBe('SELECT');
    expect(state.lines).toEqual([
      'function name(params) {',
      '  // body',
      '}',
    ]);
    expect(state.snippetSession?.trigger).toBe('fn');

    // $1(name) 치환 -> greet
    state = sendKeys(state, 'greet');
    expect(state.mode).toBe('INSERT');
    expect(state.lines[0]).toBe('function greet(params) {');

    // <Tab> 으로 $2(params) 점프 후 치환 -> user
    state = sendKeys(state, '<Tab>');
    expect(state.mode).toBe('SELECT');
    state = sendKeys(state, 'user');
    expect(state.lines[0]).toBe('function greet(user) {');

    // <Tab> 으로 $3(// body) 점프 후 치환 -> return user;
    state = sendKeys(state, '<Tab>return user;');
    expect(state.lines[1]).toBe('  return user;');

    // <Tab> 으로 $0(종료) 점프 -> INSERT 모드, 세션 종료
    state = sendKeys(state, '<Tab>');
    expect(state.mode).toBe('INSERT');
    expect(state.snippetSession).toBeNull();
  });

  it('<S-Tab> 으로 이전 탭스톱으로 되돌아가고 Escape 로 세션을 종료한다', () => {
    let state = createVimState(['']);
    state = sendKeys(state, 'iclg<Tab>');
    expect(state.mode).toBe('SELECT');
    expect(state.lines).toEqual(['console.log(value);']);

    // Escape 는 SELECT/INSERT 스니펫 세션을 종료하고 NORMAL 복귀
    state = sendKeys(state, '<Esc>');
    expect(state.mode).toBe('NORMAL');
    expect(state.snippetSession).toBeNull();

    // if<Tab> 후 $2 갔다가 <S-Tab> 으로 $1 복귀
    let state2 = createVimState(['']);
    state2 = sendKeys(state2, 'iif<Tab><Tab>');
    expect(state2.snippetSession?.currentIndex).toBe(1);
    state2 = sendKeys(state2, '<S-Tab>');
    expect(state2.snippetSession?.currentIndex).toBe(0);
    expect(state2.mode).toBe('SELECT');
  });
});

describe('vim-fugitive 미니 Git 워크플로 (:Git / :G / :Gstatus / :Gblame / :Glog)', () => {
  it(':Git status -> :Git add -> :Git commit -m -> :Glog 전체 워크플로가 동작한다', () => {
    let state = createVimState(['const a = 1;', 'const b = 2;']);
    // 초기 git 기준선 생성
    state = { ...state, primaryFilename: 'app.ts', gitBaseLines: ['const a = 1;', 'const b = 2;'] };

    // 깨끗한 상태 확인
    state = sendKeys(state, ':Gstatus<CR>');
    expect(state.commandMessage).toContain('clean');

    // 파일 수정
    state = sendKeys(state, 'ccconst a = 99;<Esc>');
    expect(getGitHunks(state).length).toBe(1);

    state = sendKeys(state, ':Git status<CR>');
    expect(state.commandMessage).toContain('unstaged');

    // 스테이징
    state = sendKeys(state, ':Git add<CR>');
    expect(state.gitStaged).toBe(true);

    // 커밋
    state = sendKeys(state, ':Git commit -m "feat: bump a to 99"<CR>');
    expect(state.gitStaged).toBe(false);
    expect(getGitHunks(state).length).toBe(0);
    expect(state.gitCommitLog?.[0]?.message).toBe('feat: bump a to 99');

    // 로그 확인
    state = sendKeys(state, ':Glog<CR>');
    expect(state.commandMessage).toContain('feat: bump a to 99');
  });

  it(':Gblame 이 인라인 Blame 가시성을 토글하고 수정 줄을 Not Committed Yet 으로 표시한다', () => {
    let state = createVimState(['const x = 1;', 'const y = 2;']);
    state = { ...state, primaryFilename: 'math.ts', gitBaseLines: ['const x = 1;', 'const y = 2;'] };

    state = sendKeys(state, 'jccconst y = 42;<Esc>');
    state = sendKeys(state, ':Gblame<CR>');
    expect(state.gitBlameVisible).toBe(true);

    const blame = computeGitBlameLines(state);
    expect(blame[0].uncommitted).toBe(false);
    expect(blame[1].uncommitted).toBe(true);
    expect(blame[1].author).toBe('Not Committed Yet');

    // 다시 :Gblame 실행 시 토글 해제
    state = sendKeys(state, ':Gblame<CR>');
    expect(state.gitBlameVisible).toBe(false);
  });

  it(':Git reset 으로 변경사항을 HEAD 기준선으로 되돌릴 수 있다', () => {
    let state = createVimState(['line 1', 'line 2']);
    state = { ...state, gitBaseLines: ['line 1', 'line 2'] };

    state = sendKeys(state, 'ccchanged<Esc>');
    expect(state.lines[0]).toBe('changed');

    state = sendKeys(state, ':Git reset<CR>');
    expect(state.lines).toEqual(['line 1', 'line 2']);
    expect(getGitHunks(state).length).toBe(0);
  });

  it('소문자 :g/pat/d (global) 명령은 대문자 :G (Git) 와 충돌하지 않는다', () => {
    const state = sendKeys(createVimState(['keep', 'drop me', 'keep2']), ':g/drop/d<CR>');
    expect(state.lines).toEqual(['keep', 'keep2']);
  });
});
