import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Editor } from '../Editor/Editor';
import { StatusBar } from '../StatusBar/StatusBar';
import { DiffViewer } from '../DiffViewer/DiffViewer';
import { handleKey } from '../../vim-engine';
import { VimEditorState, VimMode } from '../../vim-engine';
import { DailyChallengePuzzle, DailyRecord } from '../../types/game';
import {
  getTodayDateString,
  generateDailyChallenge,
  formatWordleResultCard,
  copyTextToClipboard,
} from '../../utils/dailyChallenge';
import {
  loadUserAnalytics,
  saveDailyRecord,
  recordKeyInputStats,
} from '../../utils/analyticsStorage';
import './DailyChallengeModal.css';
import { t } from '../../i18n';

export interface DailyChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayKeySound: (key: string, mode: VimMode) => void;
  onPlaySuccessSound: () => void;
}

export const DailyChallengeModal: React.FC<DailyChallengeModalProps> = ({
  isOpen,
  onClose,
  onPlayKeySound,
  onPlaySuccessSound,
}) => {
  const [puzzle, setPuzzle] = useState<DailyChallengePuzzle>(() =>
    generateDailyChallenge(getTodayDateString())
  );

  const [editorState, setEditorState] = useState<VimEditorState>(() => ({
    lines: [...puzzle.initialLines],
    cursor: { ...puzzle.initialCursor },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
  }));

  const [keystrokes, setKeystrokes] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showDiff, setShowDiff] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  const [completedRecord, setCompletedRecord] = useState<DailyRecord | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // 모달이 열릴 때 오늘 미션 및 완료 기록 동기화
  useEffect(() => {
    if (isOpen) {
      const todayStr = getTodayDateString();
      const todayPuzzle = generateDailyChallenge(todayStr);
      setPuzzle(todayPuzzle);

      const analytics = loadUserAnalytics();
      const existing = analytics.dailyRecords[todayStr];
      if (existing && existing.completed) {
        setCompletedRecord(existing);
      } else {
        setCompletedRecord(null);
      }

      setEditorState({
        lines: [...todayPuzzle.initialLines],
        cursor: { ...todayPuzzle.initialCursor },
        mode: 'NORMAL',
        undoStack: [],
        redoStack: [],
      });
      setKeystrokes(0);
      setElapsedSeconds(0);
      setIsCompleted(false);
      setCopySuccess(false);
      startTimeRef.current = null;
    }
  }, [isOpen]);

  // 타이머 실행 (미완료 시 100ms마다 측정)
  useEffect(() => {
    if (isOpen && !isCompleted && !completedRecord) {
      timerRef.current = setInterval(() => {
        if (startTimeRef.current !== null) {
          const now = Date.now();
          setElapsedSeconds(Number(((now - startTimeRef.current) / 1000).toFixed(1)));
        }
      }, 100);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isOpen, isCompleted, completedRecord]);

  const handleReset = useCallback(() => {
    setEditorState({
      lines: [...puzzle.initialLines],
      cursor: { ...puzzle.initialCursor },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    });
    setKeystrokes(0);
    setElapsedSeconds(0);
    setIsCompleted(false);
    setCopySuccess(false);
    startTimeRef.current = null;
  }, [puzzle]);

  // 키 입력 처리
  const processKey = useCallback(
    (key: string) => {
      if (isCompleted) return;

      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(key)) {
        return;
      }

      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }

      const nextKeystrokes = keystrokes + 1;
      setKeystrokes(nextKeystrokes);
      onPlayKeySound(key, editorState.mode);
      recordKeyInputStats(key);

      const nextState = handleKey(editorState, key);
      setEditorState(nextState);

      // 클리어 조건 검사
      const isTargetMatched =
        nextState.mode === 'NORMAL' &&
        nextState.lines.length === puzzle.targetLines.length &&
        nextState.lines.every((line, idx) => line === puzzle.targetLines[idx]);

      if (isTargetMatched) {
        setIsCompleted(true);
        onPlaySuccessSound();
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        const now = Date.now();
        const duration = startTimeRef.current
          ? Number(((now - startTimeRef.current) / 1000).toFixed(1))
          : elapsedSeconds;

        const stars =
          nextKeystrokes <= puzzle.par ? 3 : nextKeystrokes <= puzzle.par + 4 ? 2 : 1;

        const record: DailyRecord = {
          date: puzzle.date,
          completed: true,
          stars,
          keystrokes: nextKeystrokes,
          elapsedSeconds: duration,
          par: puzzle.par,
          completedAt: new Date().toISOString(),
        };

        saveDailyRecord(record);
        setCompletedRecord(record);
      }
    },
    [
      isCompleted,
      keystrokes,
      editorState,
      puzzle,
      onPlayKeySound,
      onPlaySuccessSound,
      elapsedSeconds,
    ]
  );

  // 모달 내 키보드 이벤트 리스너
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCompleted) {
        onClose();
        return;
      }

      // Ctrl+r Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        processKey('Ctrl-r');
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
      }

      processKey(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isCompleted, processKey, onClose]);

  const handleCopyCard = async () => {
    const record = completedRecord || {
      date: puzzle.date,
      stars: keystrokes <= puzzle.par ? 3 : keystrokes <= puzzle.par + 4 ? 2 : 1,
      keystrokes,
      par: puzzle.par,
      elapsedSeconds,
    };
    const cardText = formatWordleResultCard(record);
    const success = await copyTextToClipboard(cardText);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="daily-modal-backdrop" onClick={onClose} data-testid="daily-modal-backdrop">
      <div
        className="daily-modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('오늘의 데일리 챌린지')}
        data-testid="daily-modal"
      >
        <header className="daily-header">
          <div className="daily-title-group">
            <span className="daily-badge">📅 DAILY VIM GOLF #{puzzle.date}</span>
            <h2 className="daily-title">
              [Daily {puzzle.date}] {t(puzzle.templateTitle ?? puzzle.title.replace(/^\[Daily [^\]]+\] /, ''))}
            </h2>
          </div>
          <button
            className="daily-close-btn"
            onClick={onClose}
            aria-label={t('닫기')}
            data-testid="close-daily-modal-btn"
          >
            ✕
          </button>
        </header>

        {/* 챌린지 정보 바 */}
        <div className="daily-info-bar">
          <p className="daily-desc">{t(puzzle.description)}</p>
          <div className="daily-metrics">
            <div className="metric-box">
              <span className="metric-label">PAR</span>
              <span className="metric-val par-val">{t('{n}타', { n: puzzle.par })}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">{t('타수')}</span>
              <span className="metric-val stroke-val">{t('{n}타', { n: keystrokes })}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">{t('시간')}</span>
              <span className="metric-val time-val">{elapsedSeconds}s</span>
            </div>
          </div>
        </div>

        {/* 힌트 & 토글 버튼 */}
        <div className="daily-controls">
          <button
            className="daily-text-btn"
            onClick={() => setShowHint((prev) => !prev)}
            data-testid="toggle-daily-hint-btn"
          >
            {showHint ? t('💡 힌트 접기') : t('💡 힌트 보기')}
          </button>
          <button
            className="daily-text-btn"
            onClick={() => setShowDiff((prev) => !prev)}
            data-testid="toggle-daily-diff-btn"
          >
            {showDiff ? t('🎯 목표 Diff 숨기기') : t('🎯 목표 Diff 보기')}
          </button>
          <button
            className="daily-text-btn"
            onClick={handleReset}
            data-testid="daily-reset-btn"
          >
            {t('🔄 다시 시도')}
          </button>
        </div>

        {showHint && (
          <div className="daily-hint-banner" data-testid="daily-hint-banner">
            <strong>Hint:</strong> {t(puzzle.hint)}
          </div>
        )}

        {/* 에디터 영역 */}
        <div className="daily-editor-box">
          <Editor
            lines={editorState.lines}
            cursor={editorState.cursor}
            mode={editorState.mode}
            relativeLineNumbers={false}
            isFocused={true}
            marks={editorState.marks}
          />
          <StatusBar
            mode={editorState.mode}
            cursor={editorState.cursor}
            filename={`daily_${puzzle.date}.ts`}
            pendingKeys={editorState.pendingKeys}
          />
        </div>

        {/* 목표 상태 Diff 비교 */}
        {showDiff && (
          <div className="daily-diff-wrapper">
            <DiffViewer
              currentLines={editorState.lines}
              targetLines={puzzle.targetLines}
              isCompleted={isCompleted}
            />
          </div>
        )}

        {/* 클리어 시 결과 카드 모달 */}
        {(isCompleted || completedRecord) && (
          <div className="daily-result-card" data-testid="daily-result-card">
            <div className="result-header">
              <span className="result-stars">
                {(completedRecord?.stars ?? (keystrokes <= puzzle.par ? 3 : 2)) === 3
                  ? '⭐⭐⭐'
                  : (completedRecord?.stars ?? 2) === 2
                  ? '⭐⭐'
                  : '⭐'}
              </span>
              <h3>{t('🎉 오늘의 데일리 챌린지 클리어!')}</h3>
            </div>
            <p className="result-summary">
              {t('결과:')} <strong>{t('{n}타', { n: completedRecord?.keystrokes ?? keystrokes })}</strong> (Par: {puzzle.par}) •{' '}
              <strong>{t('{n}초', { n: completedRecord?.elapsedSeconds ?? elapsedSeconds })}</strong>
            </p>
            <div className="result-actions">
              <button
                className={`share-card-btn ${copySuccess ? 'copied' : ''}`}
                onClick={handleCopyCard}
                data-testid="daily-share-btn"
              >
                {copySuccess ? t('✅ 결과가 클립보드에 복사되었습니다!') : t('📋 결과 복사 (Wordle 스타일 Share)')}
              </button>
              <button
                className="retry-btn"
                onClick={handleReset}
                data-testid="daily-retry-btn"
              >
                {t('더 적은 타수로 재도전')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
