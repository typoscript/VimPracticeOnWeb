import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  LEARNING_TRACKS,
  computeTrackProgress,
  computeAllTracksProgress,
} from './learningTracks';
import {
  CAPSTONE_PROJECTS,
  createCapstoneMission,
  loadCapstoneProgress,
  saveCapstoneCompletion,
} from '../data/capstoneProjects';
import { MISSIONS } from '../data/missions';
import { buildCustomInitialState } from './missionInitialState';
import { runExCommand, sendKeys } from '../vim-engine';
import { LessonSelectModal } from '../components/LessonSelectModal/LessonSelectModal';

describe('목적별 학습 트랙 (learningTracks)', () => {
  it('모든 트랙의 레슨 ID 는 실제 MISSIONS 에 존재하며 진행률과 다음 레슨을 정확히 계산한다', () => {
    const missionIds = new Set(MISSIONS.map((m) => m.id));
    expect(LEARNING_TRACKS.length).toBe(4);

    for (const track of LEARNING_TRACKS) {
      expect(track.lessonIds.length).toBeGreaterThan(0);
      for (const id of track.lessonIds) {
        expect(missionIds.has(id), `트랙 ${track.id}의 레슨 #${id} 존재`).toBe(true);
      }
    }

    const progress = {
      1: { completed: true, bestStars: 3, minKeystrokes: 4 },
      2: { completed: true, bestStars: 3, minKeystrokes: 5 },
    };
    const starterProg = computeTrackProgress(LEARNING_TRACKS[0], progress);
    expect(starterProg.completedCount).toBe(2);
    expect(starterProg.totalCount).toBe(20);
    expect(starterProg.percent).toBe(10);
    expect(starterProg.nextLessonId).toBe(3);
    expect(starterProg.isFinished).toBe(false);

    const all = computeAllTracksProgress(progress);
    expect(all.length).toBe(4);
  });
});

