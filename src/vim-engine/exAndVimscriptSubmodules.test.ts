import { describe, it, expect } from 'vitest';
import { createVimState, sendKeys } from './index';
import { executeCommandLine } from './commandLine';
import { tryExecuteBatchAndUndoExCommand } from './exBatchAndUndoCommands';
import {
  parseFunctionHeader,
  registerFunction,
  formatFunctionList,
  formatFunctionBody,
  appendFunctionDraftLine,
  cancelFunctionDraft,
  defineFunctionFromLines,
  isFunctionHeaderLine,
  isEndFunctionLine,
} from './vimscriptFunctions';
import { tokenize } from './vimscriptLexer';

describe('exBatchAndUndoCommands submodule', () => {
  it('handles :args, :argadd, :argd, :n, :prev, :first, :last and unknown fallback', () => {
    const base = {
      ...createVimState(['one'], { line: 0, col: 0 }),
      virtualFiles: {
        'a.ts': ['old a'],
        'b.ts': ['old b'],
        'c.ts': ['old c'],
      },
    };

    expect(tryExecuteBatchAndUndoExCommand(base, 'unknowncmd', 'unknowncmd', ':unknowncmd', executeCommandLine)).toBeNull();

    const s1 = tryExecuteBatchAndUndoExCommand(base, 'args a.ts b.ts', 'args a.ts b.ts', ':args a.ts b.ts', executeCommandLine)!;
    expect(s1.argList).toEqual({ files: ['a.ts', 'b.ts'], currentIndex: 0 });

    const sAdd = tryExecuteBatchAndUndoExCommand(s1, 'argadd c.ts', 'argadd c.ts', ':argadd c.ts', executeCommandLine)!;
    expect(sAdd.argList?.files).toEqual(['a.ts', 'b.ts', 'c.ts']);

    const sDel = tryExecuteBatchAndUndoExCommand(sAdd, 'argd b.ts', 'argd b.ts', ':argd b.ts', executeCommandLine)!;
    expect(sDel.argList?.files).toEqual(['a.ts', 'c.ts']);

    const sList = tryExecuteBatchAndUndoExCommand(sDel, 'args', 'args', ':args', executeCommandLine)!;
    expect(sList.commandMessage).toContain('a.ts');

    const sNext = tryExecuteBatchAndUndoExCommand(sDel, 'n', 'n', ':n', executeCommandLine)!;
    expect(sNext.argList?.currentIndex).toBe(1);

    const sPrev = tryExecuteBatchAndUndoExCommand(sNext, 'prev', 'prev', ':prev', executeCommandLine)!;
    expect(sPrev.argList?.currentIndex).toBe(0);

    const sLast = tryExecuteBatchAndUndoExCommand(sPrev, 'last', 'last', ':last', executeCommandLine)!;
    expect(sLast.argList?.currentIndex).toBe(1);

    const sFirst = tryExecuteBatchAndUndoExCommand(sLast, 'first', 'first', ':first', executeCommandLine)!;
    expect(sFirst.argList?.currentIndex).toBe(0);
  });

  it('handles :argdo, :bufdo, :tabdo, :windo, :syncbind, :cdo/:cfdo, :ldo/:lfdo', () => {
    const argState = {
      ...createVimState(['old main'], { line: 0, col: 0 }),
      virtualFiles: { 'a.ts': ['old 1'], 'b.ts': ['old 2'] },
      argList: { files: ['a.ts', 'b.ts'], currentIndex: 0 },
    };
    const argDone = tryExecuteBatchAndUndoExCommand(argState, 'argdo s/old/new/g', 'argdo s/old/new/g', ':argdo s/old/new/g', executeCommandLine)!;
    expect(argDone.buffers?.find((b) => b.name === 'a.ts')?.lines).toEqual(['new 1']);
    expect(argDone.buffers?.find((b) => b.name === 'b.ts')?.lines).toEqual(['new 2']);

    const bufState = sendKeys(createVimState(['foo'], { line: 0, col: 0 }), ':e second.ts<CR>ifoo<Esc>');
    const bufDone = tryExecuteBatchAndUndoExCommand(bufState, 'bufdo s/foo/bar/g', 'bufdo s/foo/bar/g', ':bufdo s/foo/bar/g', executeCommandLine)!;
    expect(bufDone.buffers?.every((b) => b.lines[0] === 'bar')).toBe(true);

    const tabState = sendKeys(createVimState(['x'], { line: 0, col: 0 }), ':tabnew<CR>ix<Esc>');
    const tabDone = tryExecuteBatchAndUndoExCommand(tabState, 'tabdo s/x/y/g', 'tabdo s/x/y/g', ':tabdo s/x/y/g', executeCommandLine)!;
    expect(tabDone.lines).toEqual(['y']);

    const splitState = sendKeys(createVimState(['num 1'], { line: 0, col: 0 }), ':vsp<CR>');
    const winDone = tryExecuteBatchAndUndoExCommand(splitState, 'windo s/1/2/g', 'windo s/1/2/g', ':windo s/1/2/g', executeCommandLine)!;
    expect(winDone.lines).toEqual(['num 2']);

    const syncRes = tryExecuteBatchAndUndoExCommand(winDone, 'syncbind', 'syncbind', ':syncbind', executeCommandLine)!;
    expect(syncRes.mode).toBe('NORMAL');

    const qfState = sendKeys(createVimState(['hit line', 'other'], { line: 0, col: 0 }), ':vimgrep /hit/ %<CR>');
    const cdoRes = tryExecuteBatchAndUndoExCommand(qfState, 'cdo s/hit/miss/', 'cdo s/hit/miss/', ':cdo s/hit/miss/', executeCommandLine)!;
    expect(cdoRes.lines[0]).toBe('miss line');
    const cfdoRes = tryExecuteBatchAndUndoExCommand(qfState, 'cfdo s/hit/done/', 'cfdo s/hit/done/', ':cfdo s/hit/done/', executeCommandLine)!;
    expect(cfdoRes.lines[0]).toBe('done line');

    const locState = sendKeys(createVimState(['loc line'], { line: 0, col: 0 }), ':lvimgrep /loc/ %<CR>');
    const ldoRes = tryExecuteBatchAndUndoExCommand(locState, 'ldo s/loc/ok/', 'ldo s/loc/ok/', ':ldo s/loc/ok/', executeCommandLine)!;
    expect(ldoRes.lines[0]).toBe('ok line');
    const lfdoRes = tryExecuteBatchAndUndoExCommand(locState, 'lfdo s/loc/fine/', 'lfdo s/loc/fine/', ':lfdo s/loc/fine/', executeCommandLine)!;
    expect(lfdoRes.lines[0]).toBe('fine line');
  });

  it('handles :undolist, :earlier, :later, :undo {seq}, :u, :redo', () => {
    let st = createVimState(['v0'], { line: 0, col: 0 });
    st = sendKeys(st, 'ccv1<Esc>');
    st = sendKeys(st, 'ccv2<Esc>');

    const uList = tryExecuteBatchAndUndoExCommand(st, 'undolist', 'undolist', ':undolist', executeCommandLine)!;
    expect(uList.commandMessage).toBeDefined();

    const undone = tryExecuteBatchAndUndoExCommand(st, 'u', 'u', ':u', executeCommandLine)!;
    expect(undone.lines).toEqual(['v1']);

    const redone = tryExecuteBatchAndUndoExCommand(undone, 'redo', 'redo', ':redo', executeCommandLine)!;
    expect(redone.lines).toEqual(['v2']);

    const earlier = tryExecuteBatchAndUndoExCommand(redone, 'earlier 1', 'earlier 1', ':earlier 1', executeCommandLine)!;
    expect(earlier.lines).toEqual(['v1']);

    const later = tryExecuteBatchAndUndoExCommand(earlier, 'later 1', 'later 1', ':later 1', executeCommandLine)!;
    expect(later.lines).toEqual(['v2']);

    const jump0 = tryExecuteBatchAndUndoExCommand(later, 'undo 0', 'undo 0', ':undo 0', executeCommandLine)!;
    expect(jump0.lines).toEqual(['v0']);
  });
});

