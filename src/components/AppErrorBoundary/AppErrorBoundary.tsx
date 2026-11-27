import { Component, ErrorInfo, Fragment, ReactNode } from 'react';
import { t } from '../../i18n';
import './AppErrorBoundary.css';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
  /** 다시 시도할 때마다 올려 자식 트리를 새로 마운트합니다. */
  resetCount: number;
}

/**
 * 렌더링 중 예외가 나면 흰 화면 대신 복구 화면을 보여 줍니다.
 * 학습 진행도·설정은 localStorage 에 있으므로 다시 시도해도 그대로 남습니다.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null, resetCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AppErrorBoundary] render failed', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState((prev) => ({ error: null, resetCount: prev.resetCount + 1 }));
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error, resetCount } = this.state;
    if (!error) {
      return <Fragment key={resetCount}>{this.props.children}</Fragment>;
    }
    return (
      <div className="app-error-boundary" role="alert" data-testid="app-error-boundary">
        <h1>{t('⚠️ 화면을 그리는 중 오류가 발생했습니다')}</h1>
        <p>{t('학습 진행도와 설정은 브라우저에 저장되어 있어 그대로 남아 있습니다.')}</p>
        <pre className="app-error-boundary-message">{error.message}</pre>
        <div className="app-error-boundary-actions">
          <button type="button" onClick={this.handleRetry} data-testid="app-error-retry">
            {t('다시 시도')}
          </button>
          <button type="button" onClick={this.handleReload}>
            {t('새로고침')}
          </button>
        </div>
      </div>
    );
  }
}
