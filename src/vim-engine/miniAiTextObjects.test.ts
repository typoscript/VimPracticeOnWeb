import { describe, it, expect } from 'vitest';
import { createVimState, handleKey } from './index';

function typeKeys(state: ReturnType<typeof createVimState>, keys: string[]) {
  let s = state;
  for (const k of keys) {
    s = handleKey(s, k);
  }
  return s;
}

describe('mini.ai Next/Last 텍스트 객체 (in/an/il/al)', () => {
  it('cin" / din( / dan" 로 커서 뒤 다음 줄 포함 Next 짝을 원격 편집한다', () => {
    let s = createVimState(
      [
        'const a = "first";',
        'const b = fn(arg1);',
        'const c = "third";',
      ],
      { line: 0, col: 0 }
    );

    // 줄 맨 앞에서 cin" -> "first" 를 "ONE" 으로 변경
    s = typeKeys(s, ['c', 'i', 'n', '"', 'O', 'N', 'E', 'Escape']);
    expect(s.lines[0]).toBe('const a = "ONE";');

    // 여전히 0번째 줄에서 din( -> 다음 줄 fn(arg1) 내부 삭제
    s = typeKeys(s, ['d', 'i', 'n', '(']);
    expect(s.lines[1]).toBe('const b = fn();');
    expect(s.clipboard?.content).toBe('arg1');

    // 여전히 1번째 줄에서 dan" -> 2번째 줄 "third" 따옴표 포함 삭제
    s = typeKeys(s, ['d', 'a', 'n', '"']);
    expect(s.lines[2]).toBe('const c = ;');
    expect(s.clipboard?.content).toBe('"third"');
  });

  it('cil" / yil( / al[ 로 커서 앞쪽 Last 짝을 역방향 원격 편집한다', () => {
    let s = createVimState(
      [
        'const arr = [10, 20];',
        'const prev = "old"; const keep = "stay";',
      ],
      { line: 1, col: 20 } // ';' 바로 뒤
    );

    // cil" -> 앞쪽 "old" 를 "new" 로 교체
    s = typeKeys(s, ['c', 'i', 'l', '"', 'n', 'e', 'w', 'Escape']);
    expect(s.lines[1]).toBe('const prev = "new"; const keep = "stay";');

    // yil[ -> 이전 줄 [10, 20] 내부 복사
    s = typeKeys(s, ['y', 'i', 'l', '[']);
    expect(s.clipboard?.content).toBe('10, 20');
  });

  it('[count] 와 도트 반복(.) 및 대소문자 변환(gUin")·들여쓰기(>in{)를 지원한다', () => {
    // 2din" -> 두 번째 Next 따옴표 내부 삭제
    let s = createVimState(['const a = "one"; const b = "two";'], { line: 0, col: 0 });
    s = typeKeys(s, ['2', 'd', 'i', 'n', '"']);
    expect(s.lines[0]).toBe('const a = "one"; const b = "";');

    // 도트 반복(.)으로 다음 따옴표에도 동일 변경 적용
    let d = createVimState(['"aaa" "bbb" "ccc"'], { line: 0, col: 0 });
    d = typeKeys(d, ['d', 'i', 'n', '"']); // cursor at 0 (on first "), next is "bbb"!
    expect(d.lines[0]).toBe('"aaa" "" "ccc"');
    d = handleKey(d, '.'); // next after "" is "ccc"!
    expect(d.lines[0]).toBe('"aaa" "" ""');

    // gUin" -> 다음 따옴표 내부 대문자 변환
    let u = createVimState(['let x = "hello";'], { line: 0, col: 0 });
    u = typeKeys(u, ['g', 'U', 'i', 'n', '"']);
    expect(u.lines[0]).toBe('let x = "HELLO";');

    // 멀티라인 >in{ 들여쓰기
    let ind = createVimState(['const obj = {', 'a: 1,', 'b: 2,', '};'], { line: 0, col: 0 });
    ind = typeKeys(ind, ['>', 'i', 'n', '{']);
    expect(ind.lines).toEqual(['const obj = {', '  a: 1,', '  b: 2,', '};']);
  });

  it('Visual 모드 vin" / val( 선택 및 대상이 없을 때 bell 신호를 검증한다', () => {
    let s = createVimState(['fn(alpha) + "beta"'], { line: 0, col: 0 });
    s = typeKeys(s, ['v', 'i', 'n', '"']);
    expect(s.mode).toBe('VISUAL');
    expect(s.visualAnchor).toEqual({ line: 0, col: 13 });
    expect(s.cursor).toEqual({ line: 0, col: 16 });

    // 마지막 줄 끝에서 다음 따옴표가 없으면 bell
    let empty = createVimState(['no quotes here'], { line: 0, col: 0 });
    empty = typeKeys(empty, ['d', 'i', 'n', '"']);
    expect(empty.bell).toBe(true);
    expect(empty.mode).toBe('NORMAL');
  });
});
