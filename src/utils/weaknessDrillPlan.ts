import type { UserAnalyticsData } from '../types/game';
import type { LessonProgress } from './storage';
import { i18nKey } from '../i18n';
import type { DojoProblem, ProMasterProblem } from '../components/HardcoreDojo/HardcoreDojo.types';
import {
  generateRelativeJumpProblem,
  generateFTSniperProblem,
  generateWordJumpProblem,
  generateProMasterProblem,
} from '../components/HardcoreDojo/drillGenerators';
import {
  analyzeWeaknesses,
  getCategoryMeta,
  type WeaknessCategoryId,
  type WeaknessDrillPlan,
  type WeaknessDrillQueueItem,
} from './weaknessDrillAnalyzer';

/*
 * 약점 맞춤 드릴 문제 생성 (분석 결과 → 10문제 큐).
 * 문제 생성기(drillGenerators)는 도장·분석 모달에서만 쓰이므로, 앱 시작 시 로드되는
 * 약점 분석(weaknessDrillAnalyzer, SRS 복습 큐에서 사용)과 분리해 첫 화면 번들에서 빠지게 합니다.
 */

type AntiPatternProblemSpec = Omit<ProMasterProblem, 'type' | 'index'> & {
  category: 'lineEndOps' | 'lineStartOps' | 'wordReplace';
};

export const ANTI_PATTERN_DRILL_BANK: AntiPatternProblemSpec[] = [
  // 1. 줄 끝 연산자 교정 ($ 후 a -> A, c$ -> C, d$ -> D)
  {
    category: 'lineEndOps',
    prompt: i18nKey('대문자 A로 줄 끝에 세미콜론(;)을 붙이세요!'),
    lines: ['const ready = true'],
    initialCursor: { line: 0, col: 6 },
    targetLines: ['const ready = true;'],
    hint: i18nKey('A;<Esc> (줄 끝 이동 + 입력 한 번에)'),
    optimalKeys: 'A;<Esc>',
  },
  {
    category: 'lineEndOps',
    prompt: i18nKey('대문자 C로 현재 위치부터 줄 끝 값을 "prod"; 로 교체하세요!'),
    lines: ['const mode = "dev";'],
    initialCursor: { line: 0, col: 13 },
    targetLines: ['const mode = "prod";'],
    hint: i18nKey('C"prod";<Esc> (c$ 대신 대문자 C)'),
    optimalKeys: 'C"prod";<Esc>',
  },
  {
    category: 'lineEndOps',
    prompt: i18nKey('대문자 D로 주석 끝까지 한 번에 삭제하세요!'),
    lines: ['const port = 8080; // legacy'],
    initialCursor: { line: 0, col: 19 },
    targetLines: ['const port = 8080; '],
    hint: i18nKey('D (d$ 대신 대문자 D 한 타)'),
    optimalKeys: 'D',
  },
  // 2. 줄 시작 연산자 교정 (0 후 i -> I)
  {
    category: 'lineStartOps',
    prompt: i18nKey('대문자 I로 줄 맨 앞에 export 를 추가하세요!'),
    lines: ['const VERSION = 2;'],
    initialCursor: { line: 0, col: 8 },
    targetLines: ['export const VERSION = 2;'],
    hint: i18nKey('Iexport <Esc> (0 후 i 대신 대문자 I)'),
    optimalKeys: 'Iexport <Esc>',
  },
  {
    category: 'lineStartOps',
    prompt: i18nKey('대문자 I로 현재 줄 맨 앞을 주석(// ) 처리하세요!'),
    lines: ['  console.log(token);'],
    initialCursor: { line: 0, col: 12 },
    targetLines: ['  // console.log(token);'],
    hint: i18nKey('I// <Esc> (들여쓰기 첫 글자 앞에 즉시 입력)'),
    optimalKeys: 'I// <Esc>',
  },
  // 3. 백스페이스 연타 교정 (ciw / dw / ci")
  {
    category: 'wordReplace',
    prompt: i18nKey('Backspace 대신 ciw 로 oldKey 를 apiKey 로 바꾸세요!'),
    lines: ['const key = oldKey;'],
    initialCursor: { line: 0, col: 14 },
    targetLines: ['const key = apiKey;'],
    hint: i18nKey('ciwapiKey<Esc>'),
    optimalKeys: 'ciwapiKey<Esc>',
  },
  {
    category: 'wordReplace',
    prompt: i18nKey('Backspace 대신 ci" 로 "guest" 를 "admin" 으로 바꾸세요!'),
    lines: ['const role = "guest";'],
    initialCursor: { line: 0, col: 15 },
    targetLines: ['const role = "admin";'],
    hint: i18nKey('ci"admin<Esc>'),
    optimalKeys: 'ci"admin<Esc>',
  },
  {
    category: 'wordReplace',
    prompt: i18nKey('dw 로 불필요한 temp 단어를 한 번에 삭제하세요!'),
    lines: ['let temp debugMode = true;'],
    initialCursor: { line: 0, col: 4 },
    targetLines: ['let debugMode = true;'],
    hint: i18nKey('dw'),
    optimalKeys: 'dw',
  },
];

function createProblemForWeaknessCategory(
  category: WeaknessCategoryId,
  slotIndex: number
): DojoProblem {
  switch (category) {
    case 'navigation':
      return slotIndex % 2 === 0
        ? generateRelativeJumpProblem()
        : generateWordJumpProblem(slotIndex);
    case 'targeting':
      return generateFTSniperProblem(slotIndex);
    case 'textObjects':
      return generateProMasterProblem(slotIndex);
    case 'lineEndOps':
    case 'lineStartOps':
    case 'wordReplace': {
      const bank = ANTI_PATTERN_DRILL_BANK.filter((item) => item.category === category);
      const spec = bank[slotIndex % bank.length];
      return {
        type: 'pro-master',
        index: slotIndex,
        prompt: spec.prompt,
        lines: [...spec.lines],
        initialCursor: { ...spec.initialCursor },
        targetLines: [...spec.targetLines],
        hint: spec.hint,
        optimalKeys: spec.optimalKeys,
      };
    }
  }
}

/**
 * 상위 3개 약점 비중(5 : 3 : 2)에 맞춰 10문제 개인화 드릴 큐를 생성합니다.
 */
export function buildWeaknessDrillPlan(
  analytics: UserAnalyticsData,
  progress: LessonProgress,
  totalCount = 10
): WeaknessDrillPlan {
  const { hasAnalyticsData, focuses } = analyzeWeaknesses(analytics, progress);
  const topWeaknesses = focuses.slice(0, 3);

  // 우선순위 교차 패턴 (1순위 5개, 2순위 3개, 3순위 2개)
  const slotOrder = [0, 1, 0, 2, 0, 1, 0, 2, 0, 1];
  const categorySlotCounter: Record<string, number> = {};
  const queue: WeaknessDrillQueueItem[] = [];

  for (let i = 0; i < totalCount; i++) {
    const focusIdx = slotOrder[i % slotOrder.length];
    const focus = topWeaknesses[focusIdx] ?? topWeaknesses[0];
    const catCount = categorySlotCounter[focus.id] ?? 0;
    categorySlotCounter[focus.id] = catCount + 1;

    const meta = getCategoryMeta(focus.id);
    queue.push({
      problem: createProblemForWeaknessCategory(focus.id, catCount),
      focusId: focus.id,
      focusBadge: meta.badgeKey,
      focusHint: meta.hintKey,
    });
  }

  return {
    hasAnalyticsData,
    topWeaknesses,
    queue,
  };
}
