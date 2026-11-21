import { describe, it, expect } from 'vitest';
import {
  createVimState,
  handleKey,
  sendKeys,
  runExCommand,
  evalVimExpression,
  VimEditorState,
} from './index';

function runKeys(state: VimEditorState, keys: string[]): VimEditorState {
  return keys.reduce((s, k) => handleKey(s, k), state);
}

const evalVal = (state: VimEditorState, expr: string) => evalVimExpression(state, expr).value;

describe('Track A: Forced Motionwise (dv / dV / d<C-v>)', () => {
  it('dvj forces linewise motion j into charwise exclusive deletion (Neovim parity)', () => {
    let s = createVimState(['abcdef', '123456', 'xyz789'], { line: 0, col: 2 });
    s = sendKeys(s, 'dvj');
    expect(s.lines).toEqual(['ab3456', 'xyz789']);
    expect(s.clipboard).toEqual({ type: 'text', content: 'cdef\n12' });
    expect(s.cursor).toEqual({ line: 0, col: 2 });
  });

  it('dVj and dVw force motions into linewise deletion', () => {
    let s = createVimState(['abcdef', '123456', 'xyz789'], { line: 0, col: 2 });
    s = sendKeys(s, 'dVj');
    expect(s.lines).toEqual(['xyz789']);
    expect(s.clipboard?.type).toBe('line');

    let s2 = createVimState(['foo bar baz', 'qux'], { line: 0, col: 0 });
    s2 = sendKeys(s2, 'dVw');
    expect(s2.lines).toEqual(['qux']);
    expect(s2.clipboard).toEqual({ type: 'line', content: 'foo bar baz' });
  });

  it('dvw toggles exclusive w to inclusive, and dve toggles inclusive e to exclusive', () => {
    let s1 = createVimState(['foo bar baz', 'qux'], { line: 0, col: 0 });
    s1 = sendKeys(s1, 'dvw');
    expect(s1.lines).toEqual(['ar baz', 'qux']);
    expect(s1.clipboard).toEqual({ type: 'text', content: 'foo b' });

    let s2 = createVimState(['foo bar baz', 'qux'], { line: 0, col: 0 });
    s2 = sendKeys(s2, 'dve');
    expect(s2.lines).toEqual(['o bar baz', 'qux']);
    expect(s2.clipboard).toEqual({ type: 'text', content: 'fo' });
  });

  it('d<C-v>j and d<C-v>2l force blockwise deletion with block register', () => {
    let s1 = createVimState(['abcdef', '123456', 'xyz789'], { line: 0, col: 2 });
    s1 = runKeys(s1, ['d', 'Ctrl-v', 'j']);
    expect(s1.lines).toEqual(['abdef', '12456', 'xyz789']);
    expect(s1.clipboard).toEqual({ type: 'block', content: 'c\n3', blockWidth: 1 });

    let s2 = createVimState(['abcdef', '123456', 'xyz789'], { line: 0, col: 2 });
    s2 = runKeys(s2, ['d', 'Ctrl-v', '2', 'l']);
    expect(s2.lines).toEqual(['abf', '123456', 'xyz789']);
    expect(s2.clipboard).toEqual({ type: 'block', content: 'cde', blockWidth: 3 });
  });

  it('supports c<C-v>j block change, y<C-v>j block yank, dvj dot repeat, 2-key motions, and Escape cancel', () => {
    let s = createVimState(['abcdef', '123456', 'xyz789'], { line: 0, col: 2 });
    s = runKeys(s, ['c', 'Ctrl-v', 'j', 'Z', 'Escape']);
    expect(s.lines).toEqual(['abZdef', '12Z456', 'xyz789']);

    let y = createVimState(['abcdef', '123456'], { line: 0, col: 1 });
    y = runKeys(y, ['y', 'Ctrl-v', 'j']);
    expect(y.lines).toEqual(['abcdef', '123456']);
    expect(y.clipboard).toEqual({ type: 'block', content: 'b\n2', blockWidth: 1 });

    let d = createVimState(['aa11', 'bb22', 'cc33', 'dd44'], { line: 0, col: 2 });
    d = runKeys(d, ['d', 'v', 'j']);
    expect(d.lines).toEqual(['aa22', 'cc33', 'dd44']);
    d = handleKey(d, '.');
    expect(d.lines).toEqual(['aa33', 'dd44']);

    // 2-key motion: dvf) toggles f) from inclusive to exclusive
    let f = createVimState(['(hello) world'], { line: 0, col: 1 });
    f = sendKeys(f, 'dvf)');
    expect(f.lines).toEqual(['() world']);

    // Escape cancels forced motionwise
    let esc = createVimState(['abc', 'def']);
    esc = runKeys(esc, ['d', 'v', 'Escape', 'j']);
    expect(esc.lines).toEqual(['abc', 'def']);
    expect(esc.cursor.line).toBe(1);
    expect(esc.forcedMotionwise).toBeUndefined();
  });
});

