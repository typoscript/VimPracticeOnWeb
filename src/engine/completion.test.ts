import { describe, it, expect } from 'vitest';
import {
  findCompletionPrefix,
  scanBufferWords,
  startOrCycleCompletion,
  cancelCompletion,
  acceptCompletion,
} from './completion';
import { VimEditorState } from '../types/vim';

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
});
