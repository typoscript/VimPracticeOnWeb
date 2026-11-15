import { DojoLeaderboardEntry } from './HardcoreDojo.types';
import { t } from '../../i18n';

interface DojoLeaderboardModalProps {
  isOpen: boolean;
  leaderboard: DojoLeaderboardEntry[];
  onClose: () => void;
}

/**
 * 하드코어 도장 서든데스 명예의 전당 실시간 랭킹 모달입니다.
 */
export function DojoLeaderboardModal({
  isOpen,
  leaderboard,
  onClose,
}: DojoLeaderboardModalProps) {
  if (!isOpen) return null;

  return (
    <div className="dojo-modal-backdrop" onClick={onClose}>
      <div
        className="dojo-leaderboard-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Dojo Leaderboard"
      >
        <div className="dojo-modal-header">
          <h3>{t('🏆 하드코어 도장 서든데스 명예의 전당')}</h3>
          <button
            type="button"
            className="dojo-modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="dojo-modal-subtitle">
          {t('노미스 10연타를 가장 빠른 속도로 주파한 전설의 Vim 전사들')}
        </p>

        <div className="dojo-table-container">
          <table className="dojo-leaderboard-table">
            <thead>
              <tr>
                <th>{t('순위')}</th>
                <th>{t('플레이어')}</th>
                <th>{t('클리어 시간')}</th>
                <th>{t('칭호')}</th>
                <th>{t('일시')}</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, index) => {
                const isTop1 = index === 0;
                const isTop2 = index === 1;
                const isTop3 = index === 2;
                return (
                  <tr
                    key={entry.id}
                    className={
                      isTop1
                        ? 'rank-gold'
                        : isTop2
                        ? 'rank-silver'
                        : isTop3
                        ? 'rank-bronze'
                        : ''
                    }
                  >
                    <td className="rank-col">
                      {isTop1
                        ? '🥇 1'
                        : isTop2
                        ? '🥈 2'
                        : isTop3
                        ? '🥉 3'
                        : `${index + 1}`}
                    </td>
                    <td className="player-col">{entry.playerName}</td>
                    <td className="time-col">{entry.clearTime.toFixed(2)}s</td>
                    <td className="tier-col">{entry.tier}</td>
                    <td className="date-col">
                      {new Date(entry.completedAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="dojo-modal-footer">
          <button type="button" className="dojo-modal-btn" onClick={onClose}>
            {t('닫기')}
          </button>
        </div>
      </div>
    </div>
  );
}
