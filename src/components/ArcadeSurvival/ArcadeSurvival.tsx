import React from 'react';
import { Editor } from '../Editor/Editor';
import { StatusBar } from '../StatusBar/StatusBar';
import { Keycaster } from '../Keycaster/Keycaster';
import { VimMode } from '../../vim-engine';
import './ArcadeSurvival.css';
import { t } from '../../i18n';
import { useArcadeSurvival, ArcadePowerUps } from './useArcadeSurvival';

export type { ArcadePowerUps };

export interface ArcadeSurvivalProps {
  onPlayKeySound: (key: string, mode: VimMode) => void;
  onPlaySuccessSound: () => void;
  isMuted: boolean;
}

export const ArcadeSurvival: React.FC<ArcadeSurvivalProps> = ({
  onPlayKeySound,
  onPlaySuccessSound,
}) => {
  const {
    gameState,
    wave,
    score,
    combo,
    maxCombo,
    timeLeft,
    totalKeystrokes,
    powerups,
    freezeTimeLeft,
    banners,
    recentKeys,
    isNewRecord,
    analytics,
    editorState,
    currentMission,
    isFrozen,
    timeRatio,
    timeBarColor,
    handleStartGame,
    useChronoFreeze,
    useBugBomb,
  } = useArcadeSurvival({ onPlayKeySound, onPlaySuccessSound });

  return (
    <div className="arcade-survival-container" data-testid="arcade-survival">
      {/* 아케이드 헤더 HUD */}
      <header className="arcade-hud">
        <div className="hud-metric hud-wave">
          <span className="hud-label">WAVE</span>
          <span className="hud-value" data-testid="arcade-wave">
            {wave}
          </span>
        </div>

        <div className="hud-metric hud-score">
          <span className="hud-label">SCORE</span>
          <span className="hud-value" data-testid="arcade-score">
            {score.toLocaleString()}
          </span>
        </div>

        <div className="hud-metric hud-combo">
          <span className="hud-label">COMBO</span>
          <span className={`hud-value ${combo > 2 ? 'fire' : ''}`} data-testid="arcade-combo">
            {combo > 0 ? `${combo}x` : '-'}
          </span>
        </div>

        <div className="hud-metric hud-timer">
          <span className="hud-label">TIME</span>
          <span
            className={`hud-value ${isFrozen ? 'frozen' : timeLeft <= 3 ? 'critical' : ''}`}
            data-testid="arcade-timer"
          >
            {isFrozen ? `⏳ ${freezeTimeLeft.toFixed(1)}s` : `${timeLeft.toFixed(1)}s`}
          </span>
        </div>
      </header>

      {/* 파워업 스킬 바 */}
      <div className="hud-powerups-bar" data-testid="hud-powerups-bar">
        <button
          type="button"
          className={`powerup-btn powerup-freeze ${isFrozen ? 'active' : ''}`}
          onClick={useChronoFreeze}
          disabled={gameState !== 'playing' || powerups.freeze <= 0 || isFrozen}
          title={t('시간 정지: 5초간 카운트다운 정지 (Ctrl+Z)')}
          data-testid="powerup-freeze-btn"
        >
          <span className="powerup-icon">⏳</span>
          <span className="powerup-name">{t('시간 정지')}</span>
          <span className="powerup-hotkey">[Ctrl+Z]</span>
          <span className="powerup-count" data-testid="freeze-count">
            x{powerups.freeze}
          </span>
        </button>

        <button
          type="button"
          className="powerup-btn powerup-bomb"
          onClick={useBugBomb}
          disabled={gameState !== 'playing' || powerups.bomb <= 0}
          title={t('버그 폭탄: 현재 버그 즉시 폭파 (Ctrl+B)')}
          data-testid="powerup-bomb-btn"
        >
          <span className="powerup-icon">💣</span>
          <span className="powerup-name">{t('버그 폭탄')}</span>
          <span className="powerup-hotkey">[Ctrl+B]</span>
          <span className="powerup-count" data-testid="bomb-count">
            x{powerups.bomb}
          </span>
        </button>

        <div
          className={`powerup-badge powerup-shield ${powerups.shield > 0 ? 'active' : ''}`}
          title={t('콤보 & 생명선 쉴드: 방향키 페널티 방어 또는 타임아웃 시 +5초 자동 발동')}
          data-testid="powerup-shield-badge"
        >
          <span className="powerup-icon">🛡️</span>
          <span className="powerup-name">{t('쉴드')}</span>
          <span className="powerup-count" data-testid="shield-count">
            x{powerups.shield}
          </span>
        </div>
      </div>

      {/* 제한 시간 진행 바 (Time Gauge) */}
      <div className="time-bar-track">
        <div
          className={`time-bar-fill ${isFrozen ? 'frozen' : ''}`}
          style={{ width: `${timeRatio}%`, backgroundColor: timeBarColor }}
          data-testid="time-bar"
        />
      </div>

      {/* 실시간 팝업 이펙트 메시지 */}
      {banners.perfect && (
        <div className="arcade-banner perfect-banner" data-testid="perfect-banner">
          {banners.perfect}
        </div>
      )}
      {banners.penalty && (
        <div className="arcade-banner penalty-banner" data-testid="penalty-banner">
          {banners.penalty}
        </div>
      )}
      {banners.skill && (
        <div className="arcade-banner skill-banner" data-testid="skill-banner">
          {banners.skill}
        </div>
      )}
      {banners.bossAlert && (
        <div className="arcade-banner boss-alert-banner" data-testid="boss-alert-banner">
          {banners.bossAlert}
        </div>
      )}
      {banners.bossDefeated && (
        <div className="arcade-banner boss-defeated-banner" data-testid="boss-defeated-banner">
          {banners.bossDefeated}
        </div>
      )}

      {/* 미션 지침 가이드 */}
      <div
        className={`arcade-instruction-card ${currentMission.isBoss ? 'boss-card' : ''}`}
        data-testid="arcade-instruction-card"
      >
        <span className={`instruction-badge ${currentMission.isBoss ? 'boss-badge' : ''}`}>
          {currentMission.isBoss ? t('👑 보스전') : t('🎯 목표')}
        </span>
        <span className="instruction-text" data-testid="arcade-instruction">
          {currentMission.instruction}
        </span>
        <span className="instruction-par">{t('Par: {n}타', { n: currentMission.par })}</span>
      </div>

      {/* 에디터 뷰 */}
      <main className="arcade-editor-box">
        <Editor
          lines={editorState.lines}
          cursor={editorState.cursor}
          mode={editorState.mode}
          visualAnchor={editorState.visualAnchor}
          marks={editorState.marks}
          viewport={editorState.viewport}
          isFocused={gameState === 'playing'}
        />
        <StatusBar
          mode={editorState.mode}
          cursor={editorState.cursor}
          filename={`wave_${wave}_bug.ts`}
          pendingKeys={editorState.pendingKeys}
          commandType={editorState.commandType}
          commandBuffer={editorState.commandBuffer}
        />
        <Keycaster recentKeys={recentKeys} />
      </main>

      {/* 시작 대기 화면 오버레이 */}
      {gameState === 'ready' && (
        <div className="arcade-overlay ready-overlay" data-testid="arcade-ready-modal">
          <div className="overlay-dialog">
            <span className="dialog-icon">👾</span>
            <h2 className="dialog-title">Vim Defense: Bug Crusher</h2>
            <p className="dialog-desc">
              {t('에디터 코드 곳곳에 출몰하는 버그를 제한 시간 내에 정확한 Vim 명령어로 박멸하세요!')}
            </p>
            <ul className="dialog-rules">
              <li>{t('⏱️ 문제를 해결할 때마다 시간 보너스가 주어집니다.')}</li>
              <li>
                {t('⭐ Par 이하 최소 타수로 처치하면')}{' '}
                <strong>{t('PERFECT 보너스 (+200점)')}</strong>!
              </li>
              <li>
                {t('⚠️ 방향키 연타 사용 시')} <strong>{t('콤보가 0으로 리셋')}</strong>
                {t('됩니다.')}
              </li>
              <li>
                {t('👑 Wave 5 & 10에는 강력한')} <strong>{t('보스 버그')}</strong>
                {t('가 출현합니다!')}
              </li>
              <li>
                {t('⚡ [Ctrl+Z] 시간 정지, [Ctrl+B] 폭탄, 🛡️ 쉴드를 전략적으로 활용하세요!')}
              </li>
            </ul>
            <div className="best-score-badge">
              {t('최고 기록: {score}점 (최대 {wave} Wave)', {
                score: analytics.arcadeBestScore.toLocaleString(),
                wave: analytics.arcadeHighestWave,
              })}
            </div>
            <button
              className="start-arcade-btn"
              onClick={handleStartGame}
              data-testid="start-arcade-btn"
            >
              {t('🚀 서바이벌 시작 (Enter)')}
            </button>
          </div>
        </div>
      )}

      {/* 게임 오버 화면 오버레이 */}
      {gameState === 'gameover' && (
        <div className="arcade-overlay gameover-overlay" data-testid="arcade-gameover-modal">
          <div className="overlay-dialog">
            <span className="dialog-icon">💥</span>
            <h2 className="dialog-title gameover">TIME OVER!</h2>
            {isNewRecord && <div className="new-record-tag">🎉 NEW HIGH SCORE!</div>}
            <div className="result-stats-grid">
              <div className="stat-card">
                <span className="stat-label">{t('최종 점수')}</span>
                <span className="stat-num highlight" data-testid="final-score">
                  {score.toLocaleString()}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('도달 웨이브')}</span>
                <span className="stat-num">{wave}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('최대 콤보')}</span>
                <span className="stat-num">{maxCombo}x</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('총 타수')}</span>
                <span className="stat-num">{totalKeystrokes}</span>
              </div>
            </div>
            <button
              className="start-arcade-btn retry-btn"
              onClick={handleStartGame}
              data-testid="retry-arcade-btn"
            >
              {t('🔄 다시 도전하기 (Enter)')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
