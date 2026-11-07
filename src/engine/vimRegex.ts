/**
 * 순정 Vim 정규식 패턴 → JavaScript RegExp 변환기 (:help pattern)
 *
 * 매직 단계 (패턴 어디서나 전환 가능):
 * - \v (very magic): _ 를 제외한 모든 ASCII 기호가 특수 문자.  예) \v(foo|bar)+
 * - \m (magic, 기본값): ^ $ . * [ ~ 만 특수 문자. + ? = | ( ) { } < > @ % 는 \ 를 붙여야 특수 문자.
 * - \M (nomagic): ^ $ 만 특수 문자.
 * - \V (very nomagic): \ 만 특수 문자. (^ 는 패턴 시작, $ 는 패턴 끝에서만)
 *
 * 지원 항목:
 * - 반복: *  \+  \=  \?  \{n,m}  \{n}  \{n,}  \{,m}  \{}  \{-}  \{-n,m} (최소 일치)
 * - 그룹·선택: \( \)  \%( \) (캡처 없음)  \|  역참조 \1 ~ \9
 * - 위치: ^ $ (Vim 처럼 패턴 시작·끝에서만 특수), \< \> (단어 경계), \zs \ze (일치 시작·끝 지정)
 * - 앞뒤 조건: \@=  \@!  \@<=  \@<! (바로 앞의 그룹 또는 문자에 적용)
 * - 문자 클래스: \s \S \d \D \w \W \a \A \l \L \u \U \x \X \o \O \h \H \k \K \i \I \f \p,
 *   \_s 등 (\_x: 줄바꿈 포함, 한 줄 단위 매칭에서는 \x 와 동일), [...] 와 [[:alpha:]] 같은 POSIX 클래스
 * - 특수 문자: \n \t \e \r, \. \* \[ \~ \/ \\ 등 이스케이프한 리터럴
 * - 대소문자: \c (무시), \C (구분). smartcase 판단 시 \ 뒤의 대문자(\S, \W ...)는 제외
 * - ~ (magic): 직전 치환 문자열 (opts.lastSubstitute 가 없으면 리터럴 ~)
 */

export type MagicLevel = 'v' | 'm' | 'M' | 'V';

export interface VimPatternInfo {
  /** JavaScript RegExp source */
  source: string;
  /** \c → 'ignore', \C → 'match', 없으면 null */
  caseOverride: 'ignore' | 'match' | null;
  /** smartcase 판단용: \ 뒤를 제외한 대문자 포함 여부 */
  hasUppercase: boolean;
}

export interface VimPatternOptions {
  /** ~ 가 가리킬 직전 치환 문자열 */
  lastSubstitute?: string;
}

/** \ 를 붙이면 특수/리터럴이 뒤바뀌는 기호들 */
const FLIP_CHARS = '^$.*[~+?=|(){}<>@%';

function escapeJs(ch: string): string {
  return /[.*+?^${}()|[\]\\/]/.test(ch) ? `\\${ch}` : ch;
}

function escapeJsString(s: string): string {
  return [...s].map(escapeJs).join('');
}

/** 매직 단계에서 \ 없이 쓴 기호가 특수 문자인지 */
function unescapedIsSpecial(level: MagicLevel, ch: string): boolean {
  switch (level) {
    case 'v':
      return FLIP_CHARS.includes(ch);
    case 'm':
      return '^$.*[~'.includes(ch);
    case 'M':
      return '^$'.includes(ch);
    default:
      return false;
  }
}

const CLASS_ESCAPES: Record<string, string> = {
  d: '\\d', D: '\\D', s: '\\s', S: '\\S', w: '\\w', W: '\\W',
  a: '[A-Za-z]', A: '[^A-Za-z]', l: '[a-z]', L: '[^a-z]', u: '[A-Z]', U: '[^A-Z]',
  x: '[0-9A-Fa-f]', X: '[^0-9A-Fa-f]', o: '[0-7]', O: '[^0-7]',
  h: '[A-Za-z_]', H: '[^A-Za-z_]', k: '[A-Za-z0-9_]', K: '[A-Za-z_]', i: '[A-Za-z0-9_]', I: '[A-Za-z_]',
  f: '[A-Za-z0-9_./~+,#$%-]', F: '[A-Za-z_./~+,#$%-]', p: '[ -~]', P: '[!-~]',
};

