import { describe, it, expect, afterEach } from 'vitest';
import {
  configureVimEngine,
  createVimState,
  handleKey,
  runExCommand,
  sendKeys,
  LspDiagnostic,
  LspHoverSymbol,
} from './index';

const sampleDiagnostics: LspDiagnostic[] = [
  {
    id: 'diag-1',
    line: 1,
    col: 23,
    endCol: 29,
    severity: 'error',
    code: 'TS2322',
    source: 'ts',
    message: "Type 'string' is not assignable to type 'number'.",
    rule: { matchPattern: '"8080"' },
  },
  {
    id: 'diag-2',
    line: 2,
    col: 8,
    endCol: 14,
    severity: 'warning',
    code: 'TS6133',
    source: 'ts',
    message: "'unused' is declared but its value is never read.",
    rule: { matchPattern: 'unused' },
  },
  {
    id: 'diag-3',
    line: 4,
    col: 24,
    endCol: 29,
    severity: 'error',
    code: 'TS2322',
    source: 'ts',
    message: "Type 'string' is not assignable to type 'number'.",
    rule: { matchPattern: '"300"' },
  },
];

const sampleSymbols: Record<string, LspHoverSymbol> = {
  parsePort: {
    symbol: 'parsePort',
    kind: 'function',
    signature: 'function parsePort(raw: string): number',
    documentation: 'Parses a port configuration string into a numeric TCP port.',
    source: 'service.ts',
  },
};

function makeLspState() {
  return createVimState(
    [
      'function parsePort(raw: string): number {',
      '  const port: number = "8080";',
      '  const unused = 1;',
      '  return port;',
      'const timeout: number = "300";',
    ],
    { line: 0, col: 9 },
    {
      primaryFilename: 'service.ts',
      lspDiagnostics: sampleDiagnostics.map((d) => ({ ...d })),
      lspSymbols: { ...sampleSymbols },
    }
  );
}

describe('lspEngine (Neovim-style LSP hover & diagnostics)', () => {
  afterEach(() => {
    configureVimEngine({ locale: 'ko' });
  });

  it('opens and toggles LSP hover window with K when lspSymbols are present, and closes on Esc/q/cursor move', () => {
    let state = makeLspState();

    // K opens hover on parsePort
    state = handleKey(state, 'K');
    expect(state.lspHover?.isOpen).toBe(true);
    expect(state.lspHover?.symbol).toBe('parsePort');
    expect(state.lspHover?.signature).toBe('function parsePort(raw: string): number');
    expect(state.commandMessage).toContain('[LSP] parsePort:');

    // Pressing K again toggles it off
    state = handleKey(state, 'K');
    expect(state.lspHover).toBeNull();

    // Pressing Esc closes hover
    state = handleKey(state, 'K');
    expect(state.lspHover?.isOpen).toBe(true);
    state = handleKey(state, 'Escape');
    expect(state.lspHover).toBeNull();

    // Pressing q closes hover without entering macro recording
    state = handleKey(state, 'K');
    expect(state.lspHover?.isOpen).toBe(true);
    state = handleKey(state, 'q');
    expect(state.lspHover).toBeNull();
    expect(state.recordingMacro).toBeUndefined();

    // Moving cursor auto-dismisses hover popup (Neovim CursorMoved)
    state = handleKey(state, 'K');
    expect(state.lspHover?.isOpen).toBe(true);
    state = handleKey(state, 'j');
    expect(state.lspHover).toBeNull();
  });

  it('preserves classic :help fallback for K when lspSymbols is not configured', () => {
    const plainState = createVimState(['motion help test']);
    const afterK = handleKey(plainState, 'K');
    expect(afterK.helpSession?.isOpen).toBe(true);
    expect(afterK.lspHover).toBeUndefined();
  });

  it('navigates diagnostics with ]d, [d, ]D, [D with wrap-around and count support', () => {
    let state = makeLspState();

    // ]d -> diag-1 (line 1, col 23)
    state = sendKeys(state, ']d');
    expect(state.cursor).toEqual({ line: 1, col: 23 });
    expect(state.commandMessage).toContain('[E][TS2322]');
    expect(state.commandMessage).toContain('(1/3)');

    // ]d -> diag-2 (line 2, col 8)
    state = sendKeys(state, ']d');
    expect(state.cursor).toEqual({ line: 2, col: 8 });
    expect(state.commandMessage).toContain('[W][TS6133]');
    expect(state.commandMessage).toContain('(2/3)');

    // ]d -> diag-3 (line 4, col 24)
    state = sendKeys(state, ']d');
    expect(state.cursor).toEqual({ line: 4, col: 24 });
    expect(state.commandMessage).toContain('(3/3)');

    // ]d wraps around to diag-1
    state = sendKeys(state, ']d');
    expect(state.cursor).toEqual({ line: 1, col: 23 });

    // [d wraps backward to diag-3
    state = sendKeys(state, '[d');
    expect(state.cursor).toEqual({ line: 4, col: 24 });

    // [D jumps to first, ]D jumps to last
    state = sendKeys(state, '[D');
    expect(state.cursor).toEqual({ line: 1, col: 23 });
    state = sendKeys(state, ']D');
    expect(state.cursor).toEqual({ line: 4, col: 24 });

    // Empty diagnostics rings bell
    const noDiags = createVimState(['clean code'], { line: 0, col: 0 }, { lspDiagnostics: [] });
    const bellState = sendKeys(noDiags, ']d');
    expect(bellState.bell).toBe(true);
  });

  it('syncs diagnostics with :lopen/:diagnostics and clears diagnostics live when bugs are fixed', () => {
    let state = makeLspState();

    state = runExCommand(state, 'lopen');
    expect(state.locationList?.isOpen).toBe(true);
    expect(state.locationList?.items).toHaveLength(3);
    expect(state.locationList?.items[0].type).toBe('E');
    expect(state.locationList?.items[1].type).toBe('W');

    // Fix diag-1 ("8080" -> 8080)
    state = sendKeys(state, ']dxf"x');
    expect(state.lspDiagnostics).toHaveLength(2);
    expect(state.locationList?.items).toHaveLength(2);

    // Fix diag-2 and diag-3 via Ex :diagnostics also preserves sync
    state = sendKeys(state, ']dciwclean<Esc>');
    expect(state.lspDiagnostics).toHaveLength(1);
    state = sendKeys(state, ']dxf"x');
    expect(state.lspDiagnostics).toHaveLength(0);
    expect(state.locationList?.items).toHaveLength(0);

    // Works in English locale too
    configureVimEngine({ locale: 'en' });
    const emptyJump = sendKeys(state, ']d');
    expect(emptyJump.bell).toBe(true);
    expect(emptyJump.commandMessage).toBe('No diagnostics found');
  });
});

