import { Mission } from '../types/mission';
import { VirtualTestSpec, evaluateVirtualTests } from '../vim-engine';
import { i18nKey } from '../i18n';
import { STORAGE_KEYS, readStorageJson, writeStorageJson } from '../utils/localStorageClient';

export interface CapstoneProject {
  id: string;
  icon: string;
  difficultyKey: string;
  titleKey: string;
  summaryKey: string;
  descriptionKey: string;
  hintKey: string;
  par: number;
  recommendedTools: string[];
  primaryFilename: string;
  initialLines: string[];
  initialVirtualFiles: Record<string, string[]>;
  initialHarpoonList: string[];
  tests: VirtualTestSpec[];
}

export interface CapstoneCompletionRecord {
  completed: boolean;
  bestKeystrokes: number;
  completedAt: number;
}

export type CapstoneProgressMap = Record<string, CapstoneCompletionRecord>;

export const CAPSTONE_PROJECTS: readonly CapstoneProject[] = [
  {
    id: 'capstone-api-v2',
    icon: '🚀',
    difficultyKey: i18nKey('실무 · 중급'),
    titleKey: i18nKey('캡스톤 1: 레거시 API v1 → v2 마이그레이션'),
    summaryKey: i18nKey('3개 파일의 v1 엔드포인트 일괄 전환 · 디버그 플래그 비활성화 · FIXME 정리'),
    descriptionKey: i18nKey(
      '멀티파일 서비스(src/config.ts, src/client.ts, src/worker.ts)의 레거시 v1 API 를 v2 로 안전하게 마이그레이션하세요.\n어떤 Vim/Neovim 명령을 조합해도 좋으며, 모든 조건을 만족한 뒤 :TestRun (또는 :ToggleTerm 에서 npm test) 을 실행해 테스트를 모두 통과하면 클리어됩니다!\n\n요구사항:\n1. src/config.ts: API_VERSION 을 "v2" 로 올리고 debugMode 를 false 로 끄세요.\n2. src/client.ts: 모든 /v1/ 경로를 /v2/ 로 교체하세요. (:Spectre /v1/ /v2/ 추천)\n3. src/worker.ts: /v1/ 경로를 /v2/ 로 교체하고 FIXME 주석 줄을 제거하세요. (:Trouble todo 추천)'
    ),
    hintKey: i18nKey(':Spectre /v1/ /v2/ → :SpectreApply → src/config.ts 에서 f1 r2 및 Ctrl-a → src/worker.ts FIXME 삭제 → :TestRun'),
    par: 65,
    recommendedTools: [':Spectre', ':Trouble todo', 'Ctrl-a', ':HarpoonMenu', ':TestRun'],
    primaryFilename: 'src/config.ts',
    initialLines: [
      'export const API_VERSION = "v1";',
      'export const debugMode = true;',
      'export const TIMEOUT_MS = 5000;',
    ],
    initialVirtualFiles: {
      'src/config.ts': [
        'export const API_VERSION = "v1";',
        'export const debugMode = true;',
        'export const TIMEOUT_MS = 5000;',
      ],
      'src/client.ts': [
        'export const USERS_URL = "https://api.service.local/v1/users";',
        'export const ORDERS_URL = "https://api.service.local/v1/orders";',
      ],
      'src/worker.ts': [
        '// FIXME: remove legacy v1 webhook after migration',
        'export const WEBHOOK_URL = "https://api.service.local/v1/hooks";',
      ],
    },
    initialHarpoonList: ['src/config.ts', 'src/client.ts', 'src/worker.ts'],
    tests: [
      {
        id: 'api-config-version',
        name: 'config: API_VERSION is v2',
        file: 'src/config.ts',
        mustContain: ['API_VERSION = "v2"'],
        mustNotContain: ['"v1"'],
      },
      {
        id: 'api-config-debug',
        name: 'config: debugMode disabled in prod',
        file: 'src/config.ts',
        mustContain: ['debugMode = false'],
      },
      {
        id: 'api-client-v2',
        name: 'client: all endpoints migrated to /v2/',
        file: 'src/client.ts',
        mustContain: ['/v2/users', '/v2/orders'],
        mustNotContain: ['/v1/'],
      },
      {
        id: 'api-worker-clean',
        name: 'worker: migrated to /v2/ and FIXME removed',
        file: 'src/worker.ts',
        mustContain: ['/v2/hooks'],
        mustNotContain: ['/v1/', 'FIXME'],
      },
    ],
  },
  {
    id: 'capstone-hotfix',
    icon: '🐛',
    difficultyKey: i18nKey('실무 · 장애 대응'),
    titleKey: i18nKey('캡스톤 2: 프로덕션 장애 5분 핫픽스'),
    summaryKey: i18nKey('인증 연산자 취약점 수정 · 게스트 차단 · 변수명 camelCase 정규화 · 헬스체크 복구'),
    descriptionKey: i18nKey(
      '긴급 프로덕션 장애가 발생했습니다! 3개 파일(src/auth.ts, src/rateLimit.ts, src/health.ts)에 숨어 있는 버그를 빠르게 수정하고 :TestRun (또는 터미널 npm test) 으로 장애 복구를 검증하세요.\n\n요구사항:\n1. src/auth.ts: 느슨한 비교(==)를 엄격한 비교(===)로 바꾸고 allowGuest 를 false 로 차단하세요.\n2. src/rateLimit.ts: max_retry_count 식별자를 camelCase(maxRetryCount)로 정규화하고(crc), MAX_LIMIT 을 100 으로 설정하세요.\n3. src/health.ts: status 를 "healthy" 로 복구하세요.'
    ),
    hintKey: i18nKey('src/auth.ts 에서 === 수정 & Ctrl-a → :Harpoon 2 로 rateLimit.ts 이동해 crc & cw100 → :Harpoon 3 에서 ci" healthy → :TestRun'),
    par: 55,
    recommendedTools: [':Harpoon [1-3]', 'crc', 'Ctrl-a', 'gs', ':ToggleTerm (npm test)'],
    primaryFilename: 'src/auth.ts',
    initialLines: [
      'export const allowGuest = true;',
      'export function verifyToken(token: string, expected: string): boolean {',
      '  return token == expected;',
      '}',
    ],
    initialVirtualFiles: {
      'src/auth.ts': [
        'export const allowGuest = true;',
        'export function verifyToken(token: string, expected: string): boolean {',
        '  return token == expected;',
        '}',
      ],
      'src/rateLimit.ts': [
        'export const max_retry_count = 3;',
        'export const MAX_LIMIT = 0;',
      ],
      'src/health.ts': [
        'export const healthCheck = { status: "degraded", uptime: 99 };',
      ],
    },
    initialHarpoonList: ['src/auth.ts', 'src/rateLimit.ts', 'src/health.ts'],
    tests: [
      {
        id: 'hotfix-auth-guest',
        name: 'auth: guest access blocked',
        file: 'src/auth.ts',
        mustContain: ['allowGuest = false'],
      },
      {
        id: 'hotfix-auth-strict',
        name: 'auth: strict token comparison (===)',
        file: 'src/auth.ts',
        mustContain: ['token === expected'],
      },
      {
        id: 'hotfix-ratelimit',
        name: 'rateLimit: camelCase + MAX_LIMIT = 100',
        file: 'src/rateLimit.ts',
        mustContain: ['maxRetryCount', 'MAX_LIMIT = 100'],
        mustNotContain: ['max_retry_count'],
      },
      {
        id: 'hotfix-health',
        name: 'health: status reports healthy',
        file: 'src/health.ts',
        mustContain: ['"healthy"'],
        mustNotContain: ['"degraded"'],
      },
    ],
  },
  {
    id: 'capstone-pr-review',
    icon: '✨',
    difficultyKey: i18nKey('실무 · 고급'),
    titleKey: i18nKey('캡스톤 3: PR 코드 리뷰 4건 일괄 반영'),
    summaryKey: i18nKey('LSP 코드 액션(gra) · treesj 멀티라인 분할(gS) · 상수 UPPER_SNAKE(cru) · 릴리스 날짜 갱신'),
    descriptionKey: i18nKey(
      '팀원의 PR 리뷰 코멘트 4건을 현대 Neovim 도구(gra, gS, cru, Ctrl-a, :Harpoon)로 깔끔하게 반영하고 :TestRun 으로 CI 테스트를 통과시키세요!\n\n요구사항:\n1. src/userService.ts: var 선언을 const 로 바꾸고(gra → 1), TODO 주석을 삭제하세요.\n2. src/formatters.ts: 한 줄 defaultOpts 객체를 멀티라인 블록으로 펼치세요(gS).\n3. src/constants.ts: default_timeout 을 DEFAULT_TIMEOUT 으로 변환(cru)하고, releaseDate 를 "2026-11-23" 으로 하루 올리세요(Ctrl-a).'
    ),
    hintKey: i18nKey('src/userService.ts 에서 dd & gra → 1 → :Harpoon 2 에서 gS → :Harpoon 3 에서 w cru 및 j Ctrl-a → :TestRun'),
    par: 50,
    recommendedTools: ['gra', 'gS (:TSJToggle)', 'cru', 'Ctrl-a', ':HarpoonMenu', ':TestRun'],
    primaryFilename: 'src/userService.ts',
    initialLines: [
      '// TODO: replace var with const before merge',
      'var activeUsers = ["alice", "bob"];',
      'export const countUsers = () => activeUsers.length;',
    ],
    initialVirtualFiles: {
      'src/userService.ts': [
        '// TODO: replace var with const before merge',
        'var activeUsers = ["alice", "bob"];',
        'export const countUsers = () => activeUsers.length;',
      ],
      'src/formatters.ts': [
        'export const defaultOpts = { trim: true, upper: false, locale: "ko" };',
      ],
      'src/constants.ts': [
        'export const default_timeout = 3000;',
        'export const releaseDate = "2026-11-22";',
      ],
    },
    initialHarpoonList: ['src/userService.ts', 'src/formatters.ts', 'src/constants.ts'],
    tests: [
      {
        id: 'pr-userservice-const',
        name: 'userService: const declaration & TODO cleared',
        file: 'src/userService.ts',
        mustContain: ['const activeUsers'],
        mustNotContain: ['var activeUsers', 'TODO'],
      },
      {
        id: 'pr-formatters-split',
        name: 'formatters: defaultOpts split into multiline block',
        file: 'src/formatters.ts',
        mustContain: ['trim: true', 'upper: false', 'locale: "ko"'],
        minLines: 4,
      },
      {
        id: 'pr-constants-upper',
        name: 'constants: DEFAULT_TIMEOUT screaming snake case',
        file: 'src/constants.ts',
        mustContain: ['DEFAULT_TIMEOUT'],
        mustNotContain: ['default_timeout'],
      },
      {
        id: 'pr-constants-date',
        name: 'constants: releaseDate bumped to 2026-11-23',
        file: 'src/constants.ts',
        mustContain: ['"2026-11-23"'],
      },
    ],
  },
];

