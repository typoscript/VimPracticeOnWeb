import { UserAnalyticsData, ProficiencyAxes, CommandFrequency, DailyRecord } from '../types/game';
import { LessonProgress } from './storage';

export const ANALYTICS_STORAGE_KEY = 'vim_user_analytics_v1';

export function getDefaultAnalytics(): UserAnalyticsData {
  return {
    totalKeystrokes: 0,
    keyFrequencies: {},
    antiPatternCounts: {},
    totalAntiPatternsTriggered: 0,
    arcadeBestScore: 0,
    arcadeHighestWave: 0,
    arcadeMaxCombo: 0,
    arcadeGamesPlayed: 0,
    dailyStreak: 0,
    dailyRecords: {},
  };
}

export function loadUserAnalytics(): UserAnalyticsData {
  try {
    const raw = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (!raw) return getDefaultAnalytics();
    const parsed = JSON.parse(raw);
    return {
      ...getDefaultAnalytics(),
      ...parsed,
    };
  } catch {
    return getDefaultAnalytics();
  }
}

export function saveUserAnalytics(data: UserAnalyticsData): void {
  try {
    localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 저장 공간 부족 등 예외 무시
  }
}

/**
 * 단일 키 입력 통계를 누적 기록합니다.
 */
export function recordKeyInputStats(key: string): void {
  const data = loadUserAnalytics();
  data.totalKeystrokes += 1;
  data.keyFrequencies[key] = (data.keyFrequencies[key] ?? 0) + 1;
  saveUserAnalytics(data);
}

/**
 * 안티패턴 감지 통계를 누적 기록합니다.
 */
export function recordAntiPatternDetection(adviceMsg: string): void {
  const data = loadUserAnalytics();
  data.totalAntiPatternsTriggered += 1;

  let patternKey = '기타 비효율 조작';
  if (adviceMsg.includes('x, dw, 또는 ciw')) {
    patternKey = 'Backspace 연타 (x/ciw 권장)';
  } else if (adviceMsg.includes('이동 키를 연타')) {
    patternKey = '방향키/hjkl 연타 (w/b/숫자 이동 권장)';
  } else if (adviceMsg.includes('대문자 A')) {
    patternKey = '$ 후 a (대문자 A 권장)';
  } else if (adviceMsg.includes('대문자 I')) {
    patternKey = '0 후 i (대문자 I 권장)';
  } else if (adviceMsg.includes('대문자 C')) {
    patternKey = 'c$ 입력 (대문자 C 권장)';
  } else if (adviceMsg.includes('대문자 D')) {
    patternKey = 'd$ 입력 (대문자 D 권장)';
  }

  data.antiPatternCounts[patternKey] = (data.antiPatternCounts[patternKey] ?? 0) + 1;
  saveUserAnalytics(data);
}

/**
 * 아케이드 서바이벌 종료 시 최고 기록을 갱신합니다.
 */
export function saveArcadeRecord(score: number, wave: number, maxCombo: number): {
  isNewBestScore: boolean;
  data: UserAnalyticsData;
} {
  const data = loadUserAnalytics();
  data.arcadeGamesPlayed += 1;
  const isNewBestScore = score > data.arcadeBestScore;

  if (isNewBestScore) {
    data.arcadeBestScore = score;
  }
  if (wave > data.arcadeHighestWave) {
    data.arcadeHighestWave = wave;
  }
  if (maxCombo > data.arcadeMaxCombo) {
    data.arcadeMaxCombo = maxCombo;
  }

  saveUserAnalytics(data);
  return { isNewBestScore, data };
}

/**
 * 데일리 챌린지 클리어 기록을 저장하고 연속 출석 스트릭을 계산합니다.
 */
