import React, { useState, useRef, useEffect } from 'react';
import './ViewPanelsDropdown.css';

export interface ViewPanelsDropdownProps {
  showDiffView: boolean;
  onToggleDiffView: () => void;
  isSandbox: boolean;

  showRegisterInspector: boolean;
  onToggleRegisterInspector: () => void;

  showGrammarAST: boolean;
  onToggleGrammarAST: () => void;

  showActionTimeline: boolean;
  onToggleActionTimeline: () => void;

  showVirtualKeyboard: boolean;
  onToggleVirtualKeyboard: () => void;

  relativeLineNumbers: boolean;
  onToggleRelativeLineNumbers: () => void;
}

export const ViewPanelsDropdown: React.FC<ViewPanelsDropdownProps> = ({
  showDiffView,
  onToggleDiffView,
  isSandbox,
  showRegisterInspector,
  onToggleRegisterInspector,
  showGrammarAST,
  onToggleGrammarAST,
  showActionTimeline,
  onToggleActionTimeline,
  showVirtualKeyboard,
  onToggleVirtualKeyboard,
  relativeLineNumbers,
  onToggleRelativeLineNumbers,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 활성화된 패널 개수 계산
  const activeCount = [
    !isSandbox && showDiffView,
    showRegisterInspector,
    showGrammarAST,
    showActionTimeline,
    showVirtualKeyboard,
    relativeLineNumbers,
  ].filter(Boolean).length;

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      className={`view-panels-dropdown-container ${isOpen ? 'is-open' : ''}`}
      ref={containerRef}
      data-testid="view-panels-dropdown"
    >
      <button
        type="button"
        className={`toolbar-btn view-panels-trigger-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        data-testid="toggle-view-panels-menu-btn"
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="에디터 보조 패널 및 뷰어 표시/숨김 설정"
      >
        <span className="trigger-icon">👁️</span>
        <span className="trigger-label">패널 보기</span>
        <span className="active-badge">{activeCount}</span>
        <span className={`trigger-arrow ${isOpen ? 'rotated' : ''}`}>▾</span>
      </button>

      {/* 
        테스트 호환성 및 부드러운 애니메이션을 위해 DOM에 항상 렌더링하고
        CSS open 클래스로 visibility/opacity를 제어합니다.
      */}
      <div
        className={`view-panels-menu ${isOpen ? 'open' : ''}`}
        role="menu"
        aria-label="에디터 보조 패널 목록"
      >
        <div className="view-panels-menu-header">
          <div className="menu-header-title">
            <span>👁️ 뷰 &amp; 인스펙터 패널</span>
            <span className="menu-header-count">{activeCount}개 활성</span>
          </div>
          <p className="menu-header-subtitle">
            필요한 보조 도구를 자유롭게 켜고 끌 수 있습니다
          </p>
        </div>

        <div className="view-panels-list">
          {/* 1. 목표 Diff 비교 뷰 (샌드박스 제외) */}
          {!isSandbox && (
            <button
              type="button"
              className={`view-panel-item ${showDiffView ? 'active' : ''}`}
              onClick={onToggleDiffView}
              data-testid="toggle-diff-view-btn"
              title="목표 텍스트 Diff 비교 뷰어 토글"
              role="menuitemcheckbox"
              aria-checked={showDiffView}
            >
              <div className="panel-item-left">
                <span className="panel-icon">🎯</span>
                <div className="panel-text-block">
                  <span className="panel-title">목표 Diff 뷰</span>
                  <span className="panel-desc">목표 텍스트와 현재 버퍼의 차이 실시간 비교</span>
                </div>
              </div>
              <span className={`panel-switch-badge ${showDiffView ? 'on' : 'off'}`}>
                🎯 목표 Diff: {showDiffView ? 'ON' : 'OFF'}
              </span>
            </button>
          )}

          {/* 2. 실시간 레지스터 인스펙터 */}
          <button
            type="button"
            className={`view-panel-item ${showRegisterInspector ? 'active' : ''}`}
            onClick={onToggleRegisterInspector}
            data-testid="toggle-register-inspector-btn"
            title="실시간 레지스터 인스펙터 패널 토글"
            role="menuitemcheckbox"
            aria-checked={showRegisterInspector}
          >
            <div className="panel-item-left">
              <span className="panel-icon">📋</span>
              <div className="panel-text-block">
                <span className="panel-title">레지스터 인스펙터</span>
                <span className="panel-desc">Vim 레지스터 버퍼(&quot;, &quot;0~9, &quot;a~z) 실시간 모니터링</span>
              </div>
            </div>
            <span className={`panel-switch-badge ${showRegisterInspector ? 'on' : 'off'}`}>
              📋 레지스터: {showRegisterInspector ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* 3. 실시간 Vim 문법 AST 인스펙터 */}
          <button
            type="button"
            className={`view-panel-item ${showGrammarAST ? 'active' : ''}`}
            onClick={onToggleGrammarAST}
            data-testid="toggle-grammar-ast-btn"
            title="실시간 Vim 문법 AST 인스펙터 패널 토글"
            role="menuitemcheckbox"
            aria-checked={showGrammarAST}
          >
            <div className="panel-item-left">
              <span className="panel-icon">🧩</span>
              <div className="panel-text-block">
                <span className="panel-title">문법 AST 인스펙터</span>
                <span className="panel-desc">Vim 키 입력 파서 구문 분석 트리 및 설명</span>
              </div>
            </div>
            <span className={`panel-switch-badge ${showGrammarAST ? 'on' : 'off'}`}>
              🧩 문법 AST: {showGrammarAST ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* 4. 실시간 명령 복기 타임라인 & Vim X-Ray */}
          <button
            type="button"
            className={`view-panel-item ${showActionTimeline ? 'active' : ''}`}
            onClick={onToggleActionTimeline}
            data-testid="toggle-action-timeline-btn"
            title="실시간 명령 복기 타임라인 & Vim X-Ray 투시기 패널 토글"
            role="menuitemcheckbox"
            aria-checked={showActionTimeline}
          >
            <div className="panel-item-left">
              <span className="panel-icon">⏱️</span>
              <div className="panel-text-block">
                <span className="panel-title">타임라인 &amp; X-Ray</span>
                <span className="panel-desc">명령어 실행 히스토리 복기 및 엔진 내부 상태 투시</span>
              </div>
            </div>
            <span className={`panel-switch-badge ${showActionTimeline ? 'on' : 'off'}`}>
              ⏱️ 타임라인 & X-Ray: {showActionTimeline ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* 5. 가상 키보드 오버레이 */}
          <button
            type="button"
            className={`view-panel-item ${showVirtualKeyboard ? 'active' : ''}`}
            onClick={onToggleVirtualKeyboard}
            data-testid="toggle-virtual-keyboard-btn"
            title="반응형 인터랙티브 가상 키보드 패널 토글"
            role="menuitemcheckbox"
            aria-checked={showVirtualKeyboard}
          >
            <div className="panel-item-left">
              <span className="panel-icon">⌨</span>
              <div className="panel-text-block">
                <span className="panel-title">가상 키보드</span>
                <span className="panel-desc">인터랙티브 키 반응 오버레이 및 시각 피드백</span>
              </div>
            </div>
            <span className={`panel-switch-badge ${showVirtualKeyboard ? 'on' : 'off'}`}>
              ⌨ 가상 키보드: {showVirtualKeyboard ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* 6. 상대 라인 번호 (relativenumber) */}
          <button
            type="button"
            className={`view-panel-item ${relativeLineNumbers ? 'active' : ''}`}
            onClick={onToggleRelativeLineNumbers}
            data-testid="toggle-relativenumber-btn"
            title="상대 라인 번호 (relativenumber) 토글"
            role="menuitemcheckbox"
            aria-checked={relativeLineNumbers}
          >
            <div className="panel-item-left">
              <span className="panel-icon">🔢</span>
              <div className="panel-text-block">
                <span className="panel-title">상대 줄 번호</span>
                <span className="panel-desc">현재 커서 위치 기준 점프용 상대 라인 번호 표시</span>
              </div>
            </div>
            <span className={`panel-switch-badge ${relativeLineNumbers ? 'on' : 'off'}`}>
              relativenumber: {relativeLineNumbers ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
