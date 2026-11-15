import { describe, expect, it } from 'vitest';
import { createVimState, runExCommand, sendKeys } from './index';

describe('Vimscript extra builtins (#1) & variable scopes / $ENV / :finish (#2)', () => {
  describe('Buffer, window, and tab builtins', () => {
    it('supports bufnr(), bufname(), bufexists(), buflisted(), winnr(), and tabpagenr()', () => {
      let s = createVimState(['buf1'], { line: 0, col: 0 }, { primaryFilename: 'alpha.ts' });
      s = runExCommand(s, 'echo [bufnr("%"), bufname("%"), bufexists("alpha.ts"), buflisted("missing.ts"), winnr(), tabpagenr()]');
      expect(s.commandMessage).toBe("[1, 'alpha.ts', 1, 0, 1, 1]");

      // Open second buffer via :e
      s = runExCommand(s, 'e beta.ts');
      s = runExCommand(s, 'echo [bufnr("%"), bufnr("#"), bufnr("$"), bufname("%"), bufname("#"), bufexists("alpha.ts")]');
      expect(s.commandMessage).toBe("[2, 1, 2, 'beta.ts', 'alpha.ts', 1]");

      // Split window & tabs
      s = runExCommand(s, 'sp');
      s = runExCommand(s, 'echo [winnr(), winnr("$")]');
      expect(s.commandMessage).toBe('[1, 2]');
      s = sendKeys(s, '<C-w>j');
      s = runExCommand(s, 'echo winnr()');
      expect(s.commandMessage).toBe('2');

      s = runExCommand(s, 'tabnew');
      s = runExCommand(s, 'echo [tabpagenr(), tabpagenr("$")]');
      expect(s.commandMessage).toBe('[2, 2]');
    });
  });

  describe('VFS file, directory, path, and JSON builtins', () => {
    it('supports getcwd(), fnamemodify(), writefile(), filereadable(), readfile(), isdirectory(), and glob()', () => {
      let s = createVimState(['hello'], { line: 0, col: 0 }, {
        cwd: '/workspace/proj',
        virtualFiles: {
          'src/index.ts': ['line1', 'line2', 'line3'],
          'src/utils/a.ts': ['export const a = 1;'],
        },
      });

      s = runExCommand(s, 'echo [getcwd(), fnamemodify("src/index.ts", ":p:h"), filereadable("src/index.ts"), filereadable("nope.ts"), isdirectory("src/utils"), isdirectory("no_dir")]');
      expect(s.commandMessage).toBe("['/workspace/proj', '/workspace/proj/src', 1, 0, 1, 0]");

      s = runExCommand(s, 'echo glob("src/**/*.ts", 0, 1)');
      expect(s.commandMessage).toContain('src/index.ts');
      expect(s.commandMessage).toContain('src/utils/a.ts');

      s = runExCommand(s, 'echo readfile("src/index.ts", "", 2)');
      expect(s.commandMessage).toBe("['line1', 'line2']");

      s = runExCommand(s, 'call writefile(["first", "second"], "out/log.txt")');
      s = runExCommand(s, 'call writefile(["third"], "out/log.txt", "a")');
      s = runExCommand(s, 'echo [filereadable("out/log.txt"), readfile("out/log.txt")]');
      expect(s.commandMessage).toBe("[1, ['first', 'second', 'third']]");
    });

    it('supports json_encode() and json_decode() with E474 on invalid JSON', () => {
      let s = createVimState(['']);
      s = runExCommand(s, 'echo json_encode(#{k: "hi", nums: [1, 2]})');
      expect(s.commandMessage).toBe('{"k":"hi","nums":[1,2]}');

      s = runExCommand(s, 'let g:parsed = json_decode(\'{"flag":true,"items":[10,null]}\')');
      s = runExCommand(s, 'echo [g:parsed.flag, g:parsed.items[0], g:parsed.items[1]]');
      expect(s.commandMessage).toBe('[1, 10, 0]');

      s = runExCommand(s, 'echo json_decode("{bad json")');
      expect(s.bell).toBe(true);
      expect(s.commandMessage).toContain('E474');
    });
  });

  describe('Search, matchlist, and string builtins', () => {
    it('supports search(), searchpos() with flags n/W/b/c/e, matchlist(), strpart(), and strchars()', () => {
      let s = createVimState(['alpha beta alpha', 'delta alpha end'], { line: 0, col: 0 });

      s = runExCommand(s, 'echo search("alpha", "nW") . ":" . string(searchpos("alpha", "W")) . ":" . string([line("."), col(".")])');
      expect(s.commandMessage).toBe('1:[1, 12]:[1, 12]');

      // Backward search with 'b' and 'n'
      s = runExCommand(s, 'echo searchpos("alpha", "bn")');
      expect(s.commandMessage).toBe('[1, 1]');

      // 'c' accepts match at cursor and 'e' moves to end of match
      s = runExCommand(s, 'call search("beta", "b") | echo searchpos("beta", "ce")');
      expect(s.commandMessage).toBe('[1, 10]');

      // matchlist returns 10-element list on match and [] on miss
      s = runExCommand(s, 'echo matchlist("id-42-ok", \'\\(id\\)-\\(\\d\\+\\)\')[:3]');
      expect(s.commandMessage).toBe("['id-42', 'id', '42', '']");
      s = runExCommand(s, 'echo matchlist("xyz", \'\\d\\+\')');
      expect(s.commandMessage).toBe('[]');

      // strpart & strchars
      s = runExCommand(s, 'echo strpart("abcdef", 1, 3) . "|" . strpart("abcdef", 2) . "|" . strchars("가나다a")');
      expect(s.commandMessage).toBe('bcd|cdef|4');
    });
  });

  describe('Scoped variables (b:, w:, t:, s:), scope dicts, $ENV, and :finish', () => {
    it('isolates b:, w:, t: per buffer, split pane, and tab page', () => {
      let s = createVimState(['one'], { line: 0, col: 0 }, { primaryFilename: 'buf1.ts' });
      s = runExCommand(s, 'let b:tag = "first"');
      s = runExCommand(s, 'let w:pane_tag = "top"');
      s = runExCommand(s, 'let t:tab_tag = "tab1"');

      // Switch buffer -> b:tag is isolated
      s = runExCommand(s, 'e buf2.ts');
      s = runExCommand(s, 'echo exists("b:tag")');
      expect(s.commandMessage).toBe('0');
      s = runExCommand(s, 'let b:tag = "second"');

      // Switch back to buffer 1 -> b:tag preserved
      s = sendKeys(s, '<C-^>');
      s = runExCommand(s, 'echo b:tag');
      expect(s.commandMessage).toBe('first');

      // Split window -> w:pane_tag isolated per pane
      s = runExCommand(s, 'sp');
      s = sendKeys(s, '<C-w>j');
      s = runExCommand(s, 'echo exists("w:pane_tag")');
      expect(s.commandMessage).toBe('0');
      s = sendKeys(s, '<C-w>k');
      s = runExCommand(s, 'echo w:pane_tag');
      expect(s.commandMessage).toBe('top');

      // New tab -> t:tab_tag isolated per tab
      s = runExCommand(s, 'tabnew');
      s = runExCommand(s, 'echo exists("t:tab_tag")');
      expect(s.commandMessage).toBe('0');
      s = sendKeys(s, 'gT');
      s = runExCommand(s, 'echo t:tab_tag');
      expect(s.commandMessage).toBe('tab1');
    });

    it('supports bare scope dictionaries (g:, b:, w:, t:, l:, v:) and keeps #{g: 1} working', () => {
      let s = createVimState(['']);
      s = runExCommand(s, 'let g:alpha = 10 | let b:beta = 20 | let g:["dyn"] = 30');
      s = runExCommand(s, 'echo [get(g:, "alpha", 0), get(g:, "missing", 99), has_key(b:, "beta"), g:dyn]');
      expect(s.commandMessage).toBe('[10, 99, 1, 30]');

      s = runExCommand(s, 'echo #{g: 123}');
      expect(s.commandMessage).toBe("{'g': 123}");
    });

    it('reads, writes, unlets, and checks existence of $ENV variables', () => {
      let s = createVimState([''], { line: 0, col: 0 }, { cwd: '/workspace/demo' });
      s = runExCommand(s, 'echo [exists("$HOME"), exists("$NO_SUCH_ENV_VAR"), $PWD, $NO_SUCH_ENV_VAR == ""]');
      expect(s.commandMessage).toBe("[1, 0, '/workspace/demo', 1]");

      s = runExCommand(s, 'let $MY_TOKEN = "secret"');
      s = runExCommand(s, 'echo [exists("$MY_TOKEN"), $MY_TOKEN]');
      expect(s.commandMessage).toBe("[1, 'secret']");

      s = runExCommand(s, 'unlet $MY_TOKEN');
      s = runExCommand(s, 'echo [exists("$MY_TOKEN"), $MY_TOKEN == ""]');
      expect(s.commandMessage).toBe('[0, 1]');
    });

    it(':finish stops :source execution early and raises E168 outside :source', () => {
      // E168 outside :source
      let s = runExCommand(createVimState(['']), 'finish');
      expect(s.bell).toBe(true);
      expect(s.commandMessage).toContain('E168');

      // Direct :finish inside sourced file
      s = createVimState([''], { line: 0, col: 0 }, {
        virtualFiles: {
          'init.vim': [
            'let g:step1 = 1',
            'finish',
            'let g:step2 = 2',
          ],
          'guarded.vim': [
            'if exists("g:loaded_guard") | finish | endif',
            'let g:loaded_guard = 1',
            'let g:count_runs = get(g:, "count_runs", 0) + 1',
          ],
        },
      });

      s = runExCommand(s, 'source init.vim');
      expect(s.globalVars?.step1).toBe(1);
      expect(s.globalVars?.step2).toBeUndefined();
      expect(s.scriptSourcingDepth).toBeUndefined();

      // Conditional guard on second :source skips incrementing g:count_runs
      s = runExCommand(s, 'source guarded.vim');
      expect(s.globalVars?.count_runs).toBe(1);
      s = runExCommand(s, 'source guarded.vim');
      expect(s.globalVars?.count_runs).toBe(1);
    });
  });
});
