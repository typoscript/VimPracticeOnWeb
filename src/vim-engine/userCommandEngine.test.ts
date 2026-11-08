import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';
import { expandUserCommand, lookupUserCommand } from './userCommandEngine';
import type { UserCommand, VimEditorState } from './types';

function createState(lines: string[], cursor = { line: 0, col: 0 }): VimEditorState {
  return {
    lines,
    cursor,
    mode: 'NORMAL',
  };
}

function press(state: VimEditorState, keys: string[]): VimEditorState {
  return keys.reduce((s, k) => handleKey(s, k), state);
}

/** ':' + 명령 + Enter 를 실제 키 입력으로 실행 */
function ex(state: VimEditorState, command: string): VimEditorState {
  return press(state, [':', ...command.split(''), 'Enter']);
}

describe('User Command: 정의·삭제·목록 (:command!, :delcommand, :comclear)', () => {
  it(':command! 로 명령을 등록하고 :command 로 목록을 본다', () => {
    let state = ex(createState(['a']), 'command! -nargs=1 -range=% -bang Sub %s/<args>/X/g');
    expect(state.userCommands?.Sub).toEqual({
      name: 'Sub',
      nargs: '1',
      range: 'file',
      bang: true,
      replacement: '%s/<args>/X/g',
    });

    state = ex(state, 'command');
    expect(state.commandMessage).toContain('Sub');
    expect(state.commandMessage).toContain('%s/<args>/X/g');

    state = ex(state, 'com Zz');
    expect(state.commandMessage).toBe('사용자 정의 명령이 없습니다.');
  });

  it('! 없이 같은 이름을 다시 정의하면 E174, ! 를 붙이면 덮어쓴다', () => {
    let state = ex(createState(['a']), 'command Up normal gUU');
    state = ex(state, 'command Up normal guu');
    expect(state.commandMessage).toMatch(/^E174/);
    expect(state.userCommands?.Up.replacement).toBe('normal gUU');

    state = ex(state, 'command! Up normal guu');
    expect(state.userCommands?.Up.replacement).toBe('normal guu');
  });

  it('소문자로 시작하는 이름과 잘못된 속성은 거부한다', () => {
    expect(ex(createState(['a']), 'command! up normal x').commandMessage).toMatch(/^E183/);
    expect(ex(createState(['a']), 'command! -nargs=2 Up normal x').commandMessage).toMatch(/^E176/);
    expect(ex(createState(['a']), 'command! -foo Up normal x').commandMessage).toMatch(/^E181/);
  });

  it(':delcommand 와 :comclear 로 삭제한다', () => {
    let state = ex(ex(createState(['a']), 'command! A1 normal x'), 'command! B1 normal x');
    state = ex(state, 'delcommand A1');
    expect(Object.keys(state.userCommands ?? {})).toEqual(['B1']);
    expect(ex(state, 'delcommand A1').commandMessage).toMatch(/^E184/);

    state = ex(state, 'comclear');
    expect(state.userCommands).toEqual({});
  });
});

describe('User Command: 호출과 치환', () => {
  it(':W 처럼 내장 명령을 대문자 별칭으로 만든다 (오타 방지 실무 패턴)', () => {
    let state = ex(createState(['hello']), 'command! Up normal gUU');
    state = ex(state, 'Up');
    expect(state.lines).toEqual(['HELLO']);
    expect(state.mode).toBe('NORMAL');
  });

  it('<args> 와 범위(<line1>,<line2>)를 치환하여 실행한다', () => {
    let state = ex(createState(['foo 1', 'foo 2', 'foo 3']), 'command! -nargs=1 -range Rep <line1>,<line2>s/foo/<args>/');
    state = ex(state, '2,3Rep bar');
    expect(state.lines).toEqual(['foo 1', 'bar 2', 'bar 3']);

    // 범위를 생략하면 현재 줄
    state = ex({ ...state, cursor: { line: 0, col: 0 } }, 'Rep baz');
    expect(state.lines[0]).toBe('baz 1');
  });

  it('-range=% 는 범위를 생략하면 전체 버퍼에 적용된다', () => {
    let state = ex(createState(['a', 'b']), 'command! -range=% Shout <line1>,<line2>normal gUU');
    state = ex(state, 'Shout');
    expect(state.lines).toEqual(['A', 'B']);
  });

  it('접두어로 호출할 수 있고, 모호하면 E464', () => {
    let state = ex(ex(createState(['x']), 'command! Format normal gUU'), 'command! Fix normal x');
    expect(ex(state, 'Fo').lines).toEqual(['X']);
    expect(ex(state, 'F').commandMessage).toMatch(/^E464/);
    expect(lookupUserCommand(state, 'Format').kind).toBe('found');
  });

  it('인자·범위·! 규칙을 검증한다 (E471, E488, E481, E477)', () => {
    let state = ex(createState(['x']), 'command! -nargs=1 Need normal x');
    expect(ex(state, 'Need').commandMessage).toMatch(/^E471/);

    state = ex(state, 'command! NoArg normal x');
    expect(ex(state, 'NoArg extra').commandMessage).toMatch(/^E488/);
    expect(ex(state, '%NoArg').commandMessage).toMatch(/^E481/);
    expect(ex(state, 'NoArg!').commandMessage).toMatch(/^E477/);
    // 실패한 사용자 명령은 bell을 울린다
    expect(ex(state, 'NoArg!').bell).toBe(true);
  });

  it('자기 자신을 호출하는 명령은 E169 로 멈춘다', () => {
    let state = ex(createState(['x']), 'command! Loop Loop');
    state = ex(state, 'Loop');
    expect(state.commandMessage).toMatch(/^E169/);
  });

  it('내장 명령(:E 등)은 사용자 명령에 가려지지 않는다', () => {
    const state = executeCommandLine(createState(['x']), 'command! Edit normal x');
    expect(lookupUserCommand(state, 'E').kind).toBe('found');
    // :E 는 여전히 순정 Netrw 파일 탐색기 (사용자 명령 Edit 의 normal x 가 실행되지 않음)
    const opened = executeCommandLine(state, 'E');
    expect(opened.netrw?.isOpen).toBe(true);
  });

  it('<q-args>, <bang>, <lt> 를 치환한다', () => {
    const command: UserCommand = { name: 'T', nargs: '*', range: 'none', bang: true, replacement: 'echo <q-args><bang> <lt>x>' };
    expect(expandUserCommand(command, { bang: true, args: 'say "hi"', range: null }, 1, 1)).toBe('echo "say \\"hi\\""! <x>');
  });
});

describe('User Command: .vimrc 소싱', () => {
  it(':source 로 command! 정의를 적용한다', () => {
    let state = createState(['" my vimrc', 'command! Up normal gUU', 'set number']);
    state = ex(state, 'source %');
    expect(state.userCommands?.Up).toBeDefined();
    expect(state.commandMessage).toContain('2개 설정 적용');
  });
});
