import { describe, it, expect } from 'vitest';
import {
  createVimState,
  handleKey,
  detectFiletype,
  tokenizeLine,
  getSyntaxTokensMap,
  executeSyntaxCommand,
} from './index';

function runKeys(state: any, keys: string) {
  let s = state;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i] === '\n' ? 'Enter' : keys[i];
    s = handleKey(s, k);
  }
  return s;
}

describe('syntaxEngine', () => {
  describe('detectFiletype', () => {
    it('detects filetype from file extensions correctly', () => {
      expect(detectFiletype('main.ts')).toBe('typescript');
      expect(detectFiletype('App.tsx')).toBe('typescript');
      expect(detectFiletype('script.js')).toBe('javascript');
      expect(detectFiletype('app.py')).toBe('python');
      expect(detectFiletype('main.rs')).toBe('rust');
      expect(detectFiletype('server.go')).toBe('go');
      expect(detectFiletype('index.html')).toBe('html');
      expect(detectFiletype('package.json')).toBe('json');
      expect(detectFiletype('deploy.sh')).toBe('bash');
      expect(detectFiletype('init.vim')).toBe('vim');
      expect(detectFiletype('.vimrc')).toBe('vim');
      expect(detectFiletype('README.md')).toBe('markdown');
      expect(detectFiletype('notes.txt')).toBe('text');
    });

    it('respects explicit filetype overrides over filename', () => {
      expect(detectFiletype('source.ts', 'python')).toBe('python');
      expect(detectFiletype('source.ts', 'rust')).toBe('rust');
      expect(detectFiletype('source.ts', 'go')).toBe('go');
      expect(detectFiletype(undefined, 'json')).toBe('json');
      expect(detectFiletype(undefined, 'text')).toBe('text');
      expect(detectFiletype(undefined)).toBe('text');
      expect(detectFiletype('unknown.xyz')).toBe('text');
    });
  });

  describe('tokenizeLine', () => {
    it('tokenizes TypeScript code properly', () => {
      const line = 'const count: number = 42; // initial count';
      const tokens = tokenizeLine(line, 'typescript');

      const types = tokens.map((t) => ({ type: t.type, text: t.text }));
      expect(types).toContainEqual({ type: 'keyword', text: 'const' });
      expect(types).toContainEqual({ type: 'type', text: 'number' });
      expect(types).toContainEqual({ type: 'operator', text: '=' });
      expect(types).toContainEqual({ type: 'number', text: '42' });
      expect(types).toContainEqual({ type: 'comment', text: '// initial count' });
    });

    it('identifies functions, strings, and PascalCase types in TypeScript', () => {
      const line = 'function greet(user: UserProfile): string { return "Hello"; }';
      const tokens = tokenizeLine(line, 'typescript');

      expect(tokens.find((t) => t.text === 'function')?.type).toBe('keyword');
      expect(tokens.find((t) => t.text === 'greet')?.type).toBe('function');
      expect(tokens.find((t) => t.text === 'UserProfile')?.type).toBe('type');
      expect(tokens.find((t) => t.text === '"Hello"')?.type).toBe('string');
      expect(tokens.find((t) => t.text === 'return')?.type).toBe('keyword');
    });

    it('tokenizes Python def, decorators, booleans, and comments', () => {
      const line = '@cache\ndef calc_total(items): # calculate';
      const tokens = tokenizeLine(line, 'python');

      expect(tokens.find((t) => t.text === '@cache')?.type).toBe('special');
      expect(tokens.find((t) => t.text === 'def')?.type).toBe('keyword');
      expect(tokens.find((t) => t.text === 'calc_total')?.type).toBe('function');
      expect(tokens.find((t) => t.text === '# calculate')?.type).toBe('comment');
    });

    it('tokenizes Rust fn, macros, and types', () => {
      const line = 'let mut x: Vec<i32> = vec![]; println!("val: {}", x);';
      const tokens = tokenizeLine(line, 'rust');

      expect(tokens.find((t) => t.text === 'let')?.type).toBe('keyword');
      expect(tokens.find((t) => t.text === 'mut')?.type).toBe('keyword');
      expect(tokens.find((t) => t.text === 'Vec')?.type).toBe('type');
      expect(tokens.find((t) => t.text === 'i32')?.type).toBe('type');
      expect(tokens.find((t) => t.text === 'vec!')?.type).toBe('special');
      expect(tokens.find((t) => t.text === 'println!')?.type).toBe('special');
    });

    it('tokenizes Go func and := assignment', () => {
      const line = 'func main() { num := 100 }';
      const tokens = tokenizeLine(line, 'go');

      expect(tokens.find((t) => t.text === 'func')?.type).toBe('keyword');
      expect(tokens.find((t) => t.text === 'main')?.type).toBe('function');
      expect(tokens.find((t) => t.text === ':=')?.type).toBe('operator');
      expect(tokens.find((t) => t.text === '100')?.type).toBe('number');
    });

    it('tokenizes HTML tags and attributes', () => {
      const line = '<div class="main-container">Hello</div>';
      const tokens = tokenizeLine(line, 'html');

      expect(tokens.find((t) => t.text === '<div')?.type).toBe('tag');
      expect(tokens.find((t) => t.text === 'class')?.type).toBe('keyword');
      expect(tokens.find((t) => t.text === '"main-container"')?.type).toBe('string');
      expect(tokens.find((t) => t.text === '</div>')?.type).toBe('tag');
    });

    it('returns empty tokens for text mode', () => {
      const line = 'Just a regular plain text line';
      const tokens = tokenizeLine(line, 'text');
      expect(tokens).toEqual([]);
    });
  });

  describe('getSyntaxTokensMap', () => {
    it('creates an array of length matching the line with exact column types', () => {
      const line = 'let a = 1;';
      const map = getSyntaxTokensMap(line, 'typescript');
      expect(map.length).toBe(line.length);

      // 'let' -> cols 0, 1, 2 should be 'keyword'
      expect(map[0]).toBe('keyword');
      expect(map[1]).toBe('keyword');
      expect(map[2]).toBe('keyword');

      // whitespace -> col 3 should be null
      expect(map[3]).toBeNull();

      // 'a' -> col 4 is null (identifier)
      expect(map[4]).toBeNull();

      // '=' -> col 6 is 'operator'
      expect(map[6]).toBe('operator');

      // '1' -> col 8 is 'number'
      expect(map[8]).toBe('number');
    });
  });

  describe('executeSyntaxCommand', () => {
    it('handles :syntax on and :syntax off', () => {
      let state = createVimState(['const x = 1;']);

      state = executeSyntaxCommand(state, 'off');
      expect(state.options?.syntax).toBe(false);
      expect(state.commandMessage).toBe('구문 강조가 꺼졌습니다');

      state = executeSyntaxCommand(state, 'on');
      expect(state.options?.syntax).toBe(true);
      expect(state.commandMessage).toBe('구문 강조가 켜졌습니다');
    });

    it('handles :syntax enable and :syntax manual', () => {
      let state = createVimState(['const x = 1;']);

      state = executeSyntaxCommand(state, 'enable');
      expect(state.options?.syntax).toBe(true);

      state = executeSyntaxCommand(state, 'manual');
      expect(state.options?.syntax).toBe(false);
    });

    it('handles query :syntax', () => {
      let state = createVimState(['const x = 1;']);
      state = { ...state, primaryFilename: 'app.py' };

      state = executeSyntaxCommand(state, '');
      expect(state.commandMessage).toContain('ON');
      expect(state.commandMessage).toContain('python');
    });

    it('triggers bell on unknown subcommand', () => {
      let state = createVimState(['const x = 1;']);
      state = executeSyntaxCommand(state, 'invalidSub');
      expect(state.bell).toBe(true);
      expect(state.commandMessage).toContain('E28:');
    });
  });

  describe('commandLine integration', () => {
    it('executes :syntax off, :syntax on, and :syn via Ex command input', () => {
      let state = createVimState(['const x = 1;']);

      state = runKeys(state, ':syntax off\n');
      expect(state.options?.syntax).toBe(false);
      expect(state.commandMessage).toBe('구문 강조가 꺼졌습니다');

      state = runKeys(state, ':syntax on\n');
      expect(state.options?.syntax).toBe(true);
      expect(state.commandMessage).toBe('구문 강조가 켜졌습니다');

      state = runKeys(state, ':syn\n');
      expect(state.commandMessage).toContain('ON');
    });

    it('supports :set syntax=python and :set nosyntax', () => {
      let state = createVimState(['def test(): pass']);

      state = runKeys(state, ':set syntax=python\n');
      expect(state.options?.syntax).toBe('python');

      state = runKeys(state, ':set nosyntax\n');
      expect(state.options?.syntax).toBe(false);

      state = runKeys(state, ':set syntax\n');
      expect(state.options?.syntax).toBe(true);
    });
  });
});
