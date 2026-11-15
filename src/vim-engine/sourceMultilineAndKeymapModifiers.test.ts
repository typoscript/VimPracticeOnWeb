import { describe, expect, it } from 'vitest';
import { createVimState, runExCommand, sendKeys } from './index';

describe(':source multi-line/continuation & execute() (#1) + keymap modifiers & :normal! (#2)', () => {
  describe('execute() builtin and :source multi-line blocks / line continuation', () => {
    it('supports execute(cmd [, silent]) capturing Ex and echo outputs cleanly', () => {
      let s = createVimState(['hello'], { line: 0, col: 0 }, { primaryFilename: 'main.ts' });
      s = runExCommand(s, 'let g:cap = execute("echo \\"hi\\"")');
      expect(s.globalVars?.cap).toBe('\nhi');

      s = runExCommand(s, 'let g:multi = execute(["let g:x = 7", "echo g:x"])');
      expect(s.globalVars?.x).toBe(7);
      expect(s.globalVars?.multi).toBe('\n7');

      s = runExCommand(s, 'let g:bufs = execute("ls")');
      expect(s.globalVars?.bufs).toContain('main.ts');

      s = runExCommand(s, 'let g:safe = execute("not_a_valid_cmd_xyz", "silent!")');
      expect(s.bell).toBeFalsy();
      expect(s.globalVars?.safe).toBe('');
    });

    it('handles backslash line continuations and multi-line if/for/try blocks in :source', () => {
      let s = createVimState(['alpha'], { line: 0, col: 0 }, {
        virtualFiles: {
          'plugin.vim': [
            'let g:items = [',
            '  \\ "one",',
            '  "\\ comment inside continuation',
            '  \\ "two",',
            '  \\ ]',
            'if has("vim")',
            '  set number',
            '  let g:sum = 0',
            '  for n in [1, 2, 3]',
            '    let g:sum += n',
            '  endfor',
            '  nnoremap <buffer> <silent> K :let g:hit = 1<CR>',
            'else',
            '  let g:sum = -1',
            'endif',
            'try',
            '  throw "boom"',
            'catch /boom/',
            '  let g:caught = v:exception',
            'endtry',
          ],
        },
      });

      s = runExCommand(s, 'source plugin.vim');
      expect(s.globalVars?.items).toEqual(['one', 'two']);
      expect(s.options?.number).toBe(true);
      expect(s.globalVars?.sum).toBe(6);
      expect(s.globalVars?.caught).toBe('boom');
      expect(s.bufferKeymaps?.[1]?.['n:K']).toBe(':let g:hit = 1<CR>');
      s = sendKeys(s, 'K');
      expect(s.globalVars?.hit).toBe(1);
    });
  });

  describe('Keymap modifiers (<buffer>, <silent>, <expr>) and :normal!', () => {
    it('isolates <buffer> keymaps per buffer and unmaps cleanly with <buffer>', () => {
      let s = createVimState(['abcdef'], { line: 0, col: 0 }, { primaryFilename: 'buf1.ts' });
      s = runExCommand(s, 'nnoremap <buffer> X x');
      s = sendKeys(s, 'X');
      expect(s.lines[0]).toBe('bcdef');

      // Second buffer does NOT inherit buffer-local mapping
      s = runExCommand(s, 'e buf2.ts');
      s = { ...s, lines: ['12345'] };
      s = sendKeys(s, 'X');
      expect(s.lines[0]).toBe('12345');

      // Switch back to buf1 and verify :nmap output includes @X and :nunmap <buffer> works
      s = sendKeys(s, '<C-^>');
      s = runExCommand(s, 'nmap');
      expect(s.commandMessage).toContain('@X');

      s = runExCommand(s, 'nunmap <buffer> X');
      s = sendKeys(s, 'X');
      expect(s.lines[0]).toBe('bcdef');
    });

    it('suppresses commandMessage updates with <silent>', () => {
      let s = createVimState(['hello']);
      s = runExCommand(s, 'echo "before"');
      s = runExCommand(s, 'nnoremap <silent> Z :echo "noise"<CR>');
      // Restore known commandMessage, then trigger Z
      s = runExCommand(s, 'echo "keep me"');
      s = sendKeys(s, 'Z');
      expect(s.commandMessage).toBe('keep me');
    });

    it('evaluates <expr> mappings dynamically in Insert and Normal modes', () => {
      let s = createVimState(['  code'], { line: 0, col: 0 });
      s = runExCommand(s, "inoremap <expr> <Tab> col('.') > 1 ? '>' : '#'");
      // At col 0 (1-based col 1) -> inserts '#'
      s = sendKeys(s, 'i<Tab><Esc>');
      expect(s.lines[0]).toBe('#  code');

      // At col 1 (1-based col 2) -> inserts '>'
      s = sendKeys(s, 'a<Tab><Esc>');
      expect(s.lines[0]).toBe('#>  code');

      // Normal mode <expr>
      s = runExCommand(s, 'let g:to_end = 1');
      s = runExCommand(s, "nnoremap <expr> M g:to_end ? '$' : '0'");
      s = sendKeys(s, '0M');
      expect(s.cursor.col).toBe(s.lines[0].length - 1);
    });

    it(':normal uses user mappings whereas :normal! bypasses user mappings (including in :g)', () => {
      let s = createVimState(['first', 'second'], { line: 0, col: 0 });
      s = runExCommand(s, 'nnoremap J x');

      // :norm J uses mapping (deletes first char 'f')
      s = runExCommand(s, '1norm J');
      expect(s.lines).toEqual(['irst', 'second']);

      // :norm! J bypasses mapping and runs built-in J (joins lines 1 & 2)
      s = runExCommand(s, '1norm! J');
      expect(s.lines).toEqual(['irst second']);

      // :g/pat/norm! also bypasses mappings
      s = createVimState(['tag one', 'tag two'], { line: 0, col: 0 });
      s = runExCommand(s, 'nnoremap x aEXTRA<Esc>');
      s = runExCommand(s, 'g/tag/norm! x');
      expect(s.lines).toEqual(['ag one', 'ag two']);
    });
  });
});
