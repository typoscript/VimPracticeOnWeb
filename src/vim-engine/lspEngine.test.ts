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
