import {
  QuickfixItem,
  VimEditorState,
  VirtualTestCaseResult,
  VirtualTestRunResult,
  VirtualTestSpec,
} from './types';
import { buildVfsMap } from './vfs';
import { msg } from './messages';

function getFileLinesFromState(state: VimEditorState, filename: string): string[] | null {
  if (state.primaryFilename === filename) {
    return state.lines;
  }
  const activePane = state.splitPanes?.find((p) => p.filename === filename);
  if (activePane) return activePane.lines;
  const openBuf = state.buffers?.find((b) => b.name === filename);
  if (openBuf) return openBuf.lines;
  const vfs = buildVfsMap(state);
  if (filename in vfs) return vfs[filename];
  return null;
}

function evaluateSingleTest(
  state: VimEditorState,
  spec: VirtualTestSpec
): { result: VirtualTestCaseResult; failLine: number } {
  const lines = getFileLinesFromState(state, spec.file);
  if (!lines) {
    return {
      result: {
        id: spec.id,
        name: spec.name,
        file: spec.file,
        passed: false,
        reason: msg('파일을 찾을 수 없습니다: {file}', { file: spec.file }),
      },
      failLine: 0,
    };
  }

  const content = lines.join('\n');

  if (spec.exactLines && spec.exactLines.length > 0) {
    const matchesExact =
      lines.length === spec.exactLines.length &&
      lines.every((l, i) => l === spec.exactLines![i]);
    if (!matchesExact) {
      const diffIdx = lines.findIndex((l, i) => l !== spec.exactLines![i]);
      return {
        result: {
          id: spec.id,
          name: spec.name,
          file: spec.file,
          passed: false,
          reason: msg('기대한 코드 형식과 일치하지 않습니다 ({file})', { file: spec.file }),
        },
        failLine: Math.max(0, diffIdx),
      };
    }
  }

  if (spec.mustContain) {
    for (const expected of spec.mustContain) {
      if (!content.includes(expected)) {
        return {
          result: {
            id: spec.id,
            name: spec.name,
            file: spec.file,
            passed: false,
            reason: msg('필수 코드 누락: "{expected}"', { expected }),
          },
          failLine: 0,
        };
      }
    }
  }

  if (spec.mustNotContain) {
    for (const forbidden of spec.mustNotContain) {
      if (content.includes(forbidden)) {
        const lineIdx = lines.findIndex((l) => l.includes(forbidden));
        return {
          result: {
            id: spec.id,
            name: spec.name,
            file: spec.file,
            passed: false,
            reason: msg('제거 대상 패턴 잔존: "{forbidden}"', { forbidden }),
          },
          failLine: Math.max(0, lineIdx),
        };
      }
    }
  }

  if (spec.minLines !== undefined && lines.length < spec.minLines) {
    return {
      result: {
        id: spec.id,
        name: spec.name,
        file: spec.file,
        passed: false,
        reason: msg('최소 {min}줄 이상으로 분할되어야 합니다 (현재 {cur}줄)', {
          min: spec.minLines,
          cur: lines.length,
        }),
      },
      failLine: 0,
    };
  }

  return {
    result: {
      id: spec.id,
      name: spec.name,
      file: spec.file,
      passed: true,
    },
    failLine: 0,
  };
}

/**
 * 상태에 등록된 가상 테스트 스위트(state.virtualTests)를 순수 평가합니다.
 */
export function evaluateVirtualTests(
  state: VimEditorState
): { runResult: VirtualTestRunResult; failedQuickfix: QuickfixItem[] } {
  const specs = state.virtualTests ?? [];
  const results: VirtualTestCaseResult[] = [];
  const failedQuickfix: QuickfixItem[] = [];

  for (const spec of specs) {
    const { result, failLine } = evaluateSingleTest(state, spec);
    results.push(result);
    if (!result.passed) {
      failedQuickfix.push({
        filename: spec.file,
        line: failLine,
        col: 0,
        text: `[TEST FAIL] ${spec.name}: ${result.reason ?? ''}`,
        type: 'E',
      });
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const prevRunCount = state.lastTestRun?.runCount ?? 0;

  return {
    runResult: {
      suiteName: state.lastTestRun?.suiteName,
      passedCount,
      totalCount,
      allPassed: totalCount > 0 && passedCount === totalCount,
      results,
      runCount: prevRunCount + 1,
    },
    failedQuickfix,
  };
}

/**
 * 가상 테스트 실행 결과를 터미널 출력용 줄 배열로 포매팅합니다.
 */
export function formatVirtualTestOutput(result: VirtualTestRunResult): string[] {
  if (result.totalCount === 0) {
    return ['[TestRun] No virtual tests configured in this workspace.'];
  }
  const out: string[] = [];
  out.push(`RUN  ${result.suiteName || 'Virtual Test Suite'}`);
  for (const r of result.results) {
    if (r.passed) {
      out.push(`  ✓ ${r.name} (${r.file})`);
    } else {
      out.push(`  ✗ ${r.name} (${r.file}) — ${r.reason ?? 'failed'}`);
    }
  }
  out.push(
    result.allPassed
      ? `PASS  Tests: ${result.passedCount}/${result.totalCount} passed`
      : `FAIL  Tests: ${result.passedCount}/${result.totalCount} passed (${result.totalCount - result.passedCount} failed — use :copen / :cn)`
  );
  return out;
}

/**
 * `:TestRun` / `:RunTests` / 터미널 `npm test` — 가상 테스트 스위트를 실행하고 결과를 상태와 퀵픽스에 반영합니다.
 */
export function runVirtualTests(state: VimEditorState): VimEditorState {
  const specs = state.virtualTests ?? [];
  if (specs.length === 0) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[TestRun] 이 작업공간에 등록된 가상 테스트가 없습니다'),
    };
  }

  const { runResult, failedQuickfix } = evaluateVirtualTests(state);
  const nextQuickfix =
    failedQuickfix.length > 0
      ? { items: failedQuickfix, currentIndex: 0, isOpen: false }
      : state.quickfix
        ? { ...state.quickfix, items: [], isOpen: false }
        : state.quickfix;

  return {
    ...state,
    lastTestRun: runResult,
    quickfix: nextQuickfix,
    bell: runResult.allPassed ? undefined : true,
    commandMessage: runResult.allPassed
      ? msg('[TestRun] PASS — 모든 테스트 통과 ({passed}/{total})', {
          passed: runResult.passedCount,
          total: runResult.totalCount,
        })
      : msg('[TestRun] FAIL — {passed}/{total} 통과 ({failed}건 실패 · :copen 으로 확인)', {
          passed: runResult.passedCount,
          total: runResult.totalCount,
          failed: runResult.totalCount - runResult.passedCount,
        }),
  };
}
