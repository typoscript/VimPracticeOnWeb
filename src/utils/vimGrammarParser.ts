import { t, localized } from '../i18n';
export type ASTNodeType =
  | 'register'
  | 'count1'
  | 'operator'
  | 'count2'
  | 'motion'
  | 'text_object'
  | 'action'
  | 'modifier_pending'
  | 'char_pending'
  | 'pending';

export interface ASTNode {
  type: ASTNodeType;
  raw: string;
  label: string;
  description: string;
  isPending?: boolean;
}

export interface CandidateItem {
  key: string;
  name: string;
  example?: string;
  description?: string;
}

export interface CandidateCategory {
  category: string;
  items: CandidateItem[];
}

export interface VimGrammarAST {
  rawCommand: string;
  nodes: ASTNode[];
  isComplete: boolean;
  isOperatorPending: boolean;
  explanation: string;
  candidates?: CandidateCategory[];
  totalEffectiveCount: number;
}

/**
 * 텍스트 객체 이름 및 한국어 설명 매핑
 */
const TEXT_OBJECT_NAMES: Record<string, { name: string; desc: string }> = localized({
  w: { name: '단어 (Word)', desc: '단어(공백 제외)' },
  W: { name: '공백 구분 단어 (Big Word)', desc: '공백으로 구분된 단어' },
  '"': { name: '큰따옴표 ("...")', desc: '큰따옴표("...")' },
  "'": { name: "작은따옴표 ('...')", desc: "작은따옴표('...')" },
  '`': { name: '백틱 (`...`)', desc: '백틱(`...`)' },
  '(': { name: '소괄호 ((...))', desc: '소괄호((...))' },
  ')': { name: '소괄호 ((...))', desc: '소괄호((...))' },
  b: { name: '소괄호 블록', desc: '소괄호((...)) 블록' },
  '[': { name: '대괄호 ([...])', desc: '대괄호([...])' },
  ']': { name: '대괄호 ([...])', desc: '대괄호([...])' },
  '{': { name: '중괄호 ({...})', desc: '중괄호({...})' },
  '}': { name: '중괄호 ({...})', desc: '중괄호({...})' },
  B: { name: '중괄호 블록', desc: '중괄호({...}) 블록' },
  '<': { name: '꺾쇠괄호 (<...>)', desc: '꺾쇠괄호(<...>)' },
  '>': { name: '꺾쇠괄호 (<...>)', desc: '꺾쇠괄호(<...>)' },
  t: { name: 'HTML/XML 태그', desc: 'HTML/XML 태그(<tag>...</tag>)' },
  p: { name: '문단 (Paragraph)', desc: '빈 줄로 구분된 문단' },
  s: { name: '문장 (Sentence)', desc: '문장' },
});

/**
 * 모션 이름 및 한국어 설명 매핑
 */
const MOTION_NAMES: Record<string, { name: string; desc: string }> = localized({
  w: { name: '다음 단어 시작', desc: '다음 단어의 첫 글자까지' },
  b: { name: '이전 단어 시작', desc: '이전 단어의 첫 글자까지' },
  e: { name: '단어 끝', desc: '현재 또는 다음 단어의 끝 글자까지' },
  ge: { name: '이전 단어 끝', desc: '이전 단어의 끝 글자까지' },
  $: { name: '줄 끝', desc: '현재 줄 끝(마지막 문자)까지' },
  '0': { name: '줄 첫 열', desc: '현재 줄의 맨 앞(0번째 열)까지' },
  '^': { name: '줄 첫 글자', desc: '현재 줄의 첫 번째 공백이 아닌 문자까지' },
  '%': { name: '대응 짝 괄호', desc: '대응되는 짝 괄호 위치까지' },
  j: { name: '아래 줄', desc: '아래 줄' },
  k: { name: '위 줄', desc: '위 줄' },
  h: { name: '왼쪽 문자', desc: '왼쪽 문자' },
  l: { name: '오른쪽 문자', desc: '오른쪽 문자' },
  G: { name: '파일 끝 줄', desc: '파일의 맨 마지막 줄' },
  gg: { name: '파일 첫 줄', desc: '파일의 맨 첫 번째 줄' },
  '{': { name: '이전 문단 시작', desc: '이전 문단 경계(빈 줄)까지' },
  '}': { name: '다음 문단 시작', desc: '다음 문단 경계(빈 줄)까지' },
});


