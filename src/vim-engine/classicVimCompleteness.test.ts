import { describe, it, expect } from 'vitest';
import {
  createVimState,
  handleKey,
  executeCommandLine,
  configureVimEngine,
} from './index';

function runKeys(state: ReturnType<typeof createVimState>, keys: string[]) {
  let s = state;
  for (const k of keys) {
    s = handleKey(s, k);
  }
  return s;
}

function runEx(state: ReturnType<typeof createVimState>, cmd: string) {
  return executeCommandLine(state, cmd, handleKey);
}

describe('순정 Vim 100% 완성 패치 — 노멀·Ex 기본 문법', () => {
  it('X / [count]X 는 커서 앞(왼쪽)의 글자를 삭제하고 레지스터·도트 반복·Undo 와 연동한다', () => {
    let s = createVimState(['abcdef'], { line: 0, col: 4 });
    s = handleKey(s, 'X');
    expect(s.lines).toEqual(['abcef']);
    expect(s.cursor).toEqual({ line: 0, col: 3 });
    expect(s.registers?.['"']?.content).toBe('d');

    // 도트 반복 (.)
    s = handleKey(s, '.');
    expect(s.lines).toEqual(['abef']);
    expect(s.cursor).toEqual({ line: 0, col: 2 });

    // [count]X
    s = runKeys(createVimState(['0123456'], { line: 0, col: 5 }), ['3', 'X']);
    expect(s.lines).toEqual(['0156']);
    expect(s.cursor).toEqual({ line: 0, col: 2 });

    // Undo 복원
    s = handleKey(s, 'u');
    expect(s.lines).toEqual(['0123456']);

    // col === 0 에서는 no-op
    const atZero = handleKey(createVimState(['abc'], { line: 0, col: 0 }), 'X');
    expect(atZero.lines).toEqual(['abc']);
    expect(atZero.cursor).toEqual({ line: 0, col: 0 });
  });

  it('U 는 현재 줄의 여러 편집을 원래 내용으로 한 번에 되돌리고 다시 U 를 누르면 토글한다', () => {
    let s = createVimState(['hello world', 'second line'], { line: 0, col: 0 });
    // 한 줄에 여러 번 편집 수행
    s = runKeys(s, ['x', 'x', 'i', 'H', 'I', 'Escape']);
    expect(s.lines[0]).toBe('HIllo world');

    // U 1회: 편집 전 원문 복구
    s = handleKey(s, 'U');
    expect(s.lines[0]).toBe('hello world');
    expect(s.lines[1]).toBe('second line');

    // U 2회: 직전 편집 상태로 토글 복귀
    s = handleKey(s, 'U');
    expect(s.lines[0]).toBe('HIllo world');

    // u 로도 U 동작 취소 가능
    s = handleKey(s, 'u');
    expect(s.lines[0]).toBe('hello world');

    // 다른 줄을 편집하면 스냅샷이 그 줄로 전환됨
    s = runKeys(s, ['j', 'x', 'x']);
    expect(s.lines[1]).toBe('cond line');
    s = handleKey(s, 'U');
    expect(s.lines[1]).toBe('second line');
  });

  it('Q 는 마지막 녹화/재생한 매크로를 즉시 재실행하고 [count]Q 를 지원한다', () => {
    let s = createVimState(['alpha', 'beta', 'gamma', 'delta'], { line: 0, col: 0 });
    // qa 로 현재 줄 끝에 ! 추가 후 다음 줄로 이동 녹화
    s = runKeys(s, ['q', 'a', 'A', '!', 'Escape', 'j', 'q']);
    expect(s.lines[0]).toBe('alpha!');
    expect(s.cursor.line).toBe(1);

    // Q 로 방금 녹화한 매크로 재실행
    s = handleKey(s, 'Q');
    expect(s.lines[1]).toBe('beta!');
    expect(s.cursor.line).toBe(2);

    // 2Q 로 남은 2줄 일괄 적용
    s = runKeys(s, ['2', 'Q']);
    expect(s.lines).toEqual(['alpha!', 'beta!', 'gamma!', 'delta!']);

    // 녹화된 매크로가 전혀 없으면 bell
    const empty = handleKey(createVimState(['one'], { line: 0, col: 0 }), 'Q');
    expect(empty.bell).toBe(true);
  });

  it('Ex 세미콜론 범위(;)는 첫 주소로 커서를 옮긴 뒤 둘째 주소를 상대 평가한다', () => {
    const base = createVimState(
      ['line1', 'BEGIN', 'bodyA', 'bodyB', 'END', 'tail'],
      { line: 0, col: 0 }
    );

    // :2;.+2d -> 2번째 줄(BEGIN)로 이동 후 .+2(4번째 줄 bodyB)까지 삭제
    const r1 = runEx(base, ':2;.+2d');
    expect(r1.lines).toEqual(['line1', 'END', 'tail']);

    // :/BEGIN/;/END/d -> BEGIN 줄부터 그 이후 첫 END 줄까지 삭제
    const r2 = runEx(base, ':/BEGIN/;/END/d');
    expect(r2.lines).toEqual(['line1', 'tail']);

    // 연쇄 세미콜론 범위: :/SEC2/;/START/;/END/d
    const multi = createVimState(
      ['SEC1', 'START', 'keep', 'END', 'SEC2', 'START', 'drop', 'END', 'footer'],
      { line: 0, col: 0 }
    );
    const r3 = runEx(multi, ':/SEC2/;/START/;/END/d');
    expect(r3.lines).toEqual(['SEC1', 'START', 'keep', 'END', 'SEC2', 'footer']);
  });

  it(':keepjumps / :keepmarks / :lockmarks 모디파이어가 점프 리스트와 마크를 보존한다', () => {
    let s = createVimState(['aaa', 'bbb', 'ccc', 'ddd', 'eee'], { line: 0, col: 0 });
    // 마크 a 를 1행에, 점프를 2행에 기록
    s = runKeys(s, ['m', 'a']);
    const origMarks = s.marks;
    const origJumpList = s.jumpList;
    const origLastJump = s.lastJumpPos;

    // :keepjumps 5 -> 커서는 이동하지만 jumpList / lastJumpPos 보존
    s = runEx(s, ':keepjumps 5');
    expect(s.cursor.line).toBe(4);
    expect(s.jumpList).toEqual(origJumpList);
    expect(s.lastJumpPos).toEqual(origLastJump);

    // :keepmarks mark a -> 마크가 덮어씌워지지 않고 보존됨
    s = runEx(s, ':keepmarks mark a');
    expect(s.marks).toEqual(origMarks);

    // :lockmarks s/eee/EEE/ -> lastBracketMarks / marks 보존
    const beforeLockMarks = s.marks;
    s = runEx(s, ':lockmarks s/eee/EEE/');
    expect(s.lines[4]).toBe('EEE');
    expect(s.marks).toEqual(beforeLockMarks);
  });

  it('_ 모션([count]_, d_, c_, y_, Visual _) 및 g^ 모션(g^, dg^, cg^, yg^, Visual g^)이 동작한다', () => {
    let s = createVimState(['  first', '    second', '  third'], { line: 0, col: 5 });
    // 단독 _ : 현재 줄 첫 비공백(col 2)
    s = handleKey(s, '_');
    expect(s.cursor).toEqual({ line: 0, col: 2 });

    // 2_ : 1줄 아래(line 1) 첫 비공백(col 4)
    s = runKeys(s, ['2', '_']);
    expect(s.cursor).toEqual({ line: 1, col: 4 });

    // d_ : 현재 줄 삭제 (dd 와 동일)
    s = runKeys(s, ['d', '_']);
    expect(s.lines).toEqual(['  first', '  third']);

    // 2d_ : 2줄 삭제
    let s2 = createVimState(['  a', '  b', '  c'], { line: 0, col: 0 });
    s2 = runKeys(s2, ['2', 'd', '_']);
    expect(s2.lines).toEqual(['  c']);

    // g^ 및 dg^
    let s3 = createVimState(['   hello world'], { line: 0, col: 9 });
    s3 = runKeys(s3, ['g', '^']);
    expect(s3.cursor).toEqual({ line: 0, col: 3 });
    let s4 = createVimState(['   hello world'], { line: 0, col: 9 });
    s4 = runKeys(s4, ['d', 'g', '^']);
    expect(s4.lines).toEqual(['   world']);
  });

  it('[count]s / [count]S / [count]Y / [count]D / [count]C 및 [count]i/a/I/A/o/O 반복 삽입이 동작한다', () => {
    // 3s: 3글자 지우고 입력
    let s = createVimState(['abcdef'], { line: 0, col: 1 });
    s = runKeys(s, ['3', 's', 'X', 'Escape']);
    expect(s.lines).toEqual(['aXef']);

    // 2S: 2줄을 비우고 입력
    let s2 = createVimState(['line1', 'line2', 'line3'], { line: 0, col: 0 });
    s2 = runKeys(s2, ['2', 'S', ...'merged'.split(''), 'Escape']);
    expect(s2.lines).toEqual(['merged', 'line3']);

    // 2Y: 2줄 복사 후 p
    let s3 = createVimState(['one', 'two', 'three'], { line: 0, col: 0 });
    s3 = runKeys(s3, ['2', 'Y', 'G', 'p']);
    expect(s3.lines).toEqual(['one', 'two', 'three', 'one', 'two']);

    // 2D: 현재 커서부터 2번째 줄 끝까지 삭제
    let s4 = createVimState(['hello world', 'second line', 'third'], { line: 0, col: 5 });
    s4 = runKeys(s4, ['2', 'D']);
    expect(s4.lines).toEqual(['hello', 'third']);

    // 2C: 현재 커서부터 2번째 줄 끝까지 변경
    let s5 = createVimState(['hello world', 'second line', 'third'], { line: 0, col: 5 });
    s5 = runKeys(s5, ['2', 'C', '!', 'Escape']);
    expect(s5.lines).toEqual(['hello!', 'third']);

    // 3iab<Esc> -> ababab, 4A!<Esc> -> !!!!, 3oitem<Esc> -> 3줄 추가
    let s6 = createVimState(['start'], { line: 0, col: 0 });
    s6 = runKeys(s6, ['3', 'i', 'a', 'b', 'Escape']);
    expect(s6.lines).toEqual(['abababstart']);
    s6 = runKeys(s6, ['4', 'A', '!', 'Escape']);
    expect(s6.lines).toEqual(['abababstart!!!!']);
    s6 = runKeys(s6, ['3', 'o', 'r', 'o', 'w', 'Escape']);
    expect(s6.lines).toEqual(['abababstart!!!!', 'row', 'row', 'row']);
  });

  it("대괄호 탐색 모션(]' / [' / ]` / [`, [/ / ]/ / [* / ]*, [i / ]i / [I / ]I)이 동작한다", () => {
    // 1) 소문자 마크 순회 (]' / [' / ]` / [`)
    let s = createVimState(['  line0', '  line1', '  line2', '  line3'], { line: 1, col: 4 });
    s = runKeys(s, ['m', 'a', '2', 'j', 'l', 'm', 'b', 'g', 'g']);
    // ]' -> 마크 a 줄의 첫 비공백(line 1, col 2)
    s = runKeys(s, [']', "'"]);
    expect(s.cursor).toEqual({ line: 1, col: 2 });
    // ]` -> 현재 위치(1,2) 뒤의 첫 문자 마크 a(1,4), 한 번 더 누르면 마크 b(3,5)
    s = runKeys(s, [']', '`']);
    expect(s.cursor).toEqual({ line: 1, col: 4 });
    s = runKeys(s, [']', '`']);
    expect(s.cursor).toEqual({ line: 3, col: 5 });
    // [` -> 이전 마크 a 의 정확한 열(line 1, col 4)
    s = runKeys(s, ['[', '`']);
    expect(s.cursor).toEqual({ line: 1, col: 4 });
    // ]' 후 [' -> 이전 마크 a 줄의 첫 비공백(line 1, col 2)
    s = runKeys(s, [']', "'", '[', "'"]);
    expect(s.cursor).toEqual({ line: 1, col: 2 });

    // 2) 블록 주석 경계 ([/ / ]/ / [* / ]*)
    let sc = createVimState(['/* header', ' * body', ' */', 'const x = 1;'], { line: 1, col: 3 });
    sc = runKeys(sc, ['[', '/']);
    expect(sc.cursor).toEqual({ line: 0, col: 0 });
    sc = runKeys(sc, [']', '/']);
    expect(sc.cursor).toEqual({ line: 2, col: 1 });

    // 3) 키워드 줄 조회 ([i / ]i / [I)
    let si = createVimState(
      ['const token = 1;', 'const other = 2;', 'return token + 1;'],
      { line: 0, col: 6 }
    );
    si = runKeys(si, ['[', 'i']);
    expect(si.commandMessage).toBe('const token = 1;');
    si = runKeys(si, [']', 'i']);
    expect(si.commandMessage).toBe('return token + 1;');
    si = runKeys(si, ['[', 'I']);
    expect(si.commandMessage).toContain('1: const token = 1;');
    expect(si.commandMessage).toContain('3: return token + 1;');
  });
});

