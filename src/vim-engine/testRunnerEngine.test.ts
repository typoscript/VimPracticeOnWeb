import { describe, it, expect } from 'vitest';
import {
  createVimState,
  runExCommand,
  sendKeys,
  evaluateVirtualTests,
  formatVirtualTestOutput,
} from './index';

describe('Virtual Test Runner Engine (:TestRun / 터미널 npm test)', () => {
  it(':TestRun 은 실패 항목을 퀵픽스에 기록하고, 코드 수정 후 재실행하면 모두 통과한다', () => {
    let s = createVimState(
      ['export const API_VERSION = "v1";', 'export const debugMode = true;'],
      { line: 0, col: 0 },
      {
        primaryFilename: 'src/config.ts',
        virtualFiles: {
          'src/config.ts': [
            'export const API_VERSION = "v1";',
            'export const debugMode = true;',
          ],
          'src/client.ts': ['export const url = "/v1/users";'],
        },
        virtualTests: [
          {
            id: 't1',
            name: 'version is v2',
            file: 'src/config.ts',
            mustContain: ['API_VERSION = "v2"'],
            mustNotContain: ['"v1"'],
          },
          {
            id: 't2',
            name: 'debug off',
            file: 'src/config.ts',
            mustContain: ['debugMode = false'],
          },
          {
            id: 't3',
            name: 'client v2',
            file: 'src/client.ts',
            mustContain: ['/v2/users'],
            mustNotContain: ['/v1/'],
          },
        ],
      }
    );

    // 초기 실패 상태
    s = runExCommand(s, 'TestRun');
    expect(s.lastTestRun?.allPassed).toBe(false);
    expect(s.lastTestRun?.passedCount).toBe(0);
    expect(s.lastTestRun?.totalCount).toBe(3);
    expect(s.quickfix?.items.length).toBe(3);
    expect(s.bell).toBe(true);

    // 코드 수정 (f1 r2, j Ctrl-a, Spectre 로 client.ts 수정)
    s = sendKeys(s, 'f1r2j0<C-a>');
    s = runExCommand(s, 'Spectre /v1/ /v2/');
    s = runExCommand(s, 'SpectreApply');
    s = runExCommand(s, 'SpectreClose');

    // 재실행 → 전체 통과
    s = runExCommand(s, 'TestRun');
    expect(s.lastTestRun?.allPassed).toBe(true);
    expect(s.lastTestRun?.passedCount).toBe(3);
    expect(s.lastTestRun?.runCount).toBe(2);
    expect(s.bell).toBeUndefined();
    expect(s.quickfix?.items.length ?? 0).toBe(0);
  });

  it('내장 터미널(:ToggleTerm)에서 npm test 실행 시 리포트를 출력하고 lastTestRun 을 갱신한다', () => {
    let s = createVimState(['export const ok = false;'], { line: 0, col: 0 }, {
      primaryFilename: 'src/ok.ts',
      virtualFiles: { 'src/ok.ts': ['export const ok = false;'] },
      virtualTests: [
        { id: 'ok-1', name: 'ok is true', file: 'src/ok.ts', mustContain: ['ok = true'] },
      ],
    });

    // dial 로 수정 후 터미널에서 npm test 실행
    s = sendKeys(s, '<C-a>');
    s = runExCommand(s, 'ToggleTerm npm test');
    expect(s.mode).toBe('TERMINAL');
    expect(s.lastTestRun?.allPassed).toBe(true);
    expect(s.lines.some((l) => l.includes('PASS  Tests: 1/1 passed'))).toBe(true);
  });

  it('minLines · exactLines · 빈 테스트 스위트 예외를 정확히 처리한다', () => {
    const emptyState = createVimState(['const a = 1;']);
    const emptyRes = runExCommand(emptyState, 'TestRun');
    expect(emptyRes.bell).toBe(true);

    const splitState = createVimState(['const x = { a: 1, b: 2 };'], { line: 0, col: 0 }, {
      primaryFilename: 'src/f.ts',
      virtualTests: [{ id: 'min-lines', name: 'multiline', file: 'src/f.ts', minLines: 4 }],
    });
    expect(evaluateVirtualTests(splitState).runResult.allPassed).toBe(false);

    const afterSplit = sendKeys(splitState, 'gS');
    const { runResult } = evaluateVirtualTests(afterSplit);
    expect(runResult.allPassed).toBe(true);
    expect(formatVirtualTestOutput(runResult).some((l) => l.startsWith('PASS'))).toBe(true);
  });
});
