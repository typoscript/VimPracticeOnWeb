import { describe, it, expect } from 'vitest';
import { computeIncCommandPreview, createVimState, runExCommand } from './index';

describe(':substitute flags (n, e, p, l, #)', () => {
  it(':s/...//gn counts matches across lines without modifying buffer or undo stack', () => {
    const initial = createVimState(['foo bar foo', 'baz', 'foo qux']);
    const after = runExCommand(initial, '%s/foo//gn');

    expect(after.lines).toEqual(initial.lines);
    expect(after.undoStack ?? []).toHaveLength(0);
    expect(after.bell).toBeFalsy();
    expect(after.commandMessage).toContain('3');
    expect(after.commandMessage).toContain('2');
    expect(after.lastSearchQuery).toBe('foo');

    // Without g flag, counts at most 1 match per line
    const withoutG = runExCommand(initial, '%s/foo//n');
    expect(withoutG.lines).toEqual(initial.lines);
    expect(withoutG.commandMessage).toContain('2');
  });

  it('inccommand preview does not mutate previewLines when n flag is present', () => {
    const state = createVimState(['foo bar foo']);
    const preview = computeIncCommandPreview(state, '%s/foo/BAR/gn');
    expect(preview).not.toBeNull();
    expect(preview?.hasReplacement).toBe(false);
    expect(preview?.previewLines).toEqual(['foo bar foo']);
    expect(preview?.matches).toHaveLength(2);
  });

  it(':s/.../.../e suppresses E486 error and bell when pattern does not match', () => {
    const initial = createVimState(['hello world']);
    const normalFail = runExCommand(initial, '%s/missing/x/g');
    expect(normalFail.bell).toBe(true);
    expect(normalFail.commandMessage).toContain('E486');

    const silentFail = runExCommand(initial, '%s/missing/x/ge');
    expect(silentFail.bell).toBeFalsy();
    expect(silentFail.commandMessage).toBeUndefined();

    const silentCount = runExCommand(initial, '%s/missing//gne');
    expect(silentCount.bell).toBeFalsy();
    expect(silentCount.commandMessage).toBeUndefined();
  });

  it('supports p, #, and l print flags on :substitute', () => {
    const base = createVimState(['first', '\tfoo bar']);

    const withP = runExCommand(base, '%s/foo/baz/p');
    expect(withP.lines[1]).toBe('\tbaz bar');
    expect(withP.commandMessage).toBe('\tbaz bar');

    const withHash = runExCommand(base, '%s/foo/baz/#');
    expect(withHash.commandMessage).toBe('     2  \tbaz bar');

    const withL = runExCommand(base, '%s/foo/baz/l');
    expect(withL.commandMessage).toBe('^Ibaz bar$');
  });
});
