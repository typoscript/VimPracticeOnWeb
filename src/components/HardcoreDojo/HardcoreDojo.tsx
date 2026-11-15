import { DojoDrillType } from './HardcoreDojo.types';
import { DojoArenaContent } from './DojoArenaContent';
import { DojoOverlays } from './DojoOverlays';
import { DojoLeaderboardModal } from './DojoLeaderboardModal';
import { DOJO_DRILL_METAS } from './drillGenerators';
import { useHardcoreDojo } from './useHardcoreDojo';
import { VimMode } from '../../vim-engine';
import { LessonProgress } from '../../utils/storage';
import './HardcoreDojo.css';
import { t } from '../../i18n';

export interface HardcoreDojoProps {
  onBackToCourse?: () => void;
  playKeySound?: (key: string, mode: VimMode) => void;
  playSuccessSound?: () => void;
  initialDrill?: { drill: DojoDrillType; nonce: number } | null;
  analyticsProgress?: LessonProgress;
}

export function HardcoreDojo({
  onBackToCourse,
  playKeySound,
  playSuccessSound,
  initialDrill,
  analyticsProgress,
}: HardcoreDojoProps) {
  const {
    selectedDrill,
    gameState,
    weaknessPlan,
    timeLeft,
    score,
    targetsHit,
    keystrokes,
    combo,
    suddenDeathFailReason,
    finalTime,
    myRank,
    isLeaderboardOpen,
    setIsLeaderboardOpen,
    leaderboard,
    currentProblem,
    editorState,
    highScores,
    isNewRecord,
    isShaking,
    isTargetHit,
    warningMessage,
    arenaRef,
    handleSelectDrill,
    startGame,
    handleEditorClick,
    handleKeyDown,
    isTenStageMode,
    activeWeaknessItem,
    currentSpm,
    currentApm,
    getTier,
    currentMeta,
    activeHighScore,
    handleRefreshWeaknessPlan,
  } = useHardcoreDojo({
    playKeySound,
    playSuccessSound,
    initialDrill,
    analyticsProgress,
  });

  return (
    <div className="hardcore-dojo-container">
      {/* 상단 네비게이션 & 헤더 */}
      <div className="dojo-header">
        <div className="dojo-title-group">
          <h2>{t('🥋 하드코어 도장 (Vim Reflex Drills)')}</h2>
          <div className="dojo-subtitle">
            {t('나쁜 습관(방향키/연타)을 교정하고 30초 동안 순수 모션 근육 기억을 단련합니다.')}
            {activeHighScore && (
              <span style={{ marginLeft: '0.75rem', color: '#ff9e64', fontWeight: 600 }}>
                {t('🏆 {title} 최고: {score}점 ({hits}개)', {
                  title: currentMeta.title,
                  score: activeHighScore.score,
                  hits: activeHighScore.targetsHit,
                })}
              </span>
            )}
          </div>
        </div>
        <div className="dojo-header-actions">
          <button
            type="button"
            className="dojo-leaderboard-toggle-btn"
            onClick={() => setIsLeaderboardOpen(true)}
          >
            {t('🏆 명예의 전당')}
          </button>
          {onBackToCourse && (
            <button type="button" className="dojo-back-btn" onClick={onBackToCourse}>
              {t('← 연습장으로 돌아가기')}
            </button>
          )}
        </div>
      </div>

      {/* 드릴 선택 탭 */}
      <div className="dojo-drill-tabs">
        {(Object.keys(DOJO_DRILL_METAS) as DojoDrillType[]).map((drillId) => {
          const meta = DOJO_DRILL_METAS[drillId];
          const best = highScores[drillId];
          const isSpeedrun = drillId === 'sudden-death' || drillId === 'pro-master';
          return (
            <button
              key={drillId}
              type="button"
              className={`dojo-drill-tab ${selectedDrill === drillId ? 'active' : ''} ${
                isSpeedrun ? 'sudden-death' : ''
              }`}
              onClick={() => handleSelectDrill(drillId)}
            >
              <div className="dojo-tab-badge">{meta.badge}</div>
              <div className="dojo-tab-title">{meta.title}</div>
              <div className="dojo-tab-desc">{meta.description}</div>
              {!isSpeedrun && drillId !== 'weakness-custom' && best && (
                <div style={{ fontSize: '0.72rem', color: '#ff9e64', marginTop: '0.35rem' }}>
                  {t('👑 최고: {score}점 ({hits}개)', { score: best.score, hits: best.targetsHit })}
                </div>
              )}
              {drillId === 'weakness-custom' && (
                <div style={{ fontSize: '0.72rem', color: '#7dcfff', marginTop: '0.35rem', fontWeight: 700 }}>
                  {t('🧬 내 약점 집중 10문제')}
                </div>
              )}
              {isSpeedrun && (
                <div style={{ fontSize: '0.72rem', color: drillId === 'pro-master' ? '#bb9af7' : '#f7768e', marginTop: '0.35rem', fontWeight: 700 }}>
                  {drillId === 'pro-master' ? t('👑 실무 프로 10연타') : t('⚡ 10연타 노미스 서든데스')}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 대시보드 게이지 & 메트릭 */}
      <div className="dojo-dashboard">
        {isTenStageMode ? (
          /* 10문제 진행도 프로그레스 바 */
          <div className="dojo-progress-track sudden-death">
            <div
              className="dojo-progress-fill sudden-death"
              style={{ width: `${(combo / 10) * 100}%` }}
            />
          </div>
        ) : (
          /* 일반 드릴 30초 게이지 바 */
          <div className="dojo-progress-track">
            <div
              className={`dojo-progress-fill ${timeLeft <= 5 ? 'danger' : ''}`}
              style={{ width: `${(timeLeft / 30.0) * 100}%` }}
            />
          </div>
        )}

        <div className="dojo-metrics-grid">
          {isTenStageMode ? (
            <>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('⏱️ 경과 시간')}</div>
                <div className="dojo-metric-value highlight">{timeLeft.toFixed(1)}s</div>
              </div>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">
                  {selectedDrill === 'weakness-custom' ? t('진행 문제') : t('🔥 연속 콤보')}
                </div>
                <div className="dojo-metric-value highlight">{combo} / 10</div>
              </div>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('🎯 점수')}</div>
                <div className="dojo-metric-value">{t('{n}점', { n: score })}</div>
              </div>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('⚡ SPM (목표/분)')}</div>
                <div className="dojo-metric-value">{currentSpm}</div>
              </div>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('⌨️ APM (타수/분)')}</div>
                <div className="dojo-metric-value">{currentApm}</div>
              </div>
            </>
          ) : (
            <>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('⏱️ 남은 시간')}</div>
                <div className={`dojo-metric-value ${timeLeft <= 5 ? 'highlight' : ''}`}>
                  {timeLeft.toFixed(1)}s
                </div>
              </div>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('🎯 점수')}</div>
                <div className="dojo-metric-value highlight">{t('{n}점', { n: score })}</div>
              </div>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('👾 처치 과녁')}</div>
                <div className="dojo-metric-value">{t('{n}개', { n: targetsHit })}</div>
              </div>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('⚡ SPM (목표/분)')}</div>
                <div className="dojo-metric-value">{currentSpm}</div>
              </div>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('⌨️ APM (타수/분)')}</div>
                <div className="dojo-metric-value">{currentApm}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 아레나 에디터 박스 */}
      <div
        ref={arenaRef}
        tabIndex={0}
        className={`dojo-arena-wrapper ${isShaking ? 'shake' : ''} ${
          isTargetHit ? 'hit' : ''
        } ${selectedDrill === 'sudden-death' ? 'sudden-death-arena' : ''}`}
        onKeyDown={handleKeyDown}
        onClick={handleEditorClick}
        aria-label="Dojo Editor Arena"
      >
        {/* 경고 툴팁 토스트 */}
        {warningMessage && <div className="dojo-warning-toast">{warningMessage}</div>}

        <DojoArenaContent
          selectedDrill={selectedDrill}
          editorState={editorState}
          currentProblem={currentProblem}
          activeWeaknessItem={activeWeaknessItem}
          keyInstructions={currentMeta.keyInstructions}
        />

        <DojoOverlays
          gameState={gameState}
          selectedDrill={selectedDrill}
          metaTitle={currentMeta.title}
          metaDescription={currentMeta.description}
          weaknessPlan={weaknessPlan}
          onRefreshWeaknessPlan={handleRefreshWeaknessPlan}
          onStartGame={startGame}
          onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
          tierInfo={getTier()}
          isNewRecord={isNewRecord}
          score={score}
          targetsHit={targetsHit}
          keystrokes={keystrokes}
          combo={combo}
          timeLeft={timeLeft}
          finalTime={finalTime}
          myRank={myRank}
          suddenDeathFailReason={suddenDeathFailReason}
        />
      </div>

      <DojoLeaderboardModal
        isOpen={isLeaderboardOpen}
        leaderboard={leaderboard}
        onClose={() => setIsLeaderboardOpen(false)}
      />
    </div>
  );
}
