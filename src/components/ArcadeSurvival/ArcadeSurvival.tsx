import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Editor } from '../Editor/Editor';
import { StatusBar } from '../StatusBar/StatusBar';
import { Keycaster } from '../Keycaster/Keycaster';
import { ArcadeBugMission } from '../../types/game';
import { VimEditorState, VimMode } from '../../vim-engine';
import { handleKey } from '../../vim-engine';
import { saveArcadeRecord, loadUserAnalytics, recordKeyInputStats } from '../../utils/analyticsStorage';
import './ArcadeSurvival.css';
import { t, localized } from '../../i18n';

export interface ArcadeSurvivalProps {
  onPlayKeySound: (key: string, mode: VimMode) => void;
  onPlaySuccessSound: () => void;
  isMuted: boolean;
}

const ARCADE_MISSIONS: ArcadeBugMission[] = localized([
  {
    id: 1,
    title: 'Wave 1: 버그 블록 처치',
    instruction: 'f🐛 -> df/ 또는 d% 로 주석 버그 블록을 제거하세요!',
    initialLines: ['const status = "ready"; /*🐛BUG*/'],
    targetLines: ['const status = "ready"; '],
    initialCursor: { line: 0, col: 0 },
    par: 5,
    timeLimit: 15,
    bugType: 'block',
  },
  {
    id: 2,
    title: 'Wave 2: 오타 기호 박멸',
    instruction: 'f# 로 이동하여 x 로 오타 기호 #를 제거하세요!',
    initialLines: ['let portNumber = #3000;'],
    targetLines: ['let portNumber = 3000;'],
    initialCursor: { line: 0, col: 0 },
    par: 3,
    timeLimit: 13,
    bugType: 'typo',
  },
  {
    id: 3,
    title: 'Wave 3: 오염된 버그 줄 일괄 삭제',
    instruction: 'j -> dd 로 오염된 중간 줄을 통째로 삭제하세요!',
    initialLines: [
      'function bootstrap() {',
      '  // 🐛CORRUPTED LINE TO DELETE',
      '  return true;',
      '}',
    ],
    targetLines: [
      'function bootstrap() {',
      '  return true;',
      '}',
    ],
    initialCursor: { line: 0, col: 0 },
    par: 3,
    timeLimit: 12,
    bugType: 'line',
  },
  {
    id: 4,
    title: 'Wave 4: 텍스트 객체 따옴표 비우기',
    instruction: 'ci" 로 따옴표 안 버그 문자열을 비우세요 (Escape로 완료)!',
    initialLines: ['const token = "🐛CRASH_TOKEN";'],
    targetLines: ['const token = "";'],
    initialCursor: { line: 0, col: 16 },
    par: 4,
    timeLimit: 11,
    bugType: 'quote',
  },
  {
    id: 5,
    title: 'Wave 5: 괄호 안 버그 파괴',
    instruction: 'di( 로 괄호 안의 버그 인자를 깔끔하게 지우세요!',
    initialLines: ['executeHandler(🐛BAD_ARGUMENT);'],
    targetLines: ['executeHandler();'],
    initialCursor: { line: 0, col: 17 },
    par: 3,
    timeLimit: 10,
    bugType: 'tag',
  },
  {
    id: 6,
    title: 'Wave 6: 줄 끝 버그 삭제 (D)',
    instruction: 'f/ -> D 로 줄 끝에 붙은 버그 주석을 한 번에 날려버리세요!',
    initialLines: ['const maxLimit = 100; // 🐛JUNK_COMMENT'],
    targetLines: ['const maxLimit = 100; '],
    initialCursor: { line: 0, col: 0 },
    par: 3,
    timeLimit: 9,
    bugType: 'line',
  },
  {
    id: 7,
    title: 'Wave 7: 버그 단어 교체 (cw)',
    instruction: 'ciw 로 🐛ERROR 단어를 SUCCESS 로 수정하세요!',
    initialLines: ['const result = "🐛ERROR";'],
    targetLines: ['const result = "SUCCESS";'],
    initialCursor: { line: 0, col: 16 },
    par: 11,
    timeLimit: 9,
    bugType: 'quote',
  },
]);