describe('vimscriptFunctions submodule', () => {
  it('parseFunctionHeader parses valid signatures and reports E124/E128/E125/E853/E488', () => {
    expect(parseFunctionHeader('Add(a, b, ...) range abort dict')).toEqual({
      name: 'Add',
      params: ['a', 'b'],
      varargs: true,
      range: true,
      abort: true,
    });

    expect(parseFunctionHeader('MissingParens')).toContain('E124');
    expect(parseFunctionHeader('lowercase(x)')).toContain('E128');
    expect(parseFunctionHeader('BadArg(1x)')).toContain('E125');
    expect(parseFunctionHeader('DupArg(x, x)')).toContain('E853');
    expect(parseFunctionHeader('Extra(x) bogus')).toContain('E488');
  });

  it('registerFunction, formatFunctionList, formatFunctionBody, draft helpers, and header checks', () => {
    const base = createVimState(['']);
    const fn = {
      name: 'Greet',
      params: ['who'],
      varargs: false,
      range: false,
      abort: true,
      body: ['return "hi " . a:who'],
    };

    expect(formatFunctionList(base)).toBe('사용자 정의 함수가 없습니다.');

    const reg1 = registerFunction(base, fn, false);
    expect(typeof reg1).not.toBe('string');
    if (typeof reg1 !== 'string') {
      expect(formatFunctionList(reg1)).toContain('function Greet(who)');
      expect(formatFunctionBody(reg1.userFunctions!.Greet)).toContain('1  return "hi " . a:who');
      expect(registerFunction(reg1, fn, false)).toContain('E122');

      const overwritten = registerFunction(reg1, { ...fn, body: ['return "bye"'] }, true);
      expect(typeof overwritten).not.toBe('string');
      if (typeof overwritten !== 'string') {
        expect(overwritten.userFunctions?.Greet.body).toEqual(['return "bye"']);
      }
    }

    expect(isFunctionHeaderLine('fu! Foo()')).toBe(true);
    expect(isFunctionHeaderLine('let x = 1')).toBe(false);
    expect(isEndFunctionLine('endf')).toBe(true);
    expect(isEndFunctionLine('endfunction')).toBe(true);
    expect(isEndFunctionLine('return')).toBe(false);

    // Interactive draft lifecycle
    const withDraft = {
      ...base,
      functionDraft: { name: 'MyFn', params: ['x'], varargs: false, range: false, abort: false, overwrite: true, body: [] },
      mode: 'COMMAND' as const,
    };
    const added = appendFunctionDraftLine(withDraft, ':return a:x + 1');
    expect(added.functionDraft?.body).toEqual(['return a:x + 1']);

    const finished = appendFunctionDraftLine(added, 'endfunction');
    expect(finished.functionDraft).toBeUndefined();
    expect(finished.userFunctions?.MyFn.body).toEqual(['return a:x + 1']);

    const cancelled = cancelFunctionDraft(withDraft);
    expect(cancelled.functionDraft).toBeUndefined();
    expect(cancelled.mode).toBe('NORMAL');

    const defined = defineFunctionFromLines(base, 'function! Batch(a)', ['let b = a:a', 'return b']);
    expect(defined.userFunctions?.Batch.body).toEqual(['let b = a:a', 'return b']);
  });
});

