import { describe, it, expect } from 'vitest';
import {
  createVimState,
  handleKey,
  runExCommand,
  parseGitConflicts,
  getGitConflictLineKinds,
  buildAutoDapTrace,
  evaluateDapWatch,
  getDapLineVirtualText,
} from './index';

const CONFLICT_SAMPLE = [
  'const config = {',
  '<<<<<<< HEAD',
  '  retries: 2,',
  '=======',
  '  retries: 5,',
  '>>>>>>> feature/retry',
  '<<<<<<< HEAD',
  '  logLevel: "info",',
  '=======',
  '  traceEnabled: true,',
  '>>>>>>> feature/trace',
  '};',
];

const DIFF3_SAMPLE = [
  '<<<<<<< HEAD',
  'const mode = "prod";',
  '||||||| base',
  'const mode = "dev";',
  '=======',
  'const mode = "staging";',
  '>>>>>>> feature/stage',
];

describe('git-conflict.nvim 3-Way 머지 충돌 해결 엔진', () => {
  it('2-Way 및 diff3 3-Way 충돌 블록과 행별 하이라이트 맵을 정확히 파싱한다', () => {
    const blocks = parseGitConflicts(CONFLICT_SAMPLE);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].oursLabel).toBe('HEAD');
    expect(blocks[0].theirsLabel).toBe('feature/retry');
    expect(blocks[0].oursLines).toEqual(['  retries: 2,']);
    expect(blocks[0].theirsLines).toEqual(['  retries: 5,']);

    const kinds = getGitConflictLineKinds(CONFLICT_SAMPLE);
    expect(kinds.get(1)).toBe('marker-ours');
    expect(kinds.get(2)).toBe('ours');
    expect(kinds.get(3)).toBe('separator');
    expect(kinds.get(4)).toBe('theirs');
    expect(kinds.get(5)).toBe('marker-theirs');

    const diff3Blocks = parseGitConflicts(DIFF3_SAMPLE);
    expect(diff3Blocks).toHaveLength(1);
    expect(diff3Blocks[0].baseLines).toEqual(['const mode = "dev";']);
    const diff3Kinds = getGitConflictLineKinds(DIFF3_SAMPLE);
    expect(diff3Kinds.get(2)).toBe('marker-base');
    expect(diff3Kinds.get(3)).toBe('base');
  });

  it(']x / [x 로 충돌 간 순환 점프하고 co / ct / cb / c0 로 즉시 해결하며 Undo 를 지원한다', () => {
    let s = createVimState(CONFLICT_SAMPLE, { line: 0, col: 0 });
    s = handleKey(s, ']');
    s = handleKey(s, 'x');
    expect(s.cursor.line).toBe(1);
    expect(s.commandMessage).toContain('1/2');

    // 다음 충돌로 이동 후 이전 충돌로 복귀
    s = handleKey(s, ']');
    s = handleKey(s, 'x');
    expect(s.cursor.line).toBe(6);
    s = handleKey(s, '[');
    s = handleKey(s, 'x');
    expect(s.cursor.line).toBe(1);

    // ct 로 유입(theirs) 선택
    s = handleKey(s, 'c');
    s = handleKey(s, 't');
    expect(s.lines[1]).toBe('  retries: 5,');
    expect(parseGitConflicts(s.lines)).toHaveLength(1);

    // u 로 충돌 해결 되돌리기
    s = handleKey(s, 'u');
    expect(parseGitConflicts(s.lines)).toHaveLength(2);

    // co 로 ours, ]x 후 cb 로 both 선택
    s = handleKey(s, 'c');
    s = handleKey(s, 'o');
    s = handleKey(s, ']');
    s = handleKey(s, 'x');
    s = handleKey(s, 'c');
    s = handleKey(s, 'b');
    expect(s.lines).toEqual([
      'const config = {',
      '  retries: 2,',
      '  logLevel: "info",',
      '  traceEnabled: true,',
      '};',
    ]);
    expect(s.gitConflictResolvedCount).toBe(3);
  });

  it('c0 (none), :diffget //1|//2|//3 및 :GitConflictListQf 퀵픽스 연동을 지원한다', () => {
    let s = createVimState(DIFF3_SAMPLE, { line: 0, col: 0 });
    s = runExCommand(s, 'diffget //1');
    expect(s.lines).toEqual(['const mode = "dev";']);

    let s2 = createVimState(DIFF3_SAMPLE, { line: 0, col: 0 });
    s2 = runExCommand(s2, 'diffget //3');
    expect(s2.lines).toEqual(['const mode = "staging";']);

    let s3 = createVimState(DIFF3_SAMPLE, { line: 0, col: 0 });
    s3 = handleKey(s3, 'c');
    s3 = handleKey(s3, '0');
    expect(s3.lines).toEqual(['']);

    let sQf = createVimState(['const ok = 1;'], { line: 0, col: 0 }, {
      primaryFilename: 'src/ok.ts',
      virtualFiles: {
        'src/ok.ts': ['const ok = 1;'],
        'src/conf.ts': CONFLICT_SAMPLE,
      },
    });
    sQf = runExCommand(sQf, 'GitConflictListQf');
    expect(sQf.quickfix?.isOpen).toBe(true);
    expect(sQf.quickfix?.items).toHaveLength(2);
    expect(sQf.quickfix?.items[0].filename).toBe('src/conf.ts');
  });

  it('충돌 블록 바깥에서는 순정 Vim ct / cb / c0 동작을 100% 보존한다', () => {
    let s = createVimState(['hello world'], { line: 0, col: 0 });
    s = handleKey(s, 'c');
    s = handleKey(s, 't');
    s = handleKey(s, 'w');
    expect(s.mode).toBe('INSERT');
    expect(s.lines[0]).toBe('world');

    let s2 = createVimState(['foo bar'], { line: 0, col: 4 });
    s2 = handleKey(s2, 'c');
    s2 = handleKey(s2, '0');
    expect(s2.mode).toBe('INSERT');
    expect(s2.lines[0]).toBe('bar');
  });
});

