import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createVimState, sendKeys, DEFAULT_VIM_OPTIONS } from '../../vim-engine';
import {
  computeIndentGuideCols,
  computeActiveScopeIndent,
  computeMatchParenPair,
  computeRainbowDelimitersMap,
  findTodoCommentBadge,
} from './editorDecorations';
import { Editor } from './Editor';

describe('indent-blankline & todo-comments 장식 계산 (editorDecorations)', () => {
  it('들여쓰기 레벨과 빈 줄 보간을 포함해 세로 가이드선 열을 계산한다', () => {
    const lines = [
      'function demo() {',
      '  if (ok) {',
      '    return 1;',
      '',
      '    const x = 2;',
      '  }',
      '}',
    ];
    expect(computeIndentGuideCols(lines, 0, 2)).toEqual([]);
    expect(computeIndentGuideCols(lines, 1, 2)).toEqual([0]);
    expect(computeIndentGuideCols(lines, 2, 2)).toEqual([0, 2]);
    // 내부 빈 줄(line 3)은 위/아래 들여쓰기(4)를 이어받아 [0, 2] 유지
    expect(computeIndentGuideCols(lines, 3, 2)).toEqual([0, 2]);
    expect(computeIndentGuideCols(lines, 5, 2)).toEqual([0]);
  });

  it('현재 커서가 속한 활성 들여쓰기 스코프 범위와 열을 계산한다', () => {
    const lines = [
      'function demo() {',
      '  if (ok) {',
      '    const a = 1;',
      '    const b = 2;',
      '  }',
      '}',
    ];
    const scope = computeActiveScopeIndent(lines, 2, 2);
    expect(scope).toEqual({ startLine: 2, endLine: 3, col: 2 });
    expect(computeActiveScopeIndent(lines, 0, 2)).toBeNull();
  });

  it('주석 내 TODO/FIXME/HACK/WARN/NOTE/PERF 태그를 정확히 탐지하고 일반 문자열은 무시한다', () => {
    expect(findTodoCommentBadge('// TODO: implement cache')).toMatchObject({
      tag: 'TODO:',
      variant: 'info',
    });
    expect(findTodoCommentBadge('  // FIXME(auth): check token')).toMatchObject({
      tag: 'FIXME(auth):',
      variant: 'error',
    });
    expect(findTodoCommentBadge('# HACK: temporary fallback')).toMatchObject({
      tag: 'HACK:',
      variant: 'warning',
    });
    expect(findTodoCommentBadge('-- NOTE: sql index required')).toMatchObject({
      tag: 'NOTE:',
      variant: 'hint',
    });
    expect(findTodoCommentBadge('/* PERF: batch writes */')).toMatchObject({
      tag: 'PERF:',
      variant: 'perf',
    });
    expect(findTodoCommentBadge('const label = "TODO: not a comment";')).toBeNull();
  });
});

describe(':set indentline / ibl 옵션 및 Editor 렌더링', () => {
  it(':set noindentline / :set indentline / :set noibl 옵션 전환이 동작한다', () => {
    let state = createVimState(['  const a = 1;']);
    state = sendKeys(state, ':set noindentline<CR>');
    expect(state.options?.indentline).toBe(false);
    state = sendKeys(state, ':set ibl<CR>');
    expect(state.options?.indentline).toBe(true);
    state = sendKeys(state, ':set noibl<CR>');
    expect(state.options?.indentline).toBe(false);
  });

  it('Editor 가 indent-guide 와 todo-comments 배지를 렌더링하고 본문 텍스트를 보존한다', () => {
    const lines = [
      'function run() {',
      '  // TODO: optimize query',
      '  // FIXME: handle null',
      '  return true;',
      '}',
    ];

    const { rerender } = render(
      <Editor
        lines={lines}
        cursor={{ line: 3, col: 2 }}
        mode="NORMAL"
        primaryFilename="demo.ts"
        options={{ ...DEFAULT_VIM_OPTIONS, indentline: true, shiftwidth: 2 }}
      />
    );

    // 세로 들여쓰기 가이드선 + 활성 스코프 강조
    const activeGuide = screen.getByTestId('indent-guide-4-0');
    expect(activeGuide).toHaveClass('indent-guide');
    expect(activeGuide).toHaveClass('indent-guide-active');

    // TODO/FIXME 인라인 배지 렌더링 & 텍스트 무결성 확인
    expect(screen.getByTestId('todo-badge-info')).toHaveTextContent('TODO:');
    expect(screen.getByTestId('todo-badge-error')).toHaveTextContent('FIXME:');
    expect(screen.getByTestId('editor-container')).toHaveTextContent('// TODO: optimize query');

    // :set noindentline 적용 시 가이드선 숨김
    rerender(
      <Editor
        lines={lines}
        cursor={{ line: 3, col: 2 }}
        mode="NORMAL"
        primaryFilename="demo.ts"
        options={{ ...DEFAULT_VIM_OPTIONS, indentline: false, shiftwidth: 2 }}
      />
    );
    expect(screen.queryByTestId('indent-guide-4-0')).not.toBeInTheDocument();
  });
});

