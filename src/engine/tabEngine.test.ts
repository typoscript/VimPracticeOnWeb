import { describe, it, expect } from 'vitest';
import {
  ensureTabPages,
  syncCurrentTab,
  switchTab,
  openNewTab,
  closeTab,
  closeOtherTabs,
  nextTab,
  prevTab,
  firstTab,
  lastTab,
  moveTab,
} from './tabEngine';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';

describe('순정 Vim 탭 페이지(Tab Page) 엔진', () => {
  it('ensureTabPages: 초기 상태에서 현재 에디터 화면을 기반으로 1번 탭을 생성한다', () => {
    const state: VimEditorState = {
      lines: ['export const app = "main";'],
      cursor: { line: 0, col: 5 },
      mode: 'NORMAL',
      primaryFilename: 'app.ts',
    };

    const s = ensureTabPages(state);
    expect(s.tabPages).toHaveLength(1);
    expect(s.tabPages![0].id).toBe(1);
    expect(s.tabPages![0].filename).toBe('app.ts');
    expect(s.tabPages![0].lines).toEqual(['export const app = "main";']);
    expect(s.tabPages![0].cursor).toEqual({ line: 0, col: 5 });
    expect(s.currentTabId).toBe(1);
  });

  it('syncCurrentTab: 현재 탭의 변경 내용(lines, cursor)을 탭 저장소에 동기화한다', () => {
    let state: VimEditorState = {
      lines: ['line 1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'index.ts',
    };
    state = ensureTabPages(state);

    state.lines = ['line 1 modified', 'line 2'];
    state.cursor = { line: 1, col: 3 };
    const synced = syncCurrentTab(state);

    const t1 = synced.tabPages?.find((t) => t.id === 1);
    expect(t1?.lines).toEqual(['line 1 modified', 'line 2']);
    expect(t1?.cursor).toEqual({ line: 1, col: 3 });
  });

  it('openNewTab: 새 탭을 열고 각 탭이 독립적인 lines와 커서를 보존한다', () => {
    let state: VimEditorState = {
      lines: ['tab 1 content'],
      cursor: { line: 0, col: 2 },
      mode: 'NORMAL',
      primaryFilename: 'tab1.ts',
    };
    state = ensureTabPages(state);

    // 새 탭 열기 (:tabnew tab2.ts)
    state = openNewTab(state, 'tab2.ts');
    expect(state.tabPages).toHaveLength(2);
    expect(state.currentTabId).toBe(2);
    expect(state.primaryFilename).toBe('tab2.ts');
    expect(state.lines).toEqual(['']);

    // 2번 탭 내용 수정
    state.lines = ['tab 2 unique content'];
    state.cursor = { line: 0, col: 4 };

    // 1번 탭으로 전환
    state = switchTab(state, 1);
    expect(state.currentTabId).toBe(1);
    expect(state.lines).toEqual(['tab 1 content']);
    expect(state.cursor).toEqual({ line: 0, col: 2 });

    // 2번 탭으로 복귀하여 수정된 내용 보존 확인
    state = switchTab(state, 2);
    expect(state.lines).toEqual(['tab 2 unique content']);
    expect(state.cursor).toEqual({ line: 0, col: 4 });
  });

  it('closeTab: 탭을 닫고 인접 탭으로 안전하게 복귀하며, 마지막 탭은 닫을 수 없다 (E784)', () => {
    let state: VimEditorState = {
      lines: ['t1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 't1.ts',
    };
    state = ensureTabPages(state);
    state = openNewTab(state, 't2.ts');
    expect(state.tabPages).toHaveLength(2);

    // 2번 탭 닫기
    state = closeTab(state);
    expect(state.tabPages).toHaveLength(1);
    expect(state.currentTabId).toBe(1);
    expect(state.lines).toEqual(['t1']);

    // 마지막 1개 남은 탭 닫기 시도 -> E784 에러
    const lastAttempt = closeTab(state);
    expect(lastAttempt.commandMessage).toContain('E784');
    expect(lastAttempt.tabPages).toHaveLength(1);
  });

  it('closeOtherTabs: :tabonly로 현재 탭을 제외한 나머지 모든 탭을 닫는다', () => {
    let state: VimEditorState = {
      lines: ['t1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    state = ensureTabPages(state);
    state = openNewTab(state, 't2.ts');
    state = openNewTab(state, 't3.ts');
    expect(state.tabPages).toHaveLength(3);

    state = closeOtherTabs(state);
    expect(state.tabPages).toHaveLength(1);
    expect(state.currentTabId).toBe(3);
  });

  it('nextTab / prevTab / gt / gT: 탭 간 이동 및 1-based 인덱스 점프(2gt)를 지원한다', () => {
    let state: VimEditorState = {
      lines: ['t1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'tab1.ts',
    };
    state = ensureTabPages(state);
    state = openNewTab(state, 'tab2.ts');
    state = openNewTab(state, 'tab3.ts');
    expect(state.tabPages).toHaveLength(3);
    expect(state.currentTabId).toBe(3);

    // :tabfirst 로 1번 탭으로 이동
    state = firstTab(state);
    expect(state.currentTabId).toBe(1);

    // nextTab (gt) -> 2번 탭
    state = nextTab(state);
    expect(state.currentTabId).toBe(2);

    // nextTab (gt) -> 3번 탭
    state = nextTab(state);
    expect(state.currentTabId).toBe(3);

    // nextTab (gt) -> 1번 탭으로 순환(Wrap-around)
    state = nextTab(state);
    expect(state.currentTabId).toBe(1);

    // 3gt ([count]gt) -> 3번째 탭으로 직접 점프
    state = nextTab(state, 3);
    expect(state.currentTabId).toBe(3);

    // prevTab (gT) -> 2번 탭
    state = prevTab(state);
    expect(state.currentTabId).toBe(2);

    // :tablast 로 마지막 탭 이동
    state = lastTab(state);
    expect(state.currentTabId).toBe(3);
  });

  it('moveTab: :tabmove로 탭 위치를 재배치한다', () => {
    let state: VimEditorState = {
      lines: ['t1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'tab1.ts',
    };
    state = ensureTabPages(state);
    state = openNewTab(state, 'tab2.ts');
    state = openNewTab(state, 'tab3.ts');

    // 현재 활성 탭: 3번 탭. 이를 0번째(맨 앞)로 이동 (:tabm 0)
    state = moveTab(state, 0);
    expect(state.tabPages![0].id).toBe(3);
    expect(state.tabPages![1].id).toBe(1);
    expect(state.tabPages![2].id).toBe(2);

    // 다시 맨 뒤로 이동 (:tabm $)
    state = moveTab(state, '$');
    expect(state.tabPages![2].id).toBe(3);
  });

  it('Ex 커맨드(:tabnew, :tabc, :tabo, :tabn, :tabp) 및 키스트로크(gt, gT, 2gt) 통합 검증', () => {
    let state: VimEditorState = {
      lines: ['const first = 1;'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'first.ts',
    };

    // :tabnew second.ts 커맨드 실행
    for (const ch of ':tabnew second.ts\n') {
      state = handleKey(state, ch === '\n' ? 'Enter' : ch);
    }
    expect(state.tabPages).toHaveLength(2);
    expect(state.currentTabId).toBe(2);
    expect(state.primaryFilename).toBe('second.ts');

    // gt 키스트로크로 다음 탭(1번 탭) 순환
    state = handleKey(state, 'g');
    state = handleKey(state, 't');
    expect(state.currentTabId).toBe(1);
    expect(state.lines).toEqual(['const first = 1;']);

    // gT 키스트로크로 이전 탭(2번 탭) 순환
    state = handleKey(state, 'g');
    state = handleKey(state, 'T');
    expect(state.currentTabId).toBe(2);

    // 1gt 로 1번째 탭으로 직접 이동
    state = handleKey(state, '1');
    state = handleKey(state, 'g');
    state = handleKey(state, 't');
    expect(state.currentTabId).toBe(1);

    // :tabc 로 1번 탭 닫기 -> 2번 탭만 남음
    for (const ch of ':tabc\n') {
      state = handleKey(state, ch === '\n' ? 'Enter' : ch);
    }
    expect(state.tabPages).toHaveLength(1);
    expect(state.currentTabId).toBe(2);
  });
});
