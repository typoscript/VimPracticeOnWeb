import { describe, it, expect } from 'vitest';
import {
  createVimState,
  sendKeys,
  handleKey,
  runExCommand,
  splitIdentifierWords,
  coerceIdentifierCase,
  splitTopLevelItems,
} from './index';

describe('Neovim Built-in Terminal (:terminal / :term / :ToggleTerm)', () => {
  it(':terminal 로 진입해 셸 명령을 실행하고 Ctrl-\\ Ctrl-n → NORMAL 전환 및 i 재개가 동작한다', () => {
    let s = createVimState(['const a = 1;'], { line: 0, col: 0 }, {
      primaryFilename: 'src/app.ts',
      virtualFiles: { 'src/app.ts': ['const a = 1;'] },
    });

    s = runExCommand(s, 'terminal');
    expect(s.mode).toBe('TERMINAL');
    expect(s.primaryFilename).toBe('term://shell');
    expect(s.terminalSession?.isOpen).toBe(true);

    // 셸 명령 입력 및 실행
    s = sendKeys(s, 'echo hello_term<CR>');
    expect(s.lines.some((l) => l === 'hello_term')).toBe(true);
    expect(s.mode).toBe('TERMINAL');

    // Ctrl-\ Ctrl-n 으로 NORMAL 모드 전환
    s = handleKey(s, 'Ctrl-\\');
    expect(s.pendingKeys).toBe('<C-\\>');
    s = handleKey(s, 'Ctrl-n');
    expect(s.mode).toBe('NORMAL');

    // NORMAL 모드에서 위로 올라가 출력 텍스트 복사
    s = sendKeys(s, 'kyiw');
    expect(s.clipboard?.content).toBe('hello_term');

    // 다시 i 를 누르면 TERMINAL 모드로 재진입
    s = handleKey(s, 'i');
    expect(s.mode).toBe('TERMINAL');

    // 히스토리 탐색 (ArrowUp) 및 Ctrl-c 취소
    s = handleKey(s, 'ArrowUp');
    expect(s.terminalSession?.inputBuffer).toBe('echo hello_term');
    s = handleKey(s, 'Ctrl-c');
    expect(s.terminalSession?.inputBuffer).toBe('');

    // exit 로 터미널 종료 시 원래 버퍼 복귀
    s = sendKeys(s, 'exit<CR>');
    expect(s.mode).toBe('NORMAL');
    expect(s.terminalSession).toBeNull();
    expect(s.primaryFilename).toBe('src/app.ts');
    expect(s.lines).toEqual(['const a = 1;']);
  });

  it(':ToggleTerm [cmd] 로 하단 분할 터미널을 열고 출력을 복사해 코드 창에 붙여넣은 뒤 닫을 수 있다', () => {
    let s = createVimState(['const ver = "OLD";'], { line: 0, col: 0 }, {
      primaryFilename: 'src/ver.ts',
    });

    s = runExCommand(s, 'ToggleTerm echo v3.0.0');
    expect(s.mode).toBe('TERMINAL');
    expect(s.splitPanes?.length).toBe(2);
    expect(s.lines.includes('v3.0.0')).toBe(true);

    s = handleKey(s, 'Ctrl-\\');
    s = handleKey(s, 'Ctrl-n');
    s = sendKeys(s, 'kyiW<C-w>kf"ci"<C-r>0<Esc>');
    expect(s.lines).toEqual(['const ver = "v3.0.0";']);

    s = runExCommand(s, 'ToggleTerm');
    expect(s.terminalSession).toBeNull();
    expect(s.lines).toEqual(['const ver = "v3.0.0";']);
  });

  it('터미널 내 cd / pwd / clear / help 명령이 정상 동작한다', () => {
    let s = createVimState(['x']);
    s = runExCommand(s, 'term');
    s = sendKeys(s, 'cd src<CR>pwd<CR>');
    expect(s.lines.includes('/workspace/src')).toBe(true);
    s = sendKeys(s, 'clear<CR>');
    expect(s.lines.length).toBe(1);
    s = sendKeys(s, 'help<CR>');
    expect(s.lines.some((l) => l.includes('Built-in shell'))).toBe(true);
  });
});

