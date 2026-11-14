import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { HardcoreDojo } from './HardcoreDojo';

describe('HardcoreDojo Component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('기본 렌더링 시 드릴 탭 3종과 시작 버튼을 정상 렌더링한다', () => {
    render(<HardcoreDojo />);

    expect(screen.getByText(/하드코어 도장/)).toBeInTheDocument();
    expect(screen.getAllByText('상대 라인 스나이퍼').length).toBeGreaterThan(0);
    expect(screen.getByText('인라인 문자 저격')).toBeInTheDocument();
    expect(screen.getByText('단어 vs 큰 단어 (w vs W)')).toBeInTheDocument();
    expect(screen.getByText('🥋 수련 시작 (30초)')).toBeInTheDocument();
  });

  it('드릴 탭 전환 시 해당 드릴의 설명과 목표 안내가 갱신된다', () => {
    render(<HardcoreDojo />);

    // 인라인 문자 저격 탭 클릭
    const ftTab = screen.getByText('인라인 문자 저격');
    fireEvent.click(ftTab);

    expect(screen.getAllByText(/f\{문자\}, t\{문자\}/).length).toBeGreaterThan(0);

    // 단어 vs 큰 단어 탭 클릭
    const wordTab = screen.getByText('단어 vs 큰 단어 (w vs W)');
    fireEvent.click(wordTab);

    expect(screen.getAllByText(/대문자 WORD\(W\)로/).length).toBeGreaterThan(0);
  });

  it('수련 시작 클릭 시 30초 카운트다운 게이지와 실행 상태로 진입한다', () => {
    vi.useFakeTimers();
    render(<HardcoreDojo />);

    const startBtn = screen.getByText('🥋 수련 시작 (30초)');
    fireEvent.click(startBtn);

    // 실행 중 상태
    expect(screen.queryByText('🥋 수련 시작 (30초)')).not.toBeInTheDocument();
    expect(screen.getByText('30.0s')).toBeInTheDocument();

    // 1초 경과
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('29.0s')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('수련 진행 중 방향키 입력 시 하드코어 가드가 차단하고 경고를 표시한다', () => {
    render(<HardcoreDojo />);

    // 시작
    fireEvent.click(screen.getByText('🥋 수련 시작 (30초)'));

    const arena = screen.getByLabelText('Dojo Editor Arena');

    // ArrowDown 입력
    fireEvent.keyDown(arena, { key: 'ArrowDown' });

    expect(screen.getByText(/방향키 대신 hjkl 또는 w\/b를 사용하세요/)).toBeInTheDocument();
  });

  it('수련 진행 중 마우스 클릭 시 하드코어 가드가 차단하고 마우스 경고를 표시한다', () => {
    render(<HardcoreDojo />);

    fireEvent.click(screen.getByText('🥋 수련 시작 (30초)'));

    const arena = screen.getByLabelText('Dojo Editor Arena');
    fireEvent.click(arena);

    expect(screen.getByText(/마우스 대신 Vim 모션/)).toBeInTheDocument();
  });

  it('30초 타이머 종료 시 결과 오버레이와 등급 및 재도전 버튼이 나타난다', () => {
    vi.useFakeTimers();
    render(<HardcoreDojo />);

    fireEvent.click(screen.getByText('🥋 수련 시작 (30초)'));

    // 31초 경과
    act(() => {
      vi.advanceTimersByTime(31000);
    });

    expect(screen.getByText('🔄 다시 수련하기')).toBeInTheDocument();
    expect(screen.getByText('최종 점수')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('서든데스 10연타 챌린지 탭 선택 및 시작 안내/버튼을 정상 렌더링한다', () => {
    render(<HardcoreDojo />);

    const suddenDeathTab = screen.getByText('서든데스 10연타 챌린지');
    fireEvent.click(suddenDeathTab);

    expect(screen.getByText('⚡ 10연타 노미스 서든데스')).toBeInTheDocument();
    expect(screen.getByText('⚡ 서든데스 도전 시작 (10연타)')).toBeInTheDocument();
  });

  it('서든데스 진행 중 방향키 입력 시 즉시 탈락(sudden-death-failed) 오버레이와 사유가 표시된다', () => {
    render(<HardcoreDojo />);

    // 서든데스 탭 선택 및 시작
    fireEvent.click(screen.getByText('서든데스 10연타 챌린지'));
    fireEvent.click(screen.getByText('⚡ 서든데스 도전 시작 (10연타)'));

    const arena = screen.getByLabelText('Dojo Editor Arena');

    // 방향키 입력 시 즉시 탈락
    fireEvent.keyDown(arena, { key: 'ArrowLeft' });

    expect(screen.getByText('서든데스 탈락!')).toBeInTheDocument();
    expect(screen.getByText(/탈락 사유:/)).toBeInTheDocument();
    expect(screen.getByText('🔄 다시 도전하기')).toBeInTheDocument();
    expect(screen.getByText('🏆 랭킹 보드 보기')).toBeInTheDocument();
  });

  it('서든데스 진행 중 마우스 클릭 시 즉시 탈락한다', () => {
    render(<HardcoreDojo />);

    fireEvent.click(screen.getByText('서든데스 10연타 챌린지'));
    fireEvent.click(screen.getByText('⚡ 서든데스 도전 시작 (10연타)'));

    const arena = screen.getByLabelText('Dojo Editor Arena');
    fireEvent.click(arena);

    expect(screen.getByText('서든데스 탈락!')).toBeInTheDocument();
    expect(screen.getByText(/마우스 대신 Vim 모션/)).toBeInTheDocument();
  });

  it('실시간 랭킹 모달 열기 및 닫기가 정상 동작한다', () => {
    render(<HardcoreDojo />);

    // 헤더의 명예의 전당 버튼 클릭
    const hallOfFameBtn = screen.getByText('🏆 명예의 전당');
    fireEvent.click(hallOfFameBtn);

    expect(screen.getByText('🏆 하드코어 도장 서든데스 명예의 전당')).toBeInTheDocument();
    expect(screen.getByText('VimValkyrie')).toBeInTheDocument();
    expect(screen.getByText('NeoMaster')).toBeInTheDocument();

    // 닫기 버튼 클릭
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    expect(screen.queryByText('🏆 하드코어 도장 서든데스 명예의 전당')).not.toBeInTheDocument();
  });

  it('실무 프로 10연타 챌린지 탭 선택 및 시작 안내와 첫 문제 성공 판정이 정상 동작한다', () => {
    render(<HardcoreDojo />);

    // 실무 프로 10연타 탭 선택
    const proTab = screen.getByText('실무 프로 10연타 챌린지');
    fireEvent.click(proTab);

    expect(screen.getByText('👑 실무 프로 10연타')).toBeInTheDocument();
    expect(screen.getByText('👑 프로 마스터 도전 시작 (10연타)')).toBeInTheDocument();

    // 시작
    fireEvent.click(screen.getByText('👑 프로 마스터 도전 시작 (10연타)'));

    const arena = screen.getByLabelText('Dojo Editor Arena');

    // 첫 문제: const token = "EXPIRED_SECRET_KEY"; -> ci"<Esc> 로 내부 비우기
    fireEvent.keyDown(arena, { key: 'c' });
    fireEvent.keyDown(arena, { key: 'i' });
    fireEvent.keyDown(arena, { key: '"' });
    fireEvent.keyDown(arena, { key: 'Escape' });

    // 콤보가 1 / 10 으로 증가해야 함
    expect(screen.getByText('1 / 10')).toBeInTheDocument();
  });

  it('약점 집중 맞춤 드릴 탭과 initialDrill 진입 시 약점 기반 문제 세트를 구성하고 풀이할 수 있다', () => {
    localStorage.setItem(
      'vim_user_analytics_v1',
      JSON.stringify({
        totalKeystrokes: 50,
        keyFrequencies: { h: 20, j: 20 },
        antiPatternCounts: { '$ 후 a (대문자 A 권장)': 5 },
        totalAntiPatternsTriggered: 5,
        arcadeBestScore: 0,
        arcadeHighestWave: 0,
        arcadeMaxCombo: 0,
        arcadeGamesPlayed: 0,
        dailyStreak: 0,
        dailyRecords: {},
      })
    );

    render(<HardcoreDojo initialDrill={{ drill: 'weakness-custom', nonce: 1 }} />);

    expect(screen.getByTestId('dojo-weakness-plan-box')).toBeInTheDocument();
    expect(screen.getByText(/줄 끝 단축 연산/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('dojo-weakness-start-btn'));
    expect(screen.getByText('0 / 10')).toBeInTheDocument();

    // 첫 문제: const ready = true -> A;<Esc>
    const arena = screen.getByLabelText('Dojo Editor Arena');
    fireEvent.keyDown(arena, { key: 'A' });
    fireEvent.keyDown(arena, { key: ';' });
    fireEvent.keyDown(arena, { key: 'Escape' });

    expect(screen.getByText('1 / 10')).toBeInTheDocument();
  });
});
