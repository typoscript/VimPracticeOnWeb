import { t } from '../i18n';

export const SANDBOX_PRIMARY_FILENAME = 'sandbox.ts';

export const SANDBOX_HARPOON_LIST: readonly string[] = [
  'sandbox.ts',
  'src/api.ts',
  'src/worker.ts',
];

/**
 * 자유 연습장 (Sandbox Mode) 초기 샘플 코드 스니펫
 */
export const SANDBOX_INITIAL_LINES: string[] = [
  '// 🧪 VimPracticeOnWeb 자유 연습장 (Sandbox Mode)',
  '// 미션 제약 없이 모든 Vim 명령어를 자유롭게 실험해 보세요!',
  '',
  'interface User {',
  '  id: number;',
  '  name: string;',
  '  role: "admin" | "editor" | "viewer";',
  '}',
  '',
  'function greet(user: User): string {',
  '  if (user.role === "admin") {',
  '    return `Welcome, Administrator ${user.name}!`;',
  '  }',
  '  return `Hello, ${user.name}!`;',
  '}',
  '',
  'const user: User = { id: 1, name: "Vim Master", role: "admin" };',
  'console.log(greet(user));',
];

/** 화면 언어로 번역한 자유 연습장 초기 코드 (주석 줄만 번역됨) */
export function sandboxInitialLines(): string[] {
  return SANDBOX_INITIAL_LINES.map((line) => t(line));
}

/**
 * 자유 연습장 멀티파일 가상 작업공간을 생성합니다.
 * `:Oil`, `:LiveGrep`, `:Trouble`, `:HarpoonMenu`, `:source init.lua` 등을 즉시 체험할 수 있습니다.
 */
export function createSandboxVirtualFiles(currentLines: string[]): Record<string, string[]> {
  return {
    [SANDBOX_PRIMARY_FILENAME]: [...currentLines],
    'src/api.ts': [
      '// TODO: migrate endpoint from v1 to v2',
      'export const API_ENDPOINT = "https://api.example.com/v1";',
      '',
      'export interface ApiResponse<T> {',
      '  ok: boolean;',
      '  data: T;',
      '}',
      '',
      'export async function fetchUser(id: number): Promise<ApiResponse<string>> {',
      '  const url = `${API_ENDPOINT}/users/${id}`;',
      '  return { ok: true, data: url };',
      '}',
    ],
    'src/worker.ts': [
      '// FIXME: increase retry limit before production deploy',
      'export const MAX_RETRY = 1;',
      '',
      'export function runWorker(taskName: string): string {',
      '  // NOTE: supports parallel job scheduling',
      '  return `[worker] executed ${taskName} (retries=${MAX_RETRY})`;',
      '}',
    ],
    'src/mergeDemo.ts': [
      'export const featureFlags = {',
      '<<<<<<< HEAD',
      '  cacheTtlSec: 60,',
      '=======',
      '  cacheTtlSec: 300,',
      '>>>>>>> feature/perf-cache',
      '  enableMetrics: true,',
      '};',
    ],
    'init.lua': [
      '-- Sample Neovim init.lua for Sandbox (:source init.lua)',
      'vim.opt.number = true',
      'vim.opt.relativenumber = true',
      'vim.opt.ignorecase = true',
      'vim.opt.smartcase = true',
      'vim.keymap.set("n", "<leader>w", ":w<CR>", { desc = "Save buffer" })',
    ],
  };
}

/**
 * 자유 연습장의 초기 Git 기준선(gitBaseLines)을 생성합니다.
 * 한 줄의 현실적인 변경 diff를 미리 제공해 `]h` / `[h` / `:Gitsigns` 를 바로 실험할 수 있습니다.
 */
export function createSandboxGitBaseLines(currentLines: string[]): string[] {
  return currentLines.map((line) =>
    line === '  role: "admin" | "editor" | "viewer";'
      ? '  role: "admin" | "viewer";'
      : line
  );
}
