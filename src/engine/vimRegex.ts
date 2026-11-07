/**
 * 순정 Vim 정규식 패턴을 JavaScript RegExp 패턴으로 변환합니다.
 * - \( 및 \) -> ( 및 ) (캡처 그룹 추출, 표준 ( )도 호환)
 * - \+ -> + (1회 이상 반복)
 * - \? -> ? (0회 또는 1회)
 * - \| -> | (선택 분기)
 * - \{n,m\} -> {n,m} (수량자)
 * - \< 및 \> -> \b (단어 경계)
 * - \s, \d, \w 등 표준 이스케이프 유지
 * - [...] 문자 클래스 내부 내용은 그대로 보존
 */
export function vimRegexToJsRegex(vimPattern: string): string {
  let jsPattern = '';
  let i = 0;
  let inCharClass = false;

  while (i < vimPattern.length) {
    const ch = vimPattern[i];

    if (inCharClass) {
      if (ch === '\\' && i + 1 < vimPattern.length) {
        jsPattern += ch + vimPattern[i + 1];
        i += 2;
        continue;
      }
      if (ch === ']') {
        inCharClass = false;
      }
      jsPattern += ch;
      i++;
      continue;
    }

    if (ch === '[') {
      inCharClass = true;
      jsPattern += ch;
      i++;
      continue;
    }

    if (ch === '\\') {
      if (i + 1 >= vimPattern.length) {
        jsPattern += '\\\\';
        i++;
        continue;
      }
      const next = vimPattern[i + 1];
      if (next === '(') {
        jsPattern += '(';
        i += 2;
      } else if (next === ')') {
        jsPattern += ')';
        i += 2;
      } else if (next === '+') {
        jsPattern += '+';
        i += 2;
      } else if (next === '?') {
        jsPattern += '?';
        i += 2;
      } else if (next === '|') {
        jsPattern += '|';
        i += 2;
      } else if (next === '{') {
        jsPattern += '{';
        i += 2;
      } else if (next === '}') {
        jsPattern += '}';
        i += 2;
      } else if (next === '<' || next === '>') {
        jsPattern += '\\b';
        i += 2;
      } else if (next === '\\') {
        jsPattern += '\\\\';
        i += 2;
      } else if (next === '/') {
        jsPattern += '/';
        i += 2;
      } else {
        jsPattern += '\\' + next;
        i += 2;
      }
      continue;
    }

    jsPattern += ch;
    i++;
  }

  return jsPattern;
}