describe('순정 Vim 100% 완성 패치 — Vimscript 확장 문법', () => {
  it('부동소수점 리터럴·연산·수학 내장 함수(float2nr/round/floor/ceil/sqrt/pow/fmod/str2float)를 지원한다', () => {
    let s = createVimState(['hello'], { line: 0, col: 0 });
    s = runEx(s, ':let g:pi = 3.14');
    s = runEx(s, ':let g:sci = 1.5e-2');
    s = runEx(s, ':let g:divFloat = 7.0 / 2');
    s = runEx(s, ':let g:divInt = 7 / 2');
    s = runEx(s, ':let g:f2n = float2nr(3.9)');
    s = runEx(s, ':let g:rnd = round(2.6)');
    s = runEx(s, ':let g:flr = floor(2.9)');
    s = runEx(s, ':let g:cl = ceil(2.1)');
    s = runEx(s, ':let g:sq = sqrt(9.0)');
    s = runEx(s, ':let g:pw = pow(2, 3)');
    s = runEx(s, ':let g:fm = fmod(5.5, 2.0)');
    s = runEx(s, ':let g:s2f = str2float("2.75")');
    s = runEx(s, ':let g:tf = type(3.14)');
    s = runEx(s, ':let g:cat = 1 . 2');
    s = runEx(s, ':let g:d = {"key": 99} | let g:dk = g:d.key');

    expect(s.globalVars?.pi).toBeCloseTo(3.14);
    expect(s.globalVars?.sci).toBeCloseTo(0.015);
    expect(s.globalVars?.divFloat).toBeCloseTo(3.5);
    expect(s.globalVars?.divInt).toBe(3);
    expect(s.globalVars?.f2n).toBe(3);
    expect(s.globalVars?.rnd).toBe(3);
    expect(s.globalVars?.flr).toBe(2);
    expect(s.globalVars?.cl).toBe(3);
    expect(s.globalVars?.sq).toBe(3);
    expect(s.globalVars?.pw).toBe(8);
    expect(s.globalVars?.fm).toBeCloseTo(1.5);
    expect(s.globalVars?.s2f).toBeCloseTo(2.75);
    expect(s.globalVars?.tf).toBe(5);
    expect(s.globalVars?.cat).toBe('12');
    expect(s.globalVars?.dk).toBe(99);
  });

  it(':function 의 dict / closure 속성을 파싱·보존하고 시그니처에 표시한다', () => {
    let s = createVimState([
      'function! Greet() dict closure',
      '  return "hi " . self.name',
      'endfunction',
    ], { line: 0, col: 0 });
    s = runEx(s, ':source %');
    expect(s.userFunctions?.Greet?.dict).toBe(true);
    expect(s.userFunctions?.Greet?.closure).toBe(true);

    s = runEx(s, ':function Greet');
    expect(s.commandMessage).toContain('function Greet() dict closure');

    s = runEx(s, ':let g:obj = {"name": "Vim", "greet": function("Greet")}');
    s = runEx(s, ':let g:res = g:obj.greet()');
    expect(s.globalVars?.res).toBe('hi Vim');
  });

  it(':const 및 :lockvar / :unlockvar 가 불변·잠금 규칙(E46 / E741)을 강제한다', () => {
    let s = createVimState([''], { line: 0, col: 0 });
    s = runEx(s, ':const g:MAX = 100');
    expect(s.globalVars?.MAX).toBe(100);

    // :const 변수 재대입은 E46 실패
    const failConst = runEx(s, ':let g:MAX = 200');
    expect(failConst.bell).toBe(true);
    expect(failConst.commandMessage).toContain('E46');
    expect(failConst.globalVars?.MAX).toBe(100);

    // :lockvar / :unlockvar
    s = runEx(s, ':let g:val = 10');
    s = runEx(s, ':lockvar g:val');
    const failLock = runEx(s, ':let g:val = 20');
    expect(failLock.bell).toBe(true);
    expect(failLock.commandMessage).toContain('E741');
    expect(failLock.globalVars?.val).toBe(10);

    s = runEx(s, ':unlockvar g:val');
    s = runEx(s, ':let g:val = 30');
    expect(s.bell).toBeFalsy();
    expect(s.globalVars?.val).toBe(30);
  });

  it(':echoerr / :echon / :echohl 을 정확히 처리한다', () => {
    let s = createVimState([''], { line: 0, col: 0 });
    s = runEx(s, ':echohl ErrorMsg');
    expect(s.lastEchoHl).toBe('ErrorMsg');

    // :echo + :echon 은 줄바꿈/공백 없이 이어붙임
    s = runEx(s, ':echo "Hello" | echon ", " "Vim!"');
    expect(s.commandMessage).toBe('Hello, Vim!');

    // :echoerr 는 에러 메시지·이력 기록 및 bell 발생, try/catch 로 포착 가능
    const errRes = runEx(s, ':echoerr "boom!"');
    expect(errRes.bell).toBe(true);
    expect(errRes.commandMessage).toBe('boom!');
    expect(errRes.messageHistory?.includes('boom!')).toBe(true);

    const caught = runEx(s, ':try | echoerr "caught_err" | catch /caught_err/ | let g:hit = v:exception | endtry');
    expect(caught.bell).toBeFalsy();
    expect(caught.globalVars?.hit).toBe('caught_err');
  });

  it('Heredoc (:let/:const var =<< [trim] END ... END) 를 :source 및 함수 본문에서 지원한다', () => {
    let s = createVimState([
      'let g:raw =<< END',
      '  first line',
      '    second line',
      'END',
      'const g:trimmed =<< trim EOF',
      '    alpha',
      '      beta',
      '    gamma',
      'EOF',
    ], { line: 0, col: 0 });

    s = runEx(s, ':source %');
    expect(s.globalVars?.raw).toEqual(['  first line', '    second line']);
    expect(s.globalVars?.trimmed).toEqual(['alpha', '  beta', 'gamma']);

    // const heredoc 은 수정 불가
    const mutateTrimmed = runEx(s, ':let g:trimmed = []');
    expect(mutateTrimmed.bell).toBe(true);
    expect(mutateTrimmed.commandMessage).toContain('E46');
  });
});

