import { useState } from 'react';
import { ThemeSwitcher } from '../ThemeSwitcher/ThemeSwitcher';
import { ViewPanelsDropdown } from '../ViewPanelsDropdown/ViewPanelsDropdown';
import { VimTheme } from '../../utils/theme';
import { Mission } from '../../types/mission';
import { t, setLocale } from '../../i18n';

export type AppTab =
  | 'course'
  | 'sandbox'
  | 'speedrun'
  | 'custom'
  | 'arcade'
  | 'dungeon'
  | 'dojo';

interface AppHeaderProps {
  currentTab: AppTab;
  customMission: Mission | null;
  onSwitchTab: (tab: AppTab) => void;
  hardcoreMode: boolean;
  onToggleHardcoreMode: () => void;
  onOpenDailyModal: () => void;
  onOpenAnalyticsModal: () => void;
  onOpenCustomModal: () => void;
  onOpenConfigModal: () => void;
  onOpenLessonModal: () => void;
  onOpenCheatsheetModal?: () => void;
  onOpenKeyReference?: () => void;
  showDiffView: boolean;
  onToggleDiffView: () => void;
  showRegisterInspector: boolean;
  onToggleRegisterInspector: () => void;
  showMarksVisualizer: boolean;
  onToggleMarksVisualizer: () => void;
  showGrammarAST: boolean;
  onToggleGrammarAST: () => void;
  showActionTimeline: boolean;
  onToggleActionTimeline: () => void;
  showVirtualKeyboard: boolean;
  onToggleVirtualKeyboard: () => void;
  relativeLineNumbers: boolean;
  onToggleRelativeLineNumbers: () => void;
  showMacroDebugger: boolean;
  onToggleMacroDebugger: () => void;
  showWhichKey?: boolean;
  onToggleWhichKey?: () => void;
  currentTheme: VimTheme;
  onThemeChange: (theme: VimTheme) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  locale: 'ko' | 'en';
}

/**
 * 앱 상단 타이틀, 탭 전환/도구 툴바 네비게이션 및 하단 치트시트 바입니다.
 */
