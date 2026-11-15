import { describe, it, expect } from 'vitest';
import {
  createVimState,
  sendKeys,
  handleKey,
  lookupDigraph,
  describeCharUtf8Bytes,
  runExCommand,
  getCmdlineCursorCol,
  formatDigraphsList,
} from './index';

describe(']m / [m / ]M / [M 메서드 블록 이동 및 연산자·비주얼 연동', () => {
  const methodBuffer = [
    'class Service {',
    '  init() {',
    '    return 1;',
    '  }',
    '  run() {',
    '    return 2;',
    '  }',
    '}',
  ];

  it('노멀 모드에서 ]m / [m 으로 메서드 시작({)을 순방향·역방향 탐색하고 카운트를 지원한다', () => {
    let s = createVimState(methodBuffer, { line: 0, col: 0 });

    s = sendKeys(s, ']m');
    expect(s.cursor).toEqual({ line: 0, col: 14 });
    expect(s.bell).toBeUndefined();

    s = sendKeys(s, ']m');
    expect(s.cursor).toEqual({ line: 1, col: 9 });

    s = sendKeys(s, ']m');
    expect(s.cursor).toEqual({ line: 4, col: 8 });

    s = sendKeys(s, '2[m');
    expect(s.cursor).toEqual({ line: 0, col: 14 });

    // 더 이상 앞에 '{' 가 없으면 bell 울리고 이동하지 않음
    const atTop = sendKeys(s, '[m');
    expect(atTop.bell).toBe(true);
    expect(atTop.cursor).toEqual({ line: 0, col: 14 });
  });

  it('노멀 모드에서 ]M / [M 으로 메서드 끝(})을 순방향·역방향 탐색하고 없으면 bell 을 울린다', () => {
    let s = createVimState(methodBuffer, { line: 1, col: 2 });

    s = sendKeys(s, ']M');
    expect(s.cursor).toEqual({ line: 3, col: 2 });

    s = sendKeys(s, '2]M');
    expect(s.cursor).toEqual({ line: 7, col: 0 });

    // 마지막 '}' 이후에는 ]M 실패
    const pastEnd = sendKeys(s, ']M');
    expect(pastEnd.bell).toBe(true);
    expect(pastEnd.cursor).toEqual({ line: 7, col: 0 });

    s = sendKeys(s, '[M');
    expect(s.cursor).toEqual({ line: 6, col: 2 });
  });

  it('비주얼 모드(v) 및 연산자 대기 모드(d/c/y + ]m/[m/]M/[M)와 . 반복이 동작한다', () => {
    // d]m: 커서부터 다음 '{' 직전까지 삭제 + . 반복
    let s = createVimState(['alpha() { a(); }', 'beta() { b(); }']);
    s = sendKeys(s, 'd]m');
    expect(s.lines[0]).toBe('{ a(); }');
    expect(s.cursor).toEqual({ line: 0, col: 0 });

    s = sendKeys(s, 'j0.');
    expect(s.lines[1]).toBe('{ b(); }');

    // c]M: '{' 안에서 본문 끝 '}' 직전까지 변경
    let cState = createVimState(['fn() { old; }']);
    cState = sendKeys(cState, 'f{c]M{ new<Esc>');
    expect(cState.lines[0]).toBe('fn() { new}');

    // 비주얼 모드 v]M 으로 '}' 까지 선택 후 삭제
    let vState = createVimState(['{abc}']);
    vState = sendKeys(vState, 'lv]Md');
    expect(vState.lines[0]).toBe('{');
  });
});