const POSIX_CLASSES: Record<string, string> = {
  alpha: 'A-Za-z', digit: '0-9', alnum: 'A-Za-z0-9', lower: 'a-z', upper: 'A-Z',
  space: '\\s', blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f', cntrl: '\\x00-\\x1f',
  print: ' -~', graph: '!-~', return: '\\r', tab: '\\t', escape: '\\x1b', backspace: '\\x08',
};

/** [...] 문자 클래스를 해석합니다. 닫는 ] 가 없으면 null (리터럴 [ 로 처리) */
function parseCharClass(pattern: string, start: number): { source: string; end: number } | null {
  let i = start + 1;
  let out = '[';
  if (pattern[i] === '^') {
    out += '^';
    i++;
  }
  // 첫 ] 는 리터럴
  if (pattern[i] === ']') {
    out += '\\]';
    i++;
  }
  while (i < pattern.length && pattern[i] !== ']') {
    const ch = pattern[i];
    if (ch === '[' && pattern[i + 1] === ':') {
      const close = pattern.indexOf(':]', i + 2);
      const name = close > 0 ? pattern.slice(i + 2, close) : '';
      if (close > 0 && POSIX_CLASSES[name]) {
        out += POSIX_CLASSES[name];
        i = close + 2;
        continue;
      }
    }
    if (ch === '\\' && i + 1 < pattern.length) {
      const next = pattern[i + 1];
      const mapped: Record<string, string> = { e: '\\x1b', t: '\\t', r: '\\r', n: '\\n', '\\': '\\\\', ']': '\\]', '^': '\\^', '-': '\\-', d: '\\d', s: '\\s', w: '\\w' };
      out += mapped[next] ?? escapeJs(next);
      i += 2;
      continue;
    }
    out += ch === '[' || ch === '/' ? `\\${ch}` : ch;
    i++;
  }
  if (i >= pattern.length) return null;
  return { source: `${out}]`, end: i };
}

/** \{n,m} 반복 범위를 해석합니다. pattern[start] 은 '{' 다음 위치 */
function parseBrace(pattern: string, start: number): { source: string; end: number } | null {
  let i = start;
  let body = '';
  while (i < pattern.length) {
    if (pattern[i] === '}') break;
    if (pattern[i] === '\\' && pattern[i + 1] === '}') {
      i++;
      break;
    }
    body += pattern[i++];
  }
  if (i >= pattern.length) return null;
  const m = body.match(/^(-?)(\d*)(,?)(\d*)$/);
  if (!m) return null;
  const lazy = m[1] === '-' ? '?' : '';
  const [, , lo, comma, hi] = m;
  let q: string;
  if (!lo && !comma && !hi) q = '*';
  else if (!comma) q = `{${lo}}`;
  else q = `{${lo || '0'},${hi}}`;
  return { source: q + lazy, end: i };
}

