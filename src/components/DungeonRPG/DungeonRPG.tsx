import React from 'react';
import { DUNGEON_STAGES, DUNGEON_SKILLS } from '../../data/dungeonStages';
import { VimMode } from '../../vim-engine';
import './DungeonRPG.css';
import { t } from '../../i18n';
import { useDungeonRPG } from './useDungeonRPG';

export interface DungeonRPGProps {
  onPlayKeySound: (key: string, mode: VimMode) => void;
  onPlaySuccessSound: () => void;
  isMuted: boolean;
}

export const DungeonRPG: React.FC<DungeonRPGProps> = ({
  onPlayKeySound,
  onPlaySuccessSound,
}) => {
  const {
    saveData,
    currentStageIndex,
    stage,
    editorState,
    keystrokes,
    hasKey,
    doorOpen,
    isCompleted,
    starsEarned,
    newBadge,
    unlockedSkill,
    slashEffect,
    toastMessage,
    loadStage,
  } = useDungeonRPG({ onPlayKeySound, onPlaySuccessSound });

  return (
    <div className="dungeon-rpg-container" data-testid="dungeon-rpg-container">
      {/* 상단 던전 헤더 HUD */}
      <header className="dungeon-hud">
        <div className="hud-left">
          <div className="stage-selector">
            <span className="dungeon-badge">🗡️ VIM ADVENTURES</span>
            <select
              className="stage-dropdown"
              value={currentStageIndex}
              onChange={(e) => loadStage(Number(e.target.value))}
              data-testid="stage-select-dropdown"
            >
              {DUNGEON_STAGES.map((s, idx) => {
                const isUnlocked = idx === 0 || idx < saveData.highestUnlockedStage;
                const rec = saveData.stageRecords[s.id];
                const stars = rec ? '⭐'.repeat(rec.stars) : '';
                return (
                  <option key={s.id} value={idx} disabled={!isUnlocked}>
                    {t(s.title)} {stars} {!isUnlocked ? '🔒' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="hud-center">
          <div className="hud-metric stroke-metric">
            <span className="metric-label">{t('타수 (MANA)')}</span>
            <span
              className={`metric-val ${keystrokes <= stage.par ? 'good' : 'warning'}`}
              data-testid="dungeon-keystrokes"
            >
              {keystrokes} / {stage.par}
            </span>
          </div>

          <div className="hud-metric key-metric">
            <span className="metric-label">{t('열쇠')}</span>
            <span className="metric-val" data-testid="dungeon-key-status">
              {hasKey ? t('🗝️ 보유 중') : t('❌ 없음')}
            </span>
          </div>

          <div className="hud-metric door-metric">
            <span className="metric-label">{t('철문')}</span>
            <span className="metric-val" data-testid="dungeon-door-status">
              {doorOpen ? t('🔓 개방됨') : t('🔒 잠김')}
            </span>
          </div>
        </div>

        <div className="hud-right">
          <button
            className="dungeon-reset-btn"
            onClick={() => loadStage(currentStageIndex)}
            data-testid="dungeon-restart-btn"
          >
            {t('🔄 스테이지 재시작')}
          </button>
        </div>
      </header>

      {/* 미션 목표 안내 바 */}
      <div className="dungeon-objective-bar">
        <span className="objective-icon">🎯</span>
        <span className="objective-text" data-testid="dungeon-objective">
          {t(stage.objective)}
        </span>
        <span className="objective-hint" title={t(stage.hint)}>
          💡 {t(stage.hint)}
        </span>
      </div>

      {/* 실시간 알림 토스트 */}
      {toastMessage && (
        <div className="dungeon-toast" data-testid="dungeon-toast">
          {toastMessage}
        </div>
      )}

      {/* 2D 타일맵 그리드 렌더러 */}
      <main className="dungeon-viewport" data-testid="dungeon-grid-viewport">
        <div className="dungeon-grid">
          {stage.tileMap.map((tileRow, rIdx) => {
            const lineText = editorState.lines[rIdx] || '';
            return (
              <div key={rIdx} className="dungeon-grid-row">
                {tileRow.split('').map((mapTile, cIdx) => {
                  const isPlayer =
                    editorState.cursor.line === rIdx && editorState.cursor.col === cIdx;
                  const charOnBoard = lineText[cIdx] || ' ';
                  const isWall = mapTile === '#';
                  const isWater = mapTile === '~';
                  const isGap = mapTile === '_';
                  const isDoor = mapTile === 'D';
                  const isExit = mapTile === 'E';
                  const isKey = mapTile === 'K' || charOnBoard === 'K';
                  const isBoss =
                    (stage.id === 5 && rIdx === 2 && cIdx >= 3 && cIdx <= 13) ||
                    (stage.id === 6 && rIdx === 2 && cIdx >= 4 && cIdx <= 21);
                  const isDragon = stage.id === 6 && isBoss;

                  let tileClass = 'tile-floor';
                  if (isWall) tileClass = 'tile-wall';
                  else if (isWater) tileClass = 'tile-water';
                  else if (isGap) {
                    tileClass = lineText.includes('BRIDGE') ? 'tile-bridge' : 'tile-gap';
                  } else if (isDoor) tileClass = doorOpen ? 'tile-door-open' : 'tile-door-closed';
                  else if (isExit) tileClass = 'tile-exit';

                  return (
                    <div
                      key={cIdx}
                      className={`dungeon-tile ${tileClass} ${isPlayer ? 'player-tile' : ''}`}
                      data-testid={`tile-${rIdx}-${cIdx}`}
                    >
                      {/* 타일별 아이콘 / 스프라이트 */}
                      {isPlayer ? (
                        <div className="player-avatar" data-testid="player-avatar">
                          🧙‍♂️
                        </div>
                      ) : isKey && !hasKey ? (
                        <span className="entity-key">🗝️</span>
                      ) : isDoor ? (
                        <span className="entity-door">{doorOpen ? '🚪' : '🔒'}</span>
                      ) : isExit ? (
                        <span className="entity-exit">✨</span>
                      ) : isWater ? (
                        <span className="water-wave">{charOnBoard !== '~' ? charOnBoard : '≋'}</span>
                      ) : isBoss && charOnBoard !== ' ' ? (
                        <span
                          className={`entity-boss ${isDragon ? 'entity-dragon' : ''} ${
                            stage.id === 6 && keystrokes > stage.par ? 'boss-enraged' : ''
                          }`}
                        >
                          {charOnBoard}
                        </span>
                      ) : (
                        <span className="tile-char">{charOnBoard}</span>
                      )}

                      {/* 타격 이펙트 */}
                      {slashEffect &&
                        slashEffect.line === rIdx &&
                        slashEffect.col === cIdx && (
                          <div className="slash-animation">{slashEffect.label}</div>
                        )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </main>

      {/* 하단: 보유한 Vim 스킬 인벤토리 바 */}
      <footer className="dungeon-skills-bar" data-testid="dungeon-skills-bar">
        <span className="skills-bar-title">🎒 VIM SKILLS</span>
        <div className="skills-slots">
          {Object.values(DUNGEON_SKILLS).map((skill) => {
            const isUnlocked = saveData.unlockedSkillIds.includes(skill.id);
            return (
              <div
                key={skill.id}
                className={`skill-slot ${isUnlocked ? 'unlocked' : 'locked'}`}
                title={`${t(skill.name)}: ${t(skill.description)}`}
                data-testid={`skill-slot-${skill.id}`}
              >
                <span className="skill-icon">{isUnlocked ? skill.icon : '🔒'}</span>
                <span className="skill-keys">[{skill.keys[0]}]</span>
                <span className="skill-name">{t(skill.name)}</span>
              </div>
            );
          })}
        </div>
      </footer>

      {/* 클리어 & 신규 스킬 해금 모달 */}
      {isCompleted && (
        <div className="dungeon-modal-overlay" data-testid="dungeon-clear-modal">
          <div className="dungeon-clear-dialog">
            <span className="dialog-trophy">🎉</span>
            <h2 className="clear-title">{t('{title} 클리어!', { title: t(stage.title) })}</h2>
            <div className="clear-stars">
              {'⭐'.repeat(starsEarned)}{' '}
              {starsEarned === 3 ? t('(마스터 Par 달성!)') : ''}
            </div>

            <p className="clear-stat">
              {t('소모 마나(타수):')} <strong>{t('{n}타', { n: keystrokes })}</strong>{' '}
              {t('(Par 기준: {n}타)', { n: stage.par })}
            </p>

            {unlockedSkill && (
              <div className="unlocked-skill-card" data-testid="unlocked-skill-card">
                <span className="scroll-tag">{t('📜 신규 Vim 스킬 스크롤 획득!')}</span>
                <div className="skill-detail">
                  <span className="detail-icon">{unlockedSkill.icon}</span>
                  <div>
                    <h4>{t(unlockedSkill.name)}</h4>
                    <p>{t(unlockedSkill.description)}</p>
                  </div>
                </div>
              </div>
            )}

            {newBadge && (
              <div className="new-badge-banner" data-testid="new-badge-banner">
                <span>{newBadge}</span>
              </div>
            )}

            <div className="clear-actions">
              {currentStageIndex < DUNGEON_STAGES.length - 1 ? (
                <button
                  className="next-stage-btn"
                  onClick={() => loadStage(currentStageIndex + 1)}
                  data-testid="next-stage-btn"
                >
                  {t('다음 스테이지로 진입 (Enter) >')}
                </button>
              ) : (
                <button
                  className="next-stage-btn"
                  onClick={() => loadStage(0)}
                  data-testid="restart-from-first-btn"
                >
                  {t('🏆 전설 달성! 첫 스테이지로 >')}
                </button>
              )}
              <button
                className="retry-stage-btn"
                onClick={() => loadStage(currentStageIndex)}
              >
                {t('더 적은 타수로 재도전')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