describe('Insert 모드 Ctrl-k 다이그래프 입력', () => {
  it('lookupDigraph 가 표준 Vim 다이그래프 및 역순 비방향 조합을 정확히 해석한다', () => {
    expect(lookupDigraph('-', '>')).toEqual({ char: '→', matched: true });
    expect(lookupDigraph('<', '-')).toEqual({ char: '←', matched: true });
    expect(lookupDigraph('!', '=')).toEqual({ char: '≠', matched: true });
    expect(lookupDigraph('=', '<')).toEqual({ char: '≤', matched: true });
    expect(lookupDigraph('>', '=')).toEqual({ char: '≥', matched: true });
    expect(lookupDigraph('*', 'l')).toEqual({ char: 'λ', matched: true });
    expect(lookupDigraph('O', 'K')).toEqual({ char: '✓', matched: true });
    expect(lookupDigraph('c', 'o')).toEqual({ char: '©', matched: true });
    // 비방향성 역순: :e -> ë, ,c -> ç
    expect(lookupDigraph(':', 'e')).toEqual({ char: 'ë', matched: true });
    expect(lookupDigraph(',', 'c')).toEqual({ char: 'ç', matched: true });
    // 미등록 조합은 두 번째 문자로 폴백
    expect(lookupDigraph('z', 'q')).toEqual({ char: 'q', matched: false });
  });

  it('Ctrl-k 이후 두 문자를 입력해 유니코드 기호를 삽입하고 . 반복 및 취소(Esc)를 지원한다', () => {
    let s = createVimState(['a', 'b']);
    s = handleKey(s, 'A');
    s = handleKey(s, ' ');
    s = handleKey(s, 'Ctrl-k');
    expect(s.digraphPending).toBe('');
    s = handleKey(s, '-');
    expect(s.digraphPending).toBe('-');
    s = handleKey(s, '>');
    expect(s.digraphPending).toBeUndefined();
    s = handleKey(s, ' ');
    s = handleKey(s, 'Ctrl-k');
    s = handleKey(s, '*');
    s = handleKey(s, 'l');
    s = handleKey(s, 'Escape');

    expect(s.lines[0]).toBe('a → λ');
    expect(s.mode).toBe('NORMAL');

    // . 반복으로 두 번째 줄에도 동일하게 ' → λ' 삽입
    s = sendKeys(s, 'j.');
    expect(s.lines[1]).toBe('b → λ');

    // Ctrl-k 대기 중 Esc 입력 시 INSERT 모드를 유지한 채 다이그래프만 취소
    s = handleKey(s, 'i');
    s = handleKey(s, 'Ctrl-k');
    expect(s.digraphPending).toBe('');
    s = handleKey(s, 'Escape');
    expect(s.mode).toBe('INSERT');
    expect(s.digraphPending).toBeUndefined();
    s = handleKey(s, '!');
    s = handleKey(s, 'Escape');
    expect(s.mode).toBe('NORMAL');
    expect(s.lines[1]).toContain('!');
  });

  it('Ctrl-v 비주얼 블록 삽입에서도 Ctrl-k 다이그래프가 모든 선택 줄에 복제된다', () => {
    let s = createVimState(['row1', 'row2', 'row3']);
    s = handleKey(s, 'Ctrl-v');
    s = sendKeys(s, '2jI');
    s = handleKey(s, 'Ctrl-k');
    s = handleKey(s, 'O');
    s = handleKey(s, 'K');
    s = handleKey(s, ' ');
    s = handleKey(s, 'Escape');
    expect(s.lines).toEqual(['✓ row1', '✓ row2', '✓ row3']);
  });
});

describe('Insert 모드 Ctrl-a / Ctrl-@ 및 ". 레지스터', () => {
  it('Ctrl-a 로 직전 INSERT 세션의 텍스트(다이그래프·백스페이스 반영)를 재삽입하고 ". 로도 참조한다', () => {
    let s = createVimState(['hello', 'world', 'tail']);
    s = handleKey(s, 'A');
    s = sendKeys(s, ' ');
    s = handleKey(s, 'Ctrl-k');
    s = handleKey(s, '-');
    s = handleKey(s, '>');
    s = sendKeys(s, ' okz');
    s = handleKey(s, 'Backspace');
    s = handleKey(s, 'Escape');

    expect(s.lines[0]).toBe('hello → ok');
    expect(s.lastInsertedText).toBe(' → ok');

    // 빈 i<Esc> 는 직전 lastInsertedText 를 지우지 않음
    s = handleKey(s, 'i');
    s = handleKey(s, 'Escape');
    expect(s.lastInsertedText).toBe(' → ok');

    // 다음 줄에서 A Ctrl-a 로 재삽입 + 추가 문자 후 . 반복해도 이중 삽입되지 않음
    s = handleKey(s, 'j');
    s = handleKey(s, 'A');
    s = handleKey(s, 'Ctrl-a');
    s = handleKey(s, '!');
    s = handleKey(s, 'Escape');
    expect(s.lines[1]).toBe('world → ok!');

    s = sendKeys(s, 'j.');
    expect(s.lines[2]).toBe('tail → ok!');

    // ".p 로도 동일 텍스트 붙여넣기 가능
    let pState = createVimState(['prefix: ']);
    pState = handleKey(pState, 'A');
    pState = sendKeys(pState, 'DONE<Esc>');
    pState = sendKeys(pState, '".p');
    expect(pState.lines[0]).toBe('prefix: DONEDONE');
  });

  it('Ctrl-@ 는 직전 INSERT 텍스트를 삽입한 즉시 NORMAL 모드로 복귀한다', () => {
    let s = createVimState(['first', 'second']);
    s = sendKeys(s, 'A_tag<Esc>jA');
    s = handleKey(s, 'Ctrl-@');
    expect(s.mode).toBe('NORMAL');
    expect(s.lines[1]).toBe('second_tag');
  });
});

