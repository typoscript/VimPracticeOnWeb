import { t } from '../i18n';
export interface RefactoringRuleInfo {
  id: string;
  title: string;
  category: 'Modern JS' | 'Clean Code' | 'Code Convention' | 'Syntax Enforcement' | 'Style Guide';
  description: string;
  hint: string;
  recommendedVimCommand: string;
  matchCount: number;
  targetText: string;
  estimatedPar: number;
}

export interface BYOCAnalysisResult {
  sourceText: string;
  totalLines: number;
  detectedRules: RefactoringRuleInfo[];
  primaryRule: RefactoringRuleInfo;
}

/**
 * snake_case 문자열을 camelCase로 변환하는 헬퍼 함수
 */
function convertSnakeToCamel(text: string): string {
  return text.replace(/\b([a-z][a-z0-9]*)_([a-z0-9])/g, (_, p1, p2) => {
    return p1 + p2.toUpperCase();
  });
}

/**
 * 사용자가 입력한 임의의 소스 코드(TypeScript, React, Java, SQL 등)를 분석하여
 * 30초 내에 풀 수 있는 맞춤형 리팩토링 목표 코드와 Par 타수를 생성합니다.
 */
export function analyzeAndGenerateBYOC(sourceCode: string): BYOCAnalysisResult {
  const code = (sourceCode || '').trim();
  const rawLines = code ? code.split('\n') : [''];
  const detectedRules: RefactoringRuleInfo[] = [];

  // 1. var -> const 모던 자바스크립트 리팩토링 검사
  const varMatches = code.match(/\bvar\s+/g);
  if (varMatches && varMatches.length > 0) {
    const targetText = code.replace(/\bvar\s+/g, 'const ');
    const count = varMatches.length;
    detectedRules.push({
      id: 'var_to_const',
      title: t('Modern JS: var 선언을 모던 const로 일괄 교체'),
      category: 'Modern JS',
      description: t('코드 내 레거시 var 키워드 {count}개를 최신 ES6+ const 선언으로 리팩토링하세요.', { count }),
      hint: t(':%s/var/const/g 명령으로 일괄 치환하거나, ciw로 첫 번째 var를 수정한 후 n. 으로 반복하세요.'),
      recommendedVimCommand: t(':%s/var/const/g 또는 ciw + n.'),
      matchCount: count,
      targetText,
      estimatedPar: count <= 2 ? 14 : 16,
    });
  }

  // 2. 디버그 출력 로그(console.log, System.out.println 등) 제거 검사
  const logLines = rawLines.filter((l) =>
    /(console\.log\(|System\.out\.println\(|print\(|fmt\.Println\()/i.test(l)
  );
  if (logLines.length > 0) {
    const cleanedLines = rawLines.filter(
      (l) => !/(console\.log\(|System\.out\.println\(|print\(|fmt\.Println\()/i.test(l)
    );
    const targetText = cleanedLines.join('\n');
    const count = logLines.length;
    detectedRules.push({
      id: 'remove_debug_logs',
      title: t('Clean Code: 프로덕션 배포 전 디버그 출력 로그 삭제'),
      category: 'Clean Code',
      description: t('남아있는 디버그 로그 {count}줄을 깨끗하게 삭제하여 클린 코드를 완성하세요.', { count }),
      hint: t(':g/console\\.log/d 로 로그 줄을 한 번에 일괄 삭제하거나, 해당 줄에서 dd 로 빠르게 잘라내세요.'),
      recommendedVimCommand: t(':g/console\\.log/d 또는 dd'),
      matchCount: count,
      targetText,
      estimatedPar: count === 1 ? 4 : 14,
    });
  }

  // 3. 작은따옴표('...') -> 큰따옴표("...") 표준화
  const singleQuoteMatches = code.match(/'([^'\\]|\\.)*'/g);
  if (singleQuoteMatches && singleQuoteMatches.length > 0) {
    const targetText = code.replace(/'([^'\\]|\\.)*'/g, (m) => `"${m.slice(1, -1)}"`);
    const count = singleQuoteMatches.length;
    detectedRules.push({
      id: 'single_to_double_quotes',
      title: t('Style Guide: 작은따옴표를 큰따옴표로 통일'),
      category: 'Style Guide',
      description: t('문자열 리터럴 {count}개의 작은따옴표(\')를 팀 표준인 큰따옴표(")로 통일하세요.', { count }),
      hint: t('ci\' 로 문자열 내부를 다시 작성하거나, :%s/\'/\\"/g 명령으로 일괄 치환하세요.'),
      recommendedVimCommand: t('ci\' 또는 :%s/\'/\\"/g'),
      matchCount: count,
      targetText,
      estimatedPar: Math.min(24, Math.max(12, count * 4)),
    });
  }

  // 4. snake_case -> camelCase 변수명 리팩토링 검사
  const snakeMatches = code.match(/\b[a-z][a-z0-9]*_[a-z0-9]+\b/g);
  if (snakeMatches && snakeMatches.length > 0) {
    const targetText = convertSnakeToCamel(code);
    const count = snakeMatches.length;
    detectedRules.push({
      id: 'snake_to_camel',
      title: t('Code Convention: snake_case 식별자를 camelCase로 변환'),
      category: 'Code Convention',
      description: t('snake_case 식별자 {count}개({v})를 카멜표기법으로 변경하세요.', { count, v: snakeMatches.slice(0, 3).join(', ') }),
      hint: t('f_ 로 밑줄로 즉시 점프한 뒤 x(밑줄 삭제), ~(다음 문자 대문자 토글)을 조합하세요.'),
      recommendedVimCommand: t('f_ + x + ~ 또는 ciw'),
      matchCount: count,
      targetText,
      estimatedPar: count * 5 + 6,
    });
  }

  // 5. 누락된 세미콜론(;) 일괄 보정 검사
  const missingSemicolons: number[] = [];
  rawLines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (
      trimmed.length > 0 &&
      !trimmed.endsWith(';') &&
      !trimmed.endsWith('{') &&
      !trimmed.endsWith('}') &&
      !trimmed.endsWith(',') &&
      !trimmed.endsWith(':') &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('/*') &&
      !trimmed.startsWith('*') &&
      !/^(if|for|while|switch|else|function|class)\b/.test(trimmed)
    ) {
      missingSemicolons.push(idx);
    }
  });

  if (missingSemicolons.length > 0) {
    const fixedLines = [...rawLines];
    missingSemicolons.forEach((idx) => {
      fixedLines[idx] = fixedLines[idx] + ';';
    });
    const targetText = fixedLines.join('\n');
    const count = missingSemicolons.length;
    detectedRules.push({
      id: 'semicolon_enforce',
      title: t('Syntax Enforcement: 누락된 세미콜론(;) 일괄 보정'),
      category: 'Syntax Enforcement',
      description: t('구문 끝에 세미콜론이 빠진 {count}개 라인을 찾아 완결하세요.', { count }),
      hint: t('Shift+A (A;)로 줄 끝에 세미콜론을 넣은 후, j. 로 아래 줄에 연속 적용하거나 :%norm A; 를 사용하세요.'),
      recommendedVimCommand: t('A; <Esc> + j. 또는 :%norm A;'),
      matchCount: count,
      targetText,
      estimatedPar: count <= 2 ? count * 4 : 14,
    });
  }

  // 6. function 키워드 -> 화살표 함수(Arrow Function) 리팩토링 검사
  const funcMatch = code.match(/function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)\s*\{/);
  if (funcMatch) {
    const targetText = code.replace(
      /function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)\s*\{/g,
      'const $1 = ($2) => {'
    );
    detectedRules.push({
      id: 'arrow_function',
      title: t('Modern JS: 전통 함수 선언문을 화살표 함수로 전환'),
      category: 'Modern JS',
      description: t('전통적인 function 함수 선언문을 최신 화살표 함수(Arrow Function) 표현식으로 리팩토링하세요.'),
      hint: t('ciw const <Esc> 로 키워드를 바꾸고, f) a => <Esc> 로 화살표를 삽입하세요.'),
      recommendedVimCommand: 'ciw const + f) + a =>',
      matchCount: 1,
      targetText,
      estimatedPar: 18,
    });
  }

  // 7. Fallback 규칙: 만약 언어별 규칙에 아무것도 매칭되지 않은 경우
  if (detectedRules.length === 0) {
    const targetText = code ? `${code}\n// Refactored with Vim` : '// Refactored with Vim';
    detectedRules.push({
      id: 'generic_refactor',
      title: t('Vim Golf: 코드 리팩토링 및 주석 완결'),
      category: 'Clean Code',
      description: t('코드 파일 끝에 리팩토링 완료 서명을 추가하세요.'),
      hint: t('Shift+G (G) 로 파일 끝으로 이동한 뒤, o 로 새 줄을 열고 텍스트를 입력하세요.'),
      recommendedVimCommand: 'G + o',
      matchCount: 1,
      targetText,
      estimatedPar: 20,
    });
  }

  return {
    sourceText: code,
    totalLines: rawLines.length,
    detectedRules,
    primaryRule: detectedRules[0],
  };
}
