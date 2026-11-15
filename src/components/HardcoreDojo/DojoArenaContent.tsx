import { VimEditorState } from '../../vim-engine';
import {
  DojoProblem,
  RelativeJumpProblem,
  FTSniperProblem,
  WordJumpProblem,
  ProMasterProblem,
} from './HardcoreDojo.types';
import { WeaknessDrillQueueItem } from '../../utils/weaknessDrillAnalyzer';
import { t } from '../../i18n';

interface DojoArenaContentProps {
  selectedDrill: string;
  editorState: VimEditorState;
  currentProblem: DojoProblem | null;
  activeWeaknessItem: WeaknessDrillQueueItem | null;
  keyInstructions: string;
}

/**
 * 도장 아레나 상단 툴바, 안내 지침 바, 상대 라인 번호 기반 코드 뷰포트를 렌더링합니다.
 */
export function DojoArenaContent({
  selectedDrill,
  editorState,
  currentProblem,
  activeWeaknessItem,
  keyInstructions,
}: DojoArenaContentProps) {
  return (
    <>
      <div className="dojo-arena-toolbar">
        <div>
          {t('모드:')} <strong>{editorState.mode}</strong> | {t('대기 키:')}{' '}
          <code>{editorState.pendingKeys || t('(없음)')}</code>
        </div>
        {selectedDrill === 'sudden-death' ? (
          <div className="dojo-rule-badge sudden-death">
            {t('💀 서든데스: 1회 실수·방향키·연타 즉시 탈락 | 10연타 스피드런')}
          </div>
        ) : (
          <div className="dojo-rule-badge">
            {t('🔥 방향키·마우스 차단 | 1.5초 3회 초과 연타 무시')}
          </div>
        )}
      </div>

      <div className="dojo-instruction-bar">
        <div>
          {activeWeaknessItem
            ? `🧬 ${t('🧬 현재 집중 영역: {badge}', { badge: t(activeWeaknessItem.focusBadge) })} — ${t(activeWeaknessItem.focusHint)}`
            : `💡 ${keyInstructions}`}
        </div>
        {currentProblem?.type === 'ft-sniper' && (
          <div style={{ color: '#7aa2f7' }}>
            {t("🎯 타깃: '{char}'", { char: currentProblem.targetChar })}
          </div>
        )}
        {currentProblem?.type === 'word-jump' && (
          <div style={{ color: '#7aa2f7' }}>
            {t("🎯 타깃: '{char}'", { char: currentProblem.targetToken })}
          </div>
        )}
        {currentProblem?.type === 'pro-master' && (
          <div style={{ color: '#bb9af7', fontWeight: 600 }}>
            {t('🎯 목표:')} {t((currentProblem as ProMasterProblem).prompt)} | {t('힌트:')}{' '}
            {t((currentProblem as ProMasterProblem).hint)}
          </div>
        )}
      </div>

      <div className="dojo-editor-content">
        {editorState.lines.map((lineText, lineIdx) => {
          const isCursorLine = editorState.cursor.line === lineIdx;
          const isRelativeJump = currentProblem?.type === 'relative-jump';
          const isTargetLine =
            isRelativeJump &&
            lineIdx === (currentProblem as RelativeJumpProblem).targetLine;

          const dist = Math.abs(lineIdx - editorState.cursor.line);
          const lineNumDisplay = dist === 0 ? lineIdx + 1 : dist;

          return (
            <div
              key={lineIdx}
              className={`dojo-line-row ${isCursorLine ? 'active-line' : ''} ${
                isTargetLine ? 'target-line' : ''
              }`}
            >
              <div className="dojo-line-gutter">
                <span className={dist > 0 ? 'dojo-relative-number' : ''}>
                  {lineNumDisplay}
                </span>
              </div>

              <div className="dojo-code-text">
                {lineText.length === 0 ? (
                  isCursorLine && editorState.cursor.col === 0 ? (
                    <span className="dojo-char dojo-cursor">&nbsp;</span>
                  ) : (
                    <span>&nbsp;</span>
                  )
                ) : (
                  lineText.split('').map((ch, charIdx) => {
                    const isCursor =
                      isCursorLine && editorState.cursor.col === charIdx;

                    const isFTSniperTarget =
                      currentProblem?.type === 'ft-sniper' &&
                      lineIdx === 0 &&
                      charIdx === (currentProblem as FTSniperProblem).targetCol;

                    const isWordTarget =
                      currentProblem?.type === 'word-jump' &&
                      lineIdx === 0 &&
                      charIdx >= (currentProblem as WordJumpProblem).targetStartCol &&
                      charIdx <= (currentProblem as WordJumpProblem).targetEndCol;

                    let classNames = 'dojo-char';
                    if (isCursor) classNames += ' dojo-cursor';
                    if (isFTSniperTarget || isWordTarget) {
                      classNames += ' dojo-target-reticle';
                    }

                    return (
                      <span key={charIdx} className={classNames}>
                        {ch}
                      </span>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
