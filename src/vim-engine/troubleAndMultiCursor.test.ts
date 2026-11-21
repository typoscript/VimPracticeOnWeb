import { describe, it, expect, afterEach } from 'vitest';
import {
  createVimState,
  handleKey,
  executeCommandLine,
  configureVimEngine,
  jumpToTroubleItem,
} from './index';

function typeKeys(state: ReturnType<typeof createVimState>, keys: string[]) {
  let s = state;
  for (const k of keys) {
    s = handleKey(s, k);
  }
  return s;
}

afterEach(() => {
  configureVimEngine({ locale: 'ko' });
});

describe('trouble.nvim 프로젝트 진단·TODO·퀵픽스 통합 허브 (:Trouble)', () => {
  it(':Trouble 로 LSP 진단 + VFS TODO/FIXME 주석 + 퀵픽스를 통합 수집하고 모드별 필터링한다', () => {
    let s = createVimState(
      [
        '// TODO: refactor handler',
        'const x: number = "bad";',
      ],
      { line: 0, col: 0 },
      {
        primaryFilename: 'app/index.ts',
        virtualFiles: {
          'app/index.ts': [
            '// TODO: refactor handler',
            'const x: number = "bad";',
          ],
          'app/util.ts': [
            '// FIXME: handle null edge case',
            'export const ok = true;',
          ],
        },
        lspDiagnostics: [
          {
            id: 'ts2322',
            line: 1,
            col: 6,
            endCol: 7,
            severity: 'error',
            code: 'TS2322',
            message: 'Type string is not assignable to number',
          },
        ],
        quickfix: {
          isOpen: false,
          currentIndex: 0,
          items: [
            { filename: 'app/util.ts', line: 2, col: 1, type: 'W', text: 'Unused export' },
          ],
        },
      }
    );

    // :Trouble (all) -> diag + 2 TODO/FIXME + quickfix
    s = executeCommandLine(s, ':Trouble', handleKey);
    expect(s.troublePanel?.isOpen).toBe(true);
    expect(s.troublePanel?.mode).toBe('all');
    expect(s.troublePanel!.items.length).toBeGreaterThanOrEqual(4);

    // :Trouble diagnostics
    s = executeCommandLine(s, ':Trouble diagnostics', handleKey);
    expect(s.troublePanel?.mode).toBe('diagnostics');
    expect(s.troublePanel?.items).toHaveLength(1);
    expect(s.troublePanel?.items[0].tag).toBe('TS2322');

    // :Trouble todo
    s = executeCommandLine(s, ':Trouble todo', handleKey);
    expect(s.troublePanel?.mode).toBe('todo');
    expect(s.troublePanel!.items.some((i) => i.filename === 'app/index.ts' && i.tag === 'TODO')).toBe(true);
    expect(s.troublePanel!.items.some((i) => i.filename === 'app/util.ts' && i.tag === 'FIXME')).toBe(true);

    // 특정 파일 항목으로 점프 (app/util.ts)
    const utilIdx = s.troublePanel!.items.findIndex((i) => i.filename === 'app/util.ts');
    expect(utilIdx).toBeGreaterThanOrEqual(0);
    s = jumpToTroubleItem(s, utilIdx);
    expect(s.primaryFilename).toBe('app/util.ts');
    expect(s.cursor.line).toBe(0);

    // :TroubleToggle 로 닫기 -> 다시 열기
    s = executeCommandLine(s, ':TroubleToggle', handleKey);
    expect(s.troublePanel?.isOpen).toBe(false);
    s = executeCommandLine(s, ':TroubleToggle', handleKey);
    expect(s.troublePanel?.isOpen).toBe(true);

    // :TroubleClose
    s = executeCommandLine(s, ':TroubleClose', handleKey);
    expect(s.troublePanel?.isOpen).toBe(false);
  });

  it('영어 로캘에서 Trouble 메시지가 영어로 출력된다', () => {
    configureVimEngine({ locale: 'en' });
    let s = createVimState(['// TODO: test item'], { line: 0, col: 0 }, { primaryFilename: 'a.ts' });
    s = executeCommandLine(s, ':Trouble todo', handleKey);
    expect(s.commandMessage).toContain('[Trouble:todo]');
    s = executeCommandLine(s, ':TroubleClose', handleKey);
    expect(s.commandMessage).toBe('[Trouble] Panel closed');
  });
});