describe('순정 Vim 100% 완성 패치 — 키매핑 확장 & Insert Ctrl-x / 0 Ctrl-d', () => {
  it(':smap / :snoremap / :sunmap / :smapclear 가 Select 모드에서 동작한다', () => {
    let s = createVimState(['hello world'], { line: 0, col: 0 });
    s = runEx(s, ':snoremap <silent> <C-k> <Esc>');

    // gh 로 Select 모드 진입 후 Ctrl-k 누르면 <Esc> 로 노멀 복귀
    s = runKeys(s, ['g', 'h']);
    expect(s.mode).toBe('SELECT');
    s = handleKey(s, 'Ctrl-k');
    expect(s.mode).toBe('NORMAL');

    // :sunmap 해제 후 목록 비어 있음
    s = runEx(s, ':sunmap <C-k>');
    s = runEx(s, ':smap');
    expect(s.commandMessage).toContain('Select');

    // :smapclear 로 Select 매핑만 일괄 초기화
    s = runEx(s, ':smap a b');
    s = runEx(s, ':nmap x y');
    s = runEx(s, ':smapclear');
    expect(s.userKeymaps?.['s:a']).toBeUndefined();
    expect(s.userKeymaps?.['n:x']).toBe('y');
  });

  it(':map! / :noremap! / :unmap! / :mapclear! 가 Insert 와 Command-line 모드 양쪽에 동시에 적용된다', () => {
    let s = createVimState(['hello'], { line: 0, col: 0 });
    s = runEx(s, ':noremap! ;; <Esc>');
    expect(s.userKeymaps?.['i:;;']).toBe('<Esc>');
    expect(s.userKeymaps?.['c:;;']).toBe('<Esc>');
    expect(s.userKeymaps?.['n:;;']).toBeUndefined();

    // Insert 모드에서 ;; -> Normal 복귀
    s = runKeys(s, ['i', ';', ';']);
    expect(s.mode).toBe('NORMAL');
    expect(s.lines[0]).toBe('hello');

    // :unmap! 로 양쪽 동시 해제
    s = runEx(s, ':unmap! ;;');
    expect(s.userKeymaps?.['i:;;']).toBeUndefined();
    expect(s.userKeymaps?.['c:;;']).toBeUndefined();

    // :mapclear! 로 i/c 매핑만 일괄 삭제 (n 매핑 보존)
    s = runEx(s, ':nmap q w');
    s = runEx(s, ':map! zz <Esc>');
    s = runEx(s, ':mapclear!');
    expect(s.userKeymaps?.['i:zz']).toBeUndefined();
    expect(s.userKeymaps?.['c:zz']).toBeUndefined();
    expect(s.userKeymaps?.['n:q']).toBe('w');
  });

  it('Insert Ctrl-x Ctrl-v (Vim 명령/함수 완성) 와 Ctrl-x s (맞춤법 추천 완성) 가 동작한다', () => {
    // Ctrl-x Ctrl-v: 'float2' -> 'float2nr'
    let s = createVimState(['float2'], { line: 0, col: 6 });
    s = { ...s, mode: 'INSERT' };
    s = runKeys(s, ['Ctrl-x', 'Ctrl-v']);
    expect(s.completionSession?.type).toBe('vim');
    expect(s.lines[0]).toBe('float2nr');

    // Ctrl-x s: 오탈자 'helo' -> 맞춤법 추천 목록에서 'hello' 후보 포함
    let sp = createVimState(['helo'], { line: 0, col: 4 });
    sp = { ...sp, mode: 'INSERT' };
    sp = runKeys(sp, ['Ctrl-x', 's']);
    expect(sp.completionSession?.type).toBe('spell');
    expect(sp.completionSession?.candidates).toContain('hello');
  });

  it('Insert 모드 0 Ctrl-d 및 ^ Ctrl-d 가 현재 줄의 모든 선행 들여쓰기를 즉시 제거한다', () => {
    let s = createVimState(['      hello'], { line: 0, col: 6 });
    s = { ...s, mode: 'INSERT' };
    s = runKeys(s, ['0', 'Ctrl-d']);
    expect(s.lines[0]).toBe('hello');
    expect(s.cursor).toEqual({ line: 0, col: 0 });

    let s2 = createVimState(['    world'], { line: 0, col: 4 });
    s2 = { ...s2, mode: 'INSERT' };
    s2 = runKeys(s2, ['^', 'Ctrl-d']);
    expect(s2.lines[0]).toBe('world');
    expect(s2.cursor).toEqual({ line: 0, col: 0 });
  });

  it('영어 로케일에서도 신규 E741 / E990 / 키매핑 초기화 메시지가 정상 번역된다', () => {
    configureVimEngine({ locale: 'en' });
    try {
      let s = createVimState([''], { line: 0, col: 0 });
      s = runEx(s, ':let g:x = 1 | lockvar g:x');
      const locked = runEx(s, ':let g:x = 2');
      expect(locked.commandMessage).toBe('E741: Value is locked: g:x');

      const cleared = runEx(s, ':smapclear');
      expect(cleared.commandMessage).toContain('[Keymaps cleared]');
    } finally {
      configureVimEngine({ locale: 'ko' });
    }
  });
});
