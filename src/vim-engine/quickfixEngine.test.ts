import { describe, it, expect } from 'vitest';
import { VimEditorState, QuickfixItem } from './types';
import { handleKey } from './vimEngine';
import {
  setQuickfixList,
  jumpToQuickfixItem,
  nextQuickfix,
  prevQuickfix,
  firstQuickfix,
  lastQuickfix,
  openQuickfixWindow,
  closeQuickfixWindow,
  toggleQuickfixWindow,
  formatQuickfixList,
  vimgrep,
} from './quickfixEngine';

describe('quickfixEngine module', () => {
  const initialLines = [
    'const a = 1;',
    'const b = ERROR_VAR;',
    'console.log(a, b);',
    'function test() { ERROR_FN(); }',
  ];

  const sampleItems: QuickfixItem[] = [
    { filename: 'app.ts', line: 2, col: 11, text: 'const b = ERROR_VAR;' },
    { filename: 'app.ts', line: 4, col: 19, text: 'function test() { ERROR_FN(); }' },
  ];

  const createBaseState = (): VimEditorState => ({
    lines: [...initialLines],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    primaryFilename: 'app.ts',
  });

  describe('setQuickfixList & jumpToQuickfixItem', () => {
    it('퀵픽스 목록을 등록하고 jumpToFirst=true 시 첫 번째 항목으로 점프한다', () => {
      const state = createBaseState();
      const next = setQuickfixList(state, sampleItems, true);

      expect(next.quickfix).toBeDefined();
      expect(next.quickfix?.items.length).toBe(2);
      expect(next.quickfix?.currentIndex).toBe(0);
      expect(next.cursor.line).toBe(1); // line 2 (0-based: 1)
      expect(next.cursor.col).toBe(10); // col 11 (0-based: 10)
      expect(next.commandMessage).toContain('(1 of 2)');
    });

    it('인덱스를 지정하여 특정 항목으로 점프할 수 있다', () => {
      const state = setQuickfixList(createBaseState(), sampleItems, false);
      const next = jumpToQuickfixItem(state, 1);

      expect(next.quickfix?.currentIndex).toBe(1);
      expect(next.cursor.line).toBe(3); // line 4 (0-based: 3)
      expect(next.cursor.col).toBe(18); // col 19 (0-based: 18)
    });

    it('범위를 벗어난 인덱스 점프 시 E553 에러 메시지를 반환한다', () => {
      const state = setQuickfixList(createBaseState(), sampleItems, false);
      const outOfBounds = jumpToQuickfixItem(state, 5);
      expect(outOfBounds.commandMessage).toBe('E553: No more items');
    });

    it('다른 버퍼의 파일인 경우 해당 버퍼로 자동 전환하며 점프한다', () => {
      const multiBufferState: VimEditorState = {
        ...createBaseState(),
        currentBufferId: 1,
        buffers: [
          { id: 1, name: 'buf1.ts', lines: ['line 1', 'line 2'], cursor: { line: 0, col: 0 } },
          { id: 2, name: 'buf2.ts', lines: ['other file line 1', 'target error line'], cursor: { line: 0, col: 0 } },
        ],
      };

      const crossFileItems: QuickfixItem[] = [
        { filename: 'buf2.ts', bufferId: 2, line: 2, col: 8, text: 'target error line' },
      ];

      const next = setQuickfixList(multiBufferState, crossFileItems, true);
      expect(next.currentBufferId).toBe(2);
      expect(next.cursor.line).toBe(1);
      expect(next.cursor.col).toBe(7);
    });
  });

  describe('nextQuickfix, prevQuickfix, firstQuickfix, lastQuickfix', () => {
    it('nextQuickfix 및 prevQuickfix로 순회하고 경계 도달 시 E553을 표시한다', () => {
      let state = setQuickfixList(createBaseState(), sampleItems, true);
      expect(state.quickfix?.currentIndex).toBe(0);

      // 다음 항목
      state = nextQuickfix(state);
      expect(state.quickfix?.currentIndex).toBe(1);
      expect(state.cursor.line).toBe(3);

      // 더 이상 다음 항목이 없음
      state = nextQuickfix(state);
      expect(state.commandMessage).toBe('E553: No more items');

      // 이전 항목
      state = prevQuickfix(state);
      expect(state.quickfix?.currentIndex).toBe(0);
      expect(state.cursor.line).toBe(1);

      // 더 이상 이전 항목 없음
      state = prevQuickfix(state);
      expect(state.commandMessage).toBe('E553: No more items');
    });

    it('firstQuickfix 및 lastQuickfix로 양 끝으로 즉시 점프한다', () => {
      let state = setQuickfixList(createBaseState(), sampleItems, false);

      state = lastQuickfix(state);
      expect(state.quickfix?.currentIndex).toBe(1);

      state = firstQuickfix(state);
      expect(state.quickfix?.currentIndex).toBe(0);
    });
  });

  describe('openQuickfixWindow, closeQuickfixWindow, toggleQuickfixWindow', () => {
    it('퀵픽스 윈도우 열기/닫기/토글이 정상 동작한다', () => {
      let state = setQuickfixList(createBaseState(), sampleItems, false);
      expect(state.quickfix?.isOpen).toBe(false);

      // :copen
      state = openQuickfixWindow(state, 10);
      expect(state.quickfix?.isOpen).toBe(true);
      expect(state.quickfix?.height).toBe(10);

      // :cclose
      state = closeQuickfixWindow(state);
      expect(state.quickfix?.isOpen).toBe(false);

      // :cwindow (항목이 있으므로 열림)
      state = toggleQuickfixWindow(state);
      expect(state.quickfix?.isOpen).toBe(true);

      // 빈 퀵픽스 목록에서는 :cwindow 시 닫힘
      state = setQuickfixList(state, [], false);
      state = toggleQuickfixWindow(state);
      expect(state.quickfix?.isOpen).toBe(false);
    });

    it('formatQuickfixList로 :clist 출력 문자열을 생성한다', () => {
      const state = setQuickfixList(createBaseState(), sampleItems, true);
      const listStr = formatQuickfixList(state);
      expect(listStr).toContain('> 1 | app.ts:2:11 | const b = ERROR_VAR;');
      expect(listStr).toContain('  2 | app.ts:4:19 | function test() { ERROR_FN(); }');
    });
  });

  describe('vimgrep', () => {
    it(':vimgrep으로 현재 버퍼(%) 내 패턴을 검색하여 퀵픽스 목록을 생성하고 첫 매칭으로 이동한다', () => {
      const state = createBaseState();
      const res = vimgrep(state, '/ERROR/ %');

      expect(res.quickfix).toBeDefined();
      expect(res.quickfix?.items.length).toBe(2);
      expect(res.cursor.line).toBe(1);
      expect(res.cursor.col).toBe(10);
    });

    it(':vimgrep에 j 플래그가 있으면 첫 번째 매칭으로 즉시 점프하지 않는다', () => {
      const state = createBaseState();
      const res = vimgrep(state, '/ERROR/j %');

      expect(res.quickfix?.items.length).toBe(2);
      // 커서 위치는 원래 위치(0, 0) 유지
      expect(res.cursor.line).toBe(0);
      expect(res.cursor.col).toBe(0);
    });

    it('일치하는 패턴이 없으면 E480 에러를 반환한다', () => {
      const state = createBaseState();
      const res = vimgrep(state, '/NOT_FOUND/ %');
      expect(res.commandMessage).toBe('E480: No match: NOT_FOUND');
    });
  });

  describe('handleKey Ex commands integration', () => {
    it(':vimgrep, :copen, :cn, :cp, :ccl을 키스트로크로 온전히 수행할 수 있다', () => {
      let state = createBaseState();

      // 1. :vimgrep /ERROR/ %
      const cmd1 = ':vimgrep /ERROR/ %\n';
      for (const char of cmd1) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.quickfix?.items.length).toBe(2);
      expect(state.cursor.line).toBe(1);

      // 2. :copen
      const cmd2 = ':copen\n';
      for (const char of cmd2) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.quickfix?.isOpen).toBe(true);

      // 3. :cn (다음 에러로 이동)
      const cmd3 = ':cn\n';
      for (const char of cmd3) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.quickfix?.currentIndex).toBe(1);
      expect(state.cursor.line).toBe(3);

      // 4. :cp (이전 에러로 이동)
      const cmd4 = ':cp\n';
      for (const char of cmd4) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.quickfix?.currentIndex).toBe(0);
      expect(state.cursor.line).toBe(1);

      // 5. :cclose
      const cmd5 = ':cclose\n';
      for (const char of cmd5) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.quickfix?.isOpen).toBe(false);
    });

    it(':cfile 명령으로 외부 에러 로그 파일을 파싱하여 퀵픽스로 로드하고 첫 에러로 점프한다', () => {
      let state: VimEditorState = {
        lines: [
          'const a = 1;',
          'const b = 2;',
          'const c = 3;',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        primaryFilename: 'app.ts',
        buffers: [
          {
            id: 1,
            name: 'app.ts',
            lines: ['const a = 1;', 'const b = 2;', 'const c = 3;'],
            cursor: { line: 0, col: 0 },
          },
          {
            id: 2,
            name: 'errors.log',
            lines: [
              'app.ts:2:7: error TS2304: Cannot find name "b"',
              'app.ts:3:1: warning TS2322: Type "number" is not assignable',
            ],
            cursor: { line: 0, col: 0 },
          },
        ],
        currentBufferId: 1,
      };

      // :cfile errors.log 실행
      const cmd = ':cfile errors.log\n';
      for (const char of cmd) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }

      expect(state.quickfix).toBeDefined();
      expect(state.quickfix?.items.length).toBe(2);
      expect(state.quickfix?.items[0].filename).toBe('app.ts');
      expect(state.quickfix?.items[0].line).toBe(2);
      expect(state.quickfix?.items[0].col).toBe(7);
      // 첫 번째 에러 위치 (line 2 -> index 1)로 점프
      expect(state.cursor.line).toBe(1);
    });

    it(':cgetfile 명령은 퀵픽스 목록을 로드하되 커서 위치를 이동하지 않는다', () => {
      let state: VimEditorState = {
        lines: ['const a = 1;', 'const b = 2;'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        primaryFilename: 'main.ts',
        buffers: [
          {
            id: 1,
            name: 'build.err',
            lines: ['main.ts:2:5: syntax error'],
            cursor: { line: 0, col: 0 },
          },
        ],
        currentBufferId: 0,
      };

      const cmd = ':cgetfile build.err\n';
      for (const char of cmd) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }

      expect(state.quickfix?.items.length).toBe(1);
      // 커서는 여전히 line 0 유지
      expect(state.cursor.line).toBe(0);
    });
  });
});
