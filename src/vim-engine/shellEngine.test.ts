import { describe, it, expect } from 'vitest';
import { createVimState, handleKey, runExCommand, sendKeys } from './index';

describe('가상 셸 파이프·필터링 (:!cmd, :[range]!cmd, :r !, :w !, !!, !{motion})', () => {
  it(':!cmd 는 버퍼를 수정하지 않고 실행 결과를 상태바에 표시하며 %, #, ! 를 확장한다', () => {
    let s = createVimState(['line 1'], { line: 0, col: 0 }, {
      primaryFilename: 'src/app.ts',
      secondaryFilename: 'src/util.ts',
      virtualFiles: {
        'src/app.ts': ['line 1'],
        'README.md': ['hello'],
      },
    });

    s = runExCommand(s, '!echo hello % #');
    expect(s.lines).toEqual(['line 1']);
    expect(s.commandMessage).toBe('hello src/app.ts src/util.ts');
    expect(s.lastShellCommand).toBe('echo hello src/app.ts src/util.ts');

    // :!! 로 직전 셸 명령 반복
    s = runExCommand(s, '!!');
    expect(s.commandMessage).toBe('hello src/app.ts src/util.ts');

    // :!ls 는 VFS 디렉터리/파일 목록 출력
    s = runExCommand(s, '!ls');
    expect(s.commandMessage).toContain('README.md');
    expect(s.commandMessage).toContain('src/');
  });

  it(':%!sort | uniq -c 등 멀티 스테이지 셸 파이프라인으로 버퍼를 필터링하고 실행 취소(u)할 수 있다', () => {
    let s = createVimState(['  banana', '  apple', '  banana', '  cherry']);
    s = runExCommand(s, '%!sort | uniq');
    expect(s.lines).toEqual(['  apple', '  banana', '  cherry']);
    // 필터링 후 첫 줄의 첫 비공백 문자로 커서 이동
    expect(s.cursor).toEqual({ line: 0, col: 2 });

    // 실행 취소(u) 한 번으로 원본 복구
    s = handleKey(s, 'u');
    expect(s.lines).toEqual(['  banana', '  apple', '  banana', '  cherry']);

    // 범위 지정 숫자 역순 정렬: :2,4!sort -rn
    let s2 = createVimState(['header', '10', '2', '30', 'footer']);
    s2 = runExCommand(s2, '2,4!sort -rn');
    expect(s2.lines).toEqual(['header', '30', '10', '2', 'footer']);
    expect(s2.cursor).toEqual({ line: 1, col: 0 });
  });

  it('grep, sed, awk, tr, cut, head, tail, tac, rev, column, jq 유틸리티를 정확히 실행한다', () => {
    // grep -v & pipe
    let s = createVimState(['info: start', 'debug: trace', 'error: crash', 'debug: dump']);
    s = runExCommand(s, '%!grep -v debug | tr a-z A-Z');
    expect(s.lines).toEqual(['INFO: START', 'ERROR: CRASH']);

    // 부분 범위에서 grep 출력이 비면 해당 범위 줄이 제거됨 (Neovim 동일)
    let sPartial = createVimState(['a', 'b', 'c', 'd']);
    sPartial = runExCommand(sPartial, '2,3!grep nope');
    expect(sPartial.lines).toEqual(['a', 'd']);
    expect(sPartial.cursor).toEqual({ line: 1, col: 0 });

    // 전체 버퍼에서 출력이 비면 빈 줄 1개 유지 (불변식)
    let sEmpty = createVimState(['foo', 'bar']);
    sEmpty = runExCommand(sEmpty, '%!grep nope');
    expect(sEmpty.lines).toEqual(['']);

    // awk -F, 및 sed
    let sCsv = createVimState(['kim,30,dev', 'lee,25,pm']);
    sCsv = runExCommand(sCsv, "%!awk -F, '{print $3 \":\" $1}' | sed 's/pm/lead/'");
    expect(sCsv.lines).toEqual(['dev:kim', 'lead:lee']);

    // cut + head/tail + tac/rev
    let sCut = createVimState(['a:b:c', '1:2:3', 'x:y:z']);
    sCut = runExCommand(sCut, '%!cut -d: -f1,3 | tail -n 2 | tac');
    expect(sCut.lines).toEqual(['x:z', '1:3']);

    // column -t 표 정렬
    let sCol = createVimState(['name role', 'alice engineer', 'bob qa']);
    sCol = runExCommand(sCol, '%!column -t');
    expect(sCol.lines).toEqual([
      'name   role',
      'alice  engineer',
      'bob    qa',
    ]);

    // jq . JSON 예쁘게 포맷팅
    let sJson = createVimState(['{"b":1,"a":[2,3]}']);
    sJson = runExCommand(sJson, '%!jq .');
    expect(sJson.lines).toEqual([
      '{',
      '  "b": 1,',
      '  "a": [',
      '    2,',
      '    3',
      '  ]',
      '}',
    ]);
  });

  it(':0r !cmd 와 :r !cmd 로 셸 출력을 삽입하고 :w !cmd 로 버퍼 내용을 셸로 파이프한다', () => {
    let s = createVimState(['first', 'second', 'third']);
    s = runExCommand(s, '0r !echo "  // generated"');
    expect(s.lines).toEqual(['  // generated', 'first', 'second', 'third']);
    expect(s.cursor).toEqual({ line: 0, col: 2 });

    // :w !wc -l 은 버퍼를 수정하지 않고 줄 수 출력
    s = runExCommand(s, 'w !wc -l');
    expect(s.lines).toHaveLength(4);
    expect(s.commandMessage).toBe('4');

    // :2,3w !wc -l 은 2~3줄만 파이프
    s = runExCommand(s, '2,3w !wc -l');
    expect(s.commandMessage).toBe('2');
  });

  it('Normal 모드 !!, [count]!!, !{motion} 과 . 반복 및 Visual ! 필터가 동작한다', () => {
    let s = createVimState(['  hello', '  world', 'keep']);
    s = handleKey(s, 'j');
    // 2줄에 대해 !! -> :.! 진입 후 tr a-z A-Z<Enter>
    s = sendKeys(s, '!!');
    expect(s.mode).toBe('COMMAND');
    expect(s.commandBuffer).toBe('.!');
    for (const ch of 'tr a-z A-Z') {
      s = handleKey(s, ch);
    }
    s = handleKey(s, 'Enter');
    expect(s.mode).toBe('NORMAL');
    expect(s.lines).toEqual(['  hello', '  WORLD', 'keep']);
    expect(s.cursor).toEqual({ line: 1, col: 2 });

    // k 로 첫 줄 이동 후 . 반복
    s = handleKey(s, 'k');
    s = handleKey(s, '.');
    expect(s.lines).toEqual(['  HELLO', '  WORLD', 'keep']);

    // !ip 로 문단 전체 필터링
    let sPara = createVimState(['zebra', 'apple', 'mango', '', 'untouched']);
    sPara = handleKey(sPara, 'j');
    sPara = sendKeys(sPara, '!ip');
    expect(sPara.mode).toBe('COMMAND');
    expect(sPara.commandBuffer).toBe('.,.+2!');
    for (const ch of 'sort') sPara = handleKey(sPara, ch);
    sPara = handleKey(sPara, 'Enter');
    expect(sPara.lines).toEqual(['apple', 'mango', 'zebra', '', 'untouched']);

    // Visual V j !sort<Enter>
    let sVis = createVimState(['top', 'c', 'a', 'b', 'bottom']);
    sVis = sendKeys(sVis, 'jV2j!');
    expect(sVis.mode).toBe('COMMAND');
    expect(sVis.commandBuffer).toBe("'<,'>!");
    for (const ch of 'sort') sVis = handleKey(sVis, ch);
    sVis = handleKey(sVis, 'Enter');
    expect(sVis.lines).toEqual(['top', 'a', 'b', 'c', 'bottom']);
  });

  it('존재하지 않는 셸 명령이나 빈 이전 명령 확장 실패 시 bell 을 울리고 버퍼를 유지한다', () => {
    const initial = createVimState(['safe line']);
    const unknownRes = runExCommand(initial, '%!no_such_cmd_xyz');
    expect(unknownRes.bell).toBe(true);
    expect(unknownRes.lines).toEqual(['safe line']);

    const noPrevBang = runExCommand(initial, '!!');
    expect(noPrevBang.bell).toBe(true);
  });
});
