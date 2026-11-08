import { t } from '../i18n';

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
