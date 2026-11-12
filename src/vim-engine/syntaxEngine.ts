import { VimEditorState } from './types';
import { msg } from './messages';
import { getOptions } from './setEngine';

export type SyntaxTokenType =
  | 'keyword'
  | 'type'
  | 'string'
  | 'number'
  | 'comment'
  | 'boolean'
  | 'function'
  | 'operator'
  | 'tag'
  | 'special';

export interface SyntaxToken {
  type: SyntaxTokenType;
  startCol: number;
  endCol: number; // exclusive
  text: string;
}

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'html'
  | 'json'
  | 'bash'
  | 'vim'
  | 'markdown'
  | 'text';

interface SyntaxRule {
  type: SyntaxTokenType;
  pattern: RegExp;
}

/**
 * 파일명 및 명시적 filetype으로부터 지원 프로그래밍 언어를 판정합니다.
 */
export function detectFiletype(filename?: string, explicitFiletype?: string): SupportedLanguage {
  if (explicitFiletype) {
    const ft = explicitFiletype.toLowerCase().trim();
    if (ft === 'ts' || ft === 'typescript' || ft === 'tsx') return 'typescript';
    if (ft === 'js' || ft === 'javascript' || ft === 'jsx' || ft === 'mjs' || ft === 'cjs') return 'javascript';
    if (ft === 'py' || ft === 'python') return 'python';
    if (ft === 'rs' || ft === 'rust') return 'rust';
    if (ft === 'go') return 'go';
    if (ft === 'html' || ft === 'htm' || ft === 'xml') return 'html';
    if (ft === 'json') return 'json';
    if (ft === 'sh' || ft === 'bash' || ft === 'zsh') return 'bash';
    if (ft === 'vim' || ft === 'vimrc') return 'vim';
    if (ft === 'md' || ft === 'markdown') return 'markdown';
    if (ft === 'text' || ft === 'txt') return 'text';
  }

  if (!filename) return 'text';

  const clean = filename.toLowerCase().trim();
  if (clean.endsWith('.ts') || clean.endsWith('.tsx')) return 'typescript';
  if (clean.endsWith('.js') || clean.endsWith('.jsx') || clean.endsWith('.mjs') || clean.endsWith('.cjs')) return 'javascript';
  if (clean.endsWith('.py')) return 'python';
  if (clean.endsWith('.rs')) return 'rust';
  if (clean.endsWith('.go')) return 'go';
  if (clean.endsWith('.html') || clean.endsWith('.htm') || clean.endsWith('.xml')) return 'html';
  if (clean.endsWith('.json')) return 'json';
  if (clean.endsWith('.sh') || clean.endsWith('.bash') || clean.endsWith('.zsh')) return 'bash';
  if (clean.endsWith('.vim') || clean === '.vimrc' || clean === 'vimrc') return 'vim';
  if (clean.endsWith('.md') || clean.endsWith('.markdown')) return 'markdown';
  if (clean.endsWith('.txt')) return 'text';

  return 'text';
}

