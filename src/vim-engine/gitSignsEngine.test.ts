import { describe, it, expect } from 'vitest';
import {
  createVimState,
  handleKey,
  executeCommandLine,
  configureVimEngine,
  getGitHunks,
  getGitLineSigns,
} from './index';

function runKeys(state: ReturnType<typeof createVimState>, keys: string[]) {
  let s = state;
  for (const k of keys) s = handleKey(s, k);
  return s;
}

function runEx(state: ReturnType<typeof createVimState>, cmd: string) {
  return executeCommandLine(state, cmd, handleKey);
}

describe('gitsigns.nvim 스타일 Git Hunk 엔진 (]h/[h, :Gitsigns)', () => {
  it('첫 버퍼 편집 시 gitBaseLines 를 자동 캡처하고 add/change/delete 사인을 정확히 계산한다', () => {
    let s = createVimState(['const a = 1;', 'const b = 2;', 'const c = 3;', 'const d = 4;'], {
      line: 0,
      col: 0,
    });
    expect(getGitHunks(s)).toEqual([]);

    // 1행 수정 (change)
    s = runKeys(s, ['c', 'w', 'l', 'e', 't', 'Escape']);
    expect(s.gitBaseLines).toEqual(['const a = 1;', 'const b = 2;', 'const c = 3;', 'const d = 4;']);

    // 3행 아래에 새 줄 추가 (add)
    s = runKeys(s, ['j', 'j', 'o', 'const extra = 9;', 'Escape']);
    const signs = getGitLineSigns(s);
    expect(signs.get(0)).toBe('change');
    expect(signs.get(1)).toBeUndefined();
    expect(signs.get(3)).toBe('add');
    expect(getGitHunks(s).length).toBe(2);
  });

  it(']h / [h 로 다음·이전 Git Hunk 를 순환 탐색하고 Visual 모드에서도 동작한다', () => {
    let s = createVimState(
      ['line1', 'MOD_2', 'line3', 'line4', 'MOD_5', 'line6'],
      { line: 0, col: 0 },
      { gitBaseLines: ['line1', 'line2', 'line3', 'line4', 'line5', 'line6'] }
    );

    s = runKeys(s, [']', 'h']);
    expect(s.cursor.line).toBe(1);
    expect(s.commandMessage).toContain('1/2');

    s = runKeys(s, [']', 'h']);
    expect(s.cursor.line).toBe(4);
    expect(s.commandMessage).toContain('2/2');

    // 순환 wrap
    s = runKeys(s, [']', 'h']);
    expect(s.cursor.line).toBe(1);

    // 이전 hunk ([h)
    s = runKeys(s, ['[', 'h']);
    expect(s.cursor.line).toBe(4);

    // Visual 모드에서도 [h 동작
    s = runKeys(s, ['v', '[', 'h']);
    expect(s.mode).toBe('VISUAL');
    expect(s.cursor.line).toBe(1);

    // 변경 없는 버퍼에서 ]h -> bell
    const clean = runKeys(
      createVimState(['same'], { line: 0, col: 0 }, { gitBaseLines: ['same'] }),
      [']', 'h']
    );
    expect(clean.bell).toBe(true);
  });

  it(':Gitsigns preview_hunk 로 인라인 diff 미리보기를 열고 Esc/커서 이동 시 자동으로 닫는다', () => {
    let s = createVimState(
      ['alpha', 'BETA_NEW', 'gamma'],
      { line: 1, col: 0 },
      { gitBaseLines: ['alpha', 'beta_old', 'gamma'] }
    );

    s = runEx(s, ':Gitsigns preview_hunk');
    expect(s.gitHunkPreview?.isOpen).toBe(true);
    expect(s.gitHunkPreview?.hunk.removedLines).toEqual(['beta_old']);
    expect(s.gitHunkPreview?.hunk.addedLines).toEqual(['BETA_NEW']);

    // Esc 입력 시 미리보기 닫힘
    s = handleKey(s, 'Escape');
    expect(s.gitHunkPreview).toBeNull();

    // 다시 열고 다른 줄로 이동 시 닫힘
    s = runEx(s, ':Gitsigns preview_hunk');
    expect(s.gitHunkPreview?.isOpen).toBe(true);
    s = handleKey(s, 'j');
    expect(s.gitHunkPreview).toBeNull();
  });

  it(':Gitsigns reset_hunk 는 현재 Hunk 만 원복하며 u(Undo) 로 다시 복원할 수 있다', () => {
    let s = createVimState(
      ['MOD_1', 'keep', 'MOD_3'],
      { line: 0, col: 0 },
      { gitBaseLines: ['orig_1', 'keep', 'orig_3'] }
    );

    // 첫 번째 Hunk 만 리셋
    s = runEx(s, ':Gitsigns reset_hunk');
    expect(s.lines).toEqual(['orig_1', 'keep', 'MOD_3']);
    expect(getGitHunks(s).length).toBe(1);

    // Undo(u) 로 리셋 취소
    s = handleKey(s, 'u');
    expect(s.lines).toEqual(['MOD_1', 'keep', 'MOD_3']);

    // 삭제 Hunk 리셋도 원본 줄을 다시 삽입
    let delState = createVimState(
      ['line1', 'line3'],
      { line: 0, col: 0 },
      { gitBaseLines: ['line1', 'deleted_line', 'line3'] }
    );
    expect(getGitLineSigns(delState).get(0)).toBe('delete');
    delState = runEx(delState, ':Gitsigns reset_hunk');
    expect(delState.lines).toEqual(['line1', 'deleted_line', 'line3']);
    expect(getGitHunks(delState)).toEqual([]);
  });

  it(':Gitsigns stage_hunk / undo_stage_hunk / reset_buffer / status 가 정상 동작한다', () => {
    let s = createVimState(
      ['MOD_1', 'same', 'MOD_3'],
      { line: 0, col: 0 },
      { gitBaseLines: ['orig_1', 'same', 'orig_3'] }
    );

    // status 요약
    const statusRes = runEx(s, ':Gitsigns status');
    expect(statusRes.commandMessage).toContain('2');

    // Hunk #1 스테이징 -> gitBaseLines 에 반영되어 남은 Hunk 1개
    s = runEx(s, ':Gitsigns stage_hunk');
    expect(s.gitBaseLines).toEqual(['MOD_1', 'same', 'orig_3']);
    expect(getGitHunks(s).length).toBe(1);

    // undo_stage_hunk -> 다시 2개 Hunk 복구
    s = runEx(s, ':Gitsigns undo_stage_hunk');
    expect(getGitHunks(s).length).toBe(2);

    // reset_buffer -> 전체 원본 복구
    s = runEx(s, ':Gitsigns reset_buffer');
    expect(s.lines).toEqual(['orig_1', 'same', 'orig_3']);
    expect(getGitHunks(s)).toEqual([]);
  });

  it('영어 로케일에서도 Gitsigns 메시지가 정상 번역된다', () => {
    configureVimEngine({ locale: 'en' });
    try {
      const s = createVimState(['NEW'], { line: 0, col: 0 }, { gitBaseLines: ['OLD'] });
      const res = runEx(s, ':Gitsigns status');
      expect(res.commandMessage).toBe('[Gitsigns] 1 hunk(s) (+0 ~1 -0)');
    } finally {
      configureVimEngine({ locale: 'ko' });
    }
  });
});
