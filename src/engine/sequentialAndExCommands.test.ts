import { describe, it, expect } from 'vitest';
import { VimEditorState } from '../types/vim';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';

function createState(lines: string[], cursor = { line: 0, col: 0 }, mode: VimEditorState['mode'] = 'NORMAL'): VimEditorState {
  return {
    lines,
    cursor,
    mode,
    undoStack: [],
    redoStack: [],
  };
}

function feedKeys(initial: VimEditorState, keys: string[]): VimEditorState {
  let state = initial;
  for (const k of keys) {
    state = handleKey(state, k);
  }
  return state;
}

describe('Visual Mode Sequential Number Generation (g Ctrl-a, g Ctrl-x)', () => {
  it('VISUAL_LINE 모드에서 g Ctrl-a 입력 시 계단식(+1, +2, +3...)으로 숫자가 증가한다', () => {
    const state = createState(['item0', 'item0', 'item0', 'item0']);
    // V3j -> select all 4 lines -> g -> Ctrl-a
    const result = feedKeys(state, ['V', '3', 'j', 'g', 'Ctrl-a']);

    expect(result.mode).toBe('NORMAL');
    expect(result.lines).toEqual(['item1', 'item2', 'item3', 'item4']);
    expect(result.cursor.line).toBe(0);
  });

  it('VISUAL_LINE 모드에서 g Ctrl-x 입력 시 계단식(-1, -2, -3...)으로 숫자가 감소한다', () => {
    const state = createState(['item10', 'item10', 'item10', 'item10']);
    const result = feedKeys(state, ['V', '3', 'j', 'g', 'Ctrl-x']);

    expect(result.mode).toBe('NORMAL');
    expect(result.lines).toEqual(['item9', 'item8', 'item7', 'item6']);
  });

  it('[count]g Ctrl-a 입력 시 count 간격(+2, +4, +6...)으로 계단식 증가한다', () => {
    const state = createState(['val0', 'val0', 'val0']);
    const result = feedKeys(state, ['V', '2', 'j', '2', 'g', 'Ctrl-a']);

    expect(result.mode).toBe('NORMAL');
    expect(result.lines).toEqual(['val2', 'val4', 'val6']);
  });

  it('일반 비주얼 Ctrl-a는 선택된 모든 행의 숫자를 동일하게 +count 일괄 증가시킨다', () => {
    const state = createState(['item0', 'item0', 'item0']);
    const result = feedKeys(state, ['V', '2', 'j', 'Ctrl-a']);

    expect(result.mode).toBe('NORMAL');
    expect(result.lines).toEqual(['item1', 'item1', 'item1']);
  });

  it('일반 비주얼 [count]Ctrl-x는 선택된 모든 행의 숫자를 동일하게 -count 일괄 감소시킨다', () => {
    const state = createState(['item10', 'item10', 'item10']);
    const result = feedKeys(state, ['V', '2', 'j', '5', 'Ctrl-x']);

    expect(result.mode).toBe('NORMAL');
    expect(result.lines).toEqual(['item5', 'item5', 'item5']);
  });

  it('VISUAL_BLOCK 모드에서는 선택된 사각형 컬럼 영역 내의 숫자만 타겟팅된다', () => {
    const state = createState([
      'const a = 10; // 100',
      'const b = 10; // 100',
      'const c = 10; // 100',
    ]);
    // 10번째 컬럼으로 이동 (10)
    // Ctrl-v -> 2j -> l (블록 선택: '10' 컬럼) -> g -> Ctrl-a
    const result = feedKeys(state, [
      '0', '1', '0', 'l',
      'Ctrl-v', '2', 'j', 'l',
      'g', 'Ctrl-a',
    ]);

    expect(result.mode).toBe('NORMAL');
    expect(result.lines).toEqual([
      'const a = 11; // 100',
      'const b = 12; // 100',
      'const c = 13; // 100',
    ]);
  });

  it('숫자가 없는 행은 건너뛰고 숫자가 있는 행에만 순차 증가 번호가 매겨진다', () => {
    const state = createState([
      'item0',
      'no number here',
      'item0',
      'item0',
    ]);
    const result = feedKeys(state, ['V', '3', 'j', 'g', 'Ctrl-a']);

    expect(result.lines).toEqual([
      'item1',
      'no number here',
      'item2',
      'item3',
    ]);
  });

  it('복합 키 문자열 g<Ctrl-a> 및 g<Ctrl-x> 입력도 정상 작동한다', () => {
    const state = createState(['n0', 'n0']);
    const result = feedKeys(state, ['V', 'j', 'g<Ctrl-a>']);
    expect(result.lines).toEqual(['n1', 'n2']);
  });
});