export function translateVimPattern(pattern: string, opts: VimPatternOptions = {}): VimPatternInfo {
  let level: MagicLevel = 'm';
  let caseOverride: VimPatternInfo['caseOverride'] = null;
  let out = '';
  let atStart = true;
  /** 열린 그룹의 out 시작 위치 */
  const groupStack: number[] = [];
  /** 바로 앞 원자(atom)의 out 시작 위치 (\@= 등 앞뒤 조건과 반복 적용 대상) */
  let lastAtomStart = -1;
  let zsPos: number | null = null;
  let zePos: number | null = null;

  /** 현재 위치 뒤가 패턴 끝(또는 선택·그룹 닫힘)인지: $ 가 특수 문자가 되는 조건 */
  const atEndAfter = (idx: number): boolean => {
    const rest = pattern.slice(idx);
    if (rest.length === 0) return true;
    if (level === 'v') return /^[|)]/.test(rest);
    return /^\\[|)]/.test(rest);
  };

  const emitAtom = (src: string) => {
    lastAtomStart = out.length;
    out += src;
    atStart = false;
  };

  let i = 0;
  while (i < pattern.length) {
    let ch = pattern[i];
    let escaped = false;
    if (ch === '\\' && i + 1 < pattern.length) {
      escaped = true;
      ch = pattern[i + 1];
      i += 2;
    } else {
      i += 1;
    }

    // 1. \ 뒤의 문자·숫자: 클래스, 특수 문자, 역참조, 모드 전환
    if (escaped && /[A-Za-z0-9_]/.test(ch)) {
      if (ch === 'v' || ch === 'm' || ch === 'M' || ch === 'V') {
        level = ch;
        continue;
      }
      if (ch === 'c') {
        caseOverride = 'ignore';
        continue;
      }
      if (ch === 'C') {
        caseOverride = 'match';
        continue;
      }
      if (ch === 'z' && (pattern[i] === 's' || pattern[i] === 'e')) {
        if (groupStack.length === 0) {
          if (pattern[i] === 's') zsPos = out.length;
          else zePos = out.length;
        }
        i++;
        continue;
      }
      if (ch === '_') {
        const next = pattern[i];
        i++;
        if (next === '.') emitAtom('[\\s\\S]');
        else if (next === '^') out += '^';
        else if (next === '$') out += '$';
        else if (next && CLASS_ESCAPES[next]) emitAtom(CLASS_ESCAPES[next]);
        else emitAtom(escapeJs(next ?? '_'));
        continue;
      }
      if (/[1-9]/.test(ch)) {
        emitAtom(`\\${ch}`);
        continue;
      }
      const special: Record<string, string> = { n: '\\n', t: '\\t', e: '\\x1b', r: '\\r' };
      emitAtom(special[ch] ?? CLASS_ESCAPES[ch] ?? escapeJs(ch));
      continue;
    }

    // 2. 기호: 매직 단계와 \ 여부로 특수 문자인지 결정
    const isSpecial = FLIP_CHARS.includes(ch)
      ? escaped !== unescapedIsSpecial(level, ch)
      : false;

    // \V 에서도 패턴 시작의 ^ 와 끝의 $ 는 특수
    const anchorInV = level === 'V' && !escaped && ((ch === '^' && out.length === 0) || (ch === '$' && atEndAfter(i)));

    if (!isSpecial && !anchorInV) {
      emitAtom(escapeJs(ch));
      continue;
    }

    switch (ch) {
      case '^':
        if (atStart) out += '^';
        else emitAtom('\\^');
        break;
      case '$':
        if (atEndAfter(i)) out += '$';
        else emitAtom('\\$');
        break;
      case '.':
        emitAtom('.');
        break;
      case '*':
      case '+':
      case '=':
      case '?':
        // 원자 없이 나온 반복 기호는 리터럴 (Vim: 패턴 맨 앞의 * 는 * 문자)
        if (atStart || lastAtomStart < 0) emitAtom(escapeJs(ch));
        else out += ch === '=' ? '?' : ch;
        break;
      case '{': {
        const brace = parseBrace(pattern, i);
        if (!brace || atStart) {
          emitAtom('\\{');
          break;
        }
        out += brace.source;
        i = brace.end + 1;
        break;
      }
      case '[': {
        const cls = parseCharClass(pattern, i - 1);
        if (!cls) {
          emitAtom('\\[');
          break;
        }
        emitAtom(cls.source);
        i = cls.end + 1;
        break;
      }
      case '~':
        emitAtom(opts.lastSubstitute !== undefined ? `(?:${escapeJsString(opts.lastSubstitute)})` : '~');
        break;
      case '(':
        groupStack.push(out.length);
        out += '(';
        atStart = true;
        lastAtomStart = -1;
        break;
      case '%':
        // \%( ... \) : 캡처하지 않는 그룹
        if (pattern[i] === '(') {
          i += 1;
          groupStack.push(out.length);
          out += '(?:';
          atStart = true;
          lastAtomStart = -1;
        } else {
          emitAtom('%');
        }
        break;
      case ')': {
        const start = groupStack.pop();
        out += ')';
        lastAtomStart = start ?? -1;
        atStart = false;
        break;
      }
      case '|':
        out += '|';
        atStart = true;
        lastAtomStart = -1;
        break;
      case '<':
        out += '\\b(?=\\w)';
        break;
      case '>':
        out += '\\b(?<=\\w)';
        break;
      case '@': {
        // \@= \@! \@<= \@<! : 바로 앞 원자를 앞뒤 조건으로 바꿈
        const m = pattern.slice(i).match(/^(<?[=!])/);
        if (!m || lastAtomStart < 0) {
          emitAtom('@');
          break;
        }
        i += m[1].length;
        const atom = out.slice(lastAtomStart);
        const inner = atom.startsWith('(') && atom.endsWith(')') ? atom.slice(atom.startsWith('(?:') ? 3 : 1, -1) : atom;
        const kind = m[1].startsWith('<') ? `?<${m[1][1]}` : `?${m[1]}`;
        out = out.slice(0, lastAtomStart) + `(${kind}${inner})`;
        lastAtomStart = -1;
        break;
      }
      default:
        emitAtom(escapeJs(ch));
    }
  }

  let source = out;
  if (zsPos !== null || zePos !== null) {
    const zs = zsPos ?? 0;
    const ze = zePos !== null && zePos >= zs ? zePos : out.length;
    const before = out.slice(0, zs);
    const body = out.slice(zs, ze);
    const after = out.slice(ze);
    source = (before ? `(?<=${before})` : '') + body + (after ? `(?=${after})` : '');
  }

  return { source, caseOverride, hasUppercase: hasUppercaseOutsideEscapes(pattern) };
}

