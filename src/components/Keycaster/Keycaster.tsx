import React from 'react';
import './Keycaster.css';
import { t } from '../../i18n';

export interface KeycasterProps {
  recentKeys: string[];
}

/**
 * 특수 키 이름을 보기 좋은 키캡 텍스트로 변환합니다.
 */
function formatKeyLabel(key: string): string {
  switch (key) {
    case ' ':
      return 'Space';
    case 'Escape':
      return 'Esc';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'Backspace':
      return '⌫';
    case 'Enter':
      return '⏎';
    case 'Tab':
      return '⇥';
    default:
      return key;
  }
}

export const Keycaster: React.FC<KeycasterProps> = ({ recentKeys }) => {
  return (
    <div className="keycaster-container" data-testid="keycaster">
      <span className="keycaster-label">RECENT KEYS</span>
      <div className="keycaster-keys">
        {recentKeys.length === 0 ? (
          <span className="keycaster-empty">{t('키를 눌러보세요')}</span>
        ) : (
          recentKeys.map((key, index) => {
            const isLatest = index === recentKeys.length - 1;
            return (
              <span
                key={`${index}-${key}`}
                className={`keycap ${isLatest ? 'keycap-latest' : ''}`}
                data-testid={`keycap-${index}`}
              >
                {formatKeyLabel(key)}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Keycaster;