describe('실무 멀티파일 캡스톤 챌린지 (capstoneProjects)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('캡스톤 1 (API v1→v2 마이그레이션) 을 Spectre + dial + Trouble + :TestRun 으로 완주할 수 있다', () => {
    const project = CAPSTONE_PROJECTS[0];
    const mission = createCapstoneMission(project);
    let s = buildCustomInitialState(mission);

    expect(mission.checkComplete(s)).toBe(false);

    // 1. config.ts: v1 -> v2, debugMode true -> false
    s = sendKeys(s, 'f1r2j0<C-a>');
    // 2. Spectre 로 전체 /v1/ -> /v2/ 치환
    s = runExCommand(s, 'Spectre /v1/ /v2/');
    s = runExCommand(s, 'SpectreApply');
    s = runExCommand(s, 'SpectreClose');
    // 3. Harpoon 3 (worker.ts) 로 이동해 FIXME 삭제
    s = runExCommand(s, 'Harpoon 3');
    s = sendKeys(s, 'dd');
    // 4. :TestRun 실행
    s = runExCommand(s, 'TestRun');

    expect(s.lastTestRun?.allPassed).toBe(true);
    expect(mission.checkComplete(s)).toBe(true);
  });

  it('캡스톤 2 (프로덕션 핫픽스) 를 Harpoon + abolish(crc) + dial + :TestRun 으로 완주할 수 있다', () => {
    const project = CAPSTONE_PROJECTS[1];
    const mission = createCapstoneMission(project);
    let s = buildCustomInitialState(mission);

    // auth.ts: allowGuest false, == -> ===
    s = sendKeys(s, '<C-a>2j0f=a=<Esc>');
    // rateLimit.ts: crc + MAX_LIMIT = 100
    s = runExCommand(s, 'Harpoon 2');
    s = sendKeys(s, '2wcrcj0f0cw100<Esc>');
    // health.ts: degraded -> healthy
    s = runExCommand(s, 'Harpoon 3');
    s = sendKeys(s, 'f"ci"healthy<Esc>');
    // :TestRun
    s = runExCommand(s, 'TestRun');

    expect(s.lastTestRun?.allPassed).toBe(true);
    expect(mission.checkComplete(s)).toBe(true);
  });

  it('캡스톤 3 (PR 리뷰 반영) 을 gra + treesj(gS) + abolish(cru) + dial(날짜) + :TestRun 으로 완주할 수 있다', () => {
    const project = CAPSTONE_PROJECTS[2];
    const mission = createCapstoneMission(project);
    let s = buildCustomInitialState(mission);

    // userService.ts: TODO 삭제 + var -> const (gra -> 1)
    s = sendKeys(s, 'ddgra1');
    // formatters.ts: gS 로 멀티라인 분할
    s = runExCommand(s, 'Harpoon 2');
    s = sendKeys(s, 'gS');
    // constants.ts: cru + 날짜 하루 올리기
    s = runExCommand(s, 'Harpoon 3');
    s = sendKeys(s, '2wcruj0<C-a>');
    // :TestRun
    s = runExCommand(s, 'TestRun');

    expect(s.lastTestRun?.allPassed).toBe(true);
    expect(mission.checkComplete(s)).toBe(true);

    // 완료 기록 영구 저장 확인
    const saved = saveCapstoneCompletion(project.id, 42);
    expect(saved[project.id]?.completed).toBe(true);
    expect(loadCapstoneProgress()[project.id]?.bestKeystrokes).toBe(42);
  });

  it('캡스톤 4 (Git Hunk 선별 정리 & 핫픽스 커밋) 를 :Git commit + dial + :TestRun 으로 완주할 수 있다', () => {
    expect(CAPSTONE_PROJECTS.length).toBe(5);
    const project = CAPSTONE_PROJECTS[3];
    const mission = createCapstoneMission(project);
    let s = buildCustomInitialState(mission);

    // 커밋 전에는 테스트 실패
    s = runExCommand(s, 'TestRun');
    expect(s.lastTestRun?.allPassed).toBe(false);

    // src/release.ts: DEBUG_SECRET_LEAK 줄 삭제 + canaryMode false
    s = sendKeys(s, 'jdd<C-a>');
    // src/changelog.ts: 날짜 하루 올리기
    s = runExCommand(s, 'Harpoon 2');
    s = sendKeys(s, '<C-a>');
    // src/release.ts 복귀 후 :Git commit 실행
    s = runExCommand(s, 'Harpoon 1');
    s = runExCommand(s, 'Git commit -m "chore: release 2.4.0"');
    // :TestRun 통과
    s = runExCommand(s, 'TestRun');

    expect(s.lastTestRun?.allPassed).toBe(true);
    expect(mission.checkComplete(s)).toBe(true);
  });

  it('캡스톤 5 (TS 현대화 리팩토링) 를 abolish(crc/cru) + LuaSnip(iface<Tab>) + treesj(gS) + dial + Spectre + :TestRun 으로 완주할 수 있다', () => {
    const project = CAPSTONE_PROJECTS[4];
    const mission = createCapstoneMission(project);
    let s = buildCustomInitialState(mission);

    // 1. src/orderModel.ts: crc + cru + LuaSnip iface<Tab> 로 interface OrderSummary 생성
    s = sendKeys(s, '2wcrcj02wcruoiface<Tab>OrderSummary<Esc>');
    // 2. src/pricing.ts: gS 멀티라인 분할 + discount false -> true
    s = runExCommand(s, 'Harpoon 2');
    s = sendKeys(s, 'gS3j0<C-a>');
    // 3. :Spectre /legacy/ /modern/ 일괄 치환 후 HACK 삭제
    s = runExCommand(s, 'Spectre /legacy/ /modern/');
    s = runExCommand(s, 'SpectreApply');
    s = runExCommand(s, 'SpectreClose');
    s = runExCommand(s, 'Harpoon 3');
    s = sendKeys(s, 'dd');
    // 4. :TestRun 검증
    s = runExCommand(s, 'TestRun');

    expect(s.lastTestRun?.allPassed).toBe(true);
    expect(mission.checkComplete(s)).toBe(true);
  });

  it('LessonSelectModal 에 4개 학습 트랙 카드와 5개 캡스톤 카드가 렌더링되고 필터/시작이 동작한다', () => {
    const onSelectLesson = vi.fn();
    const onStartCapstone = vi.fn();
    const onClose = vi.fn();

    render(
      <LessonSelectModal
        isOpen={true}
        onClose={onClose}
        missions={MISSIONS}
        currentMissionId={1}
        progress={{ 1: { completed: true, bestStars: 3, minKeystrokes: 4 } }}
        onSelectLesson={onSelectLesson}
        onStartCapstone={onStartCapstone}
      />
    );

    expect(screen.getByTestId('learning-tracks-section')).toBeInTheDocument();
    expect(screen.getByTestId('capstone-projects-section')).toBeInTheDocument();

    // 트랙 필터 클릭 → 현대 Neovim 30강만 표시
    fireEvent.click(screen.getByTestId('track-filter-neovim'));
    expect(screen.getByText(/30개 레슨 검색됨/)).toBeInTheDocument();

    // 트랙 해제 후 캡스톤 도전하기 클릭
    fireEvent.click(screen.getByTestId('track-filter-neovim'));
    fireEvent.click(screen.getByTestId('capstone-start-capstone-api-v2'));
    expect(onStartCapstone).toHaveBeenCalledWith(CAPSTONE_PROJECTS[0]);
    expect(onClose).toHaveBeenCalled();

    // 이어하기 클릭
    fireEvent.click(screen.getByTestId('track-continue-starter'));
    expect(onSelectLesson).toHaveBeenCalledWith(2);
  });
});
