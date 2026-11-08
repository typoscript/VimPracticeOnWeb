import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';
import { findMatchingBracket } from './bracketMatch';

function createState(lines: string[], line = 0, col = 0): VimEditorState {
  return {
    lines,
    cursor: { line, col },
    mode: 'NORMAL',
  };
}

describe('VISUAL_BLOCK mode (Ctrl+v)', () => {
  it('Ctrl-v 입력 시 VISUAL_BLOCK 모드로 진입하고 visualAnchor를 설정한다', () => {
    let state = createState(['line 1', 'line 2', 'line 3'], 0, 0);
    state = handleKey(state, 'Ctrl-v');

    expect(state.mode).toBe('VISUAL_BLOCK');
    expect(state.visualAnchor).toEqual({ line: 0, col: 0 });
  });

  it('다중 행 I 삽입: Ctrl-v -> 블록 선택 -> Shift+I -> "// " -> Escape 시 모든 행에 일괄 주석이 반영된다', () => {
    let state = createState(['const a = 1;', 'const b = 2;', 'const c = 3;'], 0, 0);

    // 1. Ctrl-v로 비주얼 블록 모드 진입
    state = handleKey(state, 'Ctrl-v');
    expect(state.mode).toBe('VISUAL_BLOCK');

    // 2. j 키를 2번 눌러 3개 줄을 블록 선택
    state = handleKey(state, 'j');
    state = handleKey(state, 'j');
    expect(state.cursor.line).toBe(2);

    // 3. Shift+I ('I')를 눌러 블록 첫 열 INSERT 모드 진입
    state = handleKey(state, 'I');
    expect(state.mode).toBe('INSERT');
    expect(state.blockInsertSession).toBeDefined();
    expect(state.blockInsertSession?.lines).toEqual([0, 1, 2]);

    // 4. "// " 입력
    state = handleKey(state, '/');
    state = handleKey(state, '/');
    state = handleKey(state, ' ');

    // 첫 번째 줄에는 타이핑 중 실시간 반영
    expect(state.lines[0]).toBe('// const a = 1;');

    // 5. Escape 누르는 순간 나머지 모든 선택 행에 동일하게 일괄 반영
    state = handleKey(state, 'Escape');
    expect(state.mode).toBe('NORMAL');
    expect(state.blockInsertSession).toBeNull();
    expect(state.lines).toEqual([
      '// const a = 1;',
      '// const b = 2;',
      '// const c = 3;',
    ]);
  });

  it('다중 행 A 삽입: 블록 오른쪽 끝 다음 칸에서 텍스트를 일괄 추가한다', () => {
    let state = createState(['item', 'item', 'item'], 0, 0);
    state = handleKey(state, 'Ctrl-v');
    state = handleKey(state, 'j');
    state = handleKey(state, 'j');
    // 커서를 열 3('m')까지 확장
    state = handleKey(state, 'l');
    state = handleKey(state, 'l');
    state = handleKey(state, 'l');

    // 'A'를 눌러 블록 뒤에서 삽입
    state = handleKey(state, 'A');
    expect(state.mode).toBe('INSERT');

    state = handleKey(state, '_');
    state = handleKey(state, 'x');
    state = handleKey(state, 'Escape');

    expect(state.mode).toBe('NORMAL');
    expect(state.lines).toEqual([
      'item_x',
      'item_x',
      'item_x',
    ]);
  });

  it('다중 행 d/x 삭제: 직사각형 열 범위를 모든 행에서 일괄 삭제한다', () => {
    let state = createState(['[TAG] item 1', '[TAG] item 2', '[TAG] item 3'], 0, 0);
    state = handleKey(state, 'Ctrl-v');
    state = handleKey(state, 'j');
    state = handleKey(state, 'j');
    // '[TAG] ' 6글자 폭 선택
    for (let i = 0; i < 5; i++) {
      state = handleKey(state, 'l');
    }

    // d 키로 블록 영역 일괄 삭제
    state = handleKey(state, 'd');
    expect(state.mode).toBe('NORMAL');
    expect(state.lines).toEqual(['item 1', 'item 2', 'item 3']);
  });

  it('다중 행 c 변경: 직사각형 열 범위를 삭제하고 입력 텍스트를 일괄 복제한다', () => {
    let state = createState(['OLD_1', 'OLD_2', 'OLD_3'], 0, 0);
    state = handleKey(state, 'Ctrl-v');
    state = handleKey(state, 'j');
    state = handleKey(state, 'j');
    state = handleKey(state, 'l');
    state = handleKey(state, 'l'); // 'OLD' 3글자 영역

    state = handleKey(state, 'c');
    expect(state.mode).toBe('INSERT');

    state = handleKey(state, 'N');
    state = handleKey(state, 'E');
    state = handleKey(state, 'W');
    state = handleKey(state, 'Escape');

    expect(state.lines).toEqual(['NEW_1', 'NEW_2', 'NEW_3']);
  });

  it('다중 행 y 복사: 직사각형 블록의 텍스트를 추출하여 클립보드에 줄바꿈으로 저장한다', () => {
    let state = createState(['abc', 'def', 'ghi'], 0, 0);
    state = handleKey(state, 'Ctrl-v');
    state = handleKey(state, 'j');
    state = handleKey(state, 'j');
    state = handleKey(state, 'l');

    state = handleKey(state, 'y');
    expect(state.mode).toBe('NORMAL');
    expect(state.clipboard?.content).toBe('ab\nde\ngh');
  });
});

