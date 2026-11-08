/**
 * 순정 Vim 표현식 레지스터(=) 안전한 산술 계산기 파서
 * eval() 또는 Function()을 일체 사용하지 않고 안전한 재귀 하강(Recursive Descent) AST 파서로 수식을 계산합니다.
 */

export interface EvalResult {
  success: boolean;
  result: string;
  error?: string;
}

type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'IDENT'
  | 'PLUS'
  | 'MINUS'
  | 'STAR_STAR'
  | 'STAR'
  | 'SLASH'
  | 'PERCENT'
  | 'CARET'
  | 'DOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF';

interface Token {
  type: TokenType;
  value: any;
  pos: number;
}

class Lexer {
  private pos = 0;

  constructor(private input: string) {}

  public nextToken(): Token {
    this.skipWhitespace();

    if (this.pos >= this.input.length) {
      return { type: 'EOF', value: null, pos: this.pos };
    }

    const startPos = this.pos;
    const ch = this.input[this.pos];

    // 16진수, 2진수, 8진수 또는 10진수 숫자
    if (ch >= '0' && ch <= '9') {
      if (ch === '0' && this.pos + 1 < this.input.length) {
        const next = this.input[this.pos + 1].toLowerCase();
        if (next === 'x') {
          // Hexadecimal: 0xff
          this.pos += 2;
          const hexStart = this.pos;
          while (this.pos < this.input.length && /[0-9a-fA-F]/.test(this.input[this.pos])) {
            this.pos++;
          }
          const hexStr = this.input.slice(hexStart, this.pos);
          if (hexStr.length === 0) {
            throw new Error(`올바르지 않은 16진수 표기입니다 at pos ${startPos}`);
          }
          return { type: 'NUMBER', value: parseInt(hexStr, 16), pos: startPos };
        } else if (next === 'b') {
          // Binary: 0b1010
          this.pos += 2;
          const binStart = this.pos;
          while (this.pos < this.input.length && (this.input[this.pos] === '0' || this.input[this.pos] === '1')) {
            this.pos++;
          }
          const binStr = this.input.slice(binStart, this.pos);
          if (binStr.length === 0) {
            throw new Error(`올바르지 않은 2진수 표기입니다 at pos ${startPos}`);
          }
          return { type: 'NUMBER', value: parseInt(binStr, 2), pos: startPos };
        } else if (next === 'o') {
          // Octal: 0o77
          this.pos += 2;
          const octStart = this.pos;
          while (this.pos < this.input.length && /[0-7]/.test(this.input[this.pos])) {
            this.pos++;
          }
          const octStr = this.input.slice(octStart, this.pos);
          if (octStr.length === 0) {
            throw new Error(`올바르지 않은 8진수 표기입니다 at pos ${startPos}`);
          }
          return { type: 'NUMBER', value: parseInt(octStr, 8), pos: startPos };
        }
      }

      // 일반 10진수 숫자 (정수 또는 부동소수점)
      while (this.pos < this.input.length && /[0-9]/.test(this.input[this.pos])) {
        this.pos++;
      }
      if (this.pos < this.input.length && this.input[this.pos] === '.' && /[0-9]/.test(this.input[this.pos + 1] ?? '')) {
        this.pos++; // skip '.'
        while (this.pos < this.input.length && /[0-9]/.test(this.input[this.pos])) {
          this.pos++;
        }
      }
      const numStr = this.input.slice(startPos, this.pos);
      return { type: 'NUMBER', value: parseFloat(numStr), pos: startPos };
    }

    // 문자열 리터럴 ("..." 또는 '...')
    if (ch === '"' || ch === "'") {
      const quote = ch;
      this.pos++; // skip opening quote
      let str = '';
      while (this.pos < this.input.length && this.input[this.pos] !== quote) {
        if (this.input[this.pos] === '\\' && this.pos + 1 < this.input.length) {
          this.pos++;
          const esc = this.input[this.pos];
          if (esc === 'n') str += '\n';
          else if (esc === 't') str += '\t';
          else if (esc === 'r') str += '\r';
          else str += esc;
        } else {
          str += this.input[this.pos];
        }
        this.pos++;
      }
      if (this.pos >= this.input.length) {
        throw new Error(`문자열 따옴표가 닫히지 않았습니다 at pos ${startPos}`);
      }
      this.pos++; // skip closing quote
      return { type: 'STRING', value: str, pos: startPos };
    }

    // 식별자 및 함수명 (len, strlen, abs 등)
    if (/[a-zA-Z_]/.test(ch)) {
      while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.pos])) {
        this.pos++;
      }
      const ident = this.input.slice(startPos, this.pos);
      return { type: 'IDENT', value: ident, pos: startPos };
    }

    // 연산자 및 기호
    if (ch === '*') {
      if (this.pos + 1 < this.input.length && this.input[this.pos + 1] === '*') {
        this.pos += 2;
        return { type: 'STAR_STAR', value: '**', pos: startPos };
      }
      this.pos++;
      return { type: 'STAR', value: '*', pos: startPos };
    }

    if (ch === '+') {
      this.pos++;
      return { type: 'PLUS', value: '+', pos: startPos };
    }
    if (ch === '-') {
      this.pos++;
      return { type: 'MINUS', value: '-', pos: startPos };
    }
    if (ch === '/') {
      this.pos++;
      return { type: 'SLASH', value: '/', pos: startPos };
    }
    if (ch === '%') {
      this.pos++;
      return { type: 'PERCENT', value: '%', pos: startPos };
    }
    if (ch === '^') {
      this.pos++;
      return { type: 'CARET', value: '^', pos: startPos };
    }
    if (ch === '.') {
      this.pos++;
      return { type: 'DOT', value: '.', pos: startPos };
    }
    if (ch === '(') {
      this.pos++;
      return { type: 'LPAREN', value: '(', pos: startPos };
    }
    if (ch === ')') {
      this.pos++;
      return { type: 'RPAREN', value: ')', pos: startPos };
    }
    if (ch === ',') {
      this.pos++;
      return { type: 'COMMA', value: ',', pos: startPos };
    }

    throw new Error(`알 수 없는 기호입니다: '${ch}' at pos ${startPos}`);
  }

  private skipWhitespace() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }
}

