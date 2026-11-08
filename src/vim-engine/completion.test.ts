import { describe, it, expect } from 'vitest';
import {
  findCompletionPrefix,
  scanBufferWords,
  startOrCycleCompletion,
  cancelCompletion,
  acceptCompletion,
  findFilePrefix,
  scanWorkspaceFiles,
  startFilenameCompletion,
  findLinePrefix,
  scanBufferLines,
  startWholeLineCompletion,
} from './completion';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';

describe('Vim In-Buffer Completion (Ctrl+n / Ctrl+p)', () => {
  it('finds completion prefix of at least 2 characters immediately preceding cursor', () => {
    expect(findCompletionPrefix('const calc', 10)).toEqual({
      prefix: 'calc',
      startCol: 6,
    });
    // Single character prefix is ignored (< 2)
    expect(findCompletionPrefix('const c', 7)).toBeNull();
    // Non-word character before cursor is ignored
    expect(findCompletionPrefix('const abc = ', 12)).toBeNull();
  });

  it('scans all buffer lines and finds unique words starting with prefix', () => {
    const lines = [
      'const calculateTotalHospitalPrescriptionPrice = 100;',
      'const calcAmount = 20;',
      'const calculateTax = 10;',
      'calc',
    ];

    const words = scanBufferWords(lines, 'calc', 3, 4);
    expect(words).toEqual([
      'calculateTotalHospitalPrescriptionPrice',
      'calcAmount',
      'calculateTax',
    ]);
  });

  it('starts completion on Ctrl+n and cycles through candidates', () => {
    const initialState: VimEditorState = {
      lines: [
        'function calculateTotal() {}',
        'function calculateTax() {}',
        'const res = calc',
      ],
      cursor: { line: 2, col: 16 }, // at end of 'calc'
      mode: 'INSERT',
    };

    // 1. First Ctrl+n selects first candidate
    let state = startOrCycleCompletion(initialState, 'next');
    expect(state.lines[2]).toBe('const res = calculateTotal');
    expect(state.cursor).toEqual({ line: 2, col: 26 });
    expect(state.completionSession).toBeDefined();
    expect(state.completionSession?.selectedIndex).toBe(0);

    // 2. Second Ctrl+n cycles to second candidate
    state = startOrCycleCompletion(state, 'next');
    expect(state.lines[2]).toBe('const res = calculateTax');
    expect(state.cursor).toEqual({ line: 2, col: 24 });
    expect(state.completionSession?.selectedIndex).toBe(1);

    // 3. Third Ctrl+n cycles back to first candidate
    state = startOrCycleCompletion(state, 'next');
    expect(state.lines[2]).toBe('const res = calculateTotal');
    expect(state.completionSession?.selectedIndex).toBe(0);
  });

  it('cycles backwards with Ctrl+p', () => {
    const initialState: VimEditorState = {
      lines: [
        'function calculateTotal() {}',
        'function calculateTax() {}',
        'const res = calc',
      ],
      cursor: { line: 2, col: 16 },
      mode: 'INSERT',
    };

    // First Ctrl+p starts at the last candidate
    let state = startOrCycleCompletion(initialState, 'prev');
    expect(state.lines[2]).toBe('const res = calculateTax');
    expect(state.completionSession?.selectedIndex).toBe(1);

    // Second Ctrl+p moves back to first candidate
    state = startOrCycleCompletion(state, 'prev');
    expect(state.lines[2]).toBe('const res = calculateTotal');
    expect(state.completionSession?.selectedIndex).toBe(0);
  });

  it('cancels completion and restores original prefix with cancelCompletion', () => {
    const initialState: VimEditorState = {
      lines: ['const fooBar = 1;', 'fo'],
      cursor: { line: 1, col: 2 },
      mode: 'INSERT',
    };

    let state = startOrCycleCompletion(initialState, 'next');
    expect(state.lines[1]).toBe('fooBar');

    state = cancelCompletion(state);
    expect(state.lines[1]).toBe('fo');
    expect(state.cursor).toEqual({ line: 1, col: 2 });
    expect(state.completionSession).toBeNull();
  });

  it('accepts completion with acceptCompletion', () => {
    const initialState: VimEditorState = {
      lines: ['const fooBar = 1;', 'fo'],
      cursor: { line: 1, col: 2 },
      mode: 'INSERT',
    };

    let state = startOrCycleCompletion(initialState, 'next');
    expect(state.lines[1]).toBe('fooBar');

    state = acceptCompletion(state);
    expect(state.lines[1]).toBe('fooBar');
    expect(state.completionSession).toBeNull();
  });

  describe('순정 Vim 파일 경로 자동완성 (Ctrl+x Ctrl+f)', () => {
    it('findFilePrefix 로 따옴표 및 공백 뒤의 파일 경로 접두사를 추출한다', () => {
      expect(findFilePrefix("import utils from './src/", 25)).toEqual({
        prefix: './src/',
        startCol: 19,
      });
      expect(findFilePrefix('open("pack', 10)).toEqual({
        prefix: 'pack',
        startCol: 6,
      });
      expect(findFilePrefix('// see README.', 14)).toEqual({
        prefix: 'README.',
        startCol: 7,
      });
    });

    it('scanWorkspaceFiles 로 VFS 내 일치하는 파일 경로 목록을 검색한다', () => {
      const state: VimEditorState = {
        lines: [''],
        cursor: { line: 0, col: 0 },
        mode: 'INSERT',
      };

      const files = scanWorkspaceFiles(state, 'src/');
      expect(files).toContain('src/main.ts');
      expect(files).toContain('src/utils.ts');

      const dotFiles = scanWorkspaceFiles(state, './src/');
      expect(dotFiles).toContain('./src/main.ts');
      expect(dotFiles).toContain('./src/utils.ts');
    });

    it('startFilenameCompletion 함수를 직접 호출하여 파일 자동완성을 시작할 수 있다', () => {
      const state: VimEditorState = {
        lines: ['import "./src/"'],
        cursor: { line: 0, col: 14 },
        mode: 'INSERT',
      };
      const completed = startFilenameCompletion(state, 'next');
      expect(completed.completionSession?.type).toBe('file');
      expect(completed.lines[0]).toBe('import "./src/main.ts"');
    });

    it('Ctrl+x 누른 뒤 Ctrl+f 입력 시 파일명 자동완성이 동작하고 순환된다', () => {
      let state: VimEditorState = {
        lines: ['import "./src/"'],
        cursor: { line: 0, col: 14 },
        mode: 'INSERT',
      };

      // 1. Ctrl+x 입력 -> ^X mode 진입
      state = handleKey(state, 'Ctrl-x');
      expect(state.insertCtrlXMode).toBe(true);

      // 2. Ctrl+f 입력 -> 파일 자동완성 팝업 활성화
      state = handleKey(state, 'Ctrl-f');
      expect(state.insertCtrlXMode).toBe(false);
      expect(state.completionSession).toBeDefined();
      expect(state.completionSession?.type).toBe('file');
      expect(state.lines[0]).toBe('import "./src/main.ts"');

      // 3. Ctrl+n 으로 다음 파일 후보로 순환
      state = handleKey(state, 'Ctrl-n');
      expect(state.lines[0]).toBe('import "./src/utils.ts"');

      // 4. Ctrl+y 로 확정
      state = handleKey(state, 'Ctrl-y');
      expect(state.lines[0]).toBe('import "./src/utils.ts"');
      expect(state.completionSession).toBeNull();
    });
  });

  describe('순정 Vim 전체 라인 자동완성 (Ctrl+x Ctrl+l)', () => {
    it('findLinePrefix 로 현재 행 전체 접두사를 추출한다', () => {
      expect(findLinePrefix('  const sum = calculate(', 24)).toEqual({
        prefix: '  const sum = calculate(',
        startCol: 0,
      });
    });

    it('scanBufferLines 로 버퍼 내 접두사로 시작하는 전체 라인 목록을 수집한다', () => {
      const state: VimEditorState = {
        lines: [
          'export function handleCalculate(a: number, b: number) { return a + b; }',
          'export function handleValidate() {}',
          'export function',
        ],
        cursor: { line: 2, col: 15 },
        mode: 'INSERT',
      };

      const matchedLines = scanBufferLines(state, 'export function', 2);
      expect(matchedLines.length).toBe(2);
      expect(matchedLines[0]).toBe(
        'export function handleCalculate(a: number, b: number) { return a + b; }'
      );
      expect(matchedLines[1]).toBe('export function handleValidate() {}');
    });

    it('startWholeLineCompletion 함수를 직접 호출하여 전체 라인 자동완성을 시작할 수 있다', () => {
      const state: VimEditorState = {
        lines: [
          'const hospitalBill = calculateTotal(items, discount);',
          'const ',
        ],
        cursor: { line: 1, col: 6 },
        mode: 'INSERT',
      };
      const completed = startWholeLineCompletion(state, 'next');
      expect(completed.completionSession?.type).toBe('line');
      expect(completed.lines[1]).toBe('const hospitalBill = calculateTotal(items, discount);');
    });

    it('Ctrl+x 누른 뒤 Ctrl+l 입력 시 전체 라인이 완성되고 순환된다', () => {
      let state: VimEditorState = {
        lines: [
          'const hospitalBill = calculateTotal(items, discount);',
          'const pharmacyBill = calculateTotal(items, 0);',
          'const ',
        ],
        cursor: { line: 2, col: 6 },
        mode: 'INSERT',
      };

      // 1. Ctrl+x 입력
      state = handleKey(state, 'Ctrl-x');
      expect(state.insertCtrlXMode).toBe(true);

      // 2. Ctrl+l 입력 -> 전체 라인 완성 시작
      state = handleKey(state, 'Ctrl-l');
      expect(state.insertCtrlXMode).toBe(false);
      expect(state.completionSession?.type).toBe('line');
      expect(state.lines[2]).toBe('const hospitalBill = calculateTotal(items, discount);');

      // 3. Ctrl+n 으로 다음 라인 후보 순환
      state = handleKey(state, 'Ctrl-n');
      expect(state.lines[2]).toBe('const pharmacyBill = calculateTotal(items, 0);');

      // 4. Ctrl+e 로 취소하고 원래 타이핑했던 내용으로 복구
      state = handleKey(state, 'Ctrl-e');
      expect(state.lines[2]).toBe('const ');
      expect(state.completionSession).toBeNull();
    });
  });
});
