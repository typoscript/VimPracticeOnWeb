import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createVimState, sendKeys, DEFAULT_VIM_OPTIONS } from '../../vim-engine';
import {
  computeIndentGuideCols,
  computeActiveScopeIndent,
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