describe('Track A: :set formatoptions (fo)', () => {
  it('supports =, +=, ^=, -=, ?, E474 validation, and buffer-local :setlocal', () => {
    let s = createVimState(['hello']);
    s = runExCommand(s, 'set fo?');
    expect(s.commandMessage).toContain('formatoptions=tcqj');

    s = runExCommand(s, 'set fo+=ro');
    expect(s.options?.formatoptions).toBe('tcqjro');

    s = runExCommand(s, 'set fo-=j');
    expect(s.options?.formatoptions).toBe('tcqro');

    s = runExCommand(s, 'set fo^=j');
    expect(s.options?.formatoptions).toBe('jtcqro');

    const bad = runExCommand(s, 'set fo=Z');
    expect(bad.bell).toBe(true);
    expect(bad.commandMessage).toContain('E474');
  });

  it('j flag removes duplicate comment leader on J (but not gJ)', () => {
    let s = createVimState(['// hello', '// world']);
    s = handleKey(s, 'J');
    expect(s.lines).toEqual(['// hello world']);

    let sNoJ = createVimState(['// hello', '// world']);
    sNoJ = runExCommand(sNoJ, 'set fo-=j');
    sNoJ = handleKey(sNoJ, 'J');
    expect(sNoJ.lines).toEqual(['// hello // world']);

    let sGJ = createVimState(['// hello', '// world']);
    sGJ = sendKeys(sGJ, 'gJ');
    expect(sGJ.lines).toEqual(['// hello// world']);
  });

  it('o flag auto-inserts comment leader on o and O', () => {
    let s = createVimState(['  // first line']);
    s = runExCommand(s, 'set fo+=o');
    s = runKeys(s, ['o', 's', 'e', 'c', 'o', 'n', 'd', 'Escape']);
    expect(s.lines).toEqual(['  // first line', '  // second']);

    let sAbove = createVimState(['  # item']);
    sAbove = runExCommand(sAbove, 'set fo+=o');
    sAbove = runKeys(sAbove, ['O', 't', 'o', 'p', 'Escape']);
    expect(sAbove.lines).toEqual(['  # top', '  # item']);

    let sBlock = createVimState(['  /* block']);
    sBlock = runExCommand(sBlock, 'set fo+=o');
    sBlock = runKeys(sBlock, ['o', 'm', 'i', 'd', 'Escape']);
    expect(sBlock.lines).toEqual(['  /* block', '   * mid']);
  });

  it('r flag auto-inserts comment leader on Insert <Enter>', () => {
    let s = createVimState(['  // hello']);
    s = runExCommand(s, 'set fo+=r');
    s = runKeys(s, ['A', 'Enter', 'w', 'o', 'r', 'l', 'd', 'Escape']);
    expect(s.lines).toEqual(['  // hello', '  // world']);

    let sOff = createVimState(['  // hello']);
    sOff = runExCommand(sOff, 'set fo-=r');
    sOff = runKeys(sOff, ['A', 'Enter', 'w', 'Escape']);
    expect(sOff.lines).toEqual(['  // hello', 'w']);
  });

  it('q flag controls comment leader reflow in gq, and t/c flags control textwidth auto-wrap', () => {
    let sNoQ = createVimState(['// alpha', '// beta']);
    sNoQ = runExCommand(sNoQ, 'set tw=40 fo-=q');
    sNoQ = sendKeys(sNoQ, 'gqip');
    expect(sNoQ.lines).toEqual(['// alpha // beta']);

    let sNoT = createVimState(['hello world']);
    sNoT = runExCommand(sNoT, 'set tw=10 fo-=t');
    sNoT = runKeys(sNoT, ['A', ' ', 'x', 'y', 'z', 'Escape']);
    expect(sNoT.lines).toEqual(['hello world xyz']);

    let sCommentWrap = createVimState(['// hi there']);
    sCommentWrap = runExCommand(sCommentWrap, 'set tw=12 fo=c');
    sCommentWrap = runKeys(sCommentWrap, ['A', ' ', 'w', 'o', 'r', 'l', 'd', 'Escape']);
    expect(sCommentWrap.lines).toEqual(['// hi there', '// world']);
  });
});

