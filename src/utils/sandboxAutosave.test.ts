import { beforeEach, describe, expect, it } from 'vitest';
import { handleKey } from '../vim-engine';
import type { VimEditorState } from '../vim-engine';
import { buildSandboxInitialState } from './missionInitialState';
import {
  SANDBOX_AUTOSAVE_MAX_CHARS,
  clearSandboxAutosave,
  loadSandboxAutosave,
  restoreSandboxAutosave,
  saveSandboxAutosave,
} from './sandboxAutosave';

const settings = { activePresets: {}, leaderKey: ' ', customKeymaps: [] };
const press = (state: VimEditorState, keys: string[]) => keys.reduce((s, k) => handleKey(s, k), state);
const typeEx = (state: VimEditorState, cmd: string) => press(state, [':', ...cmd.split(''), 'Enter']);

describe('sandboxAutosave', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves edits and restores them on a fresh sandbox, including other open files', () => {
    let state = buildSandboxInitialState(settings);
    state = press(state, ['d', 'd', 'j']);
    state = typeEx(state, 'e src/api.ts');
    state = press(state, ['x']);
    expect(saveSandboxAutosave(state, ['notes.md'])).toBe(true);

    const saved = loadSandboxAutosave();
    expect(saved?.primaryFilename).toBe('src/api.ts');
    expect(saved?.localFiles).toEqual(['notes.md']);

    const restored = restoreSandboxAutosave(buildSandboxInitialState(settings), saved!);
    expect(restored.primaryFilename).toBe('src/api.ts');
    expect(restored.lines).toEqual(state.lines);
    expect(restored.cursor).toEqual(state.cursor);
    expect(restored.mode).toBe('NORMAL');

    // 처음 파일로 돌아가도 dd 한 결과가 남아 있습니다.
    const back = typeEx(restored, 'b sandbox.ts');
    const firstFileEdited = press(buildSandboxInitialState(settings), ['d', 'd']).lines;
    expect(back.lines).toEqual(firstFileEdited);
  });

  it('clears the saved copy', () => {
    saveSandboxAutosave(buildSandboxInitialState(settings), []);
    expect(loadSandboxAutosave()).not.toBeNull();
    clearSandboxAutosave();
    expect(loadSandboxAutosave()).toBeNull();
  });

  it('skips saving when the workspace is too large', () => {
    const base = buildSandboxInitialState(settings);
    const huge = { ...base, lines: ['x'.repeat(SANDBOX_AUTOSAVE_MAX_CHARS + 10)] };
    expect(saveSandboxAutosave(huge, [])).toBe(false);
    expect(loadSandboxAutosave()).toBeNull();
  });

  it('ignores a broken saved copy', () => {
    localStorage.setItem('vim_sandbox_autosave_v1', '{not json');
    expect(loadSandboxAutosave()).toBeNull();
  });
});