describe('nvim-dap / nvim-dap-ui 인터랙티브 디버거 엔진', () => {
  const CODE = [
    'const subtotal = 100;',
    'const discount = 20;',
    'const finalPrice = subtotal + discount;',
    'console.log(finalPrice);',
  ];

  it('자동 트레이스 빌더가 변수 계산과 콘솔 출력을 안전하게 추적한다', () => {
    const trace = buildAutoDapTrace(CODE, 'src/discount.ts');
    expect(trace).toHaveLength(4);
    expect(trace[2].variables.find((v) => v.name === 'finalPrice')?.value).toBe('120');
    expect(trace[3].output).toBe('120');
  });

  it(':DapBp · :DapContinue · :DapStepOver · :DapWatch · :DapEval · :DapTerminate 흐름이 정상 동작한다', () => {
    let s = createVimState(CODE, { line: 2, col: 0 }, { primaryFilename: 'src/discount.ts' });

    // 중단점 설정
    s = runExCommand(s, 'DapBp');
    expect(s.dapBreakpoints?.['src/discount.ts']).toEqual([2]);

    // 디버깅 시작 → 중단점(L3)에서 일시정지
    s = runExCommand(s, 'DapContinue');
    expect(s.dapSession?.isActive).toBe(true);
    expect(s.dapSession?.isPaused).toBe(true);
    expect(s.dapSession?.uiOpen).toBe(true);
    expect(s.dapSession?.currentLine).toBe(2);
    expect(s.cursor.line).toBe(2);

    // 가상 텍스트 & Watch & Eval
    const vtext = getDapLineVirtualText(s.dapSession, 'src/discount.ts', 2);
    expect(vtext).toContain('finalPrice = 120');

    s = runExCommand(s, 'DapWatch subtotal - discount');
    expect(s.dapSession?.watches).toContain('subtotal - discount');
    const watchEval = evaluateDapWatch(
      'subtotal - discount',
      s.dapSession?.frames[0]?.variables ?? []
    );
    expect(watchEval.value).toBe('80');

    s = runExCommand(s, 'DapEval finalPrice');
    expect(s.commandMessage).toContain('120');

    // Step Over → 4번째 줄
    s = runExCommand(s, 'DapStepOver');
    expect(s.dapSession?.currentLine).toBe(3);
    expect(s.dapSession?.consoleOutput).toContain('120');

    // Terminate
    s = runExCommand(s, 'DapTerminate');
    expect(s.dapSession?.isActive).toBe(false);
    expect(s.dapSession?.uiOpen).toBe(false);

    // Clear breakpoints
    s = runExCommand(s, 'DapClearBreakpoints');
    expect(s.dapBreakpoints).toEqual({});
  });
});