describe('Track A: Virtual Replace (gR / gr) & Ctrl-x Ctrl-] / Ctrl-x Ctrl-o', () => {
  it('gr and [count]gr preserve tab visual columns (Neovim parity)', () => {
    let s1 = createVimState(['\tabc']);
    s1 = runExCommand(s1, 'set ts=4');
    s1 = sendKeys(s1, 'grX');
    expect(s1.lines).toEqual(['X\tabc']);
    expect(s1.cursor).toEqual({ line: 0, col: 0 });

    let s2 = createVimState(['\tabc']);
    s2 = runExCommand(s2, 'set ts=4');
    s2 = sendKeys(s2, '2grX');
    expect(s2.lines).toEqual(['XX\tabc']);
    expect(s2.cursor).toEqual({ line: 0, col: 1 });

    let s4 = createVimState(['\tabc']);
    s4 = runExCommand(s4, 'set ts=4');
    s4 = sendKeys(s4, '4grX');
    expect(s4.lines).toEqual(['XXXXabc']);
    expect(s4.cursor).toEqual({ line: 0, col: 3 });
  });

  it('gR enters Virtual Replace mode, preserves tab columns, restores tab on Backspace, and dot-repeats', () => {
    let s = createVimState(['\tabc', '\tdef']);
    s = runExCommand(s, 'set ts=4');
    s = sendKeys(s, 'gR');
    expect(s.mode).toBe('REPLACE');
    expect(s.virtualReplace).toBe(true);

    s = runKeys(s, ['X', 'Y', 'Escape']);
    expect(s.mode).toBe('NORMAL');
    expect(s.virtualReplace).toBeUndefined();
    expect(s.lines[0]).toBe('XY\tabc');
    expect(s.cursor).toEqual({ line: 0, col: 1 });

    // Dot repeat on next line
    s = sendKeys(s, 'j0.');
    expect(s.lines[1]).toBe('XY\tdef');

    let sBs = createVimState(['\tabc']);
    sBs = runExCommand(sBs, 'set ts=4');
    sBs = runKeys(sBs, ['g', 'R', 'X', 'Y', 'Backspace', 'Backspace', 'Escape']);
    expect(sBs.lines).toEqual(['\tabc']);
    expect(sBs.cursor).toEqual({ line: 0, col: 0 });
  });

  it('Insert Ctrl-x Ctrl-] completes project tags and Ctrl-x Ctrl-o completes LSP symbols', () => {
    let s = createVimState(
      ['function calculateTotal() {}', 'function calculateTax() {}', 'calc'],
      { line: 2, col: 4 },
      { mode: 'INSERT' }
    );
    s = runKeys(s, ['Ctrl-x', 'Ctrl-]']);
    expect(s.completionSession?.type).toBe('tag');
    expect(s.completionSession?.candidates).toEqual(['calculateTax', 'calculateTotal']);
    expect(s.lines[2]).toBe('calculateTax');

    s = handleKey(s, 'Ctrl-n');
    expect(s.lines[2]).toBe('calculateTotal');

    s = handleKey(s, 'Ctrl-e');
    expect(s.lines[2]).toBe('calc');

    let lspState = createVimState(
      ['fet'],
      { line: 0, col: 3 },
      {
        mode: 'INSERT',
        lspSymbols: {
          fetchUser: {
            symbol: 'fetchUser',
            kind: 'function',
            signature: 'fetchUser(id: string)',
            documentation: 'Fetch a user',
          },
          fetchOrders: {
            symbol: 'fetchOrders',
            kind: 'function',
            signature: 'fetchOrders()',
            documentation: 'Fetch orders',
          },
        },
      }
    );
    lspState = runKeys(lspState, ['Ctrl-x', 'Ctrl-o']);
    expect(lspState.completionSession?.type).toBe('omni');
    expect(lspState.lines[0]).toBe('fetchOrders');
  });
});

