import { describe, it, expect } from 'vitest';
import { executeCommandLine } from './commandLine';
import { VimEditorState } from '../types/vim';

describe('commandLine module', () => {
  const initialLines = [
    'Line 1: apple and apple',
    'Line 2: apple is good',
    'Line 3: third line',
  ];

  it(':[숫자] 명령으로 지정한 라인 번호로 즉시 점프한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const next = executeCommandLine(state, '3');
    expect(next.cursor.line).toBe(2);
    expect(next.mode).toBe('NORMAL');

    const nextWithColon = executeCommandLine(state, ':2');
    expect(nextWithColon.cursor.line).toBe(1);
  });

  it(':%s/old/new/g 명령으로 전체 버퍼에서 문자열을 일괄 치환한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const next = executeCommandLine(state, '%s/apple/orange/g');
    expect(next.lines).toEqual([
      'Line 1: orange and orange',
      'Line 2: orange is good',
      'Line 3: third line',
    ]);
    expect(next.mode).toBe('NORMAL');
    expect(next.undoStack).toBeDefined();
    expect(next.undoStack).toHaveLength(1);
  });

  it(':s/old/new/g 명령으로 현재 커서가 위치한 줄에서만 치환한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const next = executeCommandLine(state, 's/apple/orange/g');
    expect(next.lines[0]).toBe('Line 1: orange and orange');
    expect(next.lines[1]).toBe('Line 2: apple is good'); // 2번째 줄은 그대로 유지
  });

  it('치환 대상이 없는 경우 안전하게 원본을 유지한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const next = executeCommandLine(state, '%s/nonExistent/new/g');
    expect(next.lines).toEqual(initialLines);
  });

  it('알 수 없는 명령어 입력 시 안전하게 NORMAL 모드로 복귀한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const next = executeCommandLine(state, 'unknownCommand');
    expect(next.mode).toBe('NORMAL');
    expect(next.lines).toEqual(initialLines);
  });
});