describe('Normal 모드 g8 (UTF-8 바이트 16진수 검사)', () => {
  it('ASCII, 다중 바이트 UTF-8(화살표/그리스/한글/이모지), 빈 줄(NUL)을 정확히 출력한다', () => {
    expect(describeCharUtf8Bytes('A', 0)).toBe('41');
    expect(describeCharUtf8Bytes('\t', 0)).toBe('09');
    expect(describeCharUtf8Bytes('→', 0)).toBe('e2 86 92');
    expect(describeCharUtf8Bytes('λ', 0)).toBe('ce bb');
    expect(describeCharUtf8Bytes('가', 0)).toBe('ea b0 80');
    expect(describeCharUtf8Bytes('🚀', 0)).toBe('f0 9f 9a 80');
    expect(describeCharUtf8Bytes('', 0)).toBe('NUL');

    let s = createVimState(['→ 가', '']);
    s = sendKeys(s, 'g8');
    expect(s.commandMessage).toBe('e2 86 92');

    s = sendKeys(s, '2lg8');
    expect(s.commandMessage).toBe('ea b0 80');

    s = sendKeys(s, 'jg8');
    expect(s.commandMessage).toBe('NUL');
  });
});

describe('커맨드라인·검색줄 중간 편집(Ctrl-b/e, ArrowLeft/Right, Delete, Ctrl-w/u, Ctrl-k, Ctrl-c)', () => {
  it('COMMAND(:) 모드에서 중간 이동·삽입·Delete·Ctrl-w·Ctrl-u·Ctrl-c 가 정상 동작한다', () => {
    let s = createVimState(['hello world']);
    s = handleKey(s, ':');
    for (const ch of '%s/foo/bar') s = handleKey(s, ch);
    expect(getCmdlineCursorCol(s)).toBe(10);

    // ArrowLeft 로 중간 이동 후 글자 수정
    s = handleKey(s, 'ArrowLeft');
    s = handleKey(s, 'ArrowLeft');
    s = handleKey(s, 'ArrowLeft');
    expect(getCmdlineCursorCol(s)).toBe(7); // '%s/foo/|bar'
    s = handleKey(s, 'Delete'); // 'b' 삭제 -> '%s/foo/ar'
    expect(s.commandBuffer).toBe('%s/foo/ar');
    expect(getCmdlineCursorCol(s)).toBe(7);
    s = handleKey(s, 'c'); // '%s/foo/car'
    expect(s.commandBuffer).toBe('%s/foo/car');
    expect(getCmdlineCursorCol(s)).toBe(8);

    // Ctrl-b (줄 맨 앞) 및 Ctrl-e (줄 맨 끝)
    s = handleKey(s, 'Ctrl-b');
    expect(getCmdlineCursorCol(s)).toBe(0);
    s = handleKey(s, ' ');
    expect(s.commandBuffer).toBe(' %s/foo/car');
    s = handleKey(s, 'Ctrl-b');
    s = handleKey(s, 'Delete');
    expect(s.commandBuffer).toBe('%s/foo/car');

    s = handleKey(s, 'Ctrl-e');
    expect(getCmdlineCursorCol(s)).toBe(10);

    // Ctrl-w 로 커서 앞 단어 삭제
    s = handleKey(s, 'Ctrl-w'); // 'car' 삭제
    expect(s.commandBuffer).toBe('%s/foo/');
    expect(getCmdlineCursorCol(s)).toBe(7);

    // Ctrl-u 로 커서 앞 전체 삭제 (뒤쪽 텍스트는 유지)
    s = handleKey(s, 'ArrowLeft');
    s = handleKey(s, 'Ctrl-u');
    expect(s.commandBuffer).toBe('/');
    expect(getCmdlineCursorCol(s)).toBe(0);

    // Ctrl-c 로 명령 입력 즉시 취소
    s = handleKey(s, 'Ctrl-c');
    expect(s.mode).toBe('NORMAL');
    expect(s.commandBuffer).toBeUndefined();
    expect(s.commandCursorCol).toBeUndefined();
  });

  it('COMMAND(:), = 표현식 모드, SEARCH(/, ?) 모드에서 Ctrl-k 다이그래프 및 중간 편집을 지원한다', () => {
    // SEARCH 모드: '/a b' -> ArrowLeft -> Ctrl-k - > -> '/a→ b'
    let s = createVimState(['prefix', 'a→ b']);
    s = handleKey(s, '/');
    s = handleKey(s, 'a');
    s = handleKey(s, ' ');
    s = handleKey(s, 'b');
    s = handleKey(s, 'ArrowLeft');
    s = handleKey(s, 'ArrowLeft');
    s = handleKey(s, 'Ctrl-k');
    expect(s.digraphPending).toBe('');
    s = handleKey(s, '-');
    expect(s.digraphPending).toBe('-');
    s = handleKey(s, '>');
    expect(s.digraphPending).toBeUndefined();
    expect(s.commandBuffer).toBe('a→ b');
    s = handleKey(s, 'Enter');
    expect(s.mode).toBe('NORMAL');
    expect(s.cursor).toEqual({ line: 1, col: 0 });

    // = 표현식 레지스터 입력에서도 Ctrl-b / Backspace / Enter 동작
    let eqState = createVimState(['val']);
    eqState = sendKeys(eqState, '"=');
    expect(eqState.mode).toBe('COMMAND');
    expect(eqState.commandType).toBe('=');
    eqState = handleKey(eqState, '2');
    eqState = handleKey(eqState, '+');
    eqState = handleKey(eqState, '9');
    eqState = handleKey(eqState, 'Ctrl-h'); // '9' 삭제
    eqState = handleKey(eqState, '3');
    eqState = handleKey(eqState, 'Enter');
    expect(eqState.mode).toBe('NORMAL');
    expect(eqState.registers?.['=']).toEqual({ type: 'char', content: '5' });
  });
});

