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

        <div className="nav-actions">
          {/* 주요 훈련 및 모달 도구 그룹 */}
          <div className="nav-action-group nav-tools-group">
            {/* 🔥 하드코어 수련 모드 토글 스위치 */}
            <button
              className={`toolbar-btn hardcore-mode-btn ${hardcoreMode ? 'active' : ''}`}
              onClick={onToggleHardcoreMode}
              data-testid="toggle-hardcore-mode-btn"
              title={t('🔥 하드코어 수련 모드: 방향키 및 마우스 완전 차단, 1.5초 3회 초과 연타 무시')}
            >
              {hardcoreMode ? t('🔥 하드코어: ON') : t('🔥 하드코어: OFF')}
            </button>

            {/* 데일리 챌린지 모달 */}
            <button
              className="toolbar-btn daily-challenge-btn"
              onClick={onOpenDailyModal}
              data-testid="open-daily-modal-btn"
              title={t('오늘의 데일리 Vim Golf 챌린지')}
            >
              {t('📅 데일리')}
            </button>

            {/* 숙련도 분석 대시보드 모달 */}
            <button
              className="toolbar-btn analytics-btn"
              onClick={onOpenAnalyticsModal}
              data-testid="open-analytics-modal-btn"
              title={t('Vim 숙련도 5각 레이더 및 명령어 사용 통계 대시보드')}
            >
              {t('📊 숙련도 분석')}
            </button>

            {/* 커스텀 Vim Golf 미션 생성 모달 */}
            <button
              className="toolbar-btn custom-mission-btn"
              onClick={onOpenCustomModal}
              data-testid="open-custom-modal-btn"
              title={t('URL 공유 가능한 커스텀 Vim Golf 미션 생성기')}
            >
              {t('⛳ 미션 만들기')}
            </button>

            {/* 커스텀 키매핑 및 설정 파일 내보내기 모달 */}
            <button
              className="toolbar-btn config-export-btn"
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
          <div className="nav-action-group nav-view-group">
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
            {/* 에디터 컬러 테마 스위처 */}
            <ThemeSwitcher
              currentTheme={currentTheme}
              onThemeChange={onThemeChange}
            />

            {/* 기계식 키보드 음향 효과음 토글 */}
            <button
              className={`toolbar-btn sound-toggle-btn ${isMuted ? 'muted' : ''}`}
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

      <section className="key-cheatsheet" aria-label="Keyboard Shortcuts">
        <span className="cheat-item"><code>h j k l</code> {t('이동')}</span>
        <span className="cheat-item"><code>w b e</code> {t('단어 점프')}</span>
        <span className="cheat-item"><code>f F t T</code> {t('문자 탐색')}</span>
        <span className="cheat-item"><code>/ n N *</code> {t('키워드 검색')}</span>
        <span className="cheat-item"><code>{t(': [숫자] / :s')}</code> {t('커맨드라인')}</span>
        <span className="cheat-item"><code>0 $ ^</code> {t('줄 이동')}</span>
        <span className="cheat-item"><code>i a I A o O</code> {t('입력 진입')}</span>
        <span className="cheat-item"><code>Esc</code> {t('일반 모드')}</span>
        <span className="cheat-item"><code>x</code> {t('글자 삭제')}</span>
        <span className="cheat-item"><code>cw cc C r</code> {t('수정/교체')}</span>
        <span className="cheat-item"><code>iw i" i(</code> {t('텍스트 객체')}</span>
        <span className="cheat-item"><code>v / V</code> {t('영역 선택')}</span>
        <span className="cheat-item"><code>dd dw</code> {t('줄/단어 삭제')}</span>
        <span className="cheat-item"><code>.</code> {t('직전 변경 반복')}</span>
        <span className="cheat-item"><code>m ' Ctrl-o</code> {t('마크/점프')}</span>
        <span className="cheat-item"><code>J ~ &gt;&gt; Ctrl-a</code> {t('라인/편집')}</span>
        <span className="cheat-item"><code>:g :norm</code> {t('일괄/글로벌')}</span>
        <span className="cheat-item"><code>zz H M L</code> {t('뷰포트/스크롤')}</span>
        <span className="cheat-item"><code>"a "0 "_</code> {t('레지스터')}</span>
        <span className="cheat-item"><code>:sp :vsp Ctrl-w</code> {t('창 분할')}</span>
        <span className="cheat-item"><code>p</code> {t('붙여넣기')}</span>
        <span className="cheat-item"><code>u / Ctrl-r</code> {t('실행취소/다시실행')}</span>
      </section>
    </>
  );
}