/**
 * 연산자 정보 매핑
 */
const OPERATOR_INFOS: Record<
  string,
  { name: string; action: string; completion: string }
> = localized({
  d: { name: '삭제 (Delete)', action: '잘라내어(삭제)', completion: '잘라내어 저장합니다.' },
  c: { name: '변경 (Change)', action: '잘라내고 INSERT 전환', completion: '잘라내고 즉시 INSERT 모드로 전환합니다.' },
  y: { name: '복사 (Yank)', action: '클립보드 복사(Yank)', completion: '클립보드에 복사(Yank)합니다.' },
  gu: { name: '소문자 변환 (Lowercase)', action: '소문자 변환', completion: '모든 영문자를 소문자로 변환합니다.' },
  gU: { name: '대문자 변환 (Uppercase)', action: '대문자 변환', completion: '모든 영문자를 대문자로 변환합니다.' },
  'g~': { name: '대소문자 반전 (Toggle Case)', action: '대소문자 반전', completion: '대소문자를 서로 반전시킵니다.' },
  gc: { name: '주석 토글 (Comment Toggle)', action: '주석 처리/해제', completion: '대상 줄의 주석을 토글합니다.' },
  '>': { name: '들여쓰기 (Indent)', action: '오른쪽 들여쓰기', completion: '오른쪽으로 들여쓰기합니다.' },
  '<': { name: '내어쓰기 (Unindent)', action: '왼쪽 내어쓰기', completion: '왼쪽으로 내어쓰기합니다.' },
  '=': { name: '자동 서식 정렬 (Auto-Format)', action: '자동 들여쓰기', completion: '들여쓰기를 자동으로 정렬합니다.' },
  v: { name: '비주얼 선택 (Visual)', action: '영역 선택', completion: '영역을 블록으로 선택합니다.' },
});

/**
 * 레지스터 한국어 서술 생성
 */
function getRegisterDescription(reg: string): string {
  if (reg === '0') return t('복사 전용 레지스터 0 (삭제 연산에 의해 덮어쓰이지 않음)');
  if (reg === '_') return t('블랙홀 레지스터 (삭제 내용 폐기)');
  if (reg === '+') return t('시스템 클립보드 레지스터 (+)');
  if (reg === '"') return t('기본 익명 레지스터');
  return t('\'{reg}\' 명명된 레지스터', { reg });
}

/**
 * 연산자 대기(Operator-Pending) 상태일 때 제공할 후보군 생성
 */