class Parser {
  private current: Token;

  constructor(private lexer: Lexer) {
    this.current = this.lexer.nextToken();
  }

  private eat(type: TokenType): Token {
    if (this.current.type !== type) {
      throw new Error(`기대하지 않은 토큰입니다: ${this.current.type} (기대값: ${type})`);
    }
    const token = this.current;
    this.current = this.lexer.nextToken();
    return token;
  }

  public parse(): any {
    const result = this.parseExpression();
    if (this.current.type !== 'EOF') {
      throw new Error(`수식 끝에 불필요한 문자가 남아있습니다 at pos ${this.current.pos}`);
    }
    return result;
  }

  // 1. 표현식 (+, -, .)
  private parseExpression(): any {
    let node = this.parseMultiplicative();

    while (
      this.current.type === 'PLUS' ||
      this.current.type === 'MINUS' ||
      this.current.type === 'DOT'
    ) {
      const op = this.current.type;
      this.eat(op);
      const right = this.parseMultiplicative();

      if (op === 'PLUS') {
        if (typeof node === 'string' || typeof right === 'string') {
          node = String(node) + String(right);
        } else {
          node = Number(node) + Number(right);
        }
      } else if (op === 'MINUS') {
        node = Number(node) - Number(right);
      } else if (op === 'DOT') {
        // Vim 문자열 연결 연산자 (.)
        node = String(node) + String(right);
      }
    }

    return node;
  }

  // 2. 곱셈, 나눗셈, 나머지 (*, /, %)
  private parseMultiplicative(): any {
    let node = this.parsePower();

    while (
      this.current.type === 'STAR' ||
      this.current.type === 'SLASH' ||
      this.current.type === 'PERCENT'
    ) {
      const op = this.current.type;
      this.eat(op);
      const right = this.parsePower();

      if (op === 'STAR') {
        node = Number(node) * Number(right);
      } else if (op === 'SLASH') {
        if (Number(right) === 0) {
          throw new Error('0으로 나눌 수 없습니다.');
        }
        node = Number(node) / Number(right);
      } else if (op === 'PERCENT') {
        if (Number(right) === 0) {
          throw new Error('0으로 나눈 나머지를 구할 수 없습니다.');
        }
        node = Number(node) % Number(right);
      }
    }

    return node;
  }

