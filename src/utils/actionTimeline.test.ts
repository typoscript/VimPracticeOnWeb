import { describe, it, expect } from 'vitest';
import {
  getActionDescription,
  formatCommandLabel,
  createInitialTimelineStep,
  generateVitestReproductionCode,
} from './actionTimeline';
import { VimEditorState } from '../types/vim';

describe('actionTimeline utilities', () => {
  it('formats command keys with readable representations', () => {
    expect(formatCommandLabel(['c', 'w', 'f', 'o', 'o', 'Escape'])).toBe('cwfoo<Esc>');
    expect(formatCommandLabel([':', 'w', 'Enter'])).toBe(':w<CR>');
    expect(formatCommandLabel([' ', 'w'])).toBe('<Space>w');
  });

  it('generates friendly Korean descriptions for standard Vim actions', () => {
    expect(getActionDescription(['w'])).toContain('다음 단어');
    expect(getActionDescription(['2', 'w'])).toContain('2회');
    expect(getActionDescription(['c', 'i', '"'])).toContain('따옴표 내부 내용 변경');
    expect(getActionDescription(['d', 'd'])).toContain('줄 삭제');
    expect(getActionDescription(['.'])).toContain('마지막 변경 명령 반복');
    expect(getActionDescription(['u'])).toContain('실행 취소');
    expect(getActionDescription(['p'])).toContain('붙여넣기');
    expect(getActionDescription(['y', 'w'])).toContain('단어 복사');
  });

  it('creates an initial timeline step correctly', () => {
    const initialState: VimEditorState = {
      lines: ['hello world'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };

    const step0 = createInitialTimelineStep(initialState);
    expect(step0.stepIndex).toBe(0);
    expect(step0.command).toBe('START');
    expect(step0.keystrokesSoFar).toBe(0);
    expect(step0.snapshot.lines).toEqual(['hello world']);
  });

  it('generates well-formed Vitest reproduction code snippet', () => {
    const currentState: VimEditorState = {
      lines: ['foo world'],
      cursor: { line: 0, col: 2 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };

    const code = generateVitestReproductionCode({
      missionTitle: '단어 교체 미션',
      initialText: 'hello world',
      initialCursor: { line: 0, col: 0 },
      allKeys: ['c', 'w', 'f', 'o', 'o', 'Escape'],
      currentState,
    });

    expect(code).toContain("it('reproduce issue in mission: 단어 교체 미션'");
    expect(code).toContain('const initialLines = [\n  "hello world"\n];');
    expect(code).toContain('const keys = ["c","w","f","o","o","Escape"];');
    expect(code).toContain('expect(state.lines).toEqual([\n  "foo world"\n]);');
    expect(code).toContain('expect(state.cursor).toEqual({ line: 0, col: 2 });');
    expect(code).toContain("expect(state.mode).toBe('NORMAL');");
  });
});