/** smartcase: \ 바로 뒤 문자(\S, \W, \U ...)를 제외하고 대문자가 있는지 */
function hasUppercaseOutsideEscapes(pattern: string): boolean {
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') {
      i++;
      continue;
    }
    if (/[A-Z]/.test(pattern[i])) return true;
  }
  return false;
}

export interface CompileOptions extends VimPatternOptions {
  ignorecase?: boolean;
  smartcase?: boolean;
  /** 추가 RegExp 플래그 (예: 'g') */
  flags?: string;
}

/**
 * Vim 패턴을 RegExp 로 컴파일합니다. 'ignorecase' / 'smartcase' 와 \c / \C 를 반영합니다.
 * 잘못된 패턴이면 RegExp 생성자가 SyntaxError 를 던집니다.
 */
export function compileVimRegex(pattern: string, opts: CompileOptions = {}): RegExp {
  const info = translateVimPattern(pattern, opts);
  let ignoreCase = !!opts.ignorecase && !(opts.smartcase && info.hasUppercase);
  if (info.caseOverride) ignoreCase = info.caseOverride === 'ignore';
  return new RegExp(info.source, (opts.flags ?? '') + (ignoreCase ? 'i' : ''));
}

/** 하위 호환: Vim 패턴의 JavaScript RegExp source (\c / \C 는 제거됨) */
export function vimRegexToJsRegex(vimPattern: string): string {
  return translateVimPattern(vimPattern).source;
}

/** 문자열을 Vim 패턴(magic)에서 글자 그대로 일치하도록 이스케이프합니다. */
export function escapeVimPattern(text: string): string {
  return text.replace(/[\\^$.*[\]~/]/g, '\\$&');
}

/** * / # 이 사용하는 검색 패턴: 키워드 단어는 \<word\> 로 단어 전체만, 그 밖에는 글자 그대로 (:help star) */
export function starSearchPattern(word: string): string {
  return /^\w+$/.test(word) ? `\\<${word}\\>` : escapeVimPattern(word);
}
