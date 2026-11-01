import { describe, it, expect } from 'vitest';
import { parseVimGrammar } from './vimGrammarParser';

describe('vimGrammarParser', () => {
  it('parses full compound command with register and counts: "a2d3aw', () => {
    const ast = parseVimGrammar('"a2d3aw');

    expect(ast.isComplete).toBe(true);
    expect(ast.isOperatorPending).toBe(false);
    expect(ast.totalEffectiveCount).toBe(6);
    expect(ast.nodes).toHaveLength(5);

    // Node 1: Register "a
    expect(ast.nodes[0].type).toBe('register');
    expect(ast.nodes[0].raw).toBe('"a');

    // Node 2: Count1 2
    expect(ast.nodes[1].type).toBe('count1');
    expect(ast.nodes[1].raw).toBe('2');

    // Node 3: Operator d
    expect(ast.nodes[2].type).toBe('operator');
    expect(ast.nodes[2].raw).toBe('d');

    // Node 4: Count2 3
    expect(ast.nodes[3].type).toBe('count2');
    expect(ast.nodes[3].raw).toBe('3');

    // Node 5: TextObject aw
    expect(ast.nodes[4].type).toBe('text_object');
    expect(ast.nodes[4].raw).toBe('aw');

    // Explanation check
    expect(ast.explanation).toContain('레지스터 a');
    expect(ast.explanation).toContain('6개(2×3)의');
    expect(ast.explanation).toContain('단어(주변 공백 포함)');
    expect(ast.explanation).toContain('잘라내어 저장합니다');
  });

  it('parses count with change operator and quotes text object: 3ci"', () => {
    const ast = parseVimGrammar('3ci"');

    expect(ast.isComplete).toBe(true);
    expect(ast.totalEffectiveCount).toBe(3);
    expect(ast.nodes).toHaveLength(3);

    expect(ast.nodes[0].type).toBe('count1');
    expect(ast.nodes[0].raw).toBe('3');

    expect(ast.nodes[1].type).toBe('operator');
    expect(ast.nodes[1].raw).toBe('c');

    expect(ast.nodes[2].type).toBe('text_object');
    expect(ast.nodes[2].raw).toBe('i"');

    expect(ast.explanation).toContain('3개의');
    expect(ast.explanation).toContain('큰따옴표("...")');
    expect(ast.explanation).toContain('INSERT 모드로 전환');
  });

  it('detects operator-pending state and provides interactive candidate guides: "a2d', () => {
    const ast = parseVimGrammar('"a2d');

    expect(ast.isComplete).toBe(false);
    expect(ast.isOperatorPending).toBe(true);
    expect(ast.nodes).toHaveLength(3);
    expect(ast.nodes[2].isPending).toBe(true);

    expect(ast.candidates).toBeDefined();
    expect(ast.candidates!.length).toBeGreaterThanOrEqual(3);

    const categories = ast.candidates!.map((c) => c.category);
    expect(categories.some((c) => c.includes('텍스트 객체'))).toBe(true);
    expect(categories.some((c) => c.includes('단어 이동'))).toBe(true);
    expect(categories.some((c) => c.includes('줄 단위'))).toBe(true);
  });

  it('detects modifier-pending state: ci', () => {
    const ast = parseVimGrammar('ci');

    expect(ast.isComplete).toBe(false);
    expect(ast.isOperatorPending).toBe(true);
    expect(ast.nodes[1].type).toBe('modifier_pending');

    expect(ast.candidates).toBeDefined();
    const targetCategory = ast.candidates![0];
    expect(targetCategory.items.some((i) => i.key === 'w')).toBe(true);
    expect(targetCategory.items.some((i) => i.key === '"')).toBe(true);
    expect(targetCategory.items.some((i) => i.key === '(')).toBe(true);
  });

  it('parses line operator dd with count: 5dd', () => {
    const ast = parseVimGrammar('5dd');

    expect(ast.isComplete).toBe(true);
    expect(ast.totalEffectiveCount).toBe(5);
    expect(ast.explanation).toContain('아래로 5줄을');
    expect(ast.explanation).toContain('잘라내어 저장합니다');
  });

  it('parses register put command: "0p', () => {
    const ast = parseVimGrammar('"0p');

    expect(ast.isComplete).toBe(true);
    expect(ast.nodes[0].raw).toBe('"0');
    expect(ast.nodes[1].raw).toBe('p');
    expect(ast.explanation).toContain('복사 전용 레지스터 0');
    expect(ast.explanation).toContain('현재 커서 뒤');
    expect(ast.explanation).toContain('붙여넣습니다');
  });

  it('parses uppercase operator on inner word: gUiw', () => {
    const ast = parseVimGrammar('gUiw');

    expect(ast.isComplete).toBe(true);
    expect(ast.nodes[0].raw).toBe('gU');
    expect(ast.nodes[1].raw).toBe('iw');
    expect(ast.explanation).toContain('대문자로 변환');
  });

  it('parses yank motion to line end: y$', () => {
    const ast = parseVimGrammar('y$');

    expect(ast.isComplete).toBe(true);
    expect(ast.nodes[0].raw).toBe('y');
    expect(ast.nodes[1].raw).toBe('$');
    expect(ast.explanation).toContain('현재 커서 위치부터');
    expect(ast.explanation).toContain('줄 끝');
    expect(ast.explanation).toContain('복사(Yank)');
  });

  it('parses standalone motions and undo/redo/dot: 10j, 4x, u, .', () => {
    const astJ = parseVimGrammar('10j');
    expect(astJ.isComplete).toBe(true);
    expect(astJ.totalEffectiveCount).toBe(10);
    expect(astJ.explanation).toContain('아래 줄');

    const astX = parseVimGrammar('4x');
    expect(astX.isComplete).toBe(true);
    expect(astX.totalEffectiveCount).toBe(4);
    expect(astX.explanation).toContain('문자 4개');

    const astU = parseVimGrammar('u');
    expect(astU.isComplete).toBe(true);
    expect(astU.explanation).toContain('실행 취소');

    const astDot = parseVimGrammar('.');
    expect(astDot.isComplete).toBe(true);
    expect(astDot.explanation).toContain('반복');
  });
});
