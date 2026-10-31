import { describe, it, expect } from 'vitest';
import { MISSIONS } from './missions';
import { VimEditorState } from '../types/vim';

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
});