describe(':ascii / :as 및 :digraphs / :dig 사용자 다이그래프 등록', () => {
  it(':ascii (:as) 는 ga 와 동일한 커서 문자 정보를 출력한다', () => {
    let s = createVimState(['A→']);
    s = runExCommand(s, 'ascii');
    expect(s.commandMessage).toContain('<A>');
    expect(s.commandMessage).toContain('65');

    s = sendKeys(s, 'l');
    s = runExCommand(s, 'as');
    expect(s.commandMessage).toContain('<→>');
    expect(s.commandMessage).toContain('8594');
  });

  it(':digraphs 로 목록을 조회하고 :digraph {c1}{c2} {code} 로 커스텀 다이그래프를 등록해 Insert/Cmdline 에서 사용한다', () => {
    let s = createVimState(['line1', 'line2']);

    // 목록 조회
    const preview = formatDigraphsList();
    expect(preview).toContain('-> →');
    s = runExCommand(s, 'dig');
    expect(s.commandMessage).toContain('다이그래프');
    expect(s.commandMessage).toContain('-> →');

    // 잘못된 코드(E474)
    const bad = runExCommand(s, 'digraph ab notanumber');
    expect(bad.bell).toBe(true);
    expect(bad.commandMessage).toContain('E474');

    // 10진수 & 16진수 커스텀 다이그래프 등록 (:digraphs z1 9733 z2 0x2728)
    s = runExCommand(s, 'digraphs z1 9733 z2 0x2728');
    expect(s.userDigraphs?.['z1']).toBe('★');
    expect(s.userDigraphs?.['z2']).toBe('✨');
    expect(s.commandMessage).toContain('z1 ★');

    // Insert 모드 Ctrl-k z 1 -> ★
    s = handleKey(s, 'A');
    s = handleKey(s, ' ');
    s = handleKey(s, 'Ctrl-k');
    s = handleKey(s, 'z');
    s = handleKey(s, '1');
    s = handleKey(s, 'Escape');
    expect(s.lines[0]).toBe('line1 ★');

    // Command(:) 치환식 중간에 Ctrl-k z 2 -> ✨ 적용
    s = handleKey(s, ':');
    for (const ch of '2s/line2/ok /') s = handleKey(s, ch);
    s = handleKey(s, 'ArrowLeft'); // '2s/line2/ok |/'
    s = handleKey(s, 'Ctrl-k');
    s = handleKey(s, 'z');
    s = handleKey(s, '2');
    s = handleKey(s, 'Enter');
    expect(s.lines[1]).toBe('ok ✨');
  });
});
