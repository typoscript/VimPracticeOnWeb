import fs from 'fs';
import path from 'path';
import { execFileSync, execSync } from 'child_process';

export interface RawGoldenDefinition {
  id: string;
  category: string;
  description: string;
  initialText: string;
  startCursor: { row: number; col: number };
  keys: string;
}

export interface GoldenTestCase extends RawGoldenDefinition {
  expected: {
    lines: string[];
    cursor: { row: number; col: number };
  };
}

const GOLDEN_DEFINITIONS: RawGoldenDefinition[] = [
  // ==========================================
  // 1. Basic Motions
  // ==========================================
  {
    id: 'motion-l-single',
    category: 'motion',
    description: 'l moves cursor right one character',
    initialText: 'hello world',
    startCursor: { row: 0, col: 0 },
    keys: 'l',
  },
  {
    id: 'motion-l-count',
    category: 'motion',
    description: '3l moves cursor right 3 characters',
    initialText: 'hello world',
    startCursor: { row: 0, col: 0 },
    keys: '3l',
  },
  {
    id: 'motion-h-boundary',
    category: 'motion',
    description: 'h at col 0 stays at col 0',
    initialText: 'hello world',
    startCursor: { row: 0, col: 0 },
    keys: 'h',
  },
  {
    id: 'motion-h-mid',
    category: 'motion',
    description: 'h moves left from middle',
    initialText: 'hello world',
    startCursor: { row: 0, col: 4 },
    keys: '2h',
  },
  {
    id: 'motion-j-down',
    category: 'motion',
    description: 'j moves down one line',
    initialText: 'first line\nsecond line\nthird line',
    startCursor: { row: 0, col: 3 },
    keys: 'j',
  },
  {
    id: 'motion-j-count',
    category: 'motion',
    description: '2j moves down 2 lines',
    initialText: 'first line\nsecond line\nthird line',
    startCursor: { row: 0, col: 2 },
    keys: '2j',
  },
  {
    id: 'motion-k-up',
    category: 'motion',
    description: 'k moves up one line',
    initialText: 'first line\nsecond line\nthird line',
    startCursor: { row: 2, col: 3 },
    keys: 'k',
  },
  {
    id: 'motion-w-word-jump',
    category: 'motion',
    description: 'w jumps to next word start',
    initialText: 'const totalCount = 100;',
    startCursor: { row: 0, col: 0 },
    keys: 'w',
  },
  {
    id: 'motion-w-count',
    category: 'motion',
    description: '3w jumps 3 words forward',
    initialText: 'const totalCount = 100;',
    startCursor: { row: 0, col: 0 },
    keys: '3w',
  },
  {
    id: 'motion-b-word-back',
    category: 'motion',
    description: 'b jumps to previous word start',
    initialText: 'const totalCount = 100;',
    startCursor: { row: 0, col: 17 },
    keys: 'b',
  },
  {
    id: 'motion-e-word-end',
    category: 'motion',
    description: 'e jumps to end of current word',
    initialText: 'const totalCount = 100;',
    startCursor: { row: 0, col: 0 },
    keys: 'e',
  },
  {
    id: 'motion-0-line-start',
    category: 'motion',
    description: '0 jumps to absolute line start (col 0)',
    initialText: '    const indented = true;',
    startCursor: { row: 0, col: 12 },
    keys: '0',
  },
  {
    id: 'motion-caret-first-non-ws',
    category: 'motion',
    description: '^ jumps to first non-whitespace character',
    initialText: '    const indented = true;',
    startCursor: { row: 0, col: 18 },
    keys: '^',
  },
  {
    id: 'motion-dollar-line-end',
    category: 'motion',
    description: '$ jumps to last character of line',
    initialText: 'console.log("hello");',
    startCursor: { row: 0, col: 0 },
    keys: '$',
  },
  {
    id: 'motion-gg-first-line',
    category: 'motion',
    description: 'gg jumps to buffer start',
    initialText: 'line 1\nline 2\nline 3\nline 4',
    startCursor: { row: 3, col: 2 },
    keys: 'gg',
  },
  {
    id: 'motion-G-last-line',
    category: 'motion',
    description: 'G jumps to last line',
    initialText: 'line 1\nline 2\nline 3\nline 4',
    startCursor: { row: 0, col: 0 },
    keys: 'G',
  },
  {
    id: 'motion-3gg-target-line',
    category: 'motion',
    description: '3gg jumps directly to line 3',
    initialText: 'line 1\nline 2\nline 3\nline 4',
    startCursor: { row: 0, col: 0 },
    keys: '3gg',
  },

  // ==========================================
  // 2. Character Search Motions (f, t, F, T, ;)
  // ==========================================
  {
    id: 'find-f-forward',
    category: 'findChar',
    description: 'fa jumps forward onto character a',
    initialText: 'foo bar baz qux',
    startCursor: { row: 0, col: 0 },
    keys: 'fa',
  },
  {
    id: 'find-f-count',
    category: 'findChar',
    description: '2fa jumps forward onto second character a',
    initialText: 'foo bar baz qux',
    startCursor: { row: 0, col: 0 },
    keys: '2fa',
  },
  {
    id: 'find-t-till',
    category: 'findChar',
    description: 'tb jumps forward till character b (one before b)',
    initialText: 'foo bar baz qux',
    startCursor: { row: 0, col: 0 },
    keys: 'tb',
  },
  {
    id: 'find-F-backward',
    category: 'findChar',
    description: 'Fa jumps backward onto character a',
    initialText: 'foo bar baz qux',
    startCursor: { row: 0, col: 10 },
    keys: 'Fa',
  },
  {
    id: 'find-semicolon-repeat',
    category: 'findChar',
    description: '; repeats last char search forward',
    initialText: 'foo bar baz qux',
    startCursor: { row: 0, col: 0 },
    keys: 'fa;',
  },
  {
    id: 'bracket-percent-match',
    category: 'bracket',
    description: '% jumps to matching bracket',
    initialText: 'if (x > 10 && (y < 20)) { return true; }',
    startCursor: { row: 0, col: 3 }, // on first '('
    keys: '%',
  },

  // ==========================================
  // 3. Delete Operators (x, dw, de, d$, d0, dd, D)
  // ==========================================
  {
    id: 'delete-x-single',
    category: 'delete',
    description: 'x deletes single character under cursor',
    initialText: 'hello world',
    startCursor: { row: 0, col: 0 },
    keys: 'x',
  },
  {
    id: 'delete-x-count',
    category: 'delete',
    description: '3x deletes 3 characters under cursor',
    initialText: 'hello world',
    startCursor: { row: 0, col: 0 },
    keys: '3x',
  },
  {
    id: 'delete-dw-word',
    category: 'delete',
    description: 'dw deletes word and trailing space',
    initialText: 'hello beautiful world',
    startCursor: { row: 0, col: 0 },
    keys: 'dw',
  },
  {
    id: 'delete-2dw-words',
    category: 'delete',
    description: '2dw deletes 2 words',
    initialText: 'one two three four',
    startCursor: { row: 0, col: 0 },
    keys: '2dw',
  },
  {
    id: 'delete-de-end-of-word',
    category: 'delete',
    description: 'de deletes to end of word without space',
    initialText: 'hello world',
    startCursor: { row: 0, col: 0 },
    keys: 'de',
  },
  {
    id: 'delete-d-dollar-to-eol',
    category: 'delete',
    description: 'd$ deletes from cursor to line end',
    initialText: 'const value = 42; // comment',
    startCursor: { row: 0, col: 18 },
    keys: 'd$',
  },
  {
    id: 'delete-D-alias',
    category: 'delete',
    description: 'D is synonym for d$',
    initialText: 'const value = 42; // comment',
    startCursor: { row: 0, col: 18 },
    keys: 'D',
  },
  {
    id: 'delete-d0-to-bol',
    category: 'delete',
    description: 'd0 deletes from cursor to beginning of line',
    initialText: 'prefix_content_suffix',
    startCursor: { row: 0, col: 7 },
    keys: 'd0',
  },
  {
    id: 'delete-dd-line',
    category: 'delete',
    description: 'dd deletes current line',
    initialText: 'line 1\nline 2\nline 3',
    startCursor: { row: 1, col: 0 },
    keys: 'dd',
  },
  {
    id: 'delete-2dd-lines',
    category: 'delete',
    description: '2dd deletes 2 lines',
    initialText: 'line 1\nline 2\nline 3\nline 4',
    startCursor: { row: 1, col: 0 },
    keys: '2dd',
  },

  // ==========================================
  // 4. Change Operators (cw, ce, c$, c0, cc, r, s, C, S)
  // ==========================================
  {
    id: 'change-cw-word',
    category: 'change',
    description: 'cw changes word and leaves in insert mode',
    initialText: 'apple banana cherry',
    startCursor: { row: 0, col: 0 },
    keys: 'cwpear<Esc>',
  },
  {
    id: 'change-ce-word-end',
    category: 'change',
    description: 'ce changes to end of word',
    initialText: 'apple banana cherry',
    startCursor: { row: 0, col: 0 },
    keys: 'ceorange<Esc>',
  },
  {
    id: 'change-c-dollar-to-eol',
    category: 'change',
    description: 'c$ changes from cursor to end of line',
    initialText: 'const message = "old string";',
    startCursor: { row: 0, col: 16 },
    keys: 'c$"new string";<Esc>',
  },
  {
    id: 'change-C-alias',
    category: 'change',
    description: 'C changes to end of line',
    initialText: 'const message = "old string";',
    startCursor: { row: 0, col: 16 },
    keys: 'C"new string";<Esc>',
  },
  {
    id: 'change-c0-to-bol',
    category: 'change',
    description: 'c0 changes from cursor to beginning of line',
    initialText: 'prefix_suffix',
    startCursor: { row: 0, col: 6 },
    keys: 'c0head_<Esc>',
  },
  {
    id: 'change-cc-line',
    category: 'change',
    description: 'cc clears line and enters insert mode',
    initialText: 'line 1\nline 2\nline 3',
    startCursor: { row: 1, col: 2 },
    keys: 'ccnew line 2<Esc>',
  },
  {
    id: 'replace-r-single-char',
    category: 'change',
    description: 'r replaces character under cursor and returns to normal mode',
    initialText: 'heLlo world',
    startCursor: { row: 0, col: 2 },
    keys: 'rl',
  },
  {
    id: 'substitute-s-single-char',
    category: 'change',
    description: 's substitutes char with new text',
    initialText: 'hXllo',
    startCursor: { row: 0, col: 1 },
    keys: 'se<Esc>',
  },

  // ==========================================
  // 5. Text Objects (iw, aw, i", a", i(, a(, i{, a{)
  // ==========================================
  {
    id: 'textobj-diw-inner-word',
    category: 'textObject',
    description: 'diw deletes inner word under cursor',
    initialText: 'const targetWord = 42;',
    startCursor: { row: 0, col: 8 },
    keys: 'diw',
  },
  {
    id: 'textobj-ciw-inner-word',
    category: 'textObject',
    description: 'ciw changes inner word under cursor',
    initialText: 'const targetWord = 42;',
    startCursor: { row: 0, col: 8 },
    keys: 'ciwreplacement<Esc>',
  },
  {
    id: 'textobj-daw-around-word',
    category: 'textObject',
    description: 'daw deletes word and trailing space',
    initialText: 'one two three',
    startCursor: { row: 0, col: 4 }, // on 'two'
    keys: 'daw',
  },
  {
    id: 'textobj-di-quote',
    category: 'textObject',
    description: 'di" deletes inside double quotes',
    initialText: 'const msg = "delete this inside";',
    startCursor: { row: 0, col: 15 },
    keys: 'di"',
  },
  {
    id: 'textobj-da-quote',
    category: 'textObject',
    description: 'da" deletes quotes and their content',
    initialText: '["delete all"]',
    startCursor: { row: 0, col: 4 },
    keys: 'da"',
  },
  {
    id: 'textobj-ci-quote',
    category: 'textObject',
    description: 'ci" replaces text inside quotes',
    initialText: 'const msg = "old";',
    startCursor: { row: 0, col: 14 },
    keys: 'ci"new<Esc>',
  },
  {
    id: 'textobj-di-paren',
    category: 'textObject',
    description: 'di( deletes inside parentheses',
    initialText: 'function run(arg1, arg2) { return; }',
    startCursor: { row: 0, col: 15 },
    keys: 'di(',
  },
  {
    id: 'textobj-da-paren',
    category: 'textObject',
    description: 'da( deletes parentheses along with content',
    initialText: 'function run(arg1, arg2) { return; }',
    startCursor: { row: 0, col: 15 },
    keys: 'da(',
  },
  {
    id: 'textobj-di-brace',
    category: 'textObject',
    description: 'di{ deletes inside curly braces',
    initialText: 'const obj = { key: "value" };',
    startCursor: { row: 0, col: 15 },
    keys: 'di{',
  },

  // ==========================================
  // 6. Yank, Put & Registers
  // ==========================================
  {
    id: 'yank-yw-and-put',
    category: 'register',
    description: 'yw yanks word and p pastes after cursor',
    initialText: 'alpha beta',
    startCursor: { row: 0, col: 0 },
    keys: 'ywwp',
  },
  {
    id: 'yank-yy-and-put-linewise',
    category: 'register',
    description: 'yy yanks line and p pastes below',
    initialText: 'first line\nsecond line',
    startCursor: { row: 0, col: 0 },
    keys: 'yyp',
  },
  {
    id: 'yank-yy-and-put-above',
    category: 'register',
    description: 'yy yanks line and P pastes above',
    initialText: 'first line\nsecond line',
    startCursor: { row: 1, col: 0 },
    keys: 'yyP',
  },
  {
    id: 'register-named-a-yank-and-put',
    category: 'register',
    description: '"ayiw yanks word into register a and "ap pastes it',
    initialText: 'apple orange',
    startCursor: { row: 0, col: 0 },
    keys: '"ayiww"ap',
  },
  {
    id: 'register-named-b-dd-and-put',
    category: 'register',
    description: '"bdd cuts line into register b and "bp pastes it',
    initialText: 'line 1\nline 2\nline 3',
    startCursor: { row: 0, col: 0 },
    keys: '"bddj"bp',
  },
  {
    id: 'register-blackhole-dd',
    category: 'register',
    description: '"_dd deletes to blackhole register preserving default clipboard',
    initialText: 'line to keep\nline to burn\nthird line',
    startCursor: { row: 0, col: 0 },
    keys: 'yyj"_ddp',
  },

  // ==========================================
  // 7. Undo & Dot Repeat
  // ==========================================
  {
    id: 'undo-dw',
    category: 'history',
    description: 'dw then u restores deleted word',
    initialText: 'hello world',
    startCursor: { row: 0, col: 0 },
    keys: 'dwu',
  },
  {
    id: 'undo-dd',
    category: 'history',
    description: 'dd then u restores deleted line',
    initialText: 'line 1\nline 2\nline 3',
    startCursor: { row: 1, col: 0 },
    keys: 'ddu',
  },
  {
    id: 'undo-x',
    category: 'history',
    description: 'x then u restores deleted char',
    initialText: 'hello world',
    startCursor: { row: 0, col: 0 },
    keys: 'xu',
  },
  {
    id: 'repeat-dot-dw',
    category: 'history',
    description: '. repeats dw delete operation',
    initialText: 'one two three four',
    startCursor: { row: 0, col: 0 },
    keys: 'dw.',
  },
  {
    id: 'repeat-dot-change',
    category: 'history',
    description: '. repeats cw change operation on next word',
    initialText: 'apple banana cherry',
    startCursor: { row: 0, col: 0 },
    keys: 'cwfruit<Esc>w.',
  },
  {
    id: 'repeat-dot-x',
    category: 'history',
    description: '. repeats single character delete x',
    initialText: 'abcdefgh',
    startCursor: { row: 0, col: 0 },
    keys: 'x..',
  },

  // ==========================================
  // 8. Visual Mode Operations
  // ==========================================
  {
    id: 'visual-v-motion-delete',
    category: 'visual',
    description: 'v selection followed by d deletes selected text',
    initialText: 'alpha beta gamma',
    startCursor: { row: 0, col: 0 },
    keys: 'ved',
  },
  {
    id: 'visual-line-V-delete',
    category: 'visual',
    description: 'V selection followed by d deletes entire line',
    initialText: 'line 1\nline 2\nline 3',
    startCursor: { row: 1, col: 2 },
    keys: 'Vd',
  },
  {
    id: 'visual-line-V-2lines-delete',
    category: 'visual',
    description: 'V selection with j deletes 2 lines',
    initialText: 'line 1\nline 2\nline 3\nline 4',
    startCursor: { row: 1, col: 0 },
    keys: 'Vjd',
  },
  {
    id: 'visual-y-and-p',
    category: 'visual',
    description: 'v selection yanked with y and pasted with p',
    initialText: 'hello world',
    startCursor: { row: 0, col: 0 },
    keys: 'vey$p',
  },

  // ==========================================
  // 9. Edge Cases & Boundary Clamping
  // ==========================================
  {
    id: 'boundary-dollar-j-sticky-eol',
    category: 'boundary',
    description: '$ on short line moves to end, j preserves end of longer line',
    initialText: 'short\na much longer line here',
    startCursor: { row: 0, col: 0 },
    keys: '$j',
  },
  {
    id: 'boundary-move-down-past-empty-line',
    category: 'boundary',
    description: 'moving down onto an empty line clamps col to 0',
    initialText: 'first line here\n\nthird line here',
    startCursor: { row: 0, col: 6 },
    keys: 'j',
  },
  {
    id: 'boundary-cw-last-word-of-line',
    category: 'boundary',
    description: 'cw on the last word of line deletes to end of line only',
    initialText: 'first second third',
    startCursor: { row: 0, col: 13 }, // on 'third'
    keys: 'cwLAST<Esc>',
  },
  {
    id: 'boundary-x-on-eol-clamps-col',
    category: 'boundary',
    description: 'x on end of line deletes char and shifts cursor left',
    initialText: 'abc',
    startCursor: { row: 0, col: 2 }, // on 'c'
    keys: 'x',
  },
];

