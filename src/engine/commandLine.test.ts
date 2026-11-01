import { describe, it, expect } from 'vitest';
import { executeCommandLine } from './commandLine';
import { handleKey } from './vimEngine';
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

  describe('고급 Ex 커맨드 (:g, :v, :norm, :[range]d/y)', () => {
    it(':g/TODO/d 명령으로 특정 패턴이 포함된 줄을 일괄 삭제한다', () => {
      const state: VimEditorState = {
        lines: [
          'const a = 1;',
          '// TODO: remove this',
          'const b = 2;',
          '// TODO: remove that',
          'const c = 3;',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, 'g/TODO/d');
      expect(result.lines).toEqual(['const a = 1;', 'const b = 2;', 'const c = 3;']);
      expect(result.commandMessage).toContain('2개 줄이 일괄 삭제되었습니다.');
      expect(result.undoStack).toHaveLength(1);
    });

    it(':v/keep/d 및 :g!/keep/d 명령으로 특정 패턴이 없는 줄을 일괄 삭제한다', () => {
      const state: VimEditorState = {
        lines: [
          'keep me 1',
          'drop me 1',
          'keep me 2',
          'drop me 2',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const resultV = executeCommandLine(state, 'v/keep/d');
      expect(resultV.lines).toEqual(['keep me 1', 'keep me 2']);

      const resultGExcl = executeCommandLine(state, 'g!/keep/d');
      expect(resultGExcl.lines).toEqual(['keep me 1', 'keep me 2']);
    });

    it(':3,4d 명령으로 지정된 범위의 줄을 삭제한다', () => {
      const state: VimEditorState = {
        lines: ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, '3,4d');
      expect(result.lines).toEqual(['line 1', 'line 2', 'line 5']);
      expect(result.clipboard?.content).toBe('line 3\nline 4');
    });

    it(':%y 명령으로 버퍼 전체를 복사한다', () => {
      const state: VimEditorState = {
        lines: ['alpha', 'beta', 'gamma'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, '%y');
      expect(result.clipboard?.content).toBe('alpha\nbeta\ngamma');
      expect(result.commandMessage).toContain('3개 줄이 복사되었습니다.');
    });

    it(':\'<,\'>norm A; 명령으로 비주얼 선택 범위의 모든 줄 끝에 세미콜론을 추가한다', () => {
      const state: VimEditorState = {
        lines: ['let x = 1', 'let y = 2', 'let z = 3', 'console.log(x)'],
        cursor: { line: 2, col: 0 },
        visualAnchor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, "'<,'>norm A;", handleKey);
      expect(result.lines).toEqual([
        'let x = 1;',
        'let y = 2;',
        'let z = 3;',
        'console.log(x)',
      ]);
      expect(result.commandMessage).toContain('3개 줄에 normal 명령을 실행했습니다.');
    });

    it(':%norm I// 명령으로 버퍼 전체 줄 앞에 주석을 일괄 삽입한다', () => {
      const state: VimEditorState = {
        lines: ['const a = 1;', 'const b = 2;'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, '%norm I// ', handleKey);
      expect(result.lines).toEqual(['// const a = 1;', '// const b = 2;']);
    });
  });
});
