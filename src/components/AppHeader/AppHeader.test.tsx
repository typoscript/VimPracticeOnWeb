import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppHeader } from './AppHeader';
import { Mission } from '../../types/mission';
import { setLocale } from '../../i18n';

const mockCustomMission: Mission = {
  id: 999,
  title: 'Custom Test',
  description: 'desc',
  hint: 'hint',
  par: 3,
  optimalKeys: ['d', 'd'],
  initialLines: ['foo', 'bar'],
  initialCursor: { line: 0, col: 0 },
  targetLines: ['bar'],
  checkComplete: () => false,
};

function createProps(overrides: Partial<React.ComponentProps<typeof AppHeader>> = {}) {
  return {
    currentTab: 'course' as const,
    customMission: null,
    onSwitchTab: vi.fn(),
    hardcoreMode: false,
    onToggleHardcoreMode: vi.fn(),
    onOpenDailyModal: vi.fn(),
    onOpenAnalyticsModal: vi.fn(),
    onOpenCustomModal: vi.fn(),
    onOpenConfigModal: vi.fn(),
    onOpenLessonModal: vi.fn(),
    showDiffView: false,
    onToggleDiffView: vi.fn(),
    showRegisterInspector: false,
    onToggleRegisterInspector: vi.fn(),
    showMarksVisualizer: false,
    onToggleMarksVisualizer: vi.fn(),
    showGrammarAST: false,
    onToggleGrammarAST: vi.fn(),
    showActionTimeline: false,
    onToggleActionTimeline: vi.fn(),
    showVirtualKeyboard: false,
    onToggleVirtualKeyboard: vi.fn(),
    relativeLineNumbers: true,
    onToggleRelativeLineNumbers: vi.fn(),
    showMacroDebugger: false,
    onToggleMacroDebugger: vi.fn(),
    currentTheme: 'tokyo-night' as const,
    onThemeChange: vi.fn(),
    isMuted: false,
    onToggleMute: vi.fn(),
    locale: 'ko' as const,
    ...overrides,
  };
}

describe('AppHeader', () => {
  beforeEach(() => {
    setLocale('ko');
  });

  it('기본 탭 목록과 활성 탭 aria-selected 를 올바르게 렌더링하고 탭 전환 콜백을 호출한다', () => {
    const props = createProps({ currentTab: 'sandbox' });
    render(<AppHeader {...props} />);

    expect(screen.getByTestId('tab-sandbox-btn')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-course-btn')).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByTestId('tab-custom-btn')).toBeNull();
    // course 탭이 아닐 때는 레슨 목록 버튼이 숨겨진다
    expect(screen.queryByTestId('open-lesson-modal-btn')).toBeNull();

    fireEvent.click(screen.getByTestId('tab-dojo-btn'));
    expect(props.onSwitchTab).toHaveBeenCalledWith('dojo');
  });

  it('customMission 이 있고 course 탭이면 커스텀 골프 탭과 레슨 목록 버튼을 렌더링한다', () => {
    const props = createProps({
      currentTab: 'course',
      customMission: mockCustomMission,
    });
    render(<AppHeader {...props} />);

    expect(screen.getByTestId('tab-custom-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('open-lesson-modal-btn'));
    expect(props.onOpenLessonModal).toHaveBeenCalledTimes(1);
  });

  it('하드코어 토글, 모달 열기, 소리/언어 전환 버튼 핸들러를 호출한다', () => {
    const props = createProps({ hardcoreMode: true, isMuted: true, locale: 'ko' });
    render(<AppHeader {...props} />);

    expect(screen.getByTestId('toggle-hardcore-mode-btn')).toHaveClass('active');
    expect(screen.getByTestId('toggle-sound-btn')).toHaveClass('muted');

    fireEvent.click(screen.getByTestId('toggle-hardcore-mode-btn'));
    fireEvent.click(screen.getByTestId('open-daily-modal-btn'));
    fireEvent.click(screen.getByTestId('open-analytics-modal-btn'));
    fireEvent.click(screen.getByTestId('open-custom-modal-btn'));
    fireEvent.click(screen.getByTestId('open-config-modal-btn'));
    fireEvent.click(screen.getByTestId('toggle-sound-btn'));

    expect(props.onToggleHardcoreMode).toHaveBeenCalledTimes(1);
    expect(props.onOpenDailyModal).toHaveBeenCalledTimes(1);
    expect(props.onOpenAnalyticsModal).toHaveBeenCalledTimes(1);
    expect(props.onOpenCustomModal).toHaveBeenCalledTimes(1);
    expect(props.onOpenConfigModal).toHaveBeenCalledTimes(1);
    expect(props.onToggleMute).toHaveBeenCalledTimes(1);
  });
  it('더보기 버튼으로 보조 버튼 묶음을 펼치고 접는다 (휴대폰 폭에서만 CSS 로 숨김)', () => {
    render(<AppHeader {...createProps()} />);
    const more = screen.getByTestId('toggle-more-actions-btn');
    const actions = more.closest('.nav-actions')!;
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(actions).not.toHaveClass('more-open');
    expect(screen.getByTestId('open-daily-modal-btn')).toHaveClass('nav-collapsible');
    expect(screen.getByTestId('toggle-locale-btn')).not.toHaveClass('nav-collapsible');
    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(actions).toHaveClass('more-open');
  });
});
