import React from 'react';
import './CoachingToast.css';
import { t } from '../../i18n';

export interface CoachingToastProps {
  message: string | null;
  onDismiss: () => void;
}

export const CoachingToast: React.FC<CoachingToastProps> = ({ message, onDismiss }) => {
  if (!message) {
    return null;
  }

  return (
    <div className="coaching-toast" data-testid="coaching-toast" role="alert">
      <div className="coaching-toast-content">
        <span className="coaching-icon">💡</span>
        <span className="coaching-message">{message}</span>
      </div>
      <button
        type="button"
        className="coaching-dismiss-btn"
        onClick={onDismiss}
        aria-label={t('닫기')}
      >
        ✕
      </button>
    </div>
  );
};

export default CoachingToast;