export function saveDailyRecord(record: DailyRecord): UserAnalyticsData {
  const data = loadUserAnalytics();
  data.dailyRecords[record.date] = record;

  // 연속 출석 일수 (Streak) 계산
  if (data.lastDailyDate) {
    const last = new Date(data.lastDailyDate);
    const curr = new Date(record.date);
    const diffDays = Math.round((curr.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      data.dailyStreak += 1;
    } else if (diffDays > 1) {
      data.dailyStreak = 1;
    }
  } else {
    data.dailyStreak = 1;
  }

  data.lastDailyDate = record.date;
  saveUserAnalytics(data);
  return data;
}

/**
 * 상위 빈도 사용 명령어 목록을 반환합니다.
 */
export function getTopCommands(analytics: UserAnalyticsData, limit = 10): CommandFrequency[] {
  const friendlyLabels: Record<string, string> = {
    h: '왼쪽 이동',
    j: '아래 이동',
    k: '위로 이동',
    l: '오른쪽 이동',
    w: '다음 단어',
    b: '이전 단어',
    e: '단어 끝',
    $: '줄 끝 이동',
    '0': '줄 맨 앞',
    '^': '첫 비공백 문자',
    i: '입력 모드',
    a: '뒤에 입력',
    I: '줄 앞 입력',
    A: '줄 끝 입력',
    o: '아래 줄 생성',
    O: '윗 줄 생성',
    x: '글자 삭제',
    dd: '줄 삭제',
    dw: '단어 삭제',
    cw: '단어 수정',
    cc: '줄 수정',
    C: '줄 끝 수정',
    D: '줄 끝 삭제',
    p: '붙여넣기',
    P: '앞에 붙여넣기',
    u: '실행 취소',
    'Ctrl-r': '다시 실행',
    '.': '직전 명령 반복',
    Escape: 'Normal 모드 복귀',
    '/': '키워드 검색',
    ':': '커맨드라인',
    'Ctrl-v': '비주얼 블록',
    'Ctrl-w': '창 분할/이동',
    '~': '대소문자 반전',
    'Ctrl-a': '숫자 증가',
  };

  const entries = Object.entries(analytics.keyFrequencies)
    .filter(([k]) => k.length > 0)
    .map(([key, count]) => ({
      key,
      count,
      label: friendlyLabels[key] ?? key,
    }))
    .sort((a, b) => b.count - a.count);

  return entries.slice(0, limit);
}

/**
 * 누적 통계와 레슨 기록을 종합하여 5개 축의 숙련도(0~100) 점수를 계산합니다.
 */
export function calculateProficiency(
  analytics: UserAnalyticsData,
  progress: LessonProgress
): ProficiencyAxes {
  const f = analytics.keyFrequencies;

  // 1. 기본 이동 (hjkl, w, b, e, 0, $, ^, gg, G)
  const navKeys = (f.h || 0) + (f.j || 0) + (f.k || 0) + (f.l || 0) +
                  (f.w || 0) + (f.b || 0) + (f.e || 0) + (f['0'] || 0) + (f.$ || 0) + (f['^'] || 0);
  const navScore = Math.min(100, Math.round(20 + Math.log10(Math.max(1, navKeys)) * 25));

  // 2. 정밀 타겟팅 (f, t, F, T, ;, ,, %, marks, jumps)
  const targetKeys = (f.f || 0) + (f.t || 0) + (f.F || 0) + (f.T || 0) +
                     (f[';'] || 0) + (f[','] || 0) + (f['%'] || 0) +
                     (f['m'] || 0) + (f["'"] || 0) + (f['Ctrl-o'] || 0) + (f['Ctrl-i'] || 0);
  const targetScore = Math.min(100, Math.round(15 + Math.log10(Math.max(1, targetKeys)) * 30));

  // 3. 텍스트 객체 (ciw, diw, ya", da(, etc. / 레슨 13, 14, 23 완료 여부)
  const textObjLessonsCompleted = [13, 14, 23].filter((id) => progress[id]?.completed).length;
  const textObjKeys = (f.c || 0) + (f.d || 0) + (f.y || 0) + (f.v || 0);
  const textObjScore = Math.min(
    100,
    Math.round(textObjLessonsCompleted * 20 + Math.log10(Math.max(1, textObjKeys)) * 15)
  );

  // 4. 대량 편집 (:s, :g, :norm, macros, visual block, splits / 레슨 17, 18, 19, 21, 22, 24)
  const batchLessons = [17, 18, 19, 21, 22, 24].filter((id) => progress[id]?.completed).length;
  const batchKeys = (f[':'] || 0) + (f['Ctrl-v'] || 0) + (f['q'] || 0) + (f['@'] || 0) + (f['Ctrl-w'] || 0);
  const batchScore = Math.min(
    100,
    Math.round(batchLessons * 12 + Math.log10(Math.max(1, batchKeys)) * 12)
  );

  // 5. 타수 효율성 (Golf Par 달성률 및 별점 비율)
  const lessonIds = Object.keys(progress).map(Number);
  const totalLessons = lessonIds.length;
  const threeStarCount = lessonIds.filter((id) => progress[id]?.bestStars === 3).length;
  const parEfficiencyRatio = totalLessons > 0 ? (threeStarCount / Math.max(1, totalLessons)) : 0;
  const efficiencyScore = Math.min(100, Math.round(20 + parEfficiencyRatio * 60 + Math.min(20, (analytics.arcadeMaxCombo || 0) * 2)));

  return {
    navigation: Math.max(10, Math.min(100, navScore)),
    targeting: Math.max(10, Math.min(100, targetScore)),
    textObjects: Math.max(10, Math.min(100, textObjScore)),
    batchEditing: Math.max(10, Math.min(100, batchScore)),
    efficiency: Math.max(10, Math.min(100, efficiencyScore)),
  };
}