export function loadCapstoneProgress(): CapstoneProgressMap {
  return readStorageJson<CapstoneProgressMap>(STORAGE_KEYS.CAPSTONE_PROGRESS, {});
}

export function saveCapstoneCompletion(
  capstoneId: string,
  keystrokes: number
): CapstoneProgressMap {
  const prev = loadCapstoneProgress();
  const existing = prev[capstoneId];
  const next: CapstoneProgressMap = {
    ...prev,
    [capstoneId]: {
      completed: true,
      bestKeystrokes:
        existing && existing.bestKeystrokes > 0
          ? Math.min(existing.bestKeystrokes, keystrokes)
          : keystrokes,
      completedAt: Date.now(),
    },
  };
  writeStorageJson(STORAGE_KEYS.CAPSTONE_PROGRESS, next);
  return next;
}

/**
 * 실무 멀티파일 캡스톤 프로젝트를 실행 가능한 Mission 객체로 변환합니다.
 * `:TestRun` 또는 터미널 `npm test` 실행 후 모든 테스트가 통과하거나,
 * 모든 가상 테스트 조건을 만족한 상태에서 `:TestRun` 이 통과하면 클리어됩니다.
 */
export function createCapstoneMission(project: CapstoneProject): Mission {
  return {
    id: 9000 + CAPSTONE_PROJECTS.findIndex((p) => p.id === project.id) + 1,
    title: project.titleKey,
    description: project.descriptionKey,
    hint: project.hintKey,
    par: project.par,
    primaryFilename: project.primaryFilename,
    initialLines: [...project.initialLines],
    initialCursor: { line: 0, col: 0 },
    initialVirtualFiles: Object.fromEntries(
      Object.entries(project.initialVirtualFiles).map(([k, v]) => [k, [...v]])
    ),
    initialHarpoonList: [...project.initialHarpoonList],
    initialVirtualTests: project.tests.map((spec) => ({ ...spec })),
    capstoneId: project.id,
    recommendedTools: [...project.recommendedTools],
    checkComplete: (state) => {
      // 모든 가상 테스트가 통과되었고 최소 1회 :TestRun(또는 npm test)으로 검증되었으면 클리어
      if (!state.lastTestRun || !state.lastTestRun.allPassed) return false;
      const { runResult } = evaluateVirtualTests(state);
      return runResult.allPassed;
    },
  };
}