function getOperatorCandidates(op: string, count1?: number): CandidateCategory[] {
  const categories: CandidateCategory[] = [];

  // 1. 텍스트 객체 후보 (Text Objects)
  categories.push({
    category: t('텍스트 객체 (Text Objects)'),
    items: [
      { key: 'iw', name: t('단어 내부'), example: `${op}iw`, description: t('공백 제외 단어 본체') },
      { key: 'aw', name: t('단어 전체'), example: `${op}aw`, description: t('단어와 주변 공백 포함') },
      { key: 'i"', name: t('큰따옴표 안'), example: `${op}i"`, description: t('문자열 내용만') },
      { key: 'a"', name: t('큰따옴표 전체'), example: `${op}a"`, description: t('따옴표 기호까지 포함') },
      { key: 'i(', name: t('소괄호 안'), example: `${op}i(`, description: t('함수 인자/조건문 내용') },
      { key: 'a(', name: t('소괄호 전체'), example: `${op}a(`, description: t('소괄호 기호까지 포함') },
      { key: 'i{', name: t('중괄호 안'), example: `${op}i{`, description: t('블록/객체 내부 코드') },
      { key: 'a{', name: t('중괄호 전체'), example: `${op}a{`, description: t('중괄호 블록 전체') },
    ],
  });

  // 2. 단어 모션 후보 (Word Motions)
  categories.push({
    category: t('단어 이동 모션 (Word Motions)'),
    items: [
      { key: 'w', name: t('다음 단어'), example: `${op}w`, description: t('다음 단어 시작 위치까지') },
      { key: 'b', name: t('이전 단어'), example: `${op}b`, description: t('이전 단어 시작 위치까지') },
      { key: 'e', name: t('단어 끝'), example: `${op}e`, description: t('단어의 마지막 문자까지') },
    ],
  });

  // 3. 줄 단위 모션 (Line Motions)
  categories.push({
    category: t('줄 단위 모션 (Line Motions)'),
    items: [
      { key: '$', name: t('줄 끝까지'), example: `${op}$`, description: t('커서부터 현재 줄 끝까지') },
      { key: '0', name: t('줄 맨 앞까지'), example: `${op}0`, description: t('줄의 0번째 열까지') },
      { key: '^', name: t('첫 글자까지'), example: `${op}^`, description: t('들여쓰기 후 첫 문자까지') },
      { key: '%', name: t('짝 괄호까지'), example: `${op}%`, description: t('대응되는 괄호 영역') },
      { key: '}', name: t('다음 문단까지'), example: `${op}}`, description: t('다음 문단 경계(빈 줄)까지') },
      { key: '{', name: t('이전 문단까지'), example: `${op}{`, description: t('이전 문단 경계(빈 줄)까지') },
    ],
  });


  // 4. 동일 연산자 연타 (Line Operator - dd, cc, yy)
  if (['d', 'c', 'y'].includes(op)) {
    categories.push({
      category: t('줄 전체 연산 (Line Operator)'),
      items: [
        {
          key: op,
          name: t('현재 줄 전체 {v} ({op}{op})', { v: op === 'd' ? t('삭제') : op === 'c' ? t('변경') : t('복사'), op }),
          example: `${op}${op}`,
          description: t('현재 커서 줄{v} 전체 적용', { v: count1 && count1 > 1 ? t('부터 {count1}줄', { count1 }) : '' }),
        },
      ],
    });
  }

  // 5. 모션 배수 (Multiplier)
  categories.push({
    category: t('모션 배수 (Multiplier)'),
    items: [
      { key: '2', name: t('2배 범위'), example: `${op}2w`, description: t('연산 범위를 2배로 확장') },
      { key: '3', name: t('3배 범위'), example: `${op}3w`, description: t('연산 범위를 3배로 확장') },
      { key: '5', name: t('5배 범위'), example: `${op}5w`, description: t('연산 범위를 5배로 확장') },
    ],
  });

  return categories;
}

/**
 * 텍스트 객체 수정자(i/a) 대기 상태 후보군 생성
 */
function getModifierCandidates(op: string, modifier: 'i' | 'a'): CandidateCategory[] {
  const modLabel = modifier === 'i' ? t('내부 (Inner)') : t('주변 전체 (Around)');
  return [
    {
      category: t('대상 텍스트 객체 ({modLabel})', { modLabel }),
      items: [
        { key: 'w', name: t('단어 (Word)'), example: `${op}${modifier}w` },
        { key: '"', name: t('큰따옴표 ("...")'), example: `${op}${modifier}"` },
        { key: "'", name: t('작은따옴표 (\'...\')'), example: `${op}${modifier}'` },
        { key: '(', name: t('소괄호 ((...))'), example: `${op}${modifier}(` },
        { key: '{', name: t('중괄호 ({...})'), example: `${op}${modifier}{` },
        { key: '[', name: t('대괄호 ([...])'), example: `${op}${modifier}[` },
        { key: 't', name: t('HTML/XML 태그'), example: `${op}${modifier}t` },
      ],
    },
  ];
}

