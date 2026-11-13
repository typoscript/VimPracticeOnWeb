import { describe, it, expect } from 'vitest';
import { createVimState, sendKeys, runExCommand } from './api';
import { resolveHelpTag } from './helpData';

describe('순정 Vim 도움말 엔진 (helpEngine)', () => {
  it(':help 또는 :h 명령으로 메인 도움말을 열 수 있어야 한다', () => {
    let state = createVimState(['hello world']);
    expect(state.helpSession).toBeFalsy();

    state = runExCommand(state, 'help');
    expect(state.helpSession).toBeDefined();
    expect(state.helpSession?.isOpen).toBe(true);
    expect(state.helpSession?.topic).toBe('help.txt');
    expect(state.helpSession?.lines.length).toBeGreaterThan(10);
    expect(state.helpSession?.cursor.line).toBe(0);

    // :q 로 닫기
    state = runExCommand(state, 'q');
    expect(state.helpSession).toBeNull();
  });

  it(':help motion 또는 :h motion 으로 특정 토픽을 열 수 있어야 한다', () => {
    let state = createVimState(['sample line']);
    state = runExCommand(state, 'h motion');

    expect(state.helpSession?.isOpen).toBe(true);
    expect(state.helpSession?.topic).toBe('motion.txt');
    expect(state.helpSession?.lines[0]).toContain('*motion.txt*');

    // :helpclose 로 닫기
    state = runExCommand(state, 'helpclose');
    expect(state.helpSession).toBeNull();
  });

  it('F1 키 입력 시 메인 도움말이 열려야 한다', () => {
    let state = createVimState(['line 1']);
    state = sendKeys(state, 'F1');

    expect(state.helpSession?.isOpen).toBe(true);
    expect(state.helpSession?.topic).toBe('help.txt');

    // 'q' 키로 닫기
    state = sendKeys(state, 'q');
    expect(state.helpSession).toBeNull();
  });

  it('NORMAL 모드에서 K 키 입력 시 커서 위치의 단어 도움말이 열려야 한다', () => {
    let state = createVimState(['learn motion and change']);
    // 커서를 'motion' 단어로 이동: 'w'
    state = sendKeys(state, 'w');
    expect(state.cursor.col).toBe(6);

    state = sendKeys(state, 'K');
    expect(state.helpSession?.isOpen).toBe(true);
    expect(state.helpSession?.topic).toBe('motion.txt');

    state = sendKeys(state, 'q');
    expect(state.helpSession).toBeNull();
  });

  it('|tag| 링크 위에서 <CR> 또는 Ctrl-] 입력 시 해당 토픽으로 점프하고 Ctrl-t로 복귀해야 한다', () => {
    let state = createVimState(['test']);
    state = runExCommand(state, 'help');
    expect(state.helpSession?.topic).toBe('help.txt');

    // help.txt 에서 |motion| 이 있는 줄로 커서 이동
    const motionLineIndex = state.helpSession?.lines.findIndex((l) => l.includes('|motion|')) ?? 5;
    for (let i = 0; i < motionLineIndex; i++) {
      state = sendKeys(state, 'j');
    }
    const currentLine = state.helpSession?.lines[state.helpSession.cursor.line] || '';
    expect(currentLine).toContain('|motion|');

    // |motion| 시작 위치로 'l' 이동
    const tagIndex = currentLine.indexOf('|motion|');
    if (state.helpSession) {
      state = {
        ...state,
        helpSession: {
          ...state.helpSession,
          cursor: { line: state.helpSession.cursor.line, col: tagIndex + 2 },
        },
      };
    }

    // Enter (<CR>) 입력으로 점프
    state = sendKeys(state, '<CR>');
    expect(state.helpSession?.topic).toBe('motion.txt');
    expect(state.helpSession?.tagStack.length).toBe(1);
    expect(state.helpSession?.tagStack[0].topic).toBe('help.txt');

    // Ctrl-t 로 이전 도움말 및 커서 위치로 복귀
    state = sendKeys(state, 'Ctrl-t');
    expect(state.helpSession?.topic).toBe('help.txt');
    expect(state.helpSession?.tagStack.length).toBe(0);
    expect(state.helpSession?.cursor.line).toBe(motionLineIndex);
  });

  it('도움말 내에서 j, k, g, G, 0, $ 커서 이동이 정상 작동해야 한다', () => {
    let state = createVimState(['test']);
    state = runExCommand(state, 'help');
    expect(state.helpSession?.cursor.line).toBe(0);

    state = sendKeys(state, 'j');
    expect(state.helpSession?.cursor.line).toBe(1);

    state = sendKeys(state, 'k');
    expect(state.helpSession?.cursor.line).toBe(0);

    state = sendKeys(state, 'G');
    expect(state.helpSession?.cursor.line).toBe((state.helpSession?.lines.length ?? 1) - 1);

    state = sendKeys(state, 'gg');
    expect(state.helpSession?.cursor.line).toBe(0);
  });

  it('태그 스택이 비어 있을 때 Ctrl-t 시 bell이 울려야 한다', () => {
    let state = createVimState(['test']);
    state = runExCommand(state, 'help');
    expect(state.helpSession?.tagStack.length).toBe(0);

    state = sendKeys(state, 'Ctrl-t');
    expect(state.bell).toBe(true);
    expect(state.commandMessage).toContain('E555');
  });

  it('resolveHelpTag 가 별칭 및 서브 토픽을 적절히 매칭해야 한다', () => {
    expect(resolveHelpTag('motion').topicKey).toBe('motion.txt');
    expect(resolveHelpTag('operators').topicKey).toBe('change.txt');
    expect(resolveHelpTag('surround').topicKey).toBe('surround.txt');
    expect(resolveHelpTag('nonexistent-tag-12345').topicKey).toBe('help.txt');
  });
});