describe('Matching Pair Motion (%) and Bracket Matcher', () => {
  it('findMatchingBracket: 단일 줄 내 괄호 짝을 정확히 찾는다', () => {
    const lines = ['function test(a, [b, c]) {}'];
    // '(' col 13 -> ')' col 23
    const match1 = findMatchingBracket(lines, { line: 0, col: 13 });
    expect(match1).toEqual({ line: 0, col: 23 });

    // '[' col 17 -> ']' col 22
    const match2 = findMatchingBracket(lines, { line: 0, col: 17 });
    expect(match2).toEqual({ line: 0, col: 22 });

    // '}' col 26 -> '{' col 25
    const match3 = findMatchingBracket(lines, { line: 0, col: 26 });
    expect(match3).toEqual({ line: 0, col: 25 });
  });

  it('findMatchingBracket: 여러 줄에 걸친 멀티라인 중첩 괄호 짝을 정확히 찾는다', () => {
    const lines = [
      'function outer() {',
      '  if (condition) {',
      '    return [1, 2];',
      '  }',
      '}',
    ];

    // line 0 col 17 '{' -> line 4 col 0 '}'
    const matchOuter = findMatchingBracket(lines, { line: 0, col: 17 });
    expect(matchOuter).toEqual({ line: 4, col: 0 });

    // line 4 col 0 '}' -> line 0 col 17 '{'
    const matchCloseOuter = findMatchingBracket(lines, { line: 4, col: 0 });
    expect(matchCloseOuter).toEqual({ line: 0, col: 17 });
  });

  it('% 키 입력 시 커서가 짝 괄호 위치로 점프한다', () => {
    let state = createState(['const sum = (10 + (20 * 30));'], 0, 12); // 바깥쪽 '('
    state = handleKey(state, '%');
    expect(state.cursor).toEqual({ line: 0, col: 27 }); // 닫는 ')'

    state = handleKey(state, '%');
    expect(state.cursor).toEqual({ line: 0, col: 12 }); // 다시 여는 '('
  });

  it('d% 입력 시 괄호 짝 구간(양 끝 괄호 포함)을 일괄 삭제한다', () => {
    let state = createState(['const val = (remove + this);'], 0, 12); // '(' 위치
    state = handleKey(state, 'd');
    state = handleKey(state, '%');

    expect(state.lines[0]).toBe('const val = ;');
  });

  it('c% 입력 시 괄호 짝 구간을 삭제하고 INSERT 모드로 진입한다', () => {
    let state = createState(['const val = [1, 2, 3];'], 0, 12); // '[' 위치
    state = handleKey(state, 'c');
    state = handleKey(state, '%');

    expect(state.lines[0]).toBe('const val = ;');
    expect(state.mode).toBe('INSERT');
    expect(state.cursor.col).toBe(12);
  });
});

describe('Inline Character Search Repeat (; and ,)', () => {
  it('; 키로 같은 방향 탐색을 반복하고, , 키로 반대 방향 탐색을 반복한다', () => {
    let state = createState(['apple, banana, cherry, date'], 0, 0);

    // f, 로 첫 번째 쉼표(col 5)로 점프
    state = handleKey(state, 'f');
    state = handleKey(state, ',');
    expect(state.cursor.col).toBe(5);
    expect(state.lastCharSearch).toEqual({ type: 'f', char: ',' });

    // ; 키로 다음 쉼표(col 13)로 점프
    state = handleKey(state, ';');
    expect(state.cursor.col).toBe(13);

    // ; 키로 다음 쉼표(col 21)로 점프
    state = handleKey(state, ';');
    expect(state.cursor.col).toBe(21);

    // , 키로 반대 방향(이전 쉼표, col 13)으로 역점프
    state = handleKey(state, ',');
    expect(state.cursor.col).toBe(13);
  });

  it('d; 입력 시 마지막 탐색 문자를 기준으로 삭제 연산자를 결합 실행한다', () => {
    let state = createState(['hello:world:test'], 0, 0);

    // f: 로 첫 콜론으로 이동
    state = handleKey(state, 'f');
    state = handleKey(state, ':');
    expect(state.cursor.col).toBe(5);

    // 다음 글자 'w'로 1칸 이동 후 d; 실행 (다음 콜론까지 삭제)
    state = handleKey(state, 'l');
    state = handleKey(state, 'd');
    state = handleKey(state, ';');

    expect(state.lines[0]).toBe('hello:test');
  });
});
