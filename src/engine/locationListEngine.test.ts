import { describe, it, expect } from 'vitest';
import {
  setLocationList,
  jumpToLocationListItem,
  nextLocationList,
  prevLocationList,
  firstLocationList,
  lastLocationList,
  openLocationListWindow,
  closeLocationListWindow,
  toggleLocationListWindow,
  formatLocationList,
  lvimgrep,
  loadLocationListFromFile,
} from './locationListEngine';
import { handleKey } from './vimEngine';
import { QuickfixItem, VimEditorState } from '../types/vim';

describe('locationListEngine module', () => {
  const dummyItems: QuickfixItem[] = [
    {
      filename: 'source.ts',
      line: 2,
      col: 5,
      text: 'Cannot find name "foo"',
      type: 'E',
    },
    {
      filename: 'source.ts',
      line: 4,
      col: 10,
      text: 'Type "number" is not assignable',
      type: 'W',
    },
  ];

  describe('setLocationList & jumpToLocationListItem', () => {
    it('로케이션 리스트를 등록하고 jumpToFirst=true 시 첫 번째 항목으로 점프한다', () => {
      const state: VimEditorState = {
        lines: ['line 1', 'line 2 foo', 'line 3', 'line 4 num'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      const next = setLocationList(state, dummyItems, true);

      expect(next.locationList).toBeDefined();
      expect(next.locationList?.items.length).toBe(2);
      expect(next.locationList?.currentIndex).toBe(0);
      expect(next.cursor).toEqual({ line: 1, col: 4 });
      expect(next.commandMessage).toContain('Cannot find name "foo"');
    });

    it('인덱스를 지정하여 특정 항목으로 점프할 수 있다', () => {
      let state: VimEditorState = {
        lines: ['line 1', 'line 2 foo', 'line 3', 'line 4 num'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      state = setLocationList(state, dummyItems, false);
      const jumped = jumpToLocationListItem(state, 1);

      expect(jumped.locationList?.currentIndex).toBe(1);
      expect(jumped.cursor).toEqual({ line: 3, col: 9 });
    });

    it('목록이 비어있으면 E776 에러 메시지를 반환한다', () => {
      const state: VimEditorState = {
        lines: ['line 1'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      const res = jumpToLocationListItem(state, 0);
      expect(res.commandMessage).toBe('E776: No location list');
    });

    it('범위를 벗어난 인덱스 점프 시 E553 에러 메시지를 반환한다', () => {
      let state: VimEditorState = {
        lines: ['line 1'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };
      state = setLocationList(state, dummyItems, false);

      const res = jumpToLocationListItem(state, 5);
      expect(res.commandMessage).toBe('E553: No more items');
    });

    it('다른 버퍼의 파일인 경우 해당 버퍼로 자동 전환하며 점프한다', () => {
      const multiBufItems: QuickfixItem[] = [
        {
          filename: 'other.ts',
          bufferId: 2,
          line: 1,
          col: 3,
          text: 'other error',
        },
      ];

      const state: VimEditorState = {
        lines: ['main line 1'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        currentBufferId: 1,
        buffers: [
          {
            id: 1,
            name: 'main.ts',
            lines: ['main line 1'],
            cursor: { line: 0, col: 0 },
          },
          {
            id: 2,
            name: 'other.ts',
            lines: ['other line 1'],
            cursor: { line: 0, col: 0 },
          },
        ],
      };

      const next = setLocationList(state, multiBufItems, true);
      expect(next.currentBufferId).toBe(2);
      expect(next.lines[0]).toBe('other line 1');
      expect(next.cursor).toEqual({ line: 0, col: 2 });
    });
  });

  describe('nextLocationList, prevLocationList, firstLocationList, lastLocationList', () => {
    it('nextLocationList 및 prevLocationList로 순회하고 경계 도달 시 E553을 표시한다', () => {
      let state: VimEditorState = {
        lines: ['l1', 'l2', 'l3', 'l4'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };
      state = setLocationList(state, dummyItems, true);
      expect(state.locationList?.currentIndex).toBe(0);

      // 다음 항목 이동
      state = nextLocationList(state);
      expect(state.locationList?.currentIndex).toBe(1);

      // 마지막에서 다시 다음 -> E553
      const boundaryNext = nextLocationList(state);
      expect(boundaryNext.commandMessage).toBe('E553: No more items');

      // 이전 항목 이동
      state = prevLocationList(state);
      expect(state.locationList?.currentIndex).toBe(0);

      // 첫 번째에서 다시 이전 -> E553
      const boundaryPrev = prevLocationList(state);
      expect(boundaryPrev.commandMessage).toBe('E553: No more items');
    });

    it('firstLocationList 및 lastLocationList로 양 끝으로 즉시 점프한다', () => {
      let state: VimEditorState = {
        lines: ['l1', 'l2', 'l3', 'l4'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };
      state = setLocationList(state, dummyItems, false);

      state = lastLocationList(state);
      expect(state.locationList?.currentIndex).toBe(1);

      state = firstLocationList(state);
      expect(state.locationList?.currentIndex).toBe(0);
    });
  });

  describe('openLocationListWindow, closeLocationListWindow, toggleLocationListWindow', () => {
    it('로케이션 리스트 윈도우 열기/닫기/토글이 정상 동작한다', () => {
      let state: VimEditorState = {
        lines: ['l1'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };
      state = setLocationList(state, dummyItems, false);
      expect(state.locationList?.isOpen).toBe(false);

      // 열기
      state = openLocationListWindow(state, 10);
      expect(state.locationList?.isOpen).toBe(true);
      expect(state.locationList?.height).toBe(10);

      // 닫기
      state = closeLocationListWindow(state);
      expect(state.locationList?.isOpen).toBe(false);

      // 토글 (아이템이 있으므로 열림)
      state = toggleLocationListWindow(state);
      expect(state.locationList?.isOpen).toBe(true);

      // 아이템이 없으면 토글 시 닫힘
      let emptyState = setLocationList(state, [], false);
      emptyState = toggleLocationListWindow(emptyState);
      expect(emptyState.locationList?.isOpen).toBe(false);
    });

    it('formatLocationList로 :llist 출력 문자열을 생성한다', () => {
      let state: VimEditorState = {
        lines: ['l1'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };
      state = setLocationList(state, dummyItems, true);

      const listStr = formatLocationList(state);
      expect(listStr).toContain('> 1 | source.ts:2:5 | Cannot find name "foo"');
      expect(listStr).toContain('  2 | source.ts:4:10 | Type "number" is not assignable');
    });
  });

  describe('lvimgrep', () => {
    it(':lvimgrep으로 현재 버퍼(%) 내 패턴을 검색하여 로케이션 리스트를 생성하고 첫 매칭으로 이동한다', () => {
      const state: VimEditorState = {
        lines: [
          'const alpha = 10;',
          '// TODO: fix this bug',
          'const beta = 20;',
          '// TODO: add more tests',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        primaryFilename: 'app.ts',
      };

      const res = lvimgrep(state, '/TODO/ %');
      expect(res.locationList).toBeDefined();
      expect(res.locationList?.items.length).toBe(2);
      expect(res.cursor).toEqual({ line: 1, col: 3 });
      expect(res.commandMessage).toContain('TODO: fix this bug');
    });

    it(':lvimgrep에 j 플래그가 있으면 첫 번째 매칭으로 즉시 점프하지 않는다', () => {
      const state: VimEditorState = {
        lines: ['const a = 1;', 'const b = 2; // target', 'const c = 3; // target'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        primaryFilename: 'app.ts',
      };

      const res = lvimgrep(state, '/target/j %');
      expect(res.locationList?.items.length).toBe(2);
      expect(res.cursor).toEqual({ line: 0, col: 0 });
    });

    it('일치하는 패턴이 없으면 E480 에러를 반환한다', () => {
      const state: VimEditorState = {
        lines: ['const a = 1;'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      const res = lvimgrep(state, '/notfound/ %');
      expect(res.commandMessage).toBe('E480: No match: notfound');
    });
  });

  describe('handleKey Ex commands integration', () => {
    it(':lvimgrep, :lopen, :lne, :lp, :lcl을 키스트로크로 온전히 수행할 수 있다', () => {
      let state: VimEditorState = {
        lines: [
          'function test() {',
          '  // BUG: memory leak',
          '  console.log("hello");',
          '  // BUG: null pointer',
          '}',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        primaryFilename: 'leak.ts',
      };

      // 1. :lvimgrep /BUG/ % 실행
      const cmd1 = ':lvimgrep /BUG/ %\n';
      for (const char of cmd1) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.locationList?.items.length).toBe(2);
      expect(state.cursor.line).toBe(1);

      // 2. :lopen 실행
      const cmd2 = ':lopen\n';
      for (const char of cmd2) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.locationList?.isOpen).toBe(true);

      // 3. :lne 로 다음 매칭으로 이동
      const cmd3 = ':lne\n';
      for (const char of cmd3) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.locationList?.currentIndex).toBe(1);
      expect(state.cursor.line).toBe(3);

      // 4. :lp 로 이전 매칭으로 복귀
      const cmd4 = ':lp\n';
      for (const char of cmd4) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.locationList?.currentIndex).toBe(0);
      expect(state.cursor.line).toBe(1);

      // 5. :lcl 로 로케이션 리스트 닫기
      const cmd5 = ':lcl\n';
      for (const char of cmd5) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.locationList?.isOpen).toBe(false);
    });

    it(':lfile 명령으로 외부 에러 로그 파일을 파싱하여 로케이션 리스트로 로드하고 첫 에러로 점프한다', () => {
      let state: VimEditorState = {
        lines: ['const a = 1;', 'const b = 2;', 'const c = 3;'],
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
            name: 'lint.err',
            lines: [
              'app.ts:2:7: error TS2304: Cannot find name "b"',
              'app.ts:3:1: warning TS2322: Type "number" is not assignable',
            ],
            cursor: { line: 0, col: 0 },
          },
        ],
        currentBufferId: 1,
      };

      const cmd = ':lfile lint.err\n';
      for (const char of cmd) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }

      expect(state.locationList).toBeDefined();
      expect(state.locationList?.items.length).toBe(2);
      expect(state.locationList?.items[0].filename).toBe('app.ts');
      expect(state.locationList?.items[0].line).toBe(2);
      expect(state.locationList?.items[0].col).toBe(7);
      expect(state.cursor.line).toBe(1);
    });

    it(':lgetfile 명령은 로케이션 리스트 목록을 로드하되 커서 위치를 이동하지 않는다', () => {
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

      const cmd = ':lgetfile build.err\n';
      for (const char of cmd) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }

      expect(state.locationList?.items.length).toBe(1);
      expect(state.cursor.line).toBe(0);
    });

    it('loadLocationListFromFile 직접 호출 시 파일이 없으면 E484를 반환한다', () => {
      const state: VimEditorState = {
        lines: ['const a = 1;'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };
      const res = loadLocationListFromFile(state, 'nonexistent.log', true);
      expect(res.commandMessage).toBe("E484: Can't open file nonexistent.log");
    });
  });

  describe('윈도우(Split Pane) 로컬 격리성 검증', () => {
    it('분할 창 환경에서 각 창은 독립된 로케이션 리스트를 유지한다', () => {
      let state: VimEditorState = {
        lines: ['left line 1', 'left line 2'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        splitDirection: 'vertical',
        activePaneIndex: 0,
        primaryFilename: 'left.ts',
        secondaryFilename: 'right.ts',
        splitPanes: [
          {
            filename: 'left.ts',
            lines: ['left line 1', 'left line 2'],
            cursor: { line: 0, col: 0 },
            mode: 'NORMAL',
          },
          {
            filename: 'right.ts',
            lines: ['right line 1', 'right line 2'],
            cursor: { line: 0, col: 0 },
            mode: 'NORMAL',
          },
        ],
      };

      // 1. 왼쪽 창(0)에서 로케이션 리스트 등록
      state = setLocationList(
        state,
        [{ filename: 'left.ts', line: 1, col: 1, text: 'left error' }],
        false
      );
      expect(state.locationList?.items.length).toBe(1);
      expect(state.splitPanes?.[0].locationList?.items.length).toBe(1);
      expect(state.splitPanes?.[1].locationList).toBeUndefined();

      // 2. 오른쪽 창(1)으로 포커스 이동 (Ctrl-w w)
      state = handleKey(state, 'Ctrl-w');
      state = handleKey(state, 'w');
      expect(state.activePaneIndex).toBe(1);
      // 오른쪽 창은 로케이션 리스트가 없어야 함
      expect(state.locationList).toBeUndefined();

      // 3. 오른쪽 창에서 새로운 로케이션 리스트 등록
      state = setLocationList(
        state,
        [
          { filename: 'right.ts', line: 1, col: 1, text: 'right err 1' },
          { filename: 'right.ts', line: 2, col: 1, text: 'right err 2' },
        ],
        false
      );
      expect(state.locationList?.items.length).toBe(2);
      expect(state.splitPanes?.[1].locationList?.items.length).toBe(2);

      // 4. 다시 왼쪽 창(0)으로 포커스 이동 (Ctrl-w w)
      state = handleKey(state, 'Ctrl-w');
      state = handleKey(state, 'w');
      expect(state.activePaneIndex).toBe(0);
      // 왼쪽 창의 원래 1개짜리 로케이션 리스트가 그대로 복원되어야 함!
      expect(state.locationList?.items.length).toBe(1);
      expect(state.locationList?.items[0].text).toBe('left error');
    });
  });
});
