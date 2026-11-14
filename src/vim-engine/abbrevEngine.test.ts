import { describe, it, expect } from 'vitest';
import {
  createVimState,
  handleKey,
  configureVimEngine,
} from './index';

function runKeys(state: ReturnType<typeof createVimState>, keys: string[]) {
  let s = state;
  for (const k of keys) {
    s = handleKey(s, k);
  }
  return s;
}

function typeCommand(state: ReturnType<typeof createVimState>, cmd: string) {
  return runKeys(state, [':', ...cmd.split(''), 'Enter']);
}

describe('Vim 약어 엔진 (:iabbrev, :cabbrev, :abbrev, :unabbrev, :abclear, Ctrl-], Ctrl-v)', () => {
  it(':iabbrev 등록 후 Space, 구두점(.), Tab, Enter, Escape 트리거로 확장된다', () => {
    let s = createVimState(['']);
    s = typeCommand(s, 'iabbrev teh the');

    // Space 트리거
    s = runKeys(s, ['i', ...'teh '.split(''), 'Escape']);
    expect(s.lines[0]).toBe('the ');

    // 구두점(.) 및 Escape 트리거
    s = createVimState(['']);
    s = typeCommand(s, 'iabbrev teh the');
    s = runKeys(s, ['i', ...'teh.'.split(''), ' ', ...'teh'.split(''), 'Escape']);
    expect(s.lines[0]).toBe('the. the');

    // Enter / Tab 트리거
    s = createVimState(['']);
    s = typeCommand(s, 'iabbrev teh the');
    s = runKeys(s, ['i', ...'teh'.split(''), 'Enter', ...'teh'.split(''), 'Tab', 'Escape']);
    expect(s.lines[0]).toBe('the');
    expect(s.lines[1]).toBe('the  ');
  });

  it('단어 경계 규칙을 지킨다 (ateh는 미확장, -teh는 확장, 비단어 시작 @e는 공백 뒤 확장)', () => {
    let s = createVimState(['']);
    s = typeCommand(s, 'iabbrev teh the');

    // 단어 내부(ateh)는 확장되지 않음
    s = runKeys(s, ['i', ...'ateh -teh '.split(''), 'Escape']);
    expect(s.lines[0]).toBe('ateh -the ');

    // 비단어 시작 약어(@e): 공백/줄 시작 뒤에서만 확장, 문자 바로 뒤(foo@e)는 미확장
    let s2 = createVimState(['']);
    s2 = typeCommand(s2, 'iabbrev @e a@b.com');
    s2 = runKeys(s2, ['i', ...'hi @e foo@e '.split(''), 'Escape']);
    expect(s2.lines[0]).toBe('hi a@b.com foo@e ');
  });

  it('Ctrl-]는 트리거 문자를 삽입하지 않고 즉시 약어를 확장한다', () => {
    let s = createVimState(['']);
    s = typeCommand(s, 'iabbrev sig Best regards');
    s = runKeys(s, ['i', ...'sig'.split(''), 'Ctrl-]', 'Escape']);
    expect(s.lines[0]).toBe('Best regards');
  });

  it('Ctrl-v 다음 문자에는 약어가 확장되지 않는다 (Insert 및 Command 모드)', () => {
    let s = createVimState(['']);
    s = typeCommand(s, 'iabbrev teh the');
    s = runKeys(s, ['i', ...'teh'.split(''), 'Ctrl-v', ' ', ...'ok'.split(''), 'Escape']);
    expect(s.lines[0]).toBe('teh ok');

    // 커맨드라인에서도 Ctrl-v로 확장 억제
    let s2 = createVimState(['abc']);
    s2 = typeCommand(s2, 'cabbrev W w');
    s2 = runKeys(s2, [':', 'W', 'Ctrl-v', ' ', '!', 'Escape']);
    expect(s2.lines[0]).toBe('abc');
  });

  it('RHS 내 특수 키 시퀀스(<CR>, <Left>, <Esc>)를 실행한다', () => {
    let s = createVimState(['']);
    s = typeCommand(s, 'inoreabbrev fn function() {}<Left>');
    s = runKeys(s, ['i', ...'fn'.split(''), 'Ctrl-]', ...'x'.split(''), 'Escape']);
    expect(s.lines[0]).toBe('function() {x}');

    let s2 = createVimState(['']);
    s2 = typeCommand(s2, 'iabbrev two line1<CR>line2<Esc>');
    s2 = runKeys(s2, ['i', ...'two'.split(''), 'Ctrl-]']);
    expect(s2.mode).toBe('NORMAL');
    expect(s2.lines).toEqual(['line1', 'line2']);
  });

  it(':inoreabbrev는 재귀 확장을 막고, :iabbrev는 연쇄 확장을 허용한다', () => {
    // 비재귀 (:inoreabbrev)
    let s1 = createVimState(['']);
    s1 = typeCommand(s1, 'inoreabbrev aa bb');
    s1 = typeCommand(s1, 'iabbrev bb cc');
    s1 = runKeys(s1, ['i', ...'aa '.split(''), 'Escape']);
    expect(s1.lines[0]).toBe('bb ');

    // 재귀 (:iabbrev)
    let s2 = createVimState(['']);
    s2 = typeCommand(s2, 'iabbrev aa bb');
    s2 = typeCommand(s2, 'iabbrev bb cc');
    s2 = runKeys(s2, ['i', ...'aa '.split(''), 'Escape']);
    expect(s2.lines[0]).toBe('cc ');
  });

  it(':cabbrev는 커맨드라인에서 동작하며 :cunabbrev 시 약어를 잘못 확장하지 않는다', () => {
    let s = createVimState(['beta', 'alpha']);
    s = typeCommand(s, 'cabbrev sr sort');
    s = typeCommand(s, 'sr');
    expect(s.lines).toEqual(['alpha', 'beta']);

    // Ctrl-] 커맨드라인 수동 확장
    s = typeCommand(s, 'cabbrev gr %s/alpha/gamma/g');
    s = runKeys(s, [':', 'g', 'r', 'Ctrl-]', 'Enter']);
    expect(s.lines).toEqual(['gamma', 'beta']);

    // :cunabbrev W 는 W 를 확장하지 않고 정상 해제해야 함
    s = typeCommand(s, 'cabbrev W sort');
    s = typeCommand(s, 'cunabbrev W');
    expect(s.bell).toBeFalsy();
    expect(s.abbreviations?.['c:W']).toBeUndefined();
  });

  it(':abbrev는 Insert와 Command 양쪽에 등록되고 :unabbrev / :abclear / :ia / :ca 조회가 동작한다', () => {
    let s = createVimState(['b', 'a']);
    s = typeCommand(s, 'abbrev so sort');
    expect(s.abbreviations?.['i:so']).toBeDefined();
    expect(s.abbreviations?.['c:so']).toBeDefined();

    // 목록 출력
    s = typeCommand(s, 'ia');
    expect(s.commandMessage).toContain('so');

    // 단일 해제 및 E24 오류 확인
    s = typeCommand(s, 'iunabbrev so');
    expect(s.abbreviations?.['i:so']).toBeUndefined();
    expect(s.abbreviations?.['c:so']).toBeDefined();

    s = typeCommand(s, 'iunabbrev nonexistent');
    expect(s.bell).toBe(true);
    expect(s.commandMessage).toContain('E24');

    // 영어 로케일 메시지 확인
    configureVimEngine({ locale: 'en' });
    const sEn = typeCommand(s, 'iunabbrev nonexistent');
    expect(sEn.commandMessage).toContain('E24: No such abbreviation');
    configureVimEngine({ locale: 'ko' });

    // :abclear
    s = typeCommand(s, 'abclear');
    expect(Object.keys(s.abbreviations ?? {})).toHaveLength(0);
  });

  it(':source % 및 .vimrc 소싱 시 약어가 적용된다', () => {
    let s = createVimState(['iabbrev adn and', 'cabbrev S sort'], undefined, {
      primaryFilename: '.vimrc',
    });
    s = typeCommand(s, 'source %');
    expect(s.abbreviations?.['i:adn']?.rhs).toBe('and');
    expect(s.abbreviations?.['c:S']?.rhs).toBe('sort');
  });

  it('약어 확장 후 도트 반복(.)이 정상 동작한다', () => {
    let s = createVimState(['first', 'second']);
    s = typeCommand(s, 'iabbrev teh the');
    s = runKeys(s, ['A', ' ', ...'teh'.split(''), 'Escape', 'j', '0', '.']);
    expect(s.lines[0]).toBe('first the');
    expect(s.lines[1]).toBe('second the');
  });
});
