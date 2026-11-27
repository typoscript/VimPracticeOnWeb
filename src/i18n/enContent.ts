/**
 * 레슨·던전·자유 연습장 본문의 영어 번역 사전: { 한국어 원문: 영어 }.
 * 데이터 파일(src/data)은 한국어 원문을 그대로 두고, 화면에서 t(mission.title) 처럼 번역합니다.
 * i18nCoverage.test.ts 가 누락·자리표시자를 검사합니다.
 * 내용은 번들 크기 때문에 두 파일로 나뉘어 있습니다: enContentLessons1to79.ts, enContentLessons80Plus.ts
 * (새 레슨 번역은 enContentLessons80Plus.ts 끝에 추가).
 */
import { EN_CONTENT_LESSONS_1_TO_79 } from './enContentLessons1to79';
import { EN_CONTENT_LESSONS_80_PLUS } from './enContentLessons80Plus';

export const EN_CONTENT: Record<string, string> = {
  ...EN_CONTENT_LESSONS_1_TO_79,
  ...EN_CONTENT_LESSONS_80_PLUS,
};