export const ArcadeSurvival: React.FC<ArcadeSurvivalProps> = ({
  onPlayKeySound,
  onPlaySuccessSound,
}) => {
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'gameover'>('ready');
  const [wave, setWave] = useState(1);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [maxTime, setMaxTime] = useState(15);
  const [keystrokesInWave, setKeystrokesInWave] = useState(0);
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);
  const [perfectMessage, setPerfectMessage] = useState<string | null>(null);
  const [penaltyMessage, setPenaltyMessage] = useState<string | null>(null);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // 로컬 저장소 최고 기록 조회
  const [analytics, setAnalytics] = useState(() => loadUserAnalytics());

  const currentMission = ARCADE_MISSIONS[(wave - 1) % ARCADE_MISSIONS.length];

  const [editorState, setEditorState] = useState<VimEditorState>(() => ({
    lines: [...currentMission.initialLines],
    cursor: { ...currentMission.initialCursor },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
  }));

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 미션 초기화 함수
  const loadWaveMission = useCallback((waveNum: number) => {
    const mission = ARCADE_MISSIONS[(waveNum - 1) % ARCADE_MISSIONS.length];
    // 웨이브가 높아질수록 제한 시간 단축 (최소 6초)
    const waveTime = Math.max(6, mission.timeLimit - Math.floor((waveNum - 1) / 3));

    setEditorState({
      lines: [...mission.initialLines],
      cursor: { ...mission.initialCursor },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    });
    setTimeLeft(waveTime);
    setMaxTime(waveTime);
    setKeystrokesInWave(0);
  }, []);

  const handleStartGame = useCallback(() => {
    setGameState('playing');
    setWave(1);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setTotalKeystrokes(0);
    setPerfectMessage(null);
    setPenaltyMessage(null);
    setIsNewRecord(false);
    loadWaveMission(1);
  }, [loadWaveMission]);

  // 카운트다운 타이머 (100ms마다 실행)
  useEffect(() => {
    if (gameState === 'playing') {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 0.1) {
            return 0;
          }
          return Number((prev - 0.1).toFixed(1));
        });
      }, 100);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [gameState]);

  // 시간 초과 시 게임 오버 처리
  useEffect(() => {
    if (gameState === 'playing' && timeLeft <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setGameState('gameover');
      const { isNewBestScore, data } = saveArcadeRecord(score, wave, maxCombo);
      setIsNewRecord(isNewBestScore);
      setAnalytics(data);
    }
  }, [gameState, timeLeft, score, wave, maxCombo]);

  // 키 입력 처리 및 버그 처치 검사
  const processArcadeKey = useCallback(
    (key: string) => {
      if (gameState !== 'playing') {
        if (key === 'Enter') {
          handleStartGame();
        }
        return;
      }

      // 방향키 사용 시 콤보 리셋 페널티!
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
        setCombo(0);
        setPenaltyMessage(t('⚠️ 방향키 사용으로 콤보가 리셋되었습니다! (hjkl을 사용하세요)'));
        setTimeout(() => setPenaltyMessage(null), 1500);
      }

      setKeystrokesInWave((prev) => prev + 1);
      setTotalKeystrokes((prev) => prev + 1);
      setRecentKeys((prev) => [...prev.slice(-6), key]);
      onPlayKeySound(key, editorState.mode);
      recordKeyInputStats(key);

      // Vim 엔진 키 처리
      const nextState = handleKey(editorState, key);
      setEditorState(nextState);

      // 버그 박멸 완료 검사
      const isTargetMatched =
        nextState.mode === 'NORMAL' &&
        nextState.lines.length === currentMission.targetLines.length &&
        nextState.lines.every((line, idx) => line === currentMission.targetLines[idx]);

      if (isTargetMatched) {
        onPlaySuccessSound();
        const nextCombo = combo + 1;
        const isParBeaten = keystrokesInWave + 1 <= currentMission.par;
        const waveBonus = isParBeaten ? 200 : 50;
        const timeBonus = Math.round(timeLeft * 10);
        const waveScore = 150 * nextCombo + waveBonus + timeBonus;

        setCombo(nextCombo);
        setMaxCombo((prev) => Math.max(prev, nextCombo));
        setScore((prev) => prev + waveScore);

        if (isParBeaten) {
          setPerfectMessage(t('⭐ PERFECT! +{waveBonus} Bonus! (최소 타수 달성)', { waveBonus }));
          setTimeout(() => setPerfectMessage(null), 1200);
        }

        const nextWave = wave + 1;
        setWave(nextWave);
        loadWaveMission(nextWave);
      }
    },
    [
      gameState,
      handleStartGame,
      editorState,
      currentMission,
      combo,
      keystrokesInWave,
      timeLeft,
      wave,
      loadWaveMission,
      onPlayKeySound,
      onPlaySuccessSound,
    ]
  );

  // 키보드 이벤트 리스너 등록
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      processArcadeKey(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [processArcadeKey]);

  const timeRatio = Math.max(0, Math.min(100, (timeLeft / maxTime) * 100));
  const timeBarColor =
    timeRatio > 50 ? '#9ece6a' : timeRatio > 25 ? '#e0af68' : '#f7768e';

  return (
    <div className="arcade-survival-container" data-testid="arcade-survival">
      {/* 아케이드 헤더 HUD */}
      <header className="arcade-hud">
        <div className="hud-metric hud-wave">
          <span className="hud-label">WAVE</span>
          <span className="hud-value" data-testid="arcade-wave">
            {wave}
          </span>
        </div>

        <div className="hud-metric hud-score">
          <span className="hud-label">SCORE</span>
          <span className="hud-value" data-testid="arcade-score">
            {score.toLocaleString()}
          </span>
        </div>

        <div className="hud-metric hud-combo">
          <span className="hud-label">COMBO</span>
          <span className={`hud-value ${combo > 2 ? 'fire' : ''}`} data-testid="arcade-combo">
            {combo > 0 ? `${combo}x` : '-'}
          </span>
        </div>

        <div className="hud-metric hud-timer">
          <span className="hud-label">TIME</span>
          <span className={`hud-value ${timeLeft <= 3 ? 'critical' : ''}`} data-testid="arcade-timer">
            {timeLeft.toFixed(1)}s
          </span>
        </div>
      </header>

      {/* 제한 시간 진행 바 (Time Gauge) */}
      <div className="time-bar-track">
        <div
          className="time-bar-fill"
          style={{ width: `${timeRatio}%`, backgroundColor: timeBarColor }}
          data-testid="time-bar"
        />
      </div>

      {/* 실시간 팝업 이펙트 메시지 */}
      {perfectMessage && (
        <div className="arcade-banner perfect-banner" data-testid="perfect-banner">
          {perfectMessage}
        </div>
      )}
      {penaltyMessage && (
        <div className="arcade-banner penalty-banner" data-testid="penalty-banner">
          {penaltyMessage}
        </div>
      )}

      {/* 미션 지침 가이드 */}
      <div className="arcade-instruction-card">
        <span className="instruction-badge">{t('🎯 목표')}</span>
        <span className="instruction-text" data-testid="arcade-instruction">
          {currentMission.instruction}
        </span>
        <span className="instruction-par">{t('Par: {n}타', { n: currentMission.par })}</span>
      </div>

      {/* 에디터 뷰 */}
      <main className="arcade-editor-box">
        <Editor
          lines={editorState.lines}
          cursor={editorState.cursor}
          mode={editorState.mode}
          visualAnchor={editorState.visualAnchor}
          marks={editorState.marks}
          viewport={editorState.viewport}
          isFocused={gameState === 'playing'}
        />
        <StatusBar
          mode={editorState.mode}
          cursor={editorState.cursor}
          filename={`wave_${wave}_bug.ts`}
          pendingKeys={editorState.pendingKeys}
          commandType={editorState.commandType}
          commandBuffer={editorState.commandBuffer}
        />
        <Keycaster recentKeys={recentKeys} />
      </main>

      {/* 시작 대기 화면 오버레이 */}
      {gameState === 'ready' && (
        <div className="arcade-overlay ready-overlay" data-testid="arcade-ready-modal">
          <div className="overlay-dialog">
            <span className="dialog-icon">👾</span>
            <h2 className="dialog-title">Vim Defense: Bug Crusher</h2>
            <p className="dialog-desc">
              {t('에디터 코드 곳곳에 출몰하는 버그를 제한 시간 내에 정확한 Vim 명령어로 박멸하세요!')}
            </p>
            <ul className="dialog-rules">
              <li>{t('⏱️ 문제를 해결할 때마다 시간 보너스가 주어집니다.')}</li>
              <li>{t('⭐ Par 이하 최소 타수로 처치하면')} <strong>{t('PERFECT 보너스 (+200점)')}</strong>!</li>
              <li>{t('⚠️ 방향키 연타 사용 시')} <strong>{t('콤보가 0으로 리셋')}</strong>{t('됩니다.')}</li>
            </ul>
            <div className="best-score-badge">
              {t('최고 기록: {score}점 (최대 {wave} Wave)', { score: analytics.arcadeBestScore.toLocaleString(), wave: analytics.arcadeHighestWave })}
            </div>
            <button
              className="start-arcade-btn"
              onClick={handleStartGame}
              data-testid="start-arcade-btn"
            >
              {t('🚀 서바이벌 시작 (Enter)')}
            </button>
          </div>
        </div>
      )}

      {/* 게임 오버 화면 오버레이 */}
      {gameState === 'gameover' && (
        <div className="arcade-overlay gameover-overlay" data-testid="arcade-gameover-modal">
          <div className="overlay-dialog">
            <span className="dialog-icon">💥</span>
            <h2 className="dialog-title gameover">TIME OVER!</h2>
            {isNewRecord && <div className="new-record-tag">🎉 NEW HIGH SCORE!</div>}
            <div className="result-stats-grid">
              <div className="stat-card">
                <span className="stat-label">{t('최종 점수')}</span>
                <span className="stat-num highlight" data-testid="final-score">
                  {score.toLocaleString()}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('도달 웨이브')}</span>
                <span className="stat-num">{wave}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('최대 콤보')}</span>
                <span className="stat-num">{maxCombo}x</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('총 타수')}</span>
                <span className="stat-num">{totalKeystrokes}</span>
              </div>
            </div>
            <button
              className="start-arcade-btn retry-btn"
              onClick={handleStartGame}
              data-testid="retry-arcade-btn"
            >
              {t('🔄 다시 도전하기 (Enter)')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
