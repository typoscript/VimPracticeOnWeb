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

  it('치환 대상이 없는 경우 안전하게 원본을 유지하고 E486 에러 메시지를 반환한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const next = executeCommandLine(state, '%s/nonExistent/new/g');
    expect(next.lines).toEqual(initialLines);
    expect(next.commandMessage).toContain('E486: 패턴을 찾을 수 없습니다: nonExistent');
  });

  it('알 수 없는 명령어 입력 시 E492 에러 메시지와 함께 NORMAL 모드로 복귀한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const next = executeCommandLine(state, 'unknownCommand');
    expect(next.mode).toBe('NORMAL');
    expect(next.lines).toEqual(initialLines);
    expect(next.commandMessage).toContain('E492: 지원하지 않는 에디터 명령어입니다: unknownCommand');
  });

  it(':w 및 :help 등 유용한 기본 명령어를 처리하고 안내 메시지를 반환한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const saveResult = executeCommandLine(state, ':w');
    expect(saveResult.commandMessage).toContain('[가상 저장 완료]');

    const helpResult = executeCommandLine(state, ':help');
    expect(helpResult.commandMessage).toContain('지원 명령어:');
  });

  it('공백이 포함된 커맨드라인(: 2, :%s /apple/orange/g)도 유연하게 파싱한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const lineJump = executeCommandLine(state, ': 2');
    expect(lineJump.cursor.line).toBe(1);
    expect(lineJump.commandMessage).toBe('2번째 줄로 이동했습니다.');

    const subWithSpace = executeCommandLine(state, ':%s /apple/banana/g');
    expect(subWithSpace.lines[0]).toBe('Line 1: banana and banana');
    expect(subWithSpace.commandMessage).toContain('3개 항목을 치환했습니다');
  });
});