describe('dial.nvim 스마트 토글 & 날짜/연산자 증감 (Ctrl-a / Ctrl-x)', () => {
  it('불리언·ISO 날짜·연산자·요일·로그레벨·const/let 을 증감하고 숫자와 충돌하지 않는다', () => {
    // 1. 기존 숫자 우선 호환성
    let numState = createVimState(['const count = 41;']);
    numState = handleKey(numState, 'Ctrl-a');
    expect(numState.lines[0]).toBe('const count = 42;');

    // 2. 불리언 토글 및 u Undo
    let boolState = createVimState(['const enabled = false;']);
    boolState = handleKey(boolState, 'Ctrl-a');
    expect(boolState.lines[0]).toBe('const enabled = true;');
    boolState = handleKey(boolState, 'u');
    expect(boolState.lines[0]).toBe('const enabled = false;');

    // 3. ISO 날짜 월말 경계 증감 (2026-11-30 + 1 -> 2026-12-01, -2 -> 2026-11-29)
    let dateState = createVimState(['const due = "2026-11-30";']);
    dateState = handleKey(dateState, 'Ctrl-a');
    expect(dateState.lines[0]).toBe('const due = "2026-12-01";');
    dateState = sendKeys(dateState, '2<C-x>');
    expect(dateState.lines[0]).toBe('const due = "2026-11-29";');

    // 4. 연산자 & 로그레벨 & 요일 & const↔let
    let opState = createVimState(['if (a === b && c >= d) {}']);
    opState = handleKey(opState, 'Ctrl-a');
    expect(opState.lines[0]).toBe('if (a !== b && c >= d) {}');
    opState = sendKeys(opState, 'f&<C-a>f><C-a>');
    expect(opState.lines[0]).toBe('if (a !== b || c <= d) {}');

    let kwState = createVimState(['const label = "hi";']);
    kwState = handleKey(kwState, 'Ctrl-a');
    expect(kwState.lines[0]).toBe('let label = "hi";');

    let dayState = createVimState(['const day = "Monday";']);
    dayState = sendKeys(dayState, '2<C-a>');
    expect(dayState.lines[0]).toBe('const day = "Wednesday";');

    // 5. Visual Line 일괄 불리언 토글
    let visState = createVimState(['const a = false;', 'const b = false;']);
    visState = sendKeys(visState, 'Vj<C-a>');
    expect(visState.lines).toEqual(['const a = true;', 'const b = true;']);

    // 6. :DialInc / :DialDec Ex 명령
    let exState = createVimState(['const level = "debug";']);
    exState = runExCommand(exState, 'DialInc 2');
    expect(exState.lines[0]).toBe('const level = "warn";');
    exState = runExCommand(exState, 'DialDec');
    expect(exState.lines[0]).toBe('const level = "info";');
  });
});