export function AppHeader({
  currentTab,
  customMission,
  onSwitchTab,
  hardcoreMode,
  onToggleHardcoreMode,
  onOpenDailyModal,
  onOpenAnalyticsModal,
  onOpenCustomModal,
  onOpenConfigModal,
  onOpenLessonModal,
  onOpenCheatsheetModal,
  onOpenKeyReference,
  showDiffView,
  onToggleDiffView,
  showRegisterInspector,
  onToggleRegisterInspector,
  showMarksVisualizer,
  onToggleMarksVisualizer,
  showGrammarAST,
  onToggleGrammarAST,
  showActionTimeline,
  onToggleActionTimeline,
  showVirtualKeyboard,
  onToggleVirtualKeyboard,
  relativeLineNumbers,
  onToggleRelativeLineNumbers,
  showMacroDebugger,
  onToggleMacroDebugger,
  showWhichKey,
  onToggleWhichKey,
  currentTheme,
  onThemeChange,
  isMuted,
  onToggleMute,
  locale,
}: AppHeaderProps) {
  // 휴대폰 폭에서는 보조 버튼을 '더보기'로 접어 에디터가 첫 화면에 보이게 합니다 (데스크톱은 항상 펼침, App.css).
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <>
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">⌨</span>
          <h1 className="brand-title">VimPracticeOnWeb</h1>
        </div>
        <p className="header-desc">{t('인터랙티브 Vim 튜토리얼 & 연습 코스')}</p>
      </header>

      {/* 탭 전환 및 상단 툴바 */}
      <div className="app-nav-bar" data-testid="app-nav-bar">
        <div className="nav-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={currentTab === 'course'}
            className={`nav-tab-btn ${currentTab === 'course' ? 'active' : ''}`}
            onClick={() => onSwitchTab('course')}
            data-testid="tab-course-btn"
          >
            {t('🎯 튜토리얼 코스')}
          </button>
          <button
            role="tab"
            aria-selected={currentTab === 'sandbox'}
            className={`nav-tab-btn ${currentTab === 'sandbox' ? 'active' : ''}`}
            onClick={() => onSwitchTab('sandbox')}
            data-testid="tab-sandbox-btn"
          >
            {t('🧪 자유 연습장')}
          </button>
          <button
            role="tab"
            aria-selected={currentTab === 'speedrun'}
            className={`nav-tab-btn ${currentTab === 'speedrun' ? 'active' : ''}`}
            onClick={() => onSwitchTab('speedrun')}
            data-testid="tab-speedrun-btn"
          >
            {t('⚡ 스피드런')}
          </button>
          <button
            role="tab"
            aria-selected={currentTab === 'arcade'}
            className={`nav-tab-btn ${currentTab === 'arcade' ? 'active' : ''}`}
            onClick={() => onSwitchTab('arcade')}
            data-testid="tab-arcade-btn"
          >
            {t('👾 아케이드')}
          </button>
          <button
            role="tab"
            aria-selected={currentTab === 'dungeon'}
            className={`nav-tab-btn ${currentTab === 'dungeon' ? 'active' : ''}`}
            onClick={() => onSwitchTab('dungeon')}
            data-testid="tab-dungeon-btn"
          >
            {t('🗡️ 던전 RPG')}
          </button>
          <button
            role="tab"
            aria-selected={currentTab === 'dojo'}
            className={`nav-tab-btn ${currentTab === 'dojo' ? 'active' : ''}`}
            onClick={() => onSwitchTab('dojo')}
            data-testid="tab-dojo-btn"
          >
            {t('🥋 도장')}
          </button>
          {customMission && (
            <button
              role="tab"
              aria-selected={currentTab === 'custom'}
              className={`nav-tab-btn ${currentTab === 'custom' ? 'active' : ''}`}
              onClick={() => onSwitchTab('custom')}
              data-testid="tab-custom-btn"
            >
              {t('⛳ 커스텀 골프')}
            </button>
          )}
        </div>

        <div className={`nav-actions${moreOpen ? ' more-open' : ''}`}>
          {/* 주요 훈련 및 모달 도구 그룹 */}
          <div className="nav-action-group nav-tools-group">
            {/* 🔥 하드코어 수련 모드 토글 스위치 */}
            <button
              className={`toolbar-btn nav-collapsible hardcore-mode-btn ${hardcoreMode ? 'active' : ''}`}
              onClick={onToggleHardcoreMode}
              data-testid="toggle-hardcore-mode-btn"
              title={t('🔥 하드코어 수련 모드: 방향키 및 마우스 완전 차단, 1.5초 3회 초과 연타 무시')}
            >
              {hardcoreMode ? t('🔥 하드코어: ON') : t('🔥 하드코어: OFF')}
            </button>

            {/* 데일리 챌린지 모달 */}
            <button
              className="toolbar-btn nav-collapsible daily-challenge-btn"
              onClick={onOpenDailyModal}
              data-testid="open-daily-modal-btn"
              title={t('오늘의 데일리 Vim Golf 챌린지')}
            >
              {t('📅 데일리')}
            </button>

            {/* 숙련도 분석 대시보드 모달 */}
            <button
              className="toolbar-btn nav-collapsible analytics-btn"
              onClick={onOpenAnalyticsModal}
              data-testid="open-analytics-modal-btn"
              title={t('Vim 숙련도 5각 레이더 및 명령어 사용 통계 대시보드')}
            >
              {t('📊 숙련도 분석')}
            </button>

            {/* 커스텀 Vim Golf 미션 생성 모달 */}
            <button
              className="toolbar-btn nav-collapsible custom-mission-btn"
              onClick={onOpenCustomModal}
              data-testid="open-custom-modal-btn"
              title={t('URL 공유 가능한 커스텀 Vim Golf 미션 생성기')}
            >
              {t('⛳ 미션 만들기')}
            </button>

            {/* 커스텀 키매핑 및 설정 파일 내보내기 모달 */}
            <button
              className="toolbar-btn nav-collapsible config-export-btn"
              onClick={onOpenConfigModal}
              data-testid="open-config-modal-btn"
              title={t('키매핑 프리셋 설정 및 .vimrc/init.lua/VS Code/IdeaVim 설정 내보내기')}
            >
              {t('⚙️ 설정/내보내기')}
            </button>

            {currentTab === 'course' && (
              <button
                className="toolbar-btn lesson-list-btn"
                onClick={onOpenLessonModal}
                data-testid="open-lesson-modal-btn"
              >
                {t('📚 레슨 목록')}
              </button>
            )}

            {onOpenCheatsheetModal && (
              <button
                type="button"
                className="toolbar-btn cheatsheet-open-btn"
                onClick={onOpenCheatsheetModal}
                data-testid="open-cheatsheet-modal-btn"
                title={t('전체 Vim · Neovim 단축키 검색 및 즉시 실행 치트시트 (:Cheatsheet)')}
              >
                {t('📖 치트시트')}
              </button>
            )}
          </div>

          {/* 에디터 보조 패널 & 인스펙터 드롭다운 그룹 */}
          <div className="nav-action-group nav-view-group nav-collapsible">
            <ViewPanelsDropdown
              showDiffView={showDiffView}
              onToggleDiffView={onToggleDiffView}
              isSandbox={currentTab === 'sandbox'}
              showRegisterInspector={showRegisterInspector}
              onToggleRegisterInspector={onToggleRegisterInspector}
              showMarksVisualizer={showMarksVisualizer}
              onToggleMarksVisualizer={onToggleMarksVisualizer}
              showGrammarAST={showGrammarAST}
              onToggleGrammarAST={onToggleGrammarAST}
              showActionTimeline={showActionTimeline}
              onToggleActionTimeline={onToggleActionTimeline}
              showVirtualKeyboard={showVirtualKeyboard}
              onToggleVirtualKeyboard={onToggleVirtualKeyboard}
              relativeLineNumbers={relativeLineNumbers}
              onToggleRelativeLineNumbers={onToggleRelativeLineNumbers}
              showMacroDebugger={showMacroDebugger}
              onToggleMacroDebugger={onToggleMacroDebugger}
              showWhichKey={showWhichKey}
              onToggleWhichKey={onToggleWhichKey}
            />
          </div>

          {/* 환경 설정 (테마, 타건음, 언어) 그룹 */}
          <div className="nav-action-group nav-settings-group">
            {/* 휴대폰 폭에서만 보이는 '더보기' 토글 */}
            <button
              type="button"
              className="toolbar-btn nav-more-btn"
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
              data-testid="toggle-more-actions-btn"
            >
              {moreOpen ? t('▲ 접기') : t('⋯ 더보기')}
            </button>
            {/* 에디터 컬러 테마 스위처 */}
            <span className="nav-collapsible">
              <ThemeSwitcher
                currentTheme={currentTheme}
                onThemeChange={onThemeChange}
              />
            </span>

            {/* 기계식 키보드 음향 효과음 토글 */}
            <button
              className={`toolbar-btn nav-collapsible sound-toggle-btn ${isMuted ? 'muted' : ''}`}
              onClick={onToggleMute}
              data-testid="toggle-sound-btn"
              title={t('기계식 키보드 타건 효과음 토글')}
            >
              {isMuted ? t('🔇 소리: OFF') : t('🔊 소리: ON')}
            </button>

            {/* 화면 언어 한/영 전환 */}
            <button
              className="toolbar-btn locale-toggle-btn"
              onClick={() => setLocale(locale === 'ko' ? 'en' : 'ko')}
              data-testid="toggle-locale-btn"
              title={t('화면 언어 전환 (한국어 / English)')}
              aria-label={t('화면 언어 전환 (한국어 / English)')}
            >
              🌐 {locale === 'ko' ? '한국어' : 'English'}
            </button>
          </div>
        </div>
      </div>

      {onOpenKeyReference && (
        <div className="key-reference-hint">
          <button type="button" onClick={onOpenKeyReference} data-testid="open-key-reference-btn">
            {t('⌨️ 키마다 하는 일 보기')}
            <kbd>Ctrl</kbd>+<kbd>/</kbd>
          </button>
        </div>
      )}
    </>
  );
}