describe('Track A: Window/Tab CWD (:lcd/:tcd/:cd/getcwd/haslocaldir) & :arglocal/:argglobal', () => {
  it(':lcd sets window-local cwd without affecting other split panes, and getcwd()/haslocaldir() reflect scope', () => {
    let s = createVimState(['main'], { line: 0, col: 0 }, {
      virtualFiles: {
        'src/app.ts': ['export const a = 1;'],
        'services/auth.ts': ['export const b = 2;'],
      },
    });
    s = runExCommand(s, 'vsp');
    expect(evalVal(s, 'haslocaldir()')).toBe(0);

    // Pane 0 sets :lcd src
    s = runExCommand(s, 'lcd src');
    expect(s.commandMessage).toBe('/workspace/src');
    expect(evalVal(s, 'getcwd()')).toBe('/workspace/src');
    expect(evalVal(s, 'haslocaldir()')).toBe(1);
    expect(evalVal(s, 'getcwd(-1)')).toBe('/workspace');

    // Switch to pane 1: still at /workspace
    s = runKeys(s, ['Ctrl-w', 'w']);
    s = runExCommand(s, 'pwd');
    expect(s.commandMessage).toBe('/workspace');
    expect(evalVal(s, 'haslocaldir()')).toBe(0);
    expect(evalVal(s, 'getcwd(1)')).toBe('/workspace/src');
    expect(evalVal(s, 'getcwd(2)')).toBe('/workspace');
    expect(evalVal(s, 'haslocaldir(1)')).toBe(1);
    expect(evalVal(s, 'haslocaldir(2)')).toBe(0);

    // Switch back to pane 0: restores /workspace/src, and :lcd - goes back to /workspace
    s = runKeys(s, ['Ctrl-w', 'w']);
    s = runExCommand(s, 'pwd');
    expect(s.commandMessage).toBe('/workspace/src');
    s = runExCommand(s, 'lcd -');
    expect(s.commandMessage).toBe('/workspace');
  });

  it(':tcd sets tab-local cwd (haslocaldir() == 2) and :cd - handles missing previous dir with E186', () => {
    let s = createVimState(['tab1'], { line: 0, col: 0 }, {
      virtualFiles: {
        'services/pay.ts': ['export const p = 1;'],
      },
    });
    const noPrev = runExCommand(s, 'cd -');
    expect(noPrev.bell).toBe(true);
    expect(noPrev.commandMessage).toContain('E186');

    s = runExCommand(s, 'tabnew');
    s = runExCommand(s, 'tcd services');
    expect(evalVal(s, 'getcwd()')).toBe('/workspace/services');
    expect(evalVal(s, 'haslocaldir()')).toBe(2);

    s = sendKeys(s, 'gT');
    expect(evalVal(s, 'getcwd()')).toBe('/workspace');
    expect(evalVal(s, 'haslocaldir()')).toBe(0);
  });

  it(':arglocal isolates window argument list from global :args, and :argglobal restores global list', () => {
    let s = createVimState(['a'], { line: 0, col: 0 }, {
      virtualFiles: {
        'a.ts': ['a'],
        'b.ts': ['b'],
        'x.ts': ['x'],
        'y.ts': ['y'],
      },
    });
    s = runExCommand(s, 'args a.ts b.ts');
    s = runExCommand(s, 'vsp');

    // Switch to pane 1 and create a window-local arglist
    s = runKeys(s, ['Ctrl-w', 'w']);
    s = runExCommand(s, 'arglocal x.ts y.ts');
    s = runExCommand(s, 'args');
    expect(s.commandMessage).toBe('[x.ts] y.ts');

    // Pane 0 still has global arglist
    s = runKeys(s, ['Ctrl-w', 'w']);
    s = runExCommand(s, 'args');
    expect(s.commandMessage).toBe('[a.ts] b.ts');

    // Back to pane 1: still local, then :argglobal reattaches to global
    s = runKeys(s, ['Ctrl-w', 'w']);
    s = runExCommand(s, 'args');
    expect(s.commandMessage).toBe('[x.ts] y.ts');
    s = runExCommand(s, 'argglobal');
    expect(s.commandMessage).toBe('[a.ts] b.ts');
  });
});