  // 3. 거듭제곱 (** 또는 ^, 우측 결합)
  private parsePower(): any {
    let node = this.parseUnary();

    if (this.current.type === 'STAR_STAR' || this.current.type === 'CARET') {
      this.eat(this.current.type);
      const right = this.parsePower();
      node = Math.pow(Number(node), Number(right));
    }

    return node;
  }

  // 4. 단항 연산 (+, -)
  private parseUnary(): any {
    if (this.current.type === 'PLUS') {
      this.eat('PLUS');
      return +Number(this.parseUnary());
    }
    if (this.current.type === 'MINUS') {
      this.eat('MINUS');
      return -Number(this.parseUnary());
    }
    return this.parsePrimary();
  }

  // 5. 기본 리터럴, 괄호, 함수 호출
  private parsePrimary(): any {
    const token = this.current;

    if (token.type === 'NUMBER') {
      this.eat('NUMBER');
      return token.value;
    }

    if (token.type === 'STRING') {
      this.eat('STRING');
      return token.value;
    }

    if (token.type === 'LPAREN') {
      this.eat('LPAREN');
      const val = this.parseExpression();
      this.eat('RPAREN');
      return val;
    }

    if (token.type === 'IDENT') {
      const funcName = token.value.toLowerCase();
      this.eat('IDENT');

      if (this.current.type === 'LPAREN') {
        this.eat('LPAREN');
        const args: any[] = [];
        if ((this.current.type as TokenType) !== 'RPAREN') {
          args.push(this.parseExpression());
          while ((this.current.type as TokenType) === 'COMMA') {
            this.eat('COMMA');
            args.push(this.parseExpression());
          }
        }
        this.eat('RPAREN');
        return this.callFunction(funcName, args);
      }

      throw new Error(`알 수 없는 식별자입니다: '${token.value}'`);
    }

    throw new Error(`올바르지 않은 수식 구문입니다 at pos ${token.pos}`);
  }

  private callFunction(name: string, args: any[]): any {
    switch (name) {
      case 'len':
      case 'strlen': {
        const target = args[0] !== undefined ? args[0] : '';
        return typeof target === 'string' ? target.length : String(target).length;
      }
      case 'abs':
        return Math.abs(Number(args[0] ?? 0));
      case 'round':
        return Math.round(Number(args[0] ?? 0));
      case 'floor':
        return Math.floor(Number(args[0] ?? 0));
      case 'ceil':
        return Math.ceil(Number(args[0] ?? 0));
      case 'sqrt':
        return Math.sqrt(Number(args[0] ?? 0));
      case 'pow':
        return Math.pow(Number(args[0] ?? 0), Number(args[1] ?? 0));
      case 'min':
        return Math.min(...args.map((a) => Number(a)));
      case 'max':
        return Math.max(...args.map((a) => Number(a)));
      default:
        throw new Error(`지원하지 않는 내장 함수입니다: ${name}`);
    }
  }
}

/**
 * Vim 표현식 문자열을 파싱하고 안전하게 평가하여 결과를 문자열로 반환합니다.
 */
export function evaluateVimExpression(exprStr: string): EvalResult {
  const trimmed = exprStr.trim();
  if (trimmed.length === 0) {
    return { success: false, result: '', error: '수식이 비어 있습니다.' };
  }

  try {
    const lexer = new Lexer(trimmed);
    const parser = new Parser(lexer);
    const val = parser.parse();

    let formatted: string;
    if (typeof val === 'number') {
      if (Number.isInteger(val)) {
        formatted = val.toString();
      } else {
        // 소수점 유효 자리 정리
        formatted = parseFloat(val.toFixed(10)).toString();
      }
    } else {
      formatted = String(val);
    }

    return { success: true, result: formatted };
  } catch (err: any) {
    return { success: false, result: '', error: err.message || '수식 파싱 오류' };
  }
}