describe('vimscriptLexer submodule', () => {
  it('tokenizes numbers, hex, strings with escapes, registers, varargs, scoped names, and operators', () => {
    const tokens = tokenize('0x1a + "a\\nb" . \'c\'\'d\' @a + a:000 + g:foo ==# #{k: 1}');
    expect(tokens[0]).toMatchObject({ type: 'num', value: 26, space: false });
    expect(tokens[1]).toMatchObject({ type: 'op', value: '+', space: true });
    expect(tokens[2]).toMatchObject({ type: 'str', value: 'a\nb' });
    expect(tokens[4]).toMatchObject({ type: 'str', value: "c'd" });
    expect(tokens[5]).toMatchObject({ type: 'reg', value: 'a' });
    expect(tokens[7]).toMatchObject({ type: 'name', value: 'a:000' });
    expect(tokens[9]).toMatchObject({ type: 'name', value: 'g:foo' });
    expect(tokens[10]).toMatchObject({ type: 'op', value: '==#' });
    expect(tokens[11]).toMatchObject({ type: 'op', value: '#{' });
    expect(tokens[tokens.length - 1]).toMatchObject({ type: 'eof' });
  });

  it('throws E114, E115, and E15 on malformed literals and unknown characters', () => {
    expect(() => tokenize('"unclosed')).toThrow(/E114/);
    expect(() => tokenize("'unclosed")).toThrow(/E115/);
    expect(() => tokenize('`bad')).toThrow(/E15/);
  });
});