describe('vim-visual-multi 다중 커서 선택·동시 편집 (g Ctrl-n / :MultiCursor)', () => {
  it('g Ctrl-n + Ctrl-n 으로 동일 단어를 점진 선택하고 c 로 동시 치환 후 u 로 한 번에 되돌린다', () => {
    let s = createVimState(
      [
        'const foo = foo + 1;',
        'return foo;',
      ],
      { line: 0, col: 6 } // 첫 번째 foo
    );

    // g Ctrl-n -> 1개 선택
    s = typeKeys(s, ['g', 'Ctrl-n']);
    expect(s.multiCursor?.isOpen).toBe(true);
    expect(s.multiCursor?.selections).toHaveLength(1);

    // Ctrl-n 두 번 -> 같은 줄 두 번째 foo + 다음 줄 foo 까지 총 3개 선택
    s = typeKeys(s, ['Ctrl-n', 'Ctrl-n']);
    expect(s.multiCursor?.selections).toHaveLength(3);

    // c 로 모두 지우고 "bar" 동시 입력 후 Esc
    s = typeKeys(s, ['c', 'b', 'a', 'r', 'Escape']);
    expect(s.multiCursor).toBeNull();
    expect(s.lines).toEqual([
      'const bar = bar + 1;',
      'return bar;',
    ]);

    // 단일 Undo 로 3곳 모두 원복!
    s = handleKey(s, 'u');
    expect(s.lines).toEqual([
      'const foo = foo + 1;',
      'return foo;',
    ]);
  });

  it('Ctrl-x 건너뛰기, Ctrl-p 선택 취소, a 접미사 동시 삽입, Backspace 및 d 삭제를 지원한다', () => {
    let s = createVimState(['item item item'], { line: 0, col: 0 });
    // 첫 번째 선택 -> Ctrl-n 두 번째 추가 -> Ctrl-x 두 번째 건너뛰고 세 번째 선택!
    s = typeKeys(s, ['g', 'Ctrl-n', 'Ctrl-n', 'Ctrl-x']);
    expect(s.multiCursor?.selections).toHaveLength(2);
    expect(s.multiCursor?.selections[0].startCol).toBe(0);
    expect(s.multiCursor?.selections[1].startCol).toBe(10);

    // a 로 두 선택 끝부분에 "_v2" 동시 추가 + Backspace 로 2 지우고 3 입력
    s = typeKeys(s, ['a', '_', 'v', '2', 'Backspace', '3', 'Escape']);
    expect(s.lines[0]).toBe('item_v3 item item_v3');

    // :MultiCursorAll 로 모든 item_v3 일괄 선택 후 d 삭제
    s = executeCommandLine(s, ':MultiCursorAll item_v3', handleKey);
    expect(s.multiCursor?.selections).toHaveLength(2);
    s = handleKey(s, 'd');
    expect(s.multiCursor).toBeNull();
    expect(s.lines[0]).toBe(' item ');
  });

  it('다중 커서 입력 중 u 문자를 입력해도 Undo 불변성 검사가 오탐하지 않으며 영어 로캘을 지원한다', () => {
    configureVimEngine({ locale: 'en' });
    let s = createVimState(['let old = 1;', 'let old = 2;'], { line: 0, col: 4 });
    // undoStack 에 기록 하나 남김
    s = typeKeys(s, ['x', 'i', 'o', 'Escape']);

    s = executeCommandLine(s, ':MultiCursor! old', handleKey);
    expect(s.commandMessage).toContain('[MultiCursor]');
    expect(s.multiCursor?.selections).toHaveLength(2);

    // 'u' 를 포함한 "num" 으로 동시 치환 -> 불변성 오류 없이 통과
    s = typeKeys(s, ['c', 'n', 'u', 'm', 'Escape']);
    expect(s.lines).toEqual(['let num = 1;', 'let num = 2;']);
    expect(s.commandMessage).toBe('[MultiCursor] Exited multi-cursor mode');
  });
});
