import { LessonProgress } from './storage';
import { i18nKey } from '../i18n';

export type LearningTrackId = 'starter' | 'refactor' | 'vimscript' | 'neovim';

export interface LearningTrack {
  id: LearningTrackId;
  icon: string;
  titleKey: string;
  descKey: string;
  badgeKey: string;
  accentColor: string;
  lessonIds: readonly number[];
}

export interface LearningTrackProgress {
  track: LearningTrack;
  completedCount: number;
  totalCount: number;
  percent: number;
  nextLessonId: number;
  isFinished: boolean;
}

export const LEARNING_TRACKS: readonly LearningTrack[] = [
  {
    id: 'starter',
    icon: '🌱',
    titleKey: i18nKey('입문 필수 20강'),
    descKey: i18nKey('기본 모션 · 편집 · 텍스트 객체 · 검색 · 매크로 핵심 기초'),
    badgeKey: i18nKey('입문'),
    accentColor: '#a6e3a1',
    lessonIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  },
  {
    id: 'refactor',
    icon: '🔧',
    titleKey: i18nKey('실무 리팩토링 25강'),
    descKey: i18nKey('정규식 치환 · 서라운드 · 다중 버퍼 · 블록 편집 고속 실무'),
    badgeKey: i18nKey('실무'),
    accentColor: '#89b4fa',
    lessonIds: [
      14, 15, 17, 18, 19, 21, 22, 23, 24, 25,
      28, 30, 31, 32, 47, 48, 52, 54, 58, 59,
      65, 66, 76, 83, 100,
    ],
  },
  {
    id: 'vimscript',
    icon: '📜',
    titleKey: i18nKey('Ex · Vimscript 마스터'),
    descKey: i18nKey('퀵픽스 · Netrw · 세션 · 자동명령 · 함수/람다 · 셸 파이프'),
    badgeKey: i18nKey('심화'),
    accentColor: '#f9e2af',
    lessonIds: [
      35, 36, 37, 38, 39, 40, 46, 51, 55, 56,
      57, 61, 62, 63, 64, 67, 68, 69, 70, 72,
      82, 84, 85, 88, 89,
    ],
  },
  {
    id: 'neovim',
    icon: '🚀',
    titleKey: i18nKey('현대 Neovim IDE 25강'),
    descKey: i18nKey('Telescope · LSP · Treesitter · Flash · Oil · 터미널 · treesj'),
    badgeKey: i18nKey('Neovim'),
    accentColor: '#cba6f7',
    lessonIds: [
      101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
      111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
      121, 122, 123, 124, 125,
    ],
  },
];

/**
 * 지정 학습 트랙의 완료율과 다음 이어하기 레슨 ID 를 계산합니다.
 */
export function computeTrackProgress(
  track: LearningTrack,
  progress: LessonProgress
): LearningTrackProgress {
  const totalCount = track.lessonIds.length;
  const completedCount = track.lessonIds.filter((id) => Boolean(progress[id]?.completed)).length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const firstUncompleted = track.lessonIds.find((id) => !progress[id]?.completed);
  const nextLessonId = firstUncompleted ?? track.lessonIds[0];

  return {
    track,
    completedCount,
    totalCount,
    percent,
    nextLessonId,
    isFinished: completedCount === totalCount && totalCount > 0,
  };
}

/**
 * 전체 4개 학습 트랙의 진행도 요약 목록을 반환합니다.
 */
export function computeAllTracksProgress(progress: LessonProgress): LearningTrackProgress[] {
  return LEARNING_TRACKS.map((track) => computeTrackProgress(track, progress));
}
