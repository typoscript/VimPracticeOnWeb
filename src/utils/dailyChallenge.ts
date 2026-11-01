import { DailyChallengePuzzle } from '../types/game';

/**
 * 오늘 날짜를 'YYYY-MM-DD' 형식으로 반환합니다.
 */
export function getTodayDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 문자열(날짜)로부터 결정론적인 양의 정수 해시값을 생성합니다.
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * 고난도 일일 Vim Golf 리팩토링 문제 템플릿 목록
 */
const DAILY_TEMPLATES: Array<{
  title: string;
  description: string;
  hint: string;
  initialLines: string[];
  targetLines: string[];
  initialCursor: { line: number; col: number };
  par: number;
}> = [
  {
    title: 'React Hook 종속성 배열 및 화살표 함수 리팩토링',
    description: 'useEffect의 첫 번째 인자 함수를 간결하게 정리하고, 누락된 종속성 배열을 추가하세요.',
    hint: 'cw로 함수를 정리하고, A 키로 줄 끝으로 가 종속성 배열 [, [id]]을 추가하세요.',
    initialLines: [
      'useEffect(function() {',
      '  fetchUserData(id);',
      '});',
    ],
    targetLines: [
      'useEffect(() => {',
      '  fetchUserData(id);',
      '}, [id]);',
    ],
    initialCursor: { line: 0, col: 10 },
    par: 14,
  },
  {
    title: 'TypeScript Interface 타이핑 & 선택적 속성 변환',
    description: '기존 속성을 선택적 속성(?:)으로 변경하고 타입을 string으로 정확히 선언하세요.',
    hint: 'f: -> i? 로 ?를 넣고, ciw 로 any를 string으로 변경하세요.',
    initialLines: [
      'interface UserProfile {',
      '  id: number;',
      '  nickname: any;',
      '}',
    ],
    targetLines: [
      'interface UserProfile {',
      '  id: number;',
      '  nickname?: string;',
      '}',
    ],
    initialCursor: { line: 2, col: 2 },
    par: 13,
  },
  {
    title: '디버그 console.log 일괄 정리 및 세미콜론 정렬',
    description: '불필요한 디버그 줄을 삭제하고 반환값의 속성을 추출하세요.',
    hint: 'dd로 console.log를 지우고, ciw로 response를 data로 수정하세요.',
    initialLines: [
      'function parseResponse(response) {',
      '  console.log("raw response", response);',
      '  return response.payload;',
      '}',
    ],
    targetLines: [
      'function parseResponse(data) {',
      '  return data.payload;',
      '}',
    ],
    initialCursor: { line: 0, col: 23 },
    par: 11,
  },
  {
    title: '배열 파이프라인 filter & map 체이닝 변환',
    description: '반복문 대신 함수형 filter 체이닝으로 배열을 가공하세요.',
    hint: 'cw와 A를 활용해 조건식을 filter 함수로 변환하세요.',
    initialLines: [
      'const items = rawList;',
      'const active = items.filter(x => x.active);',
    ],
    targetLines: [
      'const items = rawList.filter(Boolean);',
      'const active = items.filter(x => x.active);',
    ],
    initialCursor: { line: 0, col: 21 },
    par: 15,
  },
  {
    title: 'JSON 키-값 쌍 포맷팅 및 따옴표 제거',
    description: '객체 리터럴의 불필요한 키 따옴표를 제거하고 값을 수정하세요.',
    hint: 'di" 로 따옴표를 지우거나 x로 정리한 뒤 ciw로 값을 변경하세요.',
    initialLines: [
      'export const config = {',
      '  "timeout": 1000,',
      '  "retries": 3,',
      '};',
    ],
    targetLines: [
      'export const config = {',
      '  timeout: 3000,',
      '  retries: 3,',
      '};',
    ],
    initialCursor: { line: 1, col: 2 },
    par: 12,
  },
  {
    title: 'CSS-in-JS 속성명 CamelCase 변환 및 단위 추가',
    description: 'kebab-case 속성명을 camelCase로 변환하고 px 단위를 추가하세요.',
    hint: '~로 대문자 변환하고 >>와 A로 단위를 보정하세요.',
    initialLines: [
      'const style = {',
      '  backgroundColor: "#fff",',
      '  margin: 10,',
      '};',
    ],
    targetLines: [
      'const style = {',
      '  backgroundColor: "#000",',
      '  margin: "10px",',
      '};',
    ],
    initialCursor: { line: 1, col: 20 },
    par: 15,
  },
];

/**
 * 날짜 문자열에 따라 결정론적으로 일일 챌린지 미션을 생성합니다.
 */
export function generateDailyChallenge(dateStr = getTodayDateString()): DailyChallengePuzzle {
  const hash = hashString(dateStr);
  const index = hash % DAILY_TEMPLATES.length;
  const template = DAILY_TEMPLATES[index];

  return {
    date: dateStr,
    id: 9000 + (hash % 1000),
    title: `[Daily ${dateStr}] ${template.title}`,
    description: template.description,
    hint: template.hint,
    initialLines: [...template.initialLines],
    targetLines: [...template.targetLines],
    initialCursor: { ...template.initialCursor },
    par: template.par,
  };
}

/**
 * Wordle 스타일의 결과 텍스트 카드를 생성합니다.
 */
export function formatWordleResultCard(record: {
  date: string;
  stars: number;
  keystrokes: number;
  par: number;
  elapsedSeconds: number;
}): string {
  const starBlocks =
    record.stars === 3 ? '🟩🟩🟩' : record.stars === 2 ? '🟩🟩🟨' : '🟩⬜⬜';

  return [
    `🟩 VimPractice Daily #${record.date}`,
    `${starBlocks} ⭐${record.stars}/3 | ⌨️ ${record.keystrokes} keys (Par: ${record.par}) | ⏱️ ${record.elapsedSeconds}s`,
    `https://vimpractice.web.app`,
  ].join('\n');
}

/**
 * 클립보드에 텍스트를 복사합니다.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback 시도
    }
  }

  // Fallback: 가상 textarea 생성
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
    }
  }

  return false;
}
