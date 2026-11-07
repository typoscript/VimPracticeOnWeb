import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';
import {
  addHistory,
  navigateHistory,
  openCommandLineWindow,
  closeCommandLineWindow,
  executeCommandLineWindow,
} from './cmdlineWindow';

describe('cmdlineWindow & command line history module', () => {
  const initialLines = [
    'hello vim world',
    'foo bar baz',
    'apple banana cherry',
  ];

  const createBaseState = (): VimEditorState => ({
    lines: [...initialLines],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    commandHistory: ['w', 's/hello/hi/', '%s/bar/qux/g'],
    searchHistory: ['hello', 'apple', 'banana'],
  });

  describe('addHistory and history recording', () => {
    it('연속된 중복 명령은 히스토리에 중복 추가하지 않는다', () => {
      let state = createBaseState();
      // 마지막 명령인 '%s/bar/qux/g'와 동일한 명령을 다시 추가하면 추가되지 않음
      state = addHistory(state, '%s/bar/qux/g', ':');
      expect(state.commandHistory).toEqual(['w', 's/hello/hi/', '%s/bar/qux/g']);

      state = addHistory(state, 'set number', ':');
      expect(state.commandHistory).toEqual([
        'w',
        's/hello/hi/',
        '%s/bar/qux/g',
        'set number',
      ]);

      // 같은 명령어 연속 추가 시 중복 추가 안 됨
      state = addHistory(state, 'set number', ':');
      expect(state.commandHistory?.length).toBe(4);
    });

    it('검색 히스토리(/, ?)도 동일하게 중복 방지하며 기록된다', () => {
      let state = createBaseState();
      state = addHistory(state, 'cherry', '/');
      expect(state.searchHistory).toEqual(['hello', 'apple', 'banana', 'cherry']);
      state = addHistory(state, 'cherry', '/');
      expect(state.searchHistory?.length).toBe(4);
    });
  });

  describe('navigateHistory (ArrowUp/Down, Ctrl-p/Ctrl-n)', () => {
    it('빈 draft 상태에서 위/아래 방향키로 전체 히스토리를 순회한다', () => {
      let state: VimEditorState = {
        ...createBaseState(),
        mode: 'COMMAND',
        commandBuffer: '',
      };

      // ArrowUp: 가장 최근 명령 %s/bar/qux/g
      state = navigateHistory(state, 'up', ':');
      expect(state.commandBuffer).toBe('%s/bar/qux/g');

      // 한번 더 ArrowUp: 이전 명령 s/hello/hi/
      state = navigateHistory(state, 'up', ':');
      expect(state.commandBuffer).toBe('s/hello/hi/');

      // ArrowDown: 다시 최근 명령으로 이동
      state = navigateHistory(state, 'down', ':');
      expect(state.commandBuffer).toBe('%s/bar/qux/g');

      // ArrowDown: 최신을 넘어가면 원래 draft('')로 복구
      state = navigateHistory(state, 'down', ':');
      expect(state.commandBuffer).toBe('');
    });

    it('접두사(prefix)가 입력되어 있으면 해당 접두사로 시작하는 히스토리만 필터링 순회한다', () => {
      let state: VimEditorState = {
        ...createBaseState(),
        commandHistory: ['set nu', 'split', 'set rnu', 'tabnew', 'set ai'],
        mode: 'COMMAND',
        commandBuffer: 'set',
      };

      // ArrowUp -> 'set ai'
      state = navigateHistory(state, 'up', ':');
      expect(state.commandBuffer).toBe('set ai');

      // ArrowUp -> 'set rnu'
      state = navigateHistory(state, 'up', ':');
      expect(state.commandBuffer).toBe('set rnu');

      // ArrowUp -> 'set nu'
      state = navigateHistory(state, 'up', ':');
      expect(state.commandBuffer).toBe('set nu');

      // 맨 처음 도달 후 더 이상 안 올라감
      state = navigateHistory(state, 'up', ':');
      expect(state.commandBuffer).toBe('set nu');

      // ArrowDown 3번 -> 원래 draft인 'set' 복구
      state = navigateHistory(state, 'down', ':');
      expect(state.commandBuffer).toBe('set rnu');
      state = navigateHistory(state, 'down', ':');
      expect(state.commandBuffer).toBe('set ai');
      state = navigateHistory(state, 'down', ':');
      expect(state.commandBuffer).toBe('set');
    });

    it('handleKey를 통해 COMMAND 모드에서 ArrowUp/Down 및 Ctrl-p/Ctrl-n이 동작한다', () => {
      let state = createBaseState();
      // ':' 진입
      state = handleKey(state, ':');
      expect(state.mode).toBe('COMMAND');

      // ArrowUp
      state = handleKey(state, 'ArrowUp');
      expect(state.commandBuffer).toBe('%s/bar/qux/g');

      // Ctrl-p (동일하게 up)
      state = handleKey(state, 'Ctrl-p');
      expect(state.commandBuffer).toBe('s/hello/hi/');

      // Ctrl-n (동일하게 down)
      state = handleKey(state, 'Ctrl-n');
      expect(state.commandBuffer).toBe('%s/bar/qux/g');
    });
  });

  describe('Command-line Window (q:, q/, q?, Ctrl-f)', () => {
    it('NORMAL 모드에서 q: 입력 시 커맨드라인 윈도우가 열린다', () => {
      let state = createBaseState();
      state = handleKey(state, 'q');
      expect(state.pendingKeys).toBe('q');

      state = handleKey(state, ':');
      expect(state.cmdlineWindow).toBeDefined();
      expect(state.cmdlineWindow?.type).toBe(':');
      expect(state.cmdlineWindow?.lines).toEqual([
        'w',
        's/hello/hi/',
        '%s/bar/qux/g',
        '',
      ]);
      expect(state.cmdlineWindow?.mode).toBe('NORMAL');
    });

    it('NORMAL 모드에서 q/ 입력 시 검색 커맨드라인 윈도우가 열린다', () => {
      let state = createBaseState();
      state = handleKey(state, 'q');
      state = handleKey(state, '/');
      expect(state.cmdlineWindow).toBeDefined();
      expect(state.cmdlineWindow?.type).toBe('/');
      expect(state.cmdlineWindow?.lines).toEqual([
        'hello',
        'apple',
        'banana',
        '',
      ]);
    });

    it('COMMAND 모드에서 타이핑 중 Ctrl-f를 누르면 입력 중이던 초안과 함께 커맨드라인 윈도우가 열린다', () => {
      let state = createBaseState();
      state = handleKey(state, ':');
      state = handleKey(state, 's');
      state = handleKey(state, '/');
      state = handleKey(state, 'f');
      state = handleKey(state, 'o');
      state = handleKey(state, 'o');

      // Ctrl-f
      state = handleKey(state, 'Ctrl-f');
      expect(state.cmdlineWindow).toBeDefined();
      expect(state.cmdlineWindow?.type).toBe(':');
      const lines = state.cmdlineWindow?.lines ?? [];
      expect(lines[lines.length - 1]).toBe('s/foo');
    });

    it('커맨드라인 윈도우 안에서 k/j 이동 후 Enter를 누르면 해당 줄의 명령어가 실행된다', () => {
      let state = createBaseState();
      // q: 열기
      state = handleKey(state, 'q');
      state = handleKey(state, ':');
      expect(state.cmdlineWindow).toBeDefined();

      // 현재 커서는 마지막 줄(3번 빈 줄)
      expect(state.cmdlineWindow?.cursor.line).toBe(3);

      // 'k'로 이전 줄(%s/bar/qux/g, line 2)로 이동
      state = handleKey(state, 'k');
      expect(state.cmdlineWindow?.cursor.line).toBe(2);

      // 한번 더 'k'로 's/hello/hi/' (line 1)로 이동
      state = handleKey(state, 'k');
      expect(state.cmdlineWindow?.cursor.line).toBe(1);

      // Enter 실행!
      state = handleKey(state, 'Enter');

      // cmdlineWindow는 닫히고, 첫 번째 줄의 hello가 hi로 치환됨
      expect(state.cmdlineWindow).toBeNull();
      expect(state.lines[0]).toBe('hi vim world');
      // 실행된 명령어가 히스토리의 맨 뒤에 추가됨
      expect(state.commandHistory?.[state.commandHistory.length - 1]).toBe('s/hello/hi/');
    });

    it('커맨드라인 윈도우 안에서 cw 또는 dd로 명령어를 수정/편집할 수 있다', () => {
      let state = createBaseState();
      // q: 열기
      state = handleKey(state, 'q');
      state = handleKey(state, ':');

      // 'k'로 '%s/bar/qux/g' 이동
      state = handleKey(state, 'k');
      expect(state.cmdlineWindow?.cursor.line).toBe(2);

      // 'c' 'c'로 전체 줄 지우고 INSERT 모드로 전환
      state = handleKey(state, 'c');
      state = handleKey(state, 'c');
      expect(state.cmdlineWindow?.mode).toBe('INSERT');

      // 새로운 치환 명령 타이핑: %s/world/universe/
      const newCmd = '%s/world/universe/';
      for (const char of newCmd) {
        state = handleKey(state, char);
      }
      expect(state.cmdlineWindow?.lines[2]).toBe('%s/world/universe/');

      // Enter를 누르면 수정된 명령어가 즉시 실행됨
      state = handleKey(state, 'Enter');
      expect(state.cmdlineWindow).toBeNull();
      expect(state.lines[0]).toBe('hello vim universe');
    });

    it('커맨드라인 윈도우에서 NORMAL 모드 Escape 또는 Ctrl-c를 누르면 변경/실행 없이 창이 닫힌다', () => {
      let state = createBaseState();
      state = handleKey(state, 'q');
      state = handleKey(state, ':');
      expect(state.cmdlineWindow).toBeDefined();

      // Escape로 닫기
      state = handleKey(state, 'Escape');
      expect(state.cmdlineWindow).toBeNull();
      expect(state.lines).toEqual(initialLines);
    });

    it('커맨드라인 윈도우에서 :q 입력 후 Enter를 누르면 창이 닫힌다', () => {
      let state = createBaseState();
      state = handleKey(state, 'q');
      state = handleKey(state, ':');
      expect(state.cmdlineWindow).toBeDefined();

      state = handleKey(state, ':');
      state = handleKey(state, 'q');
      state = handleKey(state, 'Enter');
      expect(state.cmdlineWindow).toBeNull();
    });

    it('openCommandLineWindow, closeCommandLineWindow, executeCommandLineWindow 직접 호출 검증', () => {
      let state = createBaseState();
      state = openCommandLineWindow(state, ':', 'echo "hello"');
      expect(state.cmdlineWindow).toBeDefined();
      expect(state.cmdlineWindow?.lines[state.cmdlineWindow.lines.length - 1]).toBe('echo "hello"');

      // executeCommandLineWindow
      let executedCmd = '';
      const dummyEx = (s: VimEditorState, cmd: string) => {
        executedCmd = cmd;
        return s;
      };
      const dummySearch = (s: VimEditorState) => s;
      state = executeCommandLineWindow(state, dummyEx, dummySearch);
      expect(executedCmd).toBe('echo "hello"');
      expect(state.cmdlineWindow).toBeNull();

      // closeCommandLineWindow
      state = openCommandLineWindow(state, '/');
      expect(state.cmdlineWindow).toBeDefined();
      state = closeCommandLineWindow(state);
      expect(state.cmdlineWindow).toBeNull();
    });
  });
});