const JS_TS_RULES: SyntaxRule[] = [
  { type: 'comment', pattern: /^(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/ },
  { type: 'string', pattern: /^("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)/ },
  { type: 'number', pattern: /^(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(\.\d+)?([eE][+-]?\d+)?)\b/ },
  { type: 'boolean', pattern: /^(true|false|null|undefined)\b/ },
  {
    type: 'keyword',
    pattern:
      /^(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|default|import|export|from|as|class|extends|implements|interface|type|new|this|typeof|instanceof|try|catch|finally|throw|async|await|yield|void|debugger|in|of)\b/,
  },
  {
    type: 'type',
    pattern:
      /^(string|number|boolean|any|unknown|never|void|object|symbol|bigint|Record|Array|Promise|Set|Map|Function)\b/,
  },
  { type: 'type', pattern: /^[A-Z][a-zA-Z0-9_$]*\b/ },
  { type: 'function', pattern: /^([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()/ },
  {
    type: 'operator',
    pattern: /^(=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\+\+|--|\+=|-=|\*=|\/=|%=|\.\.\.|[+\-*/%!=<>&|^~?:])/,
  },
];

const PYTHON_RULES: SyntaxRule[] = [
  { type: 'comment', pattern: /^#[^\n]*/ },
  {
    type: 'string',
    pattern:
      /^("""[\s\S]*?"""|'''[\s\S]*?'''|[frbFRB]?"([^"\\]|\\.)*"|[frbFRB]?'([^'\\]|\\.)*')/,
  },
  { type: 'number', pattern: /^(0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+|\d+(\.\d+)?([eE][+-]?\d+)?)\b/ },
  { type: 'boolean', pattern: /^(True|False|None)\b/ },
  {
    type: 'keyword',
    pattern:
      /^(def|class|return|if|elif|else|for|while|break|continue|import|from|as|try|except|finally|raise|with|pass|lambda|yield|in|is|not|and|or|global|nonlocal|async|await|del|assert)\b/,
  },
  { type: 'special', pattern: /^@[a-zA-Z_][a-zA-Z0-9_.]*/ },
  {
    type: 'type',
    pattern:
      /^(int|float|str|bool|list|dict|set|tuple|bytes|object|type|len|range|print|enumerate|zip|map|filter)\b/,
  },
  { type: 'type', pattern: /^[A-Z][a-zA-Z0-9_]*\b/ },
  { type: 'function', pattern: /^([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()/ },
  { type: 'operator', pattern: /^(==|!=|<=|>=|\/\/|\*\*|\+=|-=|\*=|\/=|->|:=|[+\-*/%!=<>&|^~])/ },
];

const RUST_RULES: SyntaxRule[] = [
  { type: 'comment', pattern: /^(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/ },
  { type: 'string', pattern: /^(b?"([^"\\]|\\.)*"|'([^'\\]|\\.)')/ },
  {
    type: 'number',
    pattern:
      /^(0[xX][0-9a-fA-F_]+|\d+(_\d+)*(\.\d+(_\d+)*)?(f32|f64|i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize)?)\b/,
  },
  { type: 'boolean', pattern: /^(true|false)\b/ },
  { type: 'special', pattern: /^[a-zA-Z_][a-zA-Z0-9_]*!/ },
  { type: 'special', pattern: /^'[a-zA-Z_][a-zA-Z0-9_]*\b/ },
  {
    type: 'keyword',
    pattern:
      /^(fn|let|mut|if|else|match|while|loop|for|in|return|break|continue|struct|enum|trait|impl|type|pub|mod|use|crate|self|Self|super|where|async|await|move|ref|const|static|unsafe|extern)\b/,
  },
  {
    type: 'type',
    pattern:
      /^(i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|bool|char|str|String|Vec|Option|Result|Some|None|Ok|Err|Box|Rc|Arc)\b/,
  },
  { type: 'type', pattern: /^[A-Z][a-zA-Z0-9_]*\b/ },
  { type: 'function', pattern: /^([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()/ },
  {
    type: 'operator',
    pattern: /^(->|=>|::|==|!=|<=|>=|&&|\|\||\.\.|\+=|-=|\*=|\/=|%=|[+\-*/%!=<>&|^~?:])/,
  },
];

const GO_RULES: SyntaxRule[] = [
  { type: 'comment', pattern: /^(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/ },
  { type: 'string', pattern: /^("([^"\\]|\\.)*"|`[^`]*`)/ },
  { type: 'number', pattern: /^(0[xX][0-9a-fA-F]+|\d+(\.\d+)?)\b/ },
  { type: 'boolean', pattern: /^(true|false|nil|iota)\b/ },
  {
    type: 'keyword',
    pattern:
      /^(func|var|const|type|struct|interface|package|import|return|if|else|switch|case|default|for|range|break|continue|fallthrough|go|defer|select|chan|map)\b/,
  },
  {
    type: 'type',
    pattern:
      /^(int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|uintptr|float32|float64|complex64|complex128|byte|rune|string|bool|error)\b/,
  },
  { type: 'type', pattern: /^[A-Z][a-zA-Z0-9_]*\b/ },
  { type: 'function', pattern: /^([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()/ },
  {
    type: 'operator',
    pattern: /^(:=|<-|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|%=|[+\-*/%!=<>&|^~?:])/,
  },
];

const HTML_RULES: SyntaxRule[] = [
  { type: 'comment', pattern: /^<!--[\s\S]*?-->/ },
  { type: 'tag', pattern: /^(<\/?[a-zA-Z0-9_-]+>|<\/?[a-zA-Z0-9_-]+|\/>|>)/ },
  { type: 'string', pattern: /^("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/ },
  { type: 'keyword', pattern: /^[a-zA-Z0-9_-]+(?=\s*=)/ },
  { type: 'operator', pattern: /^=/ },
];

const JSON_RULES: SyntaxRule[] = [
  { type: 'keyword', pattern: /^"([^"\\]|\\.)*"(?=\s*:)/ },
  { type: 'string', pattern: /^"([^"\\]|\\.)*"/ },
  { type: 'number', pattern: /^-?\d+(\.\d+)?([eE][+-]?\d+)?\b/ },
  { type: 'boolean', pattern: /^(true|false|null)\b/ },
  { type: 'operator', pattern: /^[:,\{\}\[\]]/ },
];

const BASH_RULES: SyntaxRule[] = [
  { type: 'comment', pattern: /^#[^\n]*/ },
  { type: 'string', pattern: /^("([^"\\]|\\.)*"|'[^']*')/ },
  { type: 'special', pattern: /^(\$[a-zA-Z_0-9]+|\$\{[^}]+\})/ },
  {
    type: 'keyword',
    pattern:
      /^(if|then|else|elif|fi|case|esac|for|while|until|do|done|in|function|select|return|exit|echo|local|export)\b/,
  },
  { type: 'number', pattern: /^\d+\b/ },
  { type: 'operator', pattern: /^(==|!=|<=|>=|&&|\|\||[|=<>&;])/ },
];

const VIM_RULES: SyntaxRule[] = [
  { type: 'comment', pattern: /^"([^\n]*)/ },
  { type: 'string', pattern: /^('([^']|'')*'|"([^"\\]|\\.)*")/ },
  { type: 'special', pattern: /^[gslbwtav]:[a-zA-Z0-9_#]+/ },
  {
    type: 'keyword',
    pattern:
      /^(let|unlet|set|setlocal|function|endfunction|if|elseif|else|endif|for|in|endfor|while|endwhile|try|catch|finally|endtry|call|return|echo|echomsg|execute|autocmd|augroup|command|delcommand|highlight|syntax)\b/,
  },
  { type: 'number', pattern: /^(0[xX][0-9a-fA-F]+|\d+)\b/ },
  {
    type: 'operator',
    pattern: /^(=~|!~|==|!=|<=|>=|&&|\|\||\.|\+=|-=|\*=|\/=|%=|[+\-*/%!=<>&|^~?:])/,
  },
];

const MARKDOWN_RULES: SyntaxRule[] = [
  { type: 'keyword', pattern: /^#{1,6}\s+[^\n]*/ },
  { type: 'string', pattern: /^`[^`]+`/ },
  { type: 'tag', pattern: /^\[[^\]]+\]\([^)]+\)/ },
  { type: 'special', pattern: /^(\*\*[^*]+\*\*|__[^_]+__)/ },
  { type: 'comment', pattern: /^>[^\n]*/ },
];

function getRulesForLanguage(lang: SupportedLanguage): SyntaxRule[] {
  switch (lang) {
    case 'typescript':
    case 'javascript':
      return JS_TS_RULES;
    case 'python':
      return PYTHON_RULES;
    case 'rust':
      return RUST_RULES;
    case 'go':
      return GO_RULES;
    case 'html':
      return HTML_RULES;
    case 'json':
      return JSON_RULES;
    case 'bash':
      return BASH_RULES;
    case 'vim':
      return VIM_RULES;
    case 'markdown':
      return MARKDOWN_RULES;
    case 'text':
    default:
      return [];
  }
}

/**
 * 주어진 코드 줄을 토큰 단위로 분석합니다.
 */
export function tokenizeLine(line: string, language: SupportedLanguage): SyntaxToken[] {
  if (!line || language === 'text') return [];

  const rules = getRulesForLanguage(language);
  if (rules.length === 0) return [];

  const tokens: SyntaxToken[] = [];
  let col = 0;
  const len = line.length;

  while (col < len) {
    // 공백 건너뛰기
    if (/\s/.test(line[col])) {
      col++;
      continue;
    }

    const slice = line.slice(col);
    let matched = false;

    // Vim script 코멘트 예외 처리 (줄 시작 또는 공백 뒤의 ")
    if (language === 'vim' && line[col] === '"') {
      const prevChar = col > 0 ? line[col - 1] : ' ';
      if (/\s/.test(prevChar)) {
        tokens.push({
          type: 'comment',
          startCol: col,
          endCol: len,
          text: slice,
        });
        break;
      }
    }

    for (let r = 0; r < rules.length; r++) {
      const rule = rules[r];
      const match = rule.pattern.exec(slice);
      if (match && match[0].length > 0) {
        const text = match[0];
        tokens.push({
          type: rule.type,
          startCol: col,
          endCol: col + text.length,
          text,
        });
        col += text.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      col++;
    }
  }

  return tokens;
}

/**
 * 각 컬럼 인덱스(0 .. line.length - 1)에 해당하는 SyntaxTokenType 배열을 생성합니다.
 */
export function getSyntaxTokensMap(
  line: string,
  language: SupportedLanguage
): (SyntaxTokenType | null)[] {
  const map: (SyntaxTokenType | null)[] = new Array(line.length).fill(null);
  const tokens = tokenizeLine(line, language);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    for (let c = t.startCol; c < t.endCol && c < line.length; c++) {
      map[c] = t.type;
    }
  }

  return map;
}

/**
 * :syntax / :syn 명령어 실행 핸들러
 */
export function executeSyntaxCommand(state: VimEditorState, args: string): VimEditorState {
  const trimmed = args.trim().toLowerCase();

  if (trimmed === 'on' || trimmed === 'enable') {
    const nextOpts = { ...getOptions(state), syntax: true };
    return {
      ...state,
      options: nextOpts,
      commandMessage: msg('구문 강조가 켜졌습니다'),
    };
  }

  if (trimmed === 'off' || trimmed === 'manual') {
    const nextOpts = { ...getOptions(state), syntax: false };
    return {
      ...state,
      options: nextOpts,
      commandMessage: msg('구문 강조가 꺼졌습니다'),
    };
  }

  if (trimmed === 'reset') {
    const nextOpts = { ...getOptions(state), syntax: true };
    return {
      ...state,
      options: nextOpts,
      commandMessage: msg('구문 강조 설정이 초기화되었습니다'),
    };
  }

  if (trimmed === '') {
    const isSynOn = state.options?.syntax !== false;
    const ft = state.options?.filetype || detectFiletype(state.primaryFilename);
    const status = isSynOn ? 'ON' : 'OFF';
    return {
      ...state,
      commandMessage: msg('구문 강조: {status} (파일타입: {filetype})', { status, filetype: ft }),
    };
  }

  return {
    ...state,
    bell: true,
    commandMessage: msg('E28: 그러한 구문 하위 명령이 없습니다: {cmd}', { cmd: args.trim() }),
  };
}
