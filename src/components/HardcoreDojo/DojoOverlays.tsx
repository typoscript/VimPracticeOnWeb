import { DojoDrillType } from './HardcoreDojo.types';
import { WeaknessDrillPlan } from '../../utils/weaknessDrillAnalyzer';
import { t } from '../../i18n';

export type DojoGamePhase =
  | 'ready'
  | 'running'
  | 'finished'
  | 'sudden-death-failed'
  | 'sudden-death-cleared'
  | 'weakness-cleared';

interface DojoTierInfo {
  title: string;
  desc: string;
  className: string;
}

interface DojoOverlaysProps {
  gameState: DojoGamePhase;
  selectedDrill: DojoDrillType;
  metaTitle: string;
  metaDescription: string;
  weaknessPlan: WeaknessDrillPlan;
  onRefreshWeaknessPlan: () => void;
  onStartGame: () => void;
  onOpenLeaderboard: () => void;
  tierInfo: DojoTierInfo;
  isNewRecord: boolean;
  score: number;
  targetsHit: number;
  keystrokes: number;
  combo: number;
  timeLeft: number;
  finalTime: number | null;
  myRank: number | null;
  suddenDeathFailReason: string | null;
}

/**
 * 하드코어 도장 시작 대기/결과(일반 종료, 서든데스 탈락·완주, 약점 드릴 완주) 오버레이입니다.
 */