describe('lspRefactorEngine (Neovim 0.11 grn / grr / gra / gO)', () => {
  afterEach(() => {
    configureVimEngine({ locale: 'ko' });
  });

  it('grn opens interactive rename prompt and renames symbol across current buffer, open buffers, VFS, and lspSymbols with undo', () => {
    let state = createVimState(
      [
        'function parsePort(raw: string): number {',
        '  const parsePortEx = 1;',
        '  return parsePort("80");',
        '}',
      ],
      { line: 0, col: 10 },
      {
        primaryFilename: 'service.ts',
        buffers: [
          {
            id: 1,
            name: 'service.ts',
            lines: [
              'function parsePort(raw: string): number {',
              '  const parsePortEx = 1;',
              '  return parsePort("80");',
              '}',
            ],
            cursor: { line: 0, col: 10 },
          },
          {
            id: 2,
            name: 'index.ts',
            lines: ['import { parsePort } from "./service";', 'const p = parsePort("3000");'],
            cursor: { line: 0, col: 0 },
          },
        ],
        currentBufferId: 1,
        virtualFiles: {
          'service.ts': [
            'function parsePort(raw: string): number {',
            '  const parsePortEx = 1;',
            '  return parsePort("80");',
            '}',
          ],
          'index.ts': ['import { parsePort } from "./service";', 'const p = parsePort("3000");'],
        },
        lspSymbols: { ...sampleSymbols },
      }
    );

    // Open rename prompt with grn
    state = sendKeys(state, 'grn');
    expect(state.lspRename?.isOpen).toBe(true);
    expect(state.lspRename?.oldName).toBe('parsePort');
    expect(state.lspRename?.newName).toBe('parsePort');
    expect(state.lspRename?.occurrenceCount).toBe(4);
    expect(state.lspRename?.fileCount).toBe(2);

    // Clear with Ctrl-u, type new name, press Enter
    state = handleKey(state, 'Ctrl-u');
    for (const ch of 'readPort') state = handleKey(state, ch);
    state = handleKey(state, 'Enter');

    expect(state.lspRename).toBeNull();
    expect(state.lines[0]).toBe('function readPort(raw: string): number {');
    // Whole-word boundary preserved: parsePortEx untouched
    expect(state.lines[1]).toBe('  const parsePortEx = 1;');
    expect(state.lines[2]).toBe('  return readPort("80");');
    // Open buffer & VFS updated
    expect(state.buffers?.[1].lines[0]).toBe('import { readPort } from "./service";');
    expect(state.virtualFiles?.['index.ts'][1]).toBe('const p = readPort("3000");');
    // lspSymbols re-keyed
    expect(state.lspSymbols?.['readPort']?.symbol).toBe('readPort');
    expect(state.lspSymbols?.['parsePort']).toBeUndefined();

    // Single undo restores current buffer
    state = handleKey(state, 'u');
    expect(state.lines[0]).toBe('function parsePort(raw: string): number {');

    // Escape cancels rename cleanly
    state = sendKeys(state, 'grn');
    expect(state.lspRename?.isOpen).toBe(true);
    state = handleKey(state, 'Escape');
    expect(state.lspRename).toBeNull();

    // :LspRename {newName} works directly via Ex command
    state = runExCommand(state, 'LspRename decodePort');
    expect(state.lines[0]).toBe('function decodePort(raw: string): number {');
  });

  it('grr finds whole-word symbol references across project files and opens Quickfix list', () => {
    let state = createVimState(
      ['export function computeTax(n: number) {', '  return computeTax(n - 1);', '}'],
      { line: 0, col: 18 },
      {
        primaryFilename: 'tax.ts',
        virtualFiles: {
          'tax.ts': ['export function computeTax(n: number) {', '  return computeTax(n - 1);', '}'],
          'billing.ts': ['const total = computeTax(100);', 'const computeTaxRate = 0.1;'],
        },
      }
    );

    state = sendKeys(state, 'grr');
    expect(state.quickfix?.isOpen).toBe(true);
    expect(state.quickfix?.items.map((it) => `${it.filename}:${it.line}:${it.col}`)).toEqual([
      'tax.ts:1:17',
      'tax.ts:2:10',
      'billing.ts:1:15',
    ]);
    expect(state.commandMessage).toContain('computeTax');
    expect(state.commandMessage).toContain('3개');
  });

  it('gra opens code action menu with diagnostic quickfixes and built-in refactors, applying with number/Enter and clearing live diagnostics', () => {
    let state = makeLspState();
    // Jump to diag-1: const port: number = "8080";
    state = sendKeys(state, ']d');
    state = sendKeys(state, 'gra');
    expect(state.lspCodeActionMenu?.isOpen).toBe(true);
    expect(state.lspCodeActionMenu?.actions[0].title).toContain('8080');

    // Press '1' to apply first quickfix -> "8080" becomes 8080 and diagnostic clears live!
    state = handleKey(state, '1');
    expect(state.lspCodeActionMenu).toBeNull();
    expect(state.lines[1]).toBe('  const port: number = 8080;');
    expect(state.lspDiagnostics).toHaveLength(2);

    // Undo restores the line
    state = handleKey(state, 'u');
    expect(state.lines[1]).toBe('  const port: number = "8080";');

    // Built-in refactor on `var x == y`
    let refState = createVimState(['var ok = a == b;'], { line: 0, col: 0 });
    refState = sendKeys(refState, 'gra');
    expect(refState.lspCodeActionMenu?.actions.length).toBeGreaterThanOrEqual(2);
    // Navigate down with j and press Enter to apply strict equality
    refState = handleKey(refState, 'j');
    refState = handleKey(refState, 'Enter');
    expect(refState.lines[0]).toBe('var ok = a === b;');
  });

  it('gO extracts document symbols into Location List and opens :lopen', () => {
    let state = createVimState(
      [
        'interface User { id: string }',
        'export class UserService {',
        '  async fetchUser(id: string) {',
        '    return id;',
        '  }',
        '}',
        'export const formatUser = (u: User) => u.id;',
      ],
      { line: 0, col: 0 },
      { primaryFilename: 'user.ts' }
    );

    state = sendKeys(state, 'gO');
    expect(state.locationList?.isOpen).toBe(true);
    expect(state.locationList?.items.map((it) => `${it.line}:${it.text}`)).toEqual([
      '1:[interface] User',
      '2:[class] UserService',
      '3:[method] fetchUser',
      '7:[function] formatUser',
    ]);

    // Empty doc with no symbols rings bell
    const emptyRes = sendKeys(createVimState(['// just a comment']), 'gO');
    expect(emptyRes.bell).toBe(true);
  });

  it('preserves Virtual Replace gr{char} for non-LSP characters and counts', () => {
    let s = createVimState(['\tabc']);
    s = runExCommand(s, 'set ts=4');
    s = sendKeys(s, 'grX');
    expect(s.lines).toEqual(['X\tabc']);
  });
});