describe('matchparen 짝 괄호 강조 & rainbow-delimiters 중첩 괄호 컬러', () => {
  it('computeMatchParenPair 가 단일/멀티라인 짝 괄호 및 INSERT 직전 괄호를 정확히 찾는다', () => {
    const lines = ['function f(a) {', '  return (a + 1);', '}'];
    // line 0 col 14 ('{') <-> line 2 col 0 ('}')
    expect(computeMatchParenPair(lines, { line: 0, col: 14 }, 'NORMAL')).toEqual({
      open: { line: 0, col: 14 },
      close: { line: 2, col: 0 },
    });
    // 역방향: line 2 col 0 ('}') <-> line 0 col 14 ('{')
    expect(computeMatchParenPair(lines, { line: 2, col: 0 }, 'NORMAL')).toEqual({
      open: { line: 0, col: 14 },
      close: { line: 2, col: 0 },
    });
    // INSERT 모드에서 ')' 바로 다음 칸에서도 짝 '(' 매칭
    expect(computeMatchParenPair(lines, { line: 1, col: 16 }, 'INSERT')).toEqual({
      open: { line: 1, col: 9 },
      close: { line: 1, col: 15 },
    });
    // 괄호가 아닌 일반 문자 위에서는 null
    expect(computeMatchParenPair(lines, { line: 0, col: 0 }, 'NORMAL')).toBeNull();
  });

  it('computeRainbowDelimitersMap 이 중첩 괄호 깊이를 0..5 순환 배정하고 문자열·주석 내 괄호는 무시한다', () => {
    const lines = ['const x = ({ a: [1, "(ignored)"] }); // {ignored}'];
    const map = computeRainbowDelimitersMap(lines);
    const line0 = map.get(0)!;
    // '(' = 0, '{' = 1, '[' = 2, ']' = 2, '}' = 1, ')' = 0
    expect(line0.get(10)).toBe(0); // '('
    expect(line0.get(11)).toBe(1); // '{'
    expect(line0.get(16)).toBe(2); // '['
    // 문자열 내부 '(' (index 21) 와 주석 내부 '{' 는 매핑되지 않아야 함
    expect(line0.has(21)).toBe(false);
    expect(line0.get(31)).toBe(2); // ']'
    expect(line0.get(33)).toBe(1); // '}'
    expect(line0.get(34)).toBe(0); // ')'
  });

  it(':set nomatchparen / :set mp 및 :set norainbow / :set rb 옵션 토글이 동작한다', () => {
    let state = createVimState(['(a)']);
    state = sendKeys(state, ':set nomp norb<CR>');
    expect(state.options?.matchparen).toBe(false);
    expect(state.options?.rainbow).toBe(false);
    state = sendKeys(state, ':set matchparen rainbow<CR>');
    expect(state.options?.matchparen).toBe(true);
    expect(state.options?.rainbow).toBe(true);
  });

  it('Editor 가 커서 짝 괄호(.match-paren-highlight)와 레인보우 깊이 클래스를 렌더링하고 옵션 해제 시 숨긴다', () => {
    const lines = ['fn((1))'];
    const { container, rerender } = render(
      <Editor
        lines={lines}
        cursor={{ line: 0, col: 2 }}
        mode="NORMAL"
        primaryFilename="app.ts"
        options={{ ...DEFAULT_VIM_OPTIONS, matchparen: true, rainbow: true }}
      />
    );

    // col 2 '(' 의 짝인 col 6 ')' 가 match-paren-char 로 강조됨
    const partner = screen.getByTestId('match-paren-char');
    expect(partner).toHaveTextContent(')');
    expect(partner).toHaveClass('match-paren-highlight');
    expect(container.querySelectorAll('.rainbow-depth-1').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('editor-container')).toHaveTextContent('fn((1))');

    rerender(
      <Editor
        lines={lines}
        cursor={{ line: 0, col: 2 }}
        mode="NORMAL"
        primaryFilename="app.ts"
        options={{ ...DEFAULT_VIM_OPTIONS, matchparen: false, rainbow: false }}
      />
    );
    expect(screen.queryByTestId('match-paren-char')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.rainbow-delim').length).toBe(0);
  });
});