export function DojoOverlays({
  gameState,
  selectedDrill,
  metaTitle,
  metaDescription,
  weaknessPlan,
  onRefreshWeaknessPlan,
  onStartGame,
  onOpenLeaderboard,
  tierInfo,
  isNewRecord,
  score,
  targetsHit,
  keystrokes,
  combo,
  timeLeft,
  finalTime,
  myRank,
  suddenDeathFailReason,
}: DojoOverlaysProps) {
  if (gameState === 'ready') {
    return (
      <div className="dojo-overlay">
        <h3>{metaTitle}</h3>
        <p>{metaDescription}</p>
        {selectedDrill === 'weakness-custom' ? (
          <>
            <div className="dojo-weakness-plan-box" data-testid="dojo-weakness-plan-box">
              <div className="dojo-weakness-plan-title">
                {t('🧬 약점 기반 맞춤 10문제 세트 구성:')}
              </div>
              <div className="dojo-weakness-pills">
                {weaknessPlan.topWeaknesses.map((w, idx) => (
                  <div key={w.id} className="dojo-weakness-pill">
                    <strong>#{idx + 1} {t(w.label)}</strong>
                    <span>{w.reason}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="dojo-btn-row">
              <button
                type="button"
                className="dojo-start-btn"
                style={{ background: '#7dcfff', color: '#1a1b26' }}
                onClick={onStartGame}
                data-testid="dojo-weakness-start-btn"
              >
                {t('🧬 약점 맞춤 드릴 시작 (10문제)')}
              </button>
              <button
                type="button"
                className="dojo-leaderboard-btn"
                onClick={onRefreshWeaknessPlan}
                data-testid="dojo-weakness-refresh-btn"
              >
                {t('🔄 통계 재분석')}
              </button>
            </div>
          </>
        ) : selectedDrill === 'pro-master' ? (
          <>
            <div style={{ color: '#bb9af7', fontSize: '0.9rem', marginBottom: '1.25rem', fontWeight: 700 }}>
              {t('👑 실무 핵심 텍스트 객체와 연산자 10문제를 최단 타수로 돌파하세요!')}
            </div>
            <button
              type="button"
              className="dojo-start-btn"
              style={{ background: '#bb9af7', color: '#1a1b26' }}
              onClick={onStartGame}
            >
              {t('👑 프로 마스터 도전 시작 (10연타)')}
            </button>
          </>
        ) : selectedDrill === 'sudden-death' ? (
          <>
            <div style={{ color: '#f7768e', fontSize: '0.9rem', marginBottom: '1.25rem', fontWeight: 700 }}>
              {t('⚡ 단 1회의 실수도 허용되지 않는 서든데스! 10연속 노미스로 목표를 완주하세요!')}
            </div>
            <button type="button" className="dojo-start-btn sudden-death" onClick={onStartGame}>
              {t('⚡ 서든데스 도전 시작 (10연타)')}
            </button>
          </>
        ) : (
          <>
            <div style={{ color: '#bb9af7', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              {t('⚡ 30초 동안 방향키 없이 최단 경로로 과녁을 격파하세요!')}
            </div>
            <button type="button" className="dojo-start-btn" onClick={onStartGame}>
              {t('🥋 수련 시작 (30초)')}
            </button>
          </>
        )}
      </div>
    );
  }

  if (gameState === 'finished') {
    return (
      <div className="dojo-overlay">
        <div className="dojo-tier-badge">{tierInfo.title.split(' ')[0]}</div>
        <div className={`dojo-tier-title ${tierInfo.className}`}>{tierInfo.title}</div>
        <div style={{ color: '#9aa5ce', fontSize: '0.9rem', marginBottom: '1rem' }}>
          {tierInfo.desc}
        </div>

        {isNewRecord && <div className="dojo-new-record-tag">{t('🎉 신기록 달성!')}</div>}

        <div className="dojo-stats-summary">
          <div className="dojo-stat-item">
            <div className="num">{score}</div>
            <div className="label">{t('최종 점수')}</div>
          </div>
          <div className="dojo-stat-item">
            <div className="num">{t('{n}개', { n: targetsHit })}</div>
            <div className="label">{t('처치 과녁')}</div>
          </div>
          <div className="dojo-stat-item">
            <div className="num">{Math.round((targetsHit / 30) * 60)}</div>
            <div className="label">{t('SPM (목표/분)')}</div>
          </div>
          <div className="dojo-stat-item">
            <div className="num">{Math.round((keystrokes / 30) * 60)}</div>
            <div className="label">{t('APM (타수/분)')}</div>
          </div>
        </div>

        <div className="dojo-btn-row">
          <button type="button" className="dojo-start-btn" onClick={onStartGame}>
            {t('🔄 다시 수련하기')}
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'sudden-death-failed') {
    return (
      <div className="dojo-overlay failed">
        <div className="dojo-tier-badge">💀</div>
        <div className="dojo-tier-title bronze" style={{ color: '#f7768e' }}>
          {t('서든데스 탈락!')}
        </div>
        <div className="dojo-failure-reason">
          {t('탈락 사유:')} <strong>{suddenDeathFailReason || t('오입력 감지')}</strong>
        </div>

        <div className="dojo-stats-summary">
          <div className="dojo-stat-item">
            <div className="num" style={{ color: '#ff9e64' }}>
              {combo} / 10
            </div>
            <div className="label">{t('달성 콤보')}</div>
          </div>
          <div className="dojo-stat-item">
            <div className="num">{timeLeft.toFixed(2)}s</div>
            <div className="label">{t('생존 시간')}</div>
          </div>
          <div className="dojo-stat-item">
            <div className="num">{keystrokes}</div>
            <div className="label">{t('총 타수')}</div>
          </div>
        </div>

        <div className="dojo-btn-row">
          <button type="button" className="dojo-start-btn" onClick={onStartGame}>
            {t('🔄 다시 도전하기')}
          </button>
          <button type="button" className="dojo-leaderboard-btn" onClick={onOpenLeaderboard}>
            {t('🏆 랭킹 보드 보기')}
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'sudden-death-cleared') {
    return (
      <div className="dojo-overlay cleared">
        <div className="dojo-tier-badge">👑</div>
        <div className="dojo-tier-title master" style={{ color: '#e0af68' }}>
          {t('🎉 10연타 서든데스 완전 정복!')}
        </div>
        <div style={{ color: '#9ece6a', fontSize: '1rem', marginBottom: '1rem', fontWeight: 700 }}>
          {t('🏆 명예의 전당 {rank}위 등극!', { rank: myRank ?? 1 })}
        </div>

        <div className="dojo-stats-summary">
          <div className="dojo-stat-item">
            <div className="num" style={{ color: '#9ece6a' }}>
              {finalTime?.toFixed(2)}s
            </div>
            <div className="label">{t('완주 시간')}</div>
          </div>
          <div className="dojo-stat-item">
            <div className="num" style={{ color: '#ff9e64' }}>
              10 / 10
            </div>
            <div className="label">{t('달성 콤보')}</div>
          </div>
          <div className="dojo-stat-item">
            <div className="num">{Math.round((10 / Math.max(1, finalTime ?? 1)) * 60)}</div>
            <div className="label">{t('SPM (목표/분)')}</div>
          </div>
          <div className="dojo-stat-item">
            <div className="num">{keystrokes}</div>
            <div className="label">{t('총 타수')}</div>
          </div>
        </div>

        <div className="dojo-btn-row">
          <button type="button" className="dojo-start-btn" onClick={onStartGame}>
            {t('🔄 다시 도전하기')}
          </button>
          <button type="button" className="dojo-leaderboard-btn" onClick={onOpenLeaderboard}>
            {t('🏆 랭킹 보드 보기')}
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'weakness-cleared') {
    return (
      <div className="dojo-overlay cleared" data-testid="dojo-weakness-cleared">
        <div className="dojo-tier-badge">🧬</div>
        <div className="dojo-tier-title master" style={{ color: '#7dcfff' }}>
          {t('🎉 약점 집중 맞춤 드릴 완주!')}
        </div>
        <div style={{ color: '#9ece6a', fontSize: '0.95rem', marginBottom: '1rem', fontWeight: 700 }}>
          {t('약점 집중 교정 10문제를 모두 완료했습니다!')}
        </div>
        {isNewRecord && <div className="dojo-new-record-tag">{t('🎉 신기록 달성!')}</div>}

        <div className="dojo-stats-summary">
          <div className="dojo-stat-item">
            <div className="num" style={{ color: '#7dcfff' }}>
              {finalTime?.toFixed(2)}s
            </div>
            <div className="label">{t('완주 시간')}</div>
          </div>
          <div className="dojo-stat-item">
            <div className="num">{score}</div>
            <div className="label">{t('최종 점수')}</div>
          </div>
          <div className="dojo-stat-item">
            <div className="num">10 / 10</div>
            <div className="label">{t('달성 콤보')}</div>
          </div>
          <div className="dojo-stat-item">
            <div className="num">{keystrokes}</div>
            <div className="label">{t('총 타수')}</div>
          </div>
        </div>

        <div className="dojo-btn-row">
          <button type="button" className="dojo-start-btn" onClick={onStartGame}>
            {t('🔄 새 약점 드릴 다시 풀기')}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
