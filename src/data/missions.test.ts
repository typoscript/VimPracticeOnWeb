import { describe, it, expect } from 'vitest';
import { MISSIONS } from './missions';
import { VimEditorState } from '../types/vim';
import { handleKey } from '../engine/vimEngine';

describe('MISSIONS 10 ~ 12 validation', () => {
  it('레슨 10 (숫자 반복 카운트) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson10 = MISSIONS.find((m) => m.id === 10);
    expect(lesson10).toBeDefined();
    expect(lesson10?.par).toBe(5);

    // 완료되지 않은 상태
    const incompleteState: VimEditorState = {
      lines: ['Header line', 'REMOVE ME 1', 'REMOVE ME 2', 'one two three [GOAL]'],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    expect(lesson10!.checkComplete(incompleteState)).toBe(false);

    // 2dd 수행 후 3w로 [GOAL] 도달한 완료 상태
    const completeState: VimEditorState = {
      lines: ['Header line', 'one two three [GOAL]'],
      cursor: { line: 1, col: 14 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    expect(lesson10!.checkComplete(completeState)).toBe(true);
  });

  it('레슨 11 (빠른 입력 모드 진입) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson11 = MISSIONS.find((m) => m.id === 11);
    expect(lesson11).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['Task 1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    expect(lesson11!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['Task 1 done', 'Vim is fast!'],
      cursor: { line: 1, col: 11 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    expect(lesson11!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 12 (단어 수정 및 교체) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson12 = MISSIONS.find((m) => m.id === 12);
    expect(lesson12).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['Vim is slow', 'A cute cwt'],
      cursor: { line: 0, col: 7 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    expect(lesson12!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['Vim is fast', 'A cute cat'],
      cursor: { line: 1, col: 9 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    expect(lesson12!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 13 (줄 내 문자 탐색 및 삭제) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson13 = MISSIONS.find((m) => m.id === 13);
    expect(lesson13).toBeDefined();
    expect(lesson13?.par).toBe(5);

    const stateNotDone: VimEditorState = {
      lines: ['console.log(unwanted, junk);'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson13!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['console.log;'],
      cursor: { line: 0, col: 11 },
      mode: 'NORMAL',
    };
    expect(lesson13!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 14 (텍스트 객체 수정 및 삭제) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson14 = MISSIONS.find((m) => m.id === 14);
    expect(lesson14).toBeDefined();
    expect(lesson14?.par).toBe(14);

    const stateNotDone: VimEditorState = {
      lines: ['let oldVariable = 200;', 'const msg = "delete this text";'],
      cursor: { line: 0, col: 4 },
      mode: 'NORMAL',
    };
    expect(lesson14!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['let status = 200;', 'const msg = "";'],
      cursor: { line: 1, col: 12 },
      mode: 'NORMAL',
    };
    expect(lesson14!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 15 (점 반복 편집 자동화) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson15 = MISSIONS.find((m) => m.id === 15);
    expect(lesson15).toBeDefined();
    expect(lesson15?.par).toBe(7);

    const stateNotDone: VimEditorState = {
      lines: ['const a = 1', 'const b = 2', 'const c = 3'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson15!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['const a = 1;', 'const b = 2;', 'const c = 3;'],
      cursor: { line: 2, col: 11 },
      mode: 'NORMAL',
    };
    expect(lesson15!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 16 (키워드 검색과 점프) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson16 = MISSIONS.find((m) => m.id === 16);
    expect(lesson16).toBeDefined();
    expect(lesson16?.par).toBe(10);

    const stateNotDone: VimEditorState = {
      lines: [
        'First line with target item.',
        'Second line without any match.',
        'Third line has another target here.',
        'Fourth line reaches the [FINAL_TARGET]!',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson16!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        'First line with target item.',
        'Second line without any match.',
        'Third line has another target here.',
        'Fourth line reaches the [FINAL_TARGET]!',
      ],
      cursor: { line: 3, col: 31 },
      mode: 'NORMAL',
    };
    expect(lesson16!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 17 (커맨드라인 일괄 치환) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson17 = MISSIONS.find((m) => m.id === 17);
    expect(lesson17).toBeDefined();
    expect(lesson17?.par).toBe(16);

    const stateNotDone: VimEditorState = {
      lines: [
        '1. TODO: Fix authentication bug',
        '2. TODO: Implement search feature',
        '3. TODO: Write comprehensive tests',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson17!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        '1. DONE: Fix authentication bug',
        '2. DONE: Implement search feature',
        '3. DONE: Write comprehensive tests',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson17!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 18 (매크로 녹화와 괄호 점프 %) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson18 = MISSIONS.find((m) => m.id === 18);
    expect(lesson18).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: ['const list = [', '  alpha', '  beta', '  gamma', '];'],
      cursor: { line: 0, col: 13 },
      mode: 'NORMAL',
    };
    expect(lesson18!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: ['const list = [', '  "alpha",', '  "beta",', '  "gamma",', '];'],
      cursor: { line: 3, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson18!.checkComplete(stateDone)).toBe(true);
  });

  it('레슨 19 (Ctrl+v 비주얼 블록 다중 줄 편집) 설정 및 완료 조건이 정상 동작한다', () => {
    const lesson19 = MISSIONS.find((m) => m.id === 19);
    expect(lesson19).toBeDefined();

    const stateNotDone: VimEditorState = {
      lines: [
        'const host = "localhost";',
        'const port = 8080;',
        'const debug = true;',
        'startServer();',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson19!.checkComplete(stateNotDone)).toBe(false);

    const stateDone: VimEditorState = {
      lines: [
        '// const host = "localhost";',
        '// const port = 8080;',
        '// const debug = true;',
        'startServer();',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(lesson19!.checkComplete(stateDone)).toBe(true);
  });

  it('모든 19개 레슨이 3성(Par) 기준 optimalKeys를 포함하며 이를 실행하면 미션이 완료된다', () => {
    expect(MISSIONS.length).toBe(19);

    MISSIONS.forEach((m) => {
      expect(m.optimalKeys, `레슨 ${m.id}에 optimalKeys가 정의되어 있어야 합니다.`).toBeDefined();
      expect(m.optimalKeys!.length).toBeGreaterThan(0);
      expect(m.optimalKeys!.length).toBeLessThanOrEqual(m.par);

      let state: VimEditorState = {
        lines: [...m.initialLines],
        cursor: { ...m.initialCursor },
        mode: 'NORMAL',
        undoStack: m.initialUndoStack ? [...m.initialUndoStack] : [],
        redoStack: [],
        clipboard: m.initialClipboard,
      };

      for (const key of m.optimalKeys!) {
        state = handleKey(state, key);
      }

      expect(m.checkComplete(state), `레슨 ${m.id} (${m.title}) optimalKeys 실행 후 미션이 통과되어야 합니다.`).toBe(true);
    });
  });
});
