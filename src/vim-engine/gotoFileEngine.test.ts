import { describe, it, expect } from 'vitest';
import { createVimState, sendKeys } from './api';
import { extractFileTargetAtCursor } from './gotoFileEngine';

describe('gotoFileEngine (gf, gF, Ctrl-w f)', () => {
  const virtualFiles: Record<string, string[]> = {
    'src/app.ts': [
      "import { pay } from './services/payment';",
      '// 에러 추적: src/utils/logger.ts:3',
      "import { missing } from './nope';",
    ],
    'src/services/payment.ts': [
      'export function pay(amount: number) {',
      '  return amount * 2;',
      '}',
    ],
    'src/utils/logger.ts': [
      'export function info(m: string) {',
      '  console.log(m);',
      '  return true;',
      '}',
    ],
  };

  it('커서 아래 경로(따옴표 위/안)를 정확히 추출한다', () => {
    const line = "import { pay } from './services/payment';";
    expect(extractFileTargetAtCursor(line, 20)).toEqual({ filename: './services/payment', targetLine: undefined });
    expect(extractFileTargetAtCursor(line, 25)).toEqual({ filename: './services/payment', targetLine: undefined });

    const withLine = '// check src/utils/logger.ts:3 now';
    expect(extractFileTargetAtCursor(withLine, 12, false)).toEqual({
      filename: 'src/utils/logger.ts',
      targetLine: undefined,
    });
    expect(extractFileTargetAtCursor(withLine, 12, true)).toEqual({
      filename: 'src/utils/logger.ts',
      targetLine: 3,
    });
  });

  it('gf 로 상대 경로(./services/payment -> src/services/payment.ts) 파일을 열고 Ctrl-^ 로 복귀한다', () => {
    let state = createVimState(virtualFiles['src/app.ts'], { line: 0, col: 22 }, {
      primaryFilename: 'src/app.ts',
      virtualFiles,
    });

    state = sendKeys(state, 'gf');
    expect(state.primaryFilename).toBe('src/services/payment.ts');
    expect(state.lines).toEqual(virtualFiles['src/services/payment.ts']);
    expect(state.jumpList?.length).toBeGreaterThan(0);

    // Ctrl-^ 로 원래 버퍼 복귀
    state = sendKeys(state, '<C-^>');
    expect(state.primaryFilename).toBe('src/app.ts');
  });

  it('gF 로 :줄번호 까지 포함하여 해당 줄로 점프한다', () => {
    let state = createVimState(virtualFiles['src/app.ts'], { line: 1, col: 15 }, {
      primaryFilename: 'src/app.ts',
      virtualFiles,
    });

    state = sendKeys(state, 'gF');
    expect(state.primaryFilename).toBe('src/utils/logger.ts');
    expect(state.cursor.line).toBe(2); // 1-indexed 3 -> 0-indexed 2
  });

  it('Ctrl-w f 로 커서 아래 파일을 가로 분할 창으로 연다', () => {
    let state = createVimState(virtualFiles['src/app.ts'], { line: 0, col: 25 }, {
      primaryFilename: 'src/app.ts',
      virtualFiles,
    });

    state = sendKeys(state, '<C-w>f');
    expect(state.splitDirection).toBe('horizontal');
    expect(state.activePaneIndex).toBe(1);
    expect(state.splitPanes?.[1].filename).toBe('src/services/payment.ts');
    expect(state.lines).toEqual(virtualFiles['src/services/payment.ts']);
  });

  it('존재하지 않는 파일이나 파일명이 없는 위치에서 gf 실행 시 bell 과 E447/E446 에러를 반환한다', () => {
    let state = createVimState(virtualFiles['src/app.ts'], { line: 2, col: 26 }, {
      primaryFilename: 'src/app.ts',
      virtualFiles,
    });

    const notFound = sendKeys(state, 'gf');
    expect(notFound.bell).toBe(true);
    expect(notFound.commandMessage).toContain('E447');

    const emptyPos = sendKeys(
      createVimState(['   ', 'const x = 1;'], { line: 0, col: 0 }, { primaryFilename: 'src/app.ts', virtualFiles }),
      'gf'
    );
    expect(emptyPos.bell).toBe(true);
    expect(emptyPos.commandMessage).toContain('E446');
  });
});
