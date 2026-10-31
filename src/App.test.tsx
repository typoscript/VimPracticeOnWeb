import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('App Component with Keyboard Navigation', () => {
  it('renders application title, editor container, and status bar', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /VimPracticeOnWeb/i })).toBeInTheDocument();
    expect(screen.getByTestId('editor-container')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
    expect(screen.getByTestId('status-mode')).toHaveTextContent('NORMAL');
    expect(screen.getByTestId('status-cursor-pos')).toHaveTextContent('1:1');
  });

  it('moves cursor and updates status bar on keydown events (l, j, h, k, $, 0, gg)', () => {
    render(<App />);

    const cursorPos = screen.getByTestId('status-cursor-pos');
    expect(cursorPos).toHaveTextContent('1:1');

    // l 누름 -> 1:2
    fireEvent.keyDown(window, { key: 'l' });
    expect(cursorPos).toHaveTextContent('1:2');

    // j 누름 -> 2번째 줄 -> 2:2
    fireEvent.keyDown(window, { key: 'j' });
    expect(cursorPos).toHaveTextContent('2:2');

    // j 누름 -> 3번째 줄 -> 3:2
    fireEvent.keyDown(window, { key: 'j' });
    expect(cursorPos).toHaveTextContent('3:2');

    // $ 누름 -> 3번째 줄 맨 끝 문자 -> 3:30
    fireEvent.keyDown(window, { key: '$' });
    expect(cursorPos).toHaveTextContent('3:30');

    // 0 누름 -> 줄 맨 앞
    fireEvent.keyDown(window, { key: '0' });
    expect(cursorPos).toHaveTextContent('3:1');

    // gg 누름 -> 첫 줄 맨 앞
    fireEvent.keyDown(window, { key: 'g' });
    expect(screen.getByTestId('status-pending-keys')).toHaveTextContent('g');
    fireEvent.keyDown(window, { key: 'g' });
    expect(cursorPos).toHaveTextContent('1:1');
    expect(screen.queryByTestId('status-pending-keys')).not.toBeInTheDocument();
  });

  it('completes lesson 1 upon reaching target cursor and advances to lesson 2', () => {
    render(<App />);

    expect(screen.getByTestId('mission-title')).toHaveTextContent('레슨 1');
    expect(screen.getByText('진행 중')).toBeInTheDocument();

    // 레슨 1 목표: line 2, col 13
    // 아래로 2번 이동 (line 2)
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });

    // 오른쪽으로 13번 이동 (col 13)
    for (let i = 0; i < 13; i++) {
      fireEvent.keyDown(window, { key: 'l' });
    }

    // 성공 상태 확인
    expect(screen.getByTestId('mission-completed-badge')).toHaveTextContent('✓ 성공!');
    expect(screen.getByTestId('mission-success-banner')).toBeInTheDocument();

    // 다음 레슨 도전하기 클릭
    const nextBtn = screen.getByRole('button', { name: /다음 레슨 도전하기/i });
    fireEvent.click(nextBtn);

    // 레슨 2로 전환 확인
    expect(screen.getByTestId('mission-title')).toHaveTextContent('레슨 2');
    expect(screen.getByTestId('status-filename')).toHaveTextContent('lesson_2.txt');
  });

  it('enters INSERT mode, types text, and returns to NORMAL mode with Escape', () => {
    render(<App />);

    const statusMode = screen.getByTestId('status-mode');
    const cursorPos = screen.getByTestId('status-cursor-pos');

    expect(statusMode).toHaveTextContent('NORMAL');

    // i 누름 -> INSERT 모드 진입
    fireEvent.keyDown(window, { key: 'i' });
    expect(statusMode).toHaveTextContent('INSERT');

    // 'H', 'i' 입력
    fireEvent.keyDown(window, { key: 'H' });
    fireEvent.keyDown(window, { key: 'i' });
    expect(cursorPos).toHaveTextContent('1:3');

    // 첫 번째 줄에 'HiWelcome...' 포함 확인
    const row1 = screen.getByTestId('editor-row-1');
    expect(row1.textContent).toContain('HiWelcome');

    // Escape 누름 -> NORMAL 모드 복귀 (커서 1칸 좌측 보정)
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(statusMode).toHaveTextContent('NORMAL');
    expect(cursorPos).toHaveTextContent('1:2');

    // x 누름 -> 현재 커서 위치의 문자('i') 삭제
    fireEvent.keyDown(window, { key: 'x' });
    expect(row1.textContent).toContain('HWelcome');
  });

  it('tracks keystrokes in Keycaster and detects anti-pattern repeated motion toast', () => {
    render(<App />);

    expect(screen.getByTestId('keycaster')).toBeInTheDocument();
    expect(screen.getByTestId('mission-par-badge')).toHaveTextContent('타수: 0 / 목표(Par): 6');

    // l을 4번 누름 -> 아직 토스트 없음
    for (let i = 0; i < 4; i++) {
      fireEvent.keyDown(window, { key: 'l' });
    }
    expect(screen.queryByTestId('coaching-toast')).not.toBeInTheDocument();
    expect(screen.getByTestId('mission-par-badge')).toHaveTextContent('타수: 4 / 목표(Par): 6');

    // 5번째 l 누름 -> 5회 연속 연타 안티 패턴 감지 토스트 노출!
    fireEvent.keyDown(window, { key: 'l' });
    expect(screen.getByTestId('coaching-toast')).toBeInTheDocument();
    expect(
      screen.getByText(/이동 키를 연타하는 대신 w, b 또는 숫자\+이동/i)
    ).toBeInTheDocument();

    // 토스트 닫기 클릭
    const closeBtn = screen.getByRole('button', { name: /닫기/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('coaching-toast')).not.toBeInTheDocument();
  });

  it('자유 연습장(Sandbox) 모드 탭 전환 및 초기화가 정상 동작한다', () => {
    render(<App />);

    // 기본은 튜토리얼 코스
    expect(screen.getByTestId('mission-panel')).toBeInTheDocument();
    expect(screen.getByTestId('status-filename')).toHaveTextContent('lesson_1.txt');

    // 🧪 자유 연습장 탭 클릭
    const sandboxTabBtn = screen.getByTestId('tab-sandbox-btn');
    fireEvent.click(sandboxTabBtn);

    // 미션 패널 대신 샌드박스 패널 표시 확인
    expect(screen.queryByTestId('mission-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('sandbox-panel')).toBeInTheDocument();
    expect(screen.getByTestId('status-filename')).toHaveTextContent('sandbox.ts');

    // 샌드박스 내 코드 편집: 'dd'로 첫 번째 줄 삭제
    fireEvent.keyDown(window, { key: 'd' });
    fireEvent.keyDown(window, { key: 'd' });

    // 🔄 코드 초기화 버튼 클릭
    const resetBtn = screen.getByTestId('sandbox-reset-btn');
    fireEvent.click(resetBtn);

    // 초기 샘플 코드로 리셋되었는지 확인
    expect(screen.getByTestId('editor-row-1').textContent).toContain(
      '자유 연습장 (Sandbox Mode)'
    );

    // 🎯 튜토리얼 코스로 다시 복귀
    const courseTabBtn = screen.getByTestId('tab-course-btn');
    fireEvent.click(courseTabBtn);
    expect(screen.getByTestId('mission-panel')).toBeInTheDocument();
    expect(screen.getByTestId('status-filename')).toHaveTextContent('lesson_1.txt');
  });

  it('상대 라인 번호(relativenumber) 토글 버튼이 정상 동작한다', () => {
    localStorage.clear();
    render(<App />);

    const toggleBtn = screen.getByTestId('toggle-relativenumber-btn');
    expect(toggleBtn).toHaveTextContent('relativenumber: OFF');

    // 토글 ON 클릭
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveTextContent('relativenumber: ON');

    // 커서가 1행(line 0)에 있을 때 2행의 라인 번호는 거리 1로 표시
    expect(screen.getByTestId('line-number-2')).toHaveTextContent('1');

    // 다시 클릭하여 OFF
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveTextContent('relativenumber: OFF');
    expect(screen.getByTestId('line-number-2')).toHaveTextContent('2');
  });

  it('레슨 선택 모달을 열고 원하는 레슨으로 바로 이동할 수 있다', () => {
    render(<App />);

    const openModalBtn = screen.getByTestId('open-lesson-modal-btn');
    fireEvent.click(openModalBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Vim 커리큘럼 레슨 목록/)).toBeInTheDocument();

    // 레슨 3 카드 클릭
    const lessonCard3 = screen.getByTestId('lesson-card-3');
    fireEvent.click(lessonCard3);

    // 모달이 닫히고 레슨 3으로 전환되었는지 확인
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('mission-title')).toHaveTextContent('레슨 3');
    expect(screen.getByTestId('status-filename')).toHaveTextContent('lesson_3.txt');
  });

  it('레슨 클리어 시 localStorage에 진행 기록이 영구 저장된다', () => {
    localStorage.clear();
    render(<App />);

    // 레슨 1 시작
    expect(screen.getByTestId('mission-title')).toHaveTextContent('레슨 1');

    // 레슨 1 클리어: j 2회, l 13회
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });
    for (let i = 0; i < 13; i++) {
      fireEvent.keyDown(window, { key: 'l' });
    }

    expect(screen.getByTestId('mission-completed-badge')).toHaveTextContent('✓ 성공!');

    // localStorage에 레슨 1 기록이 저장되었는지 확인
    const rawProgress = localStorage.getItem('vim_practice_progress_v1');
    expect(rawProgress).toBeTruthy();
    const progress = JSON.parse(rawProgress!);
    expect(progress[1]).toBeDefined();
    expect(progress[1].completed).toBe(true);
    expect(progress[1].minKeystrokes).toBe(15);
  });

  it('/ 키로 검색 모드에 진입하여 프롬프트를 표시하고 일치 위치로 점프한다', () => {
    render(<App />);

    // / 입력 -> 검색 프롬프트 활성화
    fireEvent.keyDown(window, { key: '/' });
    const prompt = screen.getByTestId('commandline-prompt');
    expect(prompt).toBeInTheDocument();
    expect(prompt).toHaveTextContent('/');

    // 'T', 'A', 'R', 'G', 'E', 'T' 입력
    for (const ch of 'TARGET') {
      fireEvent.keyDown(window, { key: ch });
    }
    expect(prompt).toHaveTextContent('/TARGET');

    // 에디터 내 검색어 하이라이트 확인
    const matches = screen.getAllByTestId('search-match');
    expect(matches.length).toBeGreaterThan(0);

    // Enter 입력 -> NORMAL 모드로 복귀 및 목표 위치로 점프
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.queryByTestId('commandline-prompt')).not.toBeInTheDocument();
    expect(screen.getByTestId('status-mode')).toHaveTextContent('NORMAL');
    expect(screen.getByTestId('status-cursor-pos')).toHaveTextContent('3:15');
  });

  it(': 키로 커맨드라인 모드에 진입하여 줄 번호로 점프한다', () => {
    render(<App />);

    // : 입력 -> 커맨드라인 활성화
    fireEvent.keyDown(window, { key: ':' });
    const prompt = screen.getByTestId('commandline-prompt');
    expect(prompt).toBeInTheDocument();
    expect(prompt).toHaveTextContent(':');

    // 2 입력 후 Enter -> 2행으로 점프
    fireEvent.keyDown(window, { key: '2' });
    expect(prompt).toHaveTextContent(':2');
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(screen.queryByTestId('commandline-prompt')).not.toBeInTheDocument();
    expect(screen.getByTestId('status-cursor-pos')).toHaveTextContent('2:1');
    expect(screen.getByTestId('status-command-message')).toHaveTextContent('2번째 줄로 이동했습니다.');
  });

  it('Shift 단독 키 입력은 타수를 올리거나 Keycaster에 등록되지 않는다', () => {
    render(<App />);

    // Shift 키 입력
    fireEvent.keyDown(window, { key: 'Shift' });
    expect(screen.queryByTestId('keycap-0')).not.toBeInTheDocument();

    // 이어서 ':' 입력 시 ':'만 Keycaster에 등록됨
    fireEvent.keyDown(window, { key: ':' });
    expect(screen.getByTestId('keycap-0')).toHaveTextContent(':');
  });

  it('한글 입력 상태(자모 또는 Process)가 감지되면 한/영 전환 코칭 토스트를 띄운다', () => {
    render(<App />);

    // 한글 자모 입력
    fireEvent.keyDown(window, { key: 'ㄱ' });
    expect(screen.getByTestId('coaching-toast')).toHaveTextContent('한/영');
  });

  it('가상 키보드와 목표 Diff 비교 뷰를 토글할 수 있다', () => {
    render(<App />);

    // 가상 키보드 토글
    const kbToggleBtn = screen.getByTestId('toggle-virtual-keyboard-btn');
    expect(screen.getByTestId('virtual-keyboard')).toBeInTheDocument();
    fireEvent.click(kbToggleBtn);
    expect(screen.queryByTestId('virtual-keyboard')).not.toBeInTheDocument();

    // 목표 Diff 뷰 토글
    const diffToggleBtn = screen.getByTestId('toggle-diff-view-btn');
    expect(screen.getByTestId('diff-viewer')).toBeInTheDocument();
    fireEvent.click(diffToggleBtn);
    expect(screen.queryByTestId('diff-viewer')).not.toBeInTheDocument();
  });

  it('스피드런 탭 전환 후 챌린지를 시작할 수 있다', () => {
    render(<App />);

    // 스피드런 탭 클릭
    const speedrunTabBtn = screen.getByTestId('tab-speedrun-btn');
    fireEvent.click(speedrunTabBtn);

    expect(screen.getByTestId('speedrun-panel')).toBeInTheDocument();
    expect(screen.getByTestId('speedrun-ready-view')).toBeInTheDocument();

    // 시작 버튼 클릭 -> live view로 전환
    const startBtn = screen.getByTestId('speedrun-start-btn');
    fireEvent.click(startBtn);

    expect(screen.getByTestId('speedrun-live-view')).toBeInTheDocument();
    expect(screen.getByTestId('speedrun-stage-indicator')).toHaveTextContent('1 / 5');
  });
});