/**
 * Vim 명령어를 파싱하여 시각적 AST 노드들과 한국어 해석 문장을 생성합니다.
 * @param commandRaw 입력 명령어 문자열 (예: '"a2d3aw', '3ci"', '5dd', 'y$', '10j', 'guaw', 'ci')
 * @param activeRegister 외부에서 전달된 현재 선택 레지스터
 */
export function parseVimGrammar(
  commandRaw: string,
  activeRegister?: string | null
): VimGrammarAST {
  let str = (commandRaw || '').trim();

  // 만약 commandRaw에 레지스터 접두사가 없는데 activeRegister가 주어진 경우 보정
  if (activeRegister && !str.startsWith(`"${activeRegister}`) && !str.startsWith('"')) {
    str = `"${activeRegister}${str}`;
  }

  const nodes: ASTNode[] = [];
  let remaining = str;

  // 1. 레지스터 파싱: "a, "0, "_ 등
  let register: string | undefined = undefined;
  const regMatch = remaining.match(/^"([a-zA-Z0-9"+_]?)/);
  if (regMatch) {
    const regChar = regMatch[1];
    remaining = remaining.slice(regMatch[0].length);
    register = regChar;

    if (!regChar) {
      // " 만 입력된 레지스터 대기 상태
      nodes.push({
        type: 'register',
        raw: '"',
        label: t('대상 레지스터 (Register)'),
        description: t('레지스터 이름(a-z, 0-9, _, +) 대기 중...'),
        isPending: true,
      });
      return {
        rawCommand: str,
        nodes,
        isComplete: false,
        isOperatorPending: false,
        explanation: t('명령을 저장하거나 가져올 레지스터 이름을 입력하세요 (예: "a, "0, "_).'),
        totalEffectiveCount: 1,
      };
    } else {
      nodes.push({
        type: 'register',
        raw: `"${regChar}`,
        label: t('대상 레지스터 (Register)'),
        description: getRegisterDescription(regChar),
      });
    }
  }

  // 2. 첫 번째 카운트(Count1) 파싱: 예) 2 in 2d3aw, 5 in 5dd
  let count1: number | undefined = undefined;
  const count1Match = remaining.match(/^([1-9][0-9]*)/);
  if (count1Match) {
    count1 = parseInt(count1Match[1], 10);
    remaining = remaining.slice(count1Match[0].length);
    nodes.push({
      type: 'count1',
      raw: count1Match[1],
      label: t('반복 횟수 (Count)'),
      description: t('{count1}회 반복 실행', { count1 }),
    });
  }

  // 3. 단독 명령(Action/Motion) 또는 연산자(Operator) 파싱
  if (remaining.length === 0) {
    // 숫자 또는 레지스터만 입력된 상태
    const hasCount = count1 !== undefined;
    const hasReg = register !== undefined;
    let exp = t('명령을 계속 입력하세요.');
    if (hasReg && hasCount) {
      exp = t('레지스터 {register}에 {count1}회 실행할 연산자나 모션을 입력하세요.', { register, count1 });
    } else if (hasReg) {
      exp = t('레지스터 {register}를 사용할 연산자(d, c, y, p 등)를 입력하세요.', { register });
    } else if (hasCount) {
      exp = t('{count1}회 반복할 이동(j, k, w 등) 또는 연산자(d, c, y 등)를 입력하세요.', { count1 });
    }

    return {
      rawCommand: str,
      nodes,
      isComplete: false,
      isOperatorPending: false,
      explanation: exp,
      totalEffectiveCount: count1 ?? 1,
    };
  }

  // 연산자 접두사 매칭: d, c, y, gu, gU, g~, >, <, =, v
  const opMatch = remaining.match(/^(g[uU~]|d|c|y|>|<|=|v)/);

  if (opMatch) {
    const op = opMatch[1];
    remaining = remaining.slice(op.length);
    const opInfo = OPERATOR_INFOS[op] || {
      name: op,
      action: op,
      completion: t('{op} 연산을 실행합니다.', { op }),
    };

    // 만약 op 뒤에 아무것도 없다면 -> Operator-Pending 상태
    if (remaining.length === 0) {
      nodes.push({
        type: 'operator',
        raw: op,
        label: t('{name} 연산자', { name: opInfo.name }),
        description: t('{action} (대기 중)', { action: opInfo.action }),
        isPending: true,
      });

      const regPrefix = register ? t('레지스터 \'{register}\'에 ', { register }) : '';
      const countPrefix = count1 ? t('{count1}회 ', { count1 }) : '';
      const exp = t('{regPrefix}{countPrefix}{name} 대기 중... 적용할 모션(w, $, %) 또는 텍스트 객체(iw, i", a()를 입력하세요.', { regPrefix, countPrefix, name: opInfo.name });

      return {
        rawCommand: str,
        nodes,
        isComplete: false,
        isOperatorPending: true,
        explanation: exp,
        candidates: getOperatorCandidates(op, count1),
        totalEffectiveCount: count1 ?? 1,
      };
    }

    // 4. 두 번째 카운트(Count2) 파싱: 예) 3 in 2d3aw, 2 in c2w
    let count2: number | undefined = undefined;
    const count2Match = remaining.match(/^([1-9][0-9]*)/);
    if (count2Match) {
      count2 = parseInt(count2Match[1], 10);
      remaining = remaining.slice(count2Match[0].length);
    }

    // 연산자 노드 추가
    nodes.push({
      type: 'operator',
      raw: op,
      label: t('{name} 연산자', { name: opInfo.name }),
      description: opInfo.action,
    });

    if (count2 !== undefined) {
      nodes.push({
        type: 'count2',
        raw: String(count2),
        label: t('모션 배수 (Motion Multiplier)'),
        description: t('{count2}배 범위 적용', { count2 }),
      });
    }

    const totalCount = (count1 ?? 1) * (count2 ?? 1);

    // 연산자 뒤에 남은 것이 없다면 (예: 2d3)
    if (remaining.length === 0) {
      return {
        rawCommand: str,
        nodes,
        isComplete: false,
        isOperatorPending: true,
        explanation: t('총 {totalCount}배({v}×{v2}) 범위로 {name}할 모션을 입력하세요.', { totalCount, v: count1 ?? 1, v2: count2 ?? 1, name: opInfo.name }),
        candidates: getOperatorCandidates(op, totalCount),
        totalEffectiveCount: totalCount,
      };
    }

    // 5. 텍스트 객체(i/a) 검사
    const textObjModMatch = remaining.match(/^([ia])/);
    if (textObjModMatch) {
      const modifier = textObjModMatch[1] as 'i' | 'a';
      const modLabel = modifier === 'i' ? t('내부 (Inner)') : t('주변 전체 (Around)');
      remaining = remaining.slice(1);

      if (remaining.length === 0) {
        // di, ci, ya 등 수정자만 누른 상태
        nodes.push({
          type: 'modifier_pending',
          raw: modifier,
          label: t('텍스트 객체 한정자: {modLabel}', { modLabel }),
          description: t('대상 객체(w, ", \', (, {, [ 등) 입력 대기 중...'),
          isPending: true,
        });

        return {
          rawCommand: str,
          nodes,
          isComplete: false,
          isOperatorPending: true,
          explanation: t('{modLabel}로 선택할 대상(w: 단어, ": 따옴표, (: 괄호 등)을 입력하세요.', { modLabel }),
          candidates: getModifierCandidates(op, modifier),
          totalEffectiveCount: totalCount,
        };
      }

      // 대상 객체 파싱
      const targetChar = remaining[0];
      const targetObj = TEXT_OBJECT_NAMES[targetChar] || {
        name: t('\'{targetChar}\' 객체', { targetChar }),
        desc: t('\'{targetChar}\' 객체', { targetChar }),
      };

      nodes.push({
        type: 'text_object',
        raw: `${modifier}${targetChar}`,
        label: t('{name} 텍스트 객체', { name: targetObj.name }),
        description: `${modLabel} ${targetObj.desc}`,
      });

      // 자연어 문장 완성
      const regPart = register ? t('레지스터 {register}에 ', { register }) : '';
      const countPart =
        count1 && count2
          ? t('{totalCount}개({count1}×{count2})의 ', { totalCount, count1, count2 })
          : totalCount > 1
          ? t('{totalCount}개의 ', { totalCount })
          : '';

      const objectDesc =
        modifier === 'i'
          ? targetChar === 'w'
            ? t('단어(공백 제외)')
            : t('{desc} 내부 내용', { desc: targetObj.desc })
          : targetChar === 'w'
          ? t('단어(주변 공백 포함)')
          : t('{desc}와 기호 전체', { desc: targetObj.desc });

      const explanation = t('{regPart}현재 위치부터 {countPart}{objectDesc}를 {completion}', { regPart, countPart, objectDesc, completion: opInfo.completion });

      return {
        rawCommand: str,
        nodes,
        isComplete: true,
        isOperatorPending: false,
        explanation,
        totalEffectiveCount: totalCount,
      };
    }

    // 6. 라인 연산자 반복 검사 (dd, cc, yy)
    if (remaining === op && ['d', 'c', 'y'].includes(op)) {
      nodes.push({
        type: 'motion',
        raw: op,
        label: t('현재 줄 단위 (Line)'),
        description: t('현재 커서 줄'),
      });

      const regPart = register ? t('레지스터 {register}에 ', { register }) : '';
      const countPart = totalCount > 1 ? t('아래로 {totalCount}줄을 ', { totalCount }) : t('현재 줄을 ');
      const explanation = `${regPart}${countPart}${opInfo.completion}`;

      return {
        rawCommand: str,
        nodes,
        isComplete: true,
        isOperatorPending: false,
        explanation,
        totalEffectiveCount: totalCount,
      };
    }

    // 7. 일반 모션 검사 (w, b, e, $, 0, ^, %, {}, f{c}, t{c})
    const motionMatch = remaining.match(/^(f.|t.|F.|T.|ge|gg|[wbe$0^%jklhG{}])/);

    if (motionMatch) {
      const motionStr = motionMatch[1];
      const motionInfo = MOTION_NAMES[motionStr] || {
        name: motionStr,
        desc: t('{motionStr} 모션', { motionStr }),
      };

      nodes.push({
        type: 'motion',
        raw: motionStr,
        label: t('{name} 모션', { name: motionInfo.name }),
        description: motionInfo.desc,
      });

      const regPart = register ? t('레지스터 {register}에 ', { register }) : '';
      const countPart = totalCount > 1 ? t('{totalCount}회 ', { totalCount }) : '';
      const explanation = t('{regPart}현재 커서 위치부터 {countPart}{desc}의 내용을 {completion}', { regPart, countPart, desc: motionInfo.desc, completion: opInfo.completion });

      return {
        rawCommand: str,
        nodes,
        isComplete: true,
        isOperatorPending: false,
        explanation,
        totalEffectiveCount: totalCount,
      };
    }
  }

  // 8. 독립형 액션 및 모션 (연산자 없이 단독 실행: x, p, P, u, Ctrl-r, ., hjkl, w, b, e, $, 0, gg, G, {, } 등)
  const standaloneActionMatch = remaining.match(/^(Ctrl-r|[xpPu.r.])/) || remaining.match(/^([hjklwbe$0^%G{}]|gg)/);

  if (standaloneActionMatch) {
    const actStr = standaloneActionMatch[1];
    const totalCount = count1 ?? 1;

    if (actStr === 'x') {
      nodes.push({
        type: 'action',
        raw: 'x',
        label: t('문자 삭제 (Delete Char)'),
        description: t('커서 위치 문자 1개 삭제'),
      });
      const regPart = register ? t('레지스터 {register}에 ', { register }) : '';
      const countPart = totalCount > 1 ? t('{totalCount}개 ', { totalCount }) : '';
      return {
        rawCommand: str,
        nodes,
        isComplete: true,
        isOperatorPending: false,
        explanation: t('{regPart}커서 위치의 문자 {countPart}를 삭제합니다.', { regPart, countPart }),
        totalEffectiveCount: totalCount,
      };
    }

    if (actStr === 'p' || actStr === 'P') {
      nodes.push({
        type: 'action',
        raw: actStr,
        label: actStr === 'p' ? t('뒤에 붙여넣기 (Put After)') : t('앞에 붙여넣기 (Put Before)'),
        description: t('레지스터 내용 붙여넣기'),
      });
      const regDesc = register ? getRegisterDescription(register) : t('클립보드');
      const dirDesc = actStr === 'p' ? t('현재 커서 뒤') : t('현재 커서 앞');
      return {
        rawCommand: str,
        nodes,
        isComplete: true,
        isOperatorPending: false,
        explanation: t('{regDesc}에 저장된 내용을 {dirDesc}에 {v}붙여넣습니다.', { regDesc, dirDesc, v: totalCount > 1 ? t('{totalCount}회 반복하여 ', { totalCount }) : '' }),
        totalEffectiveCount: totalCount,
      };
    }

    if (actStr === 'u') {
      nodes.push({
        type: 'action',
        raw: 'u',
        label: t('실행 취소 (Undo)'),
        description: t('직전 편집 취소'),
      });
      return {
        rawCommand: str,
        nodes,
        isComplete: true,
        isOperatorPending: false,
        explanation: t('직전 편집 작업을 실행 취소(Undo)합니다.'),
        totalEffectiveCount: 1,
      };
    }

    if (actStr === '.') {
      nodes.push({
        type: 'action',
        raw: '.',
        label: t('마지막 변경 반복 (Dot Repeat)'),
        description: t('직전 변경 명령 재실행'),
      });
      return {
        rawCommand: str,
        nodes,
        isComplete: true,
        isOperatorPending: false,
        explanation: t('마지막으로 실행한 변경 명령을 그대로 다시 반복(Repeat)합니다.'),
        totalEffectiveCount: totalCount,
      };
    }

    // 독립 모션 (hjkl, w, b, e 등)
    const mInfo = MOTION_NAMES[actStr] || { name: actStr, desc: actStr };
    nodes.push({
      type: 'motion',
      raw: actStr,
      label: t('{name} 이동', { name: mInfo.name }),
      description: mInfo.desc,
    });
    return {
      rawCommand: str,
      nodes,
      isComplete: true,
      isOperatorPending: false,
      explanation: t('커서를 {desc} 방향으로 {v}이동합니다.', { desc: mInfo.desc, v: totalCount > 1 ? t('{totalCount}회 ', { totalCount }) : '' }),
      totalEffectiveCount: totalCount,
    };
  }

  // 매칭되지 않는 일반/미완성 키
  nodes.push({
    type: 'pending',
    raw: remaining,
    label: t('키 입력 (Input)'),
    description: `'${remaining}'`,
  });

  return {
    rawCommand: str,
    nodes,
    isComplete: false,
    isOperatorPending: false,
    explanation: t("'{str}' 명령을 분석 중입니다.", { str }),
    totalEffectiveCount: count1 ?? 1,
  };
}