describe('Ex Command: :sort [u][!] [n]', () => {
  it(':sort 는 전체 버퍼를 알파벳순 오름차순으로 정렬한다', () => {
    const state = createState(['banana', 'cherry', 'apple']);
    const result = executeCommandLine(state, ':sort');

    expect(result.lines).toEqual(['apple', 'banana', 'cherry']);
    expect(result.cursor.line).toBe(0);
  });

  it(':sort! 는 전체 버퍼를 알파벳순 내림차순으로 정렬한다', () => {
    const state = createState(['apple', 'cherry', 'banana']);
    const result = executeCommandLine(state, ':sort!');

    expect(result.lines).toEqual(['cherry', 'banana', 'apple']);
  });

  it(':sort u 는 정렬 후 중복 라인을 제거(deduplicate)한다', () => {
    const state = createState(['banana', 'apple', 'banana', 'cherry', 'apple']);
    const result = executeCommandLine(state, ':sort u');

    expect(result.lines).toEqual(['apple', 'banana', 'cherry']);
  });

  it(':sort n 은 첫 번째 숫자의 크기를 기준으로 정렬한다', () => {
    const state = createState(['item10', 'item2', 'item1', 'item20']);
    const result = executeCommandLine(state, ':sort n');

    expect(result.lines).toEqual(['item1', 'item2', 'item10', 'item20']);
  });

  it(':sort un 은 숫자 기준 정렬과 중복 제거를 동시에 수행한다', () => {
    const state = createState(['item5', 'item-2', 'item10', 'item5', 'item-2']);
    const result = executeCommandLine(state, ':sort un');

    expect(result.lines).toEqual(['item-2', 'item5', 'item10']);
  });

  it(':sort! u 는 내림차순 정렬과 중복 제거를 수행한다', () => {
    const state = createState(['b', 'a', 'c', 'b']);
    const result = executeCommandLine(state, ':sort! u');

    expect(result.lines).toEqual(['c', 'b', 'a']);
  });

  it("범위 지정 :'<,'>sort u 는 선택 영역만 정렬한다", () => {
    const state = createState([
      'KEEP_TOP',
      'zebra',
      'apple',
      'zebra',
      'KEEP_BOTTOM',
    ]);
    const visualState: VimEditorState = {
      ...state,
      mode: 'VISUAL_LINE',
      visualAnchor: { line: 1, col: 0 },
      cursor: { line: 3, col: 0 },
    };

    const result = executeCommandLine(visualState, ":'<,'>sort u");
    expect(result.lines).toEqual([
      'KEEP_TOP',
      'apple',
      'zebra',
      'KEEP_BOTTOM',
    ]);
  });
});

describe('Ex Command: :[range]m[ove] {address}', () => {
  it(':m 0 은 현재 줄을 파일 맨 위로 이동시킨다', () => {
    const state = createState(['line 1', 'line 2', 'line 3'], { line: 2, col: 0 });
    const result = executeCommandLine(state, ':m 0');

    expect(result.lines).toEqual(['line 3', 'line 1', 'line 2']);
    expect(result.cursor.line).toBe(0);
  });

  it(':m $ 은 현재 줄을 파일 맨 끝으로 이동시킨다', () => {
    const state = createState(['line 1', 'line 2', 'line 3'], { line: 0, col: 0 });
    const result = executeCommandLine(state, ':m $');

    expect(result.lines).toEqual(['line 2', 'line 3', 'line 1']);
    expect(result.cursor.line).toBe(2);
  });

  it(':1,2m 4 는 1~2번째 줄을 4번째 줄 다음으로 이동시킨다', () => {
    const state = createState(['line 1', 'line 2', 'line 3', 'line 4', 'line 5']);
    const result = executeCommandLine(state, ':1,2m 4');

    expect(result.lines).toEqual(['line 3', 'line 4', 'line 1', 'line 2', 'line 5']);
    expect(result.cursor.line).toBe(3);
  });

  it(':4,5m 0 은 4~5번째 줄을 파일 맨 위로 이동시킨다', () => {
    const state = createState(['line 1', 'line 2', 'line 3', 'line 4', 'line 5']);
    const result = executeCommandLine(state, ':4,5m 0');

    expect(result.lines).toEqual(['line 4', 'line 5', 'line 1', 'line 2', 'line 3']);
    expect(result.cursor.line).toBe(1);
  });

  it('자기 자신 범위 내부로 이동하려는 경우 E134 에러를 반환한다', () => {
    const state = createState(['line 1', 'line 2', 'line 3', 'line 4', 'line 5']);
    const result = executeCommandLine(state, ':2,4m 2');

    expect(result.commandMessage).toBe('E134: Cannot move a range of lines into itself');
    expect(result.lines).toEqual(['line 1', 'line 2', 'line 3', 'line 4', 'line 5']);
  });

  it('상대 주소 :m .+1 및 :m .-2 가 정상 동작한다', () => {
    const state = createState(['line 1', 'line 2', 'line 3', 'line 4'], { line: 1, col: 0 });
    // line 2를 line 3 뒤로 (.+1)
    const result = executeCommandLine(state, ':m .+1');
    expect(result.lines).toEqual(['line 1', 'line 3', 'line 2', 'line 4']);
  });
});

describe('Ex Command: :[range]t {address} / :co[py] {address}', () => {
  it(':t . 은 현재 줄을 바로 아래로 복제한다', () => {
    const state = createState(['line 1', 'line 2', 'line 3'], { line: 1, col: 0 });
    const result = executeCommandLine(state, ':t .');

    expect(result.lines).toEqual(['line 1', 'line 2', 'line 2', 'line 3']);
    expect(result.cursor.line).toBe(2);
  });

  it(':1,2t $ 은 1~2번째 줄을 파일 맨 끝에 복제한다', () => {
    const state = createState(['line 1', 'line 2', 'line 3']);
    const result = executeCommandLine(state, ':1,2t $');

    expect(result.lines).toEqual(['line 1', 'line 2', 'line 3', 'line 1', 'line 2']);
    expect(result.cursor.line).toBe(4);
  });

  it(':co 0 은 현재 줄을 맨 위에 복제한다', () => {
    const state = createState(['line 1', 'line 2'], { line: 1, col: 0 });
    const result = executeCommandLine(state, ':co 0');

    expect(result.lines).toEqual(['line 2', 'line 1', 'line 2']);
    expect(result.cursor.line).toBe(0);
  });

  it(':copy . 은 :t . 와 동일하게 동작한다', () => {
    const state = createState(['item'], { line: 0, col: 0 });
    const result = executeCommandLine(state, ':copy .');

    expect(result.lines).toEqual(['item', 'item']);
  });
});
