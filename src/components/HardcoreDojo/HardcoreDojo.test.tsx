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
});
