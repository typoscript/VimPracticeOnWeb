import { describe, expect, it } from 'vitest';
import { createVimState, runExCommand, sendKeys } from './index';

describe('Vimscript option variables (&opt), expand/has/exists, :redir/:messages, and Ex modifiers', () => {
  describe('&option read and write in Vimscript', () => {
    it('reads boolean, numeric, and string options via &opt, &g:opt, &l:opt', () => {
      let s = createVimState(['hello'], { line: 0, col: 0 }, {
        options: { number: true, shiftwidth: 2, tabstop: 4, foldmethod: 'indent' } as never,
      });
      // merge default options cleanly via :set
      s = runExCommand(s, 'set number shiftwidth=2 tabstop=4');
      s = runExCommand(s, 'echo &number . ":" . &g:sw . ":" . &l:ts');
      expect(s.commandMessage).toBe('1:2:4');
    });

    it('writes &opt with :let and supports !&nu and += arithmetic', () => {
      let s = createVimState(['alpha']);
      s = runExCommand(s, 'set nonumber shiftwidth=4');
      s = runExCommand(s, 'let &nu = !&nu');
      expect(s.options?.number).toBe(true);

      s = runExCommand(s, 'let &sw += 2');
      expect(s.options?.shiftwidth).toBe(6);

      s = runExCommand(s, 'let &foldmethod = "indent"');
      expect(s.options?.foldmethod).toBe('indent');
    });

    it('raises E113 on unknown option read or write', () => {
      let s = createVimState(['hello']);
      s = runExCommand(s, 'echo &no_such_option_xyz');
      expect(s.bell).toBe(true);
      expect(s.commandMessage).toContain('E113');

      s = runExCommand(createVimState(['hello']), 'let &no_such_option_xyz = 1');
      expect(s.bell).toBe(true);
      expect(s.commandMessage).toContain('E113');
    });
  });

  describe('expand(), has(), and enhanced exists()', () => {
    it('expands %, #, path modifiers (:p, :h, :t, :r, :e, chained), and line tokens', () => {
      let s = createVimState(['foo bar baz'], { line: 0, col: 5 }, {
        primaryFilename: 'src/utils/helper.ts',
        secondaryFilename: 'README.md',
        cwd: '/workspace/app',
      });

      s = runExCommand(s, 'echo expand("%") . "|" . expand("#") . "|" . expand("<slnum>")');
      expect(s.commandMessage).toBe('src/utils/helper.ts|README.md|1');

      s = runExCommand(s, 'echo expand("%:t") . "|" . expand("%:h") . "|" . expand("%:r") . "|" . expand("%:e")');
      expect(s.commandMessage).toBe('helper.ts|src/utils|src/utils/helper|ts');

      s = runExCommand(s, 'echo expand("%:t:r") . "|" . expand("%:p:h")');
      expect(s.commandMessage).toBe('helper|/workspace/app/src/utils');
    });

    it('expands <cword>, <cWORD>, and <cfile> under cursor', () => {
      let s = createVimState(['  import foo_bar from "./dir/mod.ts";'], { line: 0, col: 11 });
      s = runExCommand(s, 'echo expand("<cword>")');
      expect(s.commandMessage).toBe('foo_bar');

      s = runExCommand(createVimState(['call obj.method(x) end'], { line: 0, col: 6 }), 'echo expand("<cWORD>")');
      expect(s.commandMessage).toBe('obj.method(x)');

      s = runExCommand(createVimState(['open src/app/main.ts;'], { line: 0, col: 8 }), 'echo expand("<cfile>")');
      expect(s.commandMessage).toBe('src/app/main.ts');
    });

    it('checks has() features and exists() targets (&opt, +opt, :cmd, @reg, *func, vars)', () => {
      let s = createVimState(['abc']);
      s = runExCommand(s, 'command! MyCustomCmd echo 1');
      s = runExCommand(s, 'let g:myvar = 42');
      s = runExCommand(
        s,
        'echo [has("vim"), has("lambda"), has("win32"), exists("&nu"), exists("+sw"), exists(":edit"), exists(":MyCustomCmd"), exists(":NotACmd999"), exists("@a"), exists("*strlen"), exists("*NoFunc999"), exists("g:myvar"), exists("g:missing999")]'
      );
      expect(s.commandMessage).toBe('[1, 1, 0, 1, 1, 2, 2, 0, 1, 1, 0, 1, 0]');
    });
  });

  describe(':echom, :messages, and :redir capture', () => {
    it('records :echom in :messages history without recording plain :echo, and clears with :messages clear', () => {
      let s = createVimState(['line1']);
      s = runExCommand(s, 'echo "ephemeral"');
      s = runExCommand(s, 'echom "first msg"');
      s = runExCommand(s, 'echomsg "second msg"');
      s = runExCommand(s, 'messages');
      expect(s.commandMessage).toBe('first msg\nsecond msg');

      s = runExCommand(s, 'messages clear');
      s = runExCommand(s, 'messages');
      expect(s.messageHistory).toEqual([]);
      expect(s.commandMessage).not.toContain('first msg');
    });

    it('captures Ex commands, loops, calls, and :silent echo into g:var and @a register', () => {
      let s = createVimState(['one', 'two', 'three']);
      s = runExCommand(s, 'redir => g:out');
      s = runExCommand(s, '1,2p');
      s = runExCommand(s, 'silent echo "inside silent"');
      s = runExCommand(s, 'redir END');

      expect(s.redirSession).toBeNull();
      expect(s.globalVars?.out).toContain('one');
      expect(s.globalVars?.out).toContain('two');
      expect(s.globalVars?.out).toContain('inside silent');

      // Append mode =>>
      s = runExCommand(s, 'redir =>> g:out');
      s = runExCommand(s, 'for x in [10, 20] | echo x | endfor');
      s = runExCommand(s, 'redir END');
      expect(s.globalVars?.out).toContain('inside silent');
      expect(s.globalVars?.out).toContain('10');
      expect(s.globalVars?.out).toContain('20');

      // Register redirection @a> and @A>
      s = runExCommand(s, 'redir @a>');
      s = runExCommand(s, 'pwd');
      s = runExCommand(s, 'redir END');
      const rawRegA = s.registers?.a?.content;
      const firstReg = typeof rawRegA === 'string' ? rawRegA : (rawRegA ?? []).join('\n');
      expect(firstReg.length).toBeGreaterThan(0);

      s = runExCommand(s, 'redir @A>');
      s = runExCommand(s, 'echo "appended"');
      s = runExCommand(s, 'redir END');
      expect(s.registers?.a?.content).toContain(firstReg.trim());
      expect(s.registers?.a?.content).toContain('appended');
    });
  });

  describe('Ex modifiers (:silent[!], :keeppatterns, :noautocmd)', () => {
    it(':silent hides normal output, keeps bell+error; :silent! suppresses both error and bell', () => {
      let s = createVimState(['hello world']);
      s = runExCommand(s, 'silent echo "hidden"');
      expect(s.bell).toBeFalsy();
      expect(s.commandMessage).toBeUndefined();

      s = runExCommand(s, 'silent %s/notfound/repl/g');
      expect(s.bell).toBe(true);
      expect(s.commandMessage).toBeTruthy();

      s = runExCommand(createVimState(['hello world']), 'silent! %s/notfound/repl/g');
      expect(s.bell).toBeFalsy();
      expect(s.commandMessage).toBeUndefined();
    });

    it(':keeppatterns preserves lastSearchQuery and hlsearchSuppressed across :s and search', () => {
      let s = createVimState(['foo bar baz']);
      s = sendKeys(s, '/bar<CR>');
      s = runExCommand(s, 'noh');
      expect(s.lastSearchQuery).toBe('bar');
      expect(s.hlsearchSuppressed).toBe(true);

      s = runExCommand(s, 'keeppatterns %s/foo/qux/g');
      expect(s.lines[0]).toBe('qux bar baz');
      expect(s.lastSearchQuery).toBe('bar');
      expect(s.hlsearchSuppressed).toBe(true);
    });

    it(':noautocmd suppresses autocmd triggers only for that command and restores afterward', () => {
      let s = createVimState(['hello'], { line: 0, col: 0 }, { primaryFilename: 'test.txt' });
      s = runExCommand(s, 'autocmd BufWritePost * :let g:wrote = 1');

      s = runExCommand(s, 'noautocmd w');
      expect(s.noautocmdSuppressed).toBeFalsy();
      expect(s.globalVars?.wrote).toBeUndefined();

      s = runExCommand(s, 'w');
      expect(s.globalVars?.wrote).toBe(1);
    });
  });
});
