import React, { useState, useEffect } from 'react';
import { parseVimGrammar } from '../../utils/vimGrammarParser';
import './VimGrammarASTViewer.css';

export interface VimGrammarASTViewerProps {
  currentKeySequence?: string;
  activeRegister?: string | null;
  onSelectCandidate?: (token: string) => void;
  onClose?: () => void;
  isEmbedded?: boolean;
}

const PRESET_EXAMPLES = [
  '"a2d3aw',
  '3ci"',
  '5dd',
  'y$',
  'gUiw',
  '"0p',
  'c2w',
  '>i{',
  '"_diw',
];

export const VimGrammarASTViewer: React.FC<VimGrammarASTViewerProps> = ({
  currentKeySequence = '',
  activeRegister = null,
  onSelectCandidate,
  onClose,
  isEmbedded = false,
}) => {
  const [inputCommand, setInputCommand] = useState<string>('"a2d3aw');
  const [isManualMode, setIsManualMode] = useState<boolean>(false);

  // 에디터에서 사용자가 키를 입력 중일 때(pendingKeys 또는 activeRegister 존재 시) 자동 동기화
  useEffect(() => {
    if (currentKeySequence || activeRegister) {
      const liveCmd = (activeRegister ? `"${activeRegister}` : '') + (currentKeySequence || '');
      setInputCommand(liveCmd);
      setIsManualMode(false);
    }
  }, [currentKeySequence, activeRegister]);

  const ast = parseVimGrammar(inputCommand, activeRegister);

  const handlePresetClick = (preset: string) => {
    setInputCommand(preset);
    setIsManualMode(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputCommand(e.target.value);
    setIsManualMode(true);
  };

  const handleCandidateClick = (key: string) => {
    const nextCmd = inputCommand + key;
    setInputCommand(nextCmd);
    if (onSelectCandidate) {
      onSelectCandidate(key);
    }
  };

  return (
    <section
      className={`vim-grammar-ast-viewer ${isEmbedded ? 'embedded' : ''}`}
      data-testid="vim-grammar-ast-viewer"
      aria-label="Vim Grammar AST Inspector"
    >
      <header className="ast-header">
        <div className="ast-title-group">
          <span className="ast-badge">VIM GRAMMAR AST</span>
          <h3 className="ast-title">실시간 Vim 명령어 문법 분해기</h3>
          <span className="ast-formula">
            Command := [Register] [Count] Operator [Count] (Motion | TextObject)
          </span>
        </div>

        {onClose && (
          <button
            className="ast-close-btn"
            onClick={onClose}
            data-testid="close-ast-viewer-btn"
            aria-label="닫기"
          >
            ✕
          </button>
        )}
      </header>

      {/* 프리셋 예제 바 */}
      <div className="ast-presets" data-testid="ast-presets-bar">
        <span className="preset-label">대표 문법 프리셋:</span>
        {PRESET_EXAMPLES.map((ex) => (
          <button
            key={ex}
            className="preset-chip"
            onClick={() => handlePresetClick(ex)}
            data-testid={`preset-chip-${ex.replace(/"/g, 'quote')}`}
          >
            {ex}
          </button>
        ))}
      </div>

      {/* 명령어 입력 및 실시간 버퍼 표시줄 */}
      <div className="ast-input-row">
        <label htmlFor="ast-command-input" className="ast-input-label">
          {isManualMode ? '✏️ 문법 시뮬레이터:' : '⌨️ 에디터 입력 시퀀스:'}
        </label>
        <input
          id="ast-command-input"
          className="ast-command-input"
          value={inputCommand}
          onChange={handleInputChange}
          placeholder='명령어를 입력하세요 (예: "a2d3aw, 3ci", y$, 5dd)'
          data-testid="ast-command-input"
        />
      </div>

      {/* 시각적 AST 파이프라인 노드 렌더러 */}
      <div className="ast-pipeline" data-testid="ast-pipeline-container">
        {ast.nodes.length === 0 ? (
          <div className="ast-empty-node">명령어를 입력하면 AST 노드가 실시간 조립됩니다.</div>
        ) : (
          ast.nodes.map((node, idx) => (
            <React.Fragment key={`${node.raw}-${idx}`}>
              <div
                className={`ast-node-card node-${node.type} ${node.isPending ? 'pending' : ''}`}
                title={node.description}
                data-testid={`ast-node-${idx}`}
              >
                <span className="node-val">{node.raw}</span>
                <span className="node-label">{node.label}</span>
              </div>
              {idx < ast.nodes.length - 1 && <span className="ast-arrow">→</span>}
            </React.Fragment>
          ))
        )}
      </div>

      {/* 자연어 한국어 문장 해석 박스 */}
      <div className="ast-explanation-box" data-testid="ast-explanation-box">
        <span className="exp-icon">💬</span>
        <div className="exp-body">
          <div className="exp-title">자연어 문법 해석 (Natural Language Explanation)</div>
          <p className="exp-text" data-testid="ast-explanation-text">
            {ast.explanation}
          </p>
        </div>
      </div>

      {/* 연산자 대기(Operator-Pending) 상태일 때 다음 입력 가능한 문법 노드 인터랙티브 가이드 */}
      {ast.isOperatorPending && ast.candidates && (
        <div className="ast-candidates-container" data-testid="ast-candidates-guide">
          <div className="candidates-banner">
            <span>⚡ 연산자 대기 상태 (Operator-Pending): 다음 문법 요소를 선택하거나 입력하세요</span>
          </div>
          <div className="candidates-grid">
            {ast.candidates.map((cat) => (
              <div key={cat.category} className="candidate-category-group">
                <span className="category-name">{cat.category}</span>
                <div className="category-items">
                  {cat.items.map((item) => (
                    <button
                      key={item.key}
                      className="candidate-button"
                      onClick={() => handleCandidateClick(item.key)}
                      title={`${item.name} (${item.description || item.example || ''})`}
                      data-testid={`candidate-btn-${item.key.replace(/"/g, 'quote')}`}
                    >
                      <span className="candidate-key">{item.key}</span>
                      <span className="candidate-name">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
