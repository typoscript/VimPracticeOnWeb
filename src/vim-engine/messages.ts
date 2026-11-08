import { getVimEngineConfig } from './config';
import { EN_MESSAGES } from './messagesEn';

/**
 * 엔진이 상태 표시줄·에러로 내보내는 메시지.
 * 한국어 원문이 키이며, configureVimEngine({ locale: 'en' }) 이면 messagesEn.ts 의 영어 문구를 씁니다.
 * {이름} 자리표시자는 params 값으로 바뀝니다.
 */
export function msg(ko: string, params?: Record<string, string | number | boolean | null | undefined>): string {
  const template = getVimEngineConfig().locale === 'en' ? EN_MESSAGES[ko] ?? ko : ko;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? String(params[key]) : whole));
}
