import { describe, expect, it } from 'vitest';
import {
  computePaneRects,
  createVimState,
  getEffectiveWindowTree,
  handleKey,
  runExCommand,
  sendKeys,
  VimEditorState,
} from './index';

describe('Multi-Window Split Tree (3+ panes, nested layouts, :windo, Vimscript builtins)', () => {
  it('supports nested vertical + horizontal splits (3 panes) with accurate layout geometry', () => {
    let s = createVimState(['left-top'], { line: 0, col: 0 }, {
      primaryFilename: 'a.ts',
      virtualFiles: {
        'b.ts': ['right-pane'],
        'c.ts': ['left-bottom'],
      },
    });

    // 1. :vsp b.ts -> [a.ts | b.ts]
    s = runExCommand(s, 'vsp b.ts');
    expect(s.splitPanes).toHaveLength(2);
    expect(s.splitDirection).toBe('vertical');
    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['a.ts', 'b.ts']);

    // 2. Active is a.ts (pane 0); :sp c.ts -> vertical([horizontal([a.ts, c.ts]), b.ts])
    s = runExCommand(s, 'sp c.ts');
    expect(s.splitPanes).toHaveLength(3);
    expect(s.splitDirection).toBe('vertical');
    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['a.ts', 'c.ts', 'b.ts']);
    expect(s.activePaneIndex).toBe(0);

    const tree = getEffectiveWindowTree(s)!;
    expect(tree.kind).toBe('split');
    if (tree.kind === 'split') {
      expect(tree.direction).toBe('vertical');
      expect(tree.children[0].kind).toBe('split');
      if (tree.children[0].kind === 'split') {
        expect(tree.children[0].direction).toBe('horizontal');
      }
      expect(tree.children[1]).toEqual({ kind: 'leaf', paneIndex: 2 });
    }

    const rects = computePaneRects(tree);
    expect(rects).toHaveLength(3);
    // pane 0: top-left, pane 1: bottom-left, pane 2: right full height
    expect(rects[0]).toMatchObject({ paneIndex: 0, x: 0, y: 0, w: 0.5, h: 0.5 });
    expect(rects[1]).toMatchObject({ paneIndex: 1, x: 0, y: 0.5, w: 0.5, h: 0.5 });
    expect(rects[2]).toMatchObject({ paneIndex: 2, x: 0.5, y: 0, w: 0.5, h: 1 });
  });

  it('flattens consecutive same-direction splits into a single 3-way split', () => {
    let s = createVimState(['one'], { line: 0, col: 0 }, {
      primaryFilename: 'a.ts',
      virtualFiles: { 'b.ts': ['two'], 'c.ts': ['three'] },
    });

    s = runExCommand(s, 'vsp b.ts');
    s = runExCommand(s, 'vsp c.ts');

    expect(s.splitPanes).toHaveLength(3);
    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['a.ts', 'c.ts', 'b.ts']);
    const tree = getEffectiveWindowTree(s)!;
    expect(tree.kind).toBe('split');
    if (tree.kind === 'split') {
      expect(tree.direction).toBe('vertical');
      expect(tree.children).toHaveLength(3);
    }
  });

  it('navigates a 2x2 (4-pane) grid geometrically with Ctrl-w h/j/k/l, w/W, [count]Ctrl-w w, t/b/p', () => {
    let s = createVimState(['TL'], { line: 0, col: 0 }, {
      primaryFilename: 'tl.ts',
      virtualFiles: {
        'tr.ts': ['TR'],
        'bl.ts': ['BL'],
        'br.ts': ['BR'],
      },
    });

    // Build 2x2: vertical([horizontal([tl, bl]), horizontal([tr, br])])
    s = runExCommand(s, 'vsp tr.ts'); // panes: [tl(0), tr(1)], active: 0
    s = runExCommand(s, 'sp bl.ts'); // panes: [tl(0), bl(1), tr(2)], active: 0
    s = sendKeys(s, '<C-w>l'); // focus tr(2)
    expect(s.activePaneIndex).toBe(2);
    s = runExCommand(s, 'sp br.ts'); // panes: [tl(0), bl(1), tr(2), br(3)], active: 2

    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['tl.ts', 'bl.ts', 'tr.ts', 'br.ts']);
    expect(s.activePaneIndex).toBe(2);

    // tr(2) -> j -> br(3)
    s = sendKeys(s, '<C-w>j');
    expect(s.activePaneIndex).toBe(3);
    expect(s.lines).toEqual(['BR']);

    // br(3) -> h -> bl(1)
    s = sendKeys(s, '<C-w>h');
    expect(s.activePaneIndex).toBe(1);
    expect(s.lines).toEqual(['BL']);

    // bl(1) -> k -> tl(0)
    s = sendKeys(s, '<C-w>k');
    expect(s.activePaneIndex).toBe(0);
    expect(s.lines).toEqual(['TL']);

    // Boundary no-op: tl(0) -> h stays at 0
    s = sendKeys(s, '<C-w>h');
    expect(s.activePaneIndex).toBe(0);

    // Cycle forward (w) and backward (W)
    s = sendKeys(s, '<C-w>w');
    expect(s.activePaneIndex).toBe(1);
    s = sendKeys(s, '<C-w>W');
    expect(s.activePaneIndex).toBe(0);
    s = sendKeys(s, '<C-w>W');
    expect(s.activePaneIndex).toBe(3);

    // [count]Ctrl-w w jumps directly to 1-based window number
    s = sendKeys(s, '2<C-w>w');
    expect(s.activePaneIndex).toBe(1);
    expect(s.lines).toEqual(['BL']);

    // Ctrl-w p returns to previous window (3)
    s = sendKeys(s, '<C-w>p');
    expect(s.activePaneIndex).toBe(3);

    // Ctrl-w t -> first (0), Ctrl-w b -> last (3)
    s = sendKeys(s, '<C-w>t');
    expect(s.activePaneIndex).toBe(0);
    s = sendKeys(s, '<C-w>b');
    expect(s.activePaneIndex).toBe(3);
  });

  it('collapses nested branches cleanly on :close and keeps only active pane on :only', () => {
    let s = createVimState(['A'], { line: 0, col: 0 }, {
      primaryFilename: 'a.ts',
      virtualFiles: { 'b.ts': ['B'], 'c.ts': ['C'] },
    });

    s = runExCommand(s, 'vsp b.ts');
    s = runExCommand(s, 'sp c.ts'); // vertical([horizontal([a, c]), b])
    expect(s.splitPanes).toHaveLength(3);

    // Close pane 0 (a.ts) -> remaining should collapse to vertical([c.ts, b.ts])
    s = runExCommand(s, 'close');
    expect(s.splitPanes).toHaveLength(2);
    expect(s.splitDirection).toBe('vertical');
    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['c.ts', 'b.ts']);
    expect(s.activePaneIndex).toBe(0);
    expect(s.lines).toEqual(['C']);

    // Add a 3rd pane again, jump to last, and run :only
    s = runExCommand(s, 'sp a.ts');
    expect(s.splitPanes).toHaveLength(3);
    s = sendKeys(s, '<C-w>b');
    expect(s.lines).toEqual(['B']);
    s = runExCommand(s, 'only');
    expect(s.splitDirection).toBe('none');
    expect(s.splitPanes).toBeUndefined();
    expect(s.windowLayout).toBeUndefined();
    expect(s.lines).toEqual(['B']);
    expect(s.primaryFilename).toBe('b.ts');
  });

  it('supports Ctrl-w x, r, R, H/J/K/L, and Ctrl-w T on 3-pane layouts', () => {
    let s = createVimState(['A'], { line: 0, col: 0 }, {
      primaryFilename: 'a.ts',
      virtualFiles: { 'b.ts': ['B'], 'c.ts': ['C'] },
    });

    // 3 vertical columns: [a.ts, c.ts, b.ts]
    s = runExCommand(s, 'vsp b.ts');
    s = runExCommand(s, 'vsp c.ts');
    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['a.ts', 'c.ts', 'b.ts']);

    // Ctrl-w x swaps active (0: a.ts) with next sibling (1: c.ts) -> [c.ts, a.ts, b.ts]
    s = sendKeys(s, '<C-w>x');
    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['c.ts', 'a.ts', 'b.ts']);

    // Ctrl-w r rotates clockwise -> [b.ts, c.ts, a.ts], focus follows c.ts to index 1
    s = sendKeys(s, '<C-w>r');
    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['b.ts', 'c.ts', 'a.ts']);
    expect(s.activePaneIndex).toBe(1);
    expect(s.lines).toEqual(['C']);

    // Ctrl-w R rotates counter-clockwise back -> [c.ts, a.ts, b.ts], focus follows c.ts to index 0
    s = sendKeys(s, '<C-w>R');
    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['c.ts', 'a.ts', 'b.ts']);
    expect(s.activePaneIndex).toBe(0);

    // Ctrl-w J moves c.ts to full-width bottom: horizontal([vertical([a.ts, b.ts]), c.ts])
    s = sendKeys(s, '<C-w>J');
    expect(s.splitDirection).toBe('horizontal');
    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(s.activePaneIndex).toBe(2);
    const rects = computePaneRects(getEffectiveWindowTree(s)!);
    expect(rects[2]).toMatchObject({ paneIndex: 2, x: 0, y: 0.5, w: 1, h: 0.5 });

    // Ctrl-w T breaks c.ts out to a new tab while Tab 1 retains the 2-pane [a.ts | b.ts] split
    s = sendKeys(s, '<C-w>T');
    expect(s.tabPages).toHaveLength(2);
    expect(s.currentTabId).toBe(2);
    expect(s.primaryFilename).toBe('c.ts');
    expect(s.splitPanes).toBeUndefined();

    // Switch back to Tab 1 -> 2-pane vertical split preserved!
    s = sendKeys(s, 'gT');
    expect(s.currentTabId).toBe(1);
    expect(s.splitDirection).toBe('vertical');
    expect(s.splitPanes).toHaveLength(2);
    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['a.ts', 'b.ts']);
  });

  it('resizes vertical and horizontal nested splits independently and equalizes with Ctrl-w =', () => {
    let s = createVimState(['A'], { line: 0, col: 0 }, {
      primaryFilename: 'a.ts',
      virtualFiles: { 'b.ts': ['B'], 'c.ts': ['C'] },
    });

    // vertical([horizontal([a, c]), b])
    s = runExCommand(s, 'vsp b.ts');
    s = runExCommand(s, 'sp c.ts');

    // Increase height of pane 0 (horizontal axis): Ctrl-w +
    s = sendKeys(s, '10<C-w>+');
    let rects = computePaneRects(getEffectiveWindowTree(s)!);
    expect(rects[0].h).toBeCloseTo(0.6, 5);
    expect(rects[1].h).toBeCloseTo(0.4, 5);
    expect(rects[0].w).toBeCloseTo(0.5, 5); // vertical axis untouched

    // Increase width of left column (vertical axis): :vert res +15
    s = runExCommand(s, 'vert res +15');
    rects = computePaneRects(getEffectiveWindowTree(s)!);
    expect(rects[0].w).toBeCloseTo(0.65, 5);
    expect(rects[2].w).toBeCloseTo(0.35, 5);
    expect(rects[0].h).toBeCloseTo(0.6, 5); // horizontal axis untouched

    // Equalize everything with Ctrl-w =
    s = sendKeys(s, '<C-w>=');
    rects = computePaneRects(getEffectiveWindowTree(s)!);
    expect(rects[0].w).toBeCloseTo(0.5, 5);
    expect(rects[0].h).toBeCloseTo(0.5, 5);
  });

  it('runs :windo and :windo! across 3+ panes and synchronizes scrollbind across all 3 panes', () => {
    const mkLines = (tag: string) => Array.from({ length: 20 }, (_, i) => `${tag} foo ${i + 1}`);
    let s: VimEditorState = createVimState(mkLines('P1'), { line: 0, col: 0 }, {
      primaryFilename: 'p1.ts',
      viewport: { topRow: 0, visibleRows: 8 },
      virtualFiles: {
        'p2.ts': mkLines('P2'),
        'p3.ts': mkLines('P3'),
      },
    });

    s = runExCommand(s, 'vsp p2.ts');
    s = runExCommand(s, 'sp p3.ts');
    expect(s.splitPanes).toHaveLength(3);

    // :windo applies substitution and scrollbind to all 3 panes
    s = runExCommand(s, 'windo %s/foo/bar/g | set scb');
    expect(s.commandMessage).toContain('3개 창에 대해 :windo');
    expect(s.splitPanes![0].lines[0]).toBe('P1 bar 1');
    expect(s.splitPanes![1].lines[0]).toBe('P3 bar 1');
    expect(s.splitPanes![2].lines[0]).toBe('P2 bar 1');
    expect(s.splitPanes!.every((p) => p.scrollbind === true)).toBe(true);
    // Vim 처럼 :%s 는 커서를 마지막 치환 줄로 옮기므로 모든 창을 첫 줄로 되돌립니다.
    s = runExCommand(s, 'windo 1');

    // Scrolling pane 0 with Ctrl-e scrolls panes 1 and 2 together
    s = handleKey(s, 'Ctrl-e');
    s = handleKey(s, 'Ctrl-e');
    expect(s.viewport!.topRow).toBe(2);
    expect(s.splitPanes![1].viewport!.topRow).toBe(2);
    expect(s.splitPanes![2].viewport!.topRow).toBe(2);

    // :windo! ignores failure in panes without 'P2' and still updates pane 2
    s = runExCommand(s, 'windo! %s/P2/UPDATED/g');
    expect(s.bell).toBeFalsy();
    expect(s.splitPanes![2].lines[0]).toBe('UPDATED bar 1');
  });

  it('preserves per-pane location lists, global marks, and :mksession/:source for 3-pane trees', () => {
    let s = createVimState(['err_a'], { line: 0, col: 0 }, {
      primaryFilename: 'a.ts',
      virtualFiles: {
        'b.ts': ['err_b'],
        'c.ts': ['line0', 'err_c'],
      },
    });

    s = runExCommand(s, 'vsp b.ts');
    s = runExCommand(s, 'sp c.ts'); // [a(0), c(1), b(2)]

    // Set location list in pane 0 and pane 1 independently
    s = runExCommand(s, 'lvimgrep /err_a/ %');
    expect(s.locationList?.items).toHaveLength(1);
    s = sendKeys(s, '<C-w>j'); // pane 1 (c.ts)
    expect(s.locationList).toBeUndefined();
    s = runExCommand(s, 'lvimgrep /err_c/ %');
    expect(s.locationList?.items[0].text).toBe('err_c');

    // Set global mark M in pane 1 (c.ts) line 1, jump back to pane 2 (b.ts), then jump to 'M
    s = sendKeys(s, 'mM');
    s = sendKeys(s, '<C-w>l'); // pane 2 (b.ts)
    expect(s.activePaneIndex).toBe(2);
    s = sendKeys(s, "'M");
    expect(s.activePaneIndex).toBe(1);
    expect(s.cursor.line).toBe(1);

    // Save 3-pane nested layout to session, reset with :only, and restore with :source
    s = runExCommand(s, 'mksession! multi.vim');
    s = runExCommand(s, 'only');
    expect(s.splitPanes).toBeUndefined();

    s = runExCommand(s, 'source multi.vim');
    expect(s.splitPanes).toHaveLength(3);
    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['a.ts', 'c.ts', 'b.ts']);
    expect(s.windowLayout?.kind).toBe('split');
    expect(s.activePaneIndex).toBe(1);
  });

  it('supports Vimscript winnr() directions, win_getid(), win_id2win(), win_gotoid(), and winlayout()', () => {
    let s = createVimState(['A'], { line: 0, col: 0 }, {
      primaryFilename: 'a.ts',
      virtualFiles: { 'b.ts': ['B'], 'c.ts': ['C'] },
    });

    // Single pane winlayout & win_getid
    s = runExCommand(s, 'echo [win_getid(), win_id2win(win_getid()), winlayout()]');
    expect(s.commandMessage).toBe("[1000, 1, ['leaf', 1000]]");

    // Create 3-pane nested layout: vertical([horizontal([a(1000), c(1002)]), b(1001)])
    s = runExCommand(s, 'vsp b.ts');
    s = runExCommand(s, 'sp c.ts');

    s = runExCommand(s, 'echo [winnr(), winnr("$"), winnr("j"), winnr("l")]');
    expect(s.commandMessage).toBe('[1, 3, 2, 3]');

    s = runExCommand(s, 'echo winlayout()');
    expect(s.commandMessage).toBe("['row', [['col', [['leaf', 1000], ['leaf', 1002]]], ['leaf', 1001]]]");

    // Jump directly to window id 1001 (b.ts, winnr 3) using win_gotoid()
    s = runExCommand(s, 'let g:ok = win_gotoid(1001) | echo [g:ok, winnr(), win_getid(), win_id2win(1002)]');
    expect(s.commandMessage).toBe('[1, 3, 1001, 2]');
    expect(s.activePaneIndex).toBe(2);
    expect(s.lines).toEqual(['B']);

    // Unknown window id returns 0 without changing focus
    s = runExCommand(s, 'echo [win_gotoid(9999), win_id2win(9999), win_getid(9)]');
    expect(s.commandMessage).toBe('[0, 0, 0]');
    expect(s.activePaneIndex).toBe(2);
  });

  it('synchronizes edits live across multiple windows viewing the same buffer while keeping cursors independent', () => {
    let s = createVimState(['line 1', 'line 2', 'line 3', 'line 4'], { line: 0, col: 0 }, {
      primaryFilename: 'shared.ts',
      virtualFiles: { 'other.ts': ['independent'] },
    });

    // Plain :vsp opens a second window viewing the SAME buffer (shared.ts)
    s = runExCommand(s, 'vsp');
    expect(s.splitPanes).toHaveLength(2);
    expect(s.splitPanes![0].filename).toBe('shared.ts');
    expect(s.splitPanes![1].filename).toBe('shared.ts');
    expect(s.splitPanes![0].bufferId).toBe(s.splitPanes![1].bufferId);

    // Move pane 1 cursor to line 3 (bottom), then return to pane 0
    s = sendKeys(s, '<C-w>l3j<C-w>h');
    expect(s.activePaneIndex).toBe(0);
    expect(s.cursor.line).toBe(0);
    expect(s.splitPanes![1].cursor.line).toBe(3);

    // Also open an independent buffer in a 3rd pane (other.ts)
    s = runExCommand(s, 'sp other.ts'); // [shared(0), other(1), shared(2)]
    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['shared.ts', 'other.ts', 'shared.ts']);

    // Edit pane 0 via Ex substitution -> pane 2 (same buffer) updates immediately, pane 1 (other.ts) untouched!
    s = runExCommand(s, '%s/line/row/g');
    expect(s.splitPanes![0].lines[0]).toBe('row 1');
    expect(s.splitPanes![2].lines[0]).toBe('row 1');
    expect(s.splitPanes![1].lines[0]).toBe('independent');
    // :%s 후 커서는 마지막 치환 줄에 있으므로(Vim 동작) 첫 줄로 돌아온 뒤 지웁니다.
    s = sendKeys(s, 'gg');

    // Delete 2 lines in pane 0 via Normal mode (2dd) -> pane 2 shrinks to 2 lines and clamps cursor safely to line 1
    s = sendKeys(s, '2dd');
    expect(s.lines).toEqual(['row 3', 'row 4']);
    expect(s.splitPanes![2].lines).toEqual(['row 3', 'row 4']);
    expect(s.splitPanes![2].cursor.line).toBe(1);

    // Switch to pane 2 and undo ('u') -> restores 4 lines in both pane 2 and pane 0!
    s = sendKeys(s, '<C-w>lu');
    expect(s.lines).toEqual(['row 1', 'row 2', 'row 3', 'row 4']);
    expect(s.splitPanes![0].lines).toEqual(['row 1', 'row 2', 'row 3', 'row 4']);
  });

  it('supports :topleft, :botright, :aboveleft, :belowright, and :vertical split placement modifiers', () => {
    let s = createVimState(['MAIN'], { line: 0, col: 0 }, {
      primaryFilename: 'main.ts',
      virtualFiles: {
        'right.ts': ['RIGHT'],
        'footer.ts': ['FOOTER'],
        'sidebar.ts': ['SIDEBAR'],
        'above.ts': ['ABOVE'],
      },
    });

    // 1. :vsp right.ts -> [main(0) | right(1)]
    s = runExCommand(s, 'vsp right.ts');

    // 2. :botright sp footer.ts -> full-width footer at bottom of the entire root tree
    s = runExCommand(s, 'botright sp footer.ts');
    expect(s.splitDirection).toBe('horizontal');
    expect(s.splitPanes!.map((p) => p.filename)).toEqual(['main.ts', 'right.ts', 'footer.ts']);
    let rects = computePaneRects(getEffectiveWindowTree(s)!);
    expect(rects[2]).toMatchObject({ paneIndex: 2, x: 0, y: 0.5, w: 1, h: 0.5 });

    // 3. :topleft vertical sp sidebar.ts -> full-height sidebar on far left of the entire root tree
    s = runExCommand(s, 'topleft vertical sp sidebar.ts');
    expect(s.splitDirection).toBe('vertical');
    expect(s.splitPanes!.map((p) => p.filename)).toEqual([
      'sidebar.ts',
      'main.ts',
      'right.ts',
      'footer.ts',
    ]);
    rects = computePaneRects(getEffectiveWindowTree(s)!);
    expect(rects[0]).toMatchObject({ paneIndex: 0, x: 0, y: 0, w: 0.5, h: 1 });
    // Active focus remains on main.ts (now index 1)
    expect(s.activePaneIndex).toBe(1);

    // 4. :aboveleft sp above.ts -> splits directly ABOVE main.ts (not below)
    s = runExCommand(s, 'aboveleft sp above.ts');
    expect(s.splitPanes!.map((p) => p.filename)).toEqual([
      'sidebar.ts',
      'above.ts',
      'main.ts',
      'right.ts',
      'footer.ts',
    ]);
    expect(s.activePaneIndex).toBe(2);
  });

  it('triggers WinNew, WinLeave, WinEnter, WinClosed, TabLeave, and TabEnter autocmds cleanly and respects :noautocmd', () => {
    let s = createVimState(['A'], { line: 0, col: 0 }, {
      primaryFilename: 'a.ts',
      virtualFiles: { 'b.ts': ['B'] },
    });

    s = runExCommand(s, 'let g:log = []');
    s = runExCommand(s, 'autocmd WinNew * :call add(g:log, "WinNew")');
    s = runExCommand(s, 'autocmd WinLeave * :call add(g:log, "WinLeave")');
    s = runExCommand(s, 'autocmd WinEnter * :call add(g:log, "WinEnter")');
    s = runExCommand(s, 'autocmd WinClosed * :call add(g:log, "WinClosed")');
    s = runExCommand(s, 'autocmd TabLeave * :call add(g:log, "TabLeave")');
    s = runExCommand(s, 'autocmd TabEnter * :call add(g:log, "TabEnter")');

    // :vsp b.ts -> WinNew
    s = runExCommand(s, 'vsp b.ts');
    expect(s.globalVars?.log).toEqual(['WinNew']);

    // Ctrl-w l -> WinLeave, WinEnter (fired exactly once!)
    s = sendKeys(s, '<C-w>l');
    expect(s.globalVars?.log).toEqual(['WinNew', 'WinLeave', 'WinEnter']);

    // :noautocmd wincmd h -> suppressed!
    s = runExCommand(s, 'noautocmd wincmd h');
    expect(s.activePaneIndex).toBe(0);
    expect(s.globalVars?.log).toEqual(['WinNew', 'WinLeave', 'WinEnter']);

    // :tabnew -> WinLeave, TabLeave, TabEnter, WinEnter
    s = runExCommand(s, 'tabnew');
    expect(s.globalVars?.log).toEqual([
      'WinNew',
      'WinLeave',
      'WinEnter',
      'WinLeave',
      'TabLeave',
      'TabEnter',
      'WinEnter',
    ]);

    // gT back to Tab 1, then :close -> WinClosed, WinEnter
    s = sendKeys(s, 'gT');
    s = runExCommand(s, 'close');
    expect(s.globalVars?.log).toEqual([
      'WinNew',
      'WinLeave',
      'WinEnter',
      'WinLeave',
      'TabLeave',
      'TabEnter',
      'WinEnter',
      'WinLeave',
      'TabLeave',
      'TabEnter',
      'WinEnter',
      'WinClosed',
      'WinEnter',
    ]);
  });
});