function findNeovimBinary(): string {
  if (process.env.NVIM_PATH && fs.existsSync(process.env.NVIM_PATH)) {
    return process.env.NVIM_PATH;
  }

  const candidatePaths = [
    '/opt/homebrew/bin/nvim',
    '/usr/local/bin/nvim',
    '/usr/bin/nvim',
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  try {
    const whichResult = execSync('which nvim', { encoding: 'utf8' }).trim();
    if (whichResult && fs.existsSync(whichResult)) {
      return whichResult;
    }
  } catch {
    // ignore
  }

  throw new Error(
    'Neovim binary (nvim) not found! Please install neovim or set NVIM_PATH environment variable.'
  );
}

export function generateGoldenTestCases(): GoldenTestCase[] {
  const nvimBin = findNeovimBinary();
  console.log(`[GoldenTests] Using Neovim binary at: ${nvimBin}`);

  const tempDir = path.resolve(process.cwd(), '.system_temp_golden');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const inputFile = path.join(tempDir, 'cases_input.json');
  const outputFile = path.join(tempDir, 'cases_output.json');
  const luaScriptFile = path.join(tempDir, 'runner.lua');

  fs.writeFileSync(inputFile, JSON.stringify(GOLDEN_DEFINITIONS, null, 2), 'utf8');

  // Lua runner script for Neovim headless
  const luaCode = `
local arg = _G.arg
local inFile = arg[1]
local outFile = arg[2]

local fIn = io.open(inFile, "r")
if not fIn then
  io.stderr:write("Could not open input file: " .. inFile .. "\\n")
  os.exit(1)
end
local content = fIn:read("*a")
fIn:close()

local cases = vim.json.decode(content)
local results = {}

for _, case in ipairs(cases) do
  vim.cmd("enew!")
  local inLines = vim.split(case.initialText, "\\n", { plain = true })
  vim.api.nvim_buf_set_lines(0, 0, -1, false, inLines)
  
  -- Reset undo history so 'u' only undoes test keystrokes
  vim.bo.undolevels = -1
  vim.bo.undolevels = 1000

  -- 1-indexed row in Neovim cursor
  local startRow = math.max(1, case.startCursor.row + 1)
  local startCol = math.max(0, case.startCursor.col)
  vim.api.nvim_win_set_cursor(0, { startRow, startCol })

  -- Translate keys (e.g. <Esc> -> \\x1b)
  local feedStr = vim.api.nvim_replace_termcodes(case.keys, true, false, true)
  vim.api.nvim_feedkeys(feedStr, "nx", false)

  local outLines = vim.api.nvim_buf_get_lines(0, 0, -1, false)
  local cur = vim.api.nvim_win_get_cursor(0)

  table.insert(results, {
    id = case.id,
    category = case.category,
    description = case.description,
    initialText = case.initialText,
    startCursor = case.startCursor,
    keys = case.keys,
    expected = {
      lines = outLines,
      cursor = {
        row = cur[1] - 1,
        col = cur[2],
      }
    }
  })
end

local fOut = io.open(outFile, "w")
if not fOut then
  io.stderr:write("Could not open output file: " .. outFile .. "\\n")
  os.exit(1)
end
fOut:write(vim.json.encode(results))
fOut:close()

os.exit(0)
`;

  fs.writeFileSync(luaScriptFile, luaCode, 'utf8');

  try {
    execFileSync(nvimBin, ['--headless', '-u', 'NONE', '-l', luaScriptFile, inputFile, outputFile], {
      encoding: 'utf8',
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    const outputContent = fs.readFileSync(outputFile, 'utf8');
    const goldenResults: GoldenTestCase[] = JSON.parse(outputContent);

    // Save formatted results to test/fixtures/neovim-golden-cases.json
    const fixtureDir = path.resolve(process.cwd(), 'test/fixtures');
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }
    const fixturePath = path.join(fixtureDir, 'neovim-golden-cases.json');
    fs.writeFileSync(fixturePath, JSON.stringify(goldenResults, null, 2), 'utf8');

    console.log(
      `[GoldenTests] Successfully generated ${goldenResults.length} golden test cases from Neovim!`
    );
    console.log(`[GoldenTests] Saved to: ${fixturePath}`);

    return goldenResults;
  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
      if (fs.existsSync(luaScriptFile)) fs.unlinkSync(luaScriptFile);
      if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch {
      // ignore cleanup errors
    }
  }
}

// CLI execution
if (process.argv[1] && process.argv[1].endsWith('generateGoldenTests.ts')) {
  try {
    generateGoldenTestCases();
  } catch (err) {
    console.error('[GoldenTests] Error generating golden test cases:', err);
    process.exit(1);
  }
}