describe('vim-abolish 식별자 케이스 변환 (crs / crc / crm / cru / cr- / cr. / :Coerce)', () => {
  it('단어 분해 및 8종 케이스 변환 유틸리티가 정확히 동작한다', () => {
    expect(splitIdentifierWords('HTTPServerURL')).toEqual(['http', 'server', 'url']);
    expect(splitIdentifierWords('user_profile_id')).toEqual(['user', 'profile', 'id']);
    expect(splitIdentifierWords('api-base-url')).toEqual(['api', 'base', 'url']);
    expect(coerceIdentifierCase('user_profile_id', 'camel')).toBe('userProfileId');
    expect(coerceIdentifierCase('userProfileId', 'snake')).toBe('user_profile_id');
    expect(coerceIdentifierCase('user_profile_id', 'pascal')).toBe('UserProfileId');
    expect(coerceIdentifierCase('userProfileId', 'upper')).toBe('USER_PROFILE_ID');
    expect(coerceIdentifierCase('userProfileId', 'kebab')).toBe('user-profile-id');
    expect(coerceIdentifierCase('userProfileId', 'dot')).toBe('user.profile.id');
    expect(coerceIdentifierCase('user_profile_id', 'title')).toBe('User Profile Id');
  });

  it('NORMAL 모드 cr{variant}, 도트 반복(.), Undo 및 :Coerce 명령을 지원한다', () => {
    let s = createVimState([
      'const user_name = "a";',
      'const order_id = "b";',
    ]);
    s = sendKeys(s, 'wcrc');
    expect(s.lines[0]).toBe('const userName = "a";');

    // 도트 반복(.)으로 다음 줄도 camelCase 변환
    s = sendKeys(s, 'j0w.');
    expect(s.lines[1]).toBe('const orderId = "b";');

    // Undo 로 2번째 줄 원복
    s = handleKey(s, 'u');
    expect(s.lines[1]).toBe('const order_id = "b";');

    // crm / cru / cr- / :Coerce
    s = sendKeys(s, 'crm');
    expect(s.lines[1]).toBe('const OrderId = "b";');
    s = sendKeys(s, 'cru');
    expect(s.lines[1]).toBe('const ORDER_ID = "b";');
    s = sendKeys(s, 'cr-');
    expect(s.lines[1]).toBe('const order-id = "b";');
    s = runExCommand(s, 'Coerce snake');
    expect(s.lines[1]).toBe('const order_id = "b";');
  });
});

describe('treesj 구조적 Split/Join (gS / :TSJToggle / :TSJSplit / :TSJJoin)', () => {
  it('문자열·중첩 괄호 안 쉼표를 보존하며 최상위 항목을 정확히 분할한다', () => {
    expect(splitTopLevelItems('a: "x, y", b: fn(1, 2), c: [3, 4]')).toEqual([
      'a: "x, y"',
      'b: fn(1, 2)',
      'c: [3, 4]',
    ]);
  });

  it('gS 로 한 줄 객체/배열/함수를 멀티라인으로 펼치고 다시 한 줄로 왕복 병합하며 Undo 를 지원한다', () => {
    let s = createVimState(['const cfg = { host: "local", port: 8080, msg: "a, b" };']);

    // Split
    s = sendKeys(s, 'gS');
    expect(s.lines).toEqual([
      'const cfg = {',
      '  host: "local",',
      '  port: 8080,',
      '  msg: "a, b"',
      '};',
    ]);

    // Join (왕복 대칭)
    s = sendKeys(s, 'gS');
    expect(s.lines).toEqual(['const cfg = { host: "local", port: 8080, msg: "a, b" };']);

    // Undo → 다시 멀티라인 복원
    s = handleKey(s, 'u');
    expect(s.lines.length).toBe(5);

    // :TSJJoin / :TSJSplit Ex 명령
    s = runExCommand(s, 'TSJJoin');
    expect(s.lines).toEqual(['const cfg = { host: "local", port: 8080, msg: "a, b" };']);

    // 함수 인자 Split / Join
    let fnState = createVimState(['  callApi(url, { retry: 3 }, true);']);
    fnState = runExCommand(fnState, 'TSJSplit');
    expect(fnState.lines).toEqual([
      '  callApi(',
      '    url,',
      '    { retry: 3 },',
      '    true',
      '  );',
    ]);
    fnState = runExCommand(fnState, 'TSJToggle');
    expect(fnState.lines).toEqual(['  callApi(url, { retry: 3 }, true);']);

    // 빈 블록은 bell
    let emptyState = createVimState(['const obj = {};']);
    emptyState = sendKeys(emptyState, 'gS');
    expect(emptyState.bell).toBe(true);
  });
});
