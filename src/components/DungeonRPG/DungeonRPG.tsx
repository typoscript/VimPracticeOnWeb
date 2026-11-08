import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DUNGEON_STAGES,
  DUNGEON_SKILLS,
} from '../../data/dungeonStages';
import { DungeonStage, DungeonSkill } from '../../types/dungeon';
import { VimEditorState, VimMode } from '../../vim-engine';
import { handleKey } from '../../vim-engine';
import {
  loadDungeonSave,
  recordStageClear,
} from '../../utils/dungeonStorage';
import { recordKeyInputStats } from '../../utils/analyticsStorage';
import './DungeonRPG.css';
import { t } from '../../i18n';

export interface DungeonRPGProps {
  onPlayKeySound: (key: string, mode: VimMode) => void;
  onPlaySuccessSound: () => void;
  isMuted: boolean;
}

export const DungeonRPG: React.FC<DungeonRPGProps> = ({
  onPlayKeySound,
  onPlaySuccessSound,
}) => {
  const [saveData, setSaveData] = useState(() => loadDungeonSave());
  const [currentStageIndex, setCurrentStageIndex] = useState(0);

  const stage: DungeonStage = DUNGEON_STAGES[currentStageIndex];

  const [editorState, setEditorState] = useState<VimEditorState>(() => ({
    lines: [...stage.initialLines],
    cursor: { ...stage.initialCursor },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
  }));

  const [keystrokes, setKeystrokes] = useState(0);
  const [hasKey, setHasKey] = useState(false);
  const [doorOpen, setDoorOpen] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [starsEarned, setStarsEarned] = useState(0);
  const [newBadge, setNewBadge] = useState<string | null>(null);
  const [unlockedSkill, setUnlockedSkill] = useState<DungeonSkill | null>(null);

  // 시각 효과: 타격 이펙트 및 배너 알림
  const [slashEffect, setSlashEffect] = useState<{
    line: number;
    col: number;
    label: string;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const activeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      activeTimersRef.current.forEach((t) => clearTimeout(t));
      activeTimersRef.current = [];
    };
  }, []);

  // 스테이지 변경 시 초기화
  const loadStage = useCallback((index: number) => {
    const s = DUNGEON_STAGES[index];
    setCurrentStageIndex(index);
    setEditorState({
      lines: [...s.initialLines],
      cursor: { ...s.initialCursor },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    });
    setKeystrokes(0);
    setHasKey(false);
    setDoorOpen(false);
    setIsCompleted(false);
    setStarsEarned(0);
    setNewBadge(null);
    setUnlockedSkill(null);
    setSlashEffect(null);
    setToastMessage(null);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    const timer = setTimeout(() => {
      if (isMountedRef.current) {
        setToastMessage((prev) => (prev === msg ? null : prev));
      }
    }, 2000);
    activeTimersRef.current.push(timer);
  }, []);

  // 키 입력 및 던전 상호작용 처리
  const processDungeonKey = useCallback(
    (key: string) => {
      if (isCompleted) {
        if (key === 'Enter') {
          if (currentStageIndex < DUNGEON_STAGES.length - 1) {
            loadStage(currentStageIndex + 1);
          }
        }
        return;
      }

      // 허용 키 검사 (스킬 잠금)
      const isAllowed =
        stage.allowedKeys.includes(key) ||
        stage.allowedKeys.some((k) => key.startsWith(k)) ||
        ['Shift', 'Control', 'Alt', 'Meta'].includes(key);

      if (!isAllowed) {
        showToast(t('🔒 이 스테이지에서는 아직 [{key}] 키를 사용할 수 없습니다!', { key }));
        return;
      }

      onPlayKeySound(key, editorState.mode);
      recordKeyInputStats(key);
      const prevCursor = { ...editorState.cursor };

      // Vim 엔진 키 처리
      let nextState = handleKey(editorState, key);

      // 단일 보행(h/j/k/l) 시 벽/물/문 충돌 검사
      const isWalk = ['h', 'j', 'k', 'l'].includes(key);
      const nextCursor = nextState.cursor;
      const targetTileChar = stage.tileMap[nextCursor.line]?.[nextCursor.col];

      if (isWalk) {
        // 벽(#) 충돌
        if (targetTileChar === '#') {
          nextState = { ...nextState, cursor: prevCursor };
          showToast(t('🧱 벽에 부딪혔습니다!'));
        }
        // 물(~) 충돌: 보행 불가
        else if (targetTileChar === '~') {
          nextState = { ...nextState, cursor: prevCursor };
          showToast(t('🌊 깊은 물은 걸어서 건널 수 없습니다! w/b/e 도약 부츠를 사용하세요.'));
        }
        // 심연(_) 충돌: 다리가 없으면 보행 불가
        else if (targetTileChar === '_' && !nextState.lines[nextCursor.line]?.includes('BRIDGE')) {
          nextState = { ...nextState, cursor: prevCursor };
          showToast(t('🕳️ 끊어진 심연입니다! 다리 블록을 yiw 복사한 후 p로 건설하세요.'));
        }
        // 잠긴 문(D) 충돌
        else if (targetTileChar === 'D' && !doorOpen) {
          nextState = { ...nextState, cursor: prevCursor };
          showToast(t('🚪 굳게 잠긴 문입니다! 황금 열쇠(K)를 획득하세요.'));
        }
      }

      // 타격 액션 이펙트 (x, di", da(, dw, yiw)
      if (key === 'x' || key === 'd' || nextState.pendingKeys?.includes('d')) {
        setSlashEffect({
          line: nextCursor.line,
          col: nextCursor.col,
          label: 'SLASH! 🗡️',
        });
        const timer = setTimeout(() => {
          if (isMountedRef.current) setSlashEffect(null);
        }, 600);
        activeTimersRef.current.push(timer);
      }

      // 열쇠(K) 획득 검사
      const curCharInLine = nextState.lines[nextCursor.line]?.[nextCursor.col];
      const origCharInMap = stage.tileMap[nextCursor.line]?.[nextCursor.col];
      if (!hasKey && (curCharInLine === 'K' || origCharInMap === 'K')) {
        setHasKey(true);
        setDoorOpen(true);
        onPlaySuccessSound();
        showToast(t('🗝️ 황금 열쇠를 획득하여 잠긴 문(D)이 열렸습니다!'));

        // 맵에서 K를 빈 공간(.)으로 갱신
        const updatedLines = [...nextState.lines];
        const rowStr = updatedLines[nextCursor.line] || '';
        updatedLines[nextCursor.line] =
          rowStr.slice(0, nextCursor.col) + '.' + rowStr.slice(nextCursor.col + 1);
        nextState = { ...nextState, lines: updatedLines };
      }

      // 보스전(Stage 5) 특수 판정: BUG_LORD 핵 파괴 시 문 자동 개방
      if (stage.id === 5) {
        const hasBossAlive = nextState.lines.some((l) => l.includes('BUG_LORD'));
        if (!hasBossAlive && !doorOpen) {
          setDoorOpen(true);
          setHasKey(true);
          onPlaySuccessSound();
          setSlashEffect({ line: 2, col: 5, label: 'BOSS CRUSHED! 💥' });
          showToast(t('💥 버그 로드가 쓰러져 신전의 거대한 문이 열렸습니다!'));
        }
      }

      // 출구(E) 도달 클리어 검사
      if (
        (origCharInMap === 'E' || curCharInLine === 'E') &&
        (doorOpen || hasKey || stage.id === 2 || stage.id === 3)
      ) {
        setIsCompleted(true);
        onPlaySuccessSound();
        const nextKeystrokes = keystrokes + 1;
        setKeystrokes(nextKeystrokes);

        const res = recordStageClear(
          stage.id,
          nextKeystrokes,
          stage.par,
          stage.newSkillUnlocked?.id
        );
        setSaveData(res.data);
        setStarsEarned(res.stars);
        if (res.newBadgeEarned) setNewBadge(res.newBadgeEarned);
        if (stage.newSkillUnlocked) setUnlockedSkill(stage.newSkillUnlocked);
        return;
      }

      setKeystrokes((prev) => prev + 1);
      setEditorState(nextState);
    },
    [
      isCompleted,
      stage,
      currentStageIndex,
      loadStage,
      editorState,
      doorOpen,
      hasKey,
      keystrokes,
      onPlayKeySound,
      onPlaySuccessSound,
      showToast,
    ]
  );

  // 키보드 리스너 등록
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      processDungeonKey(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [processDungeonKey]);

  return (
    <div className="dungeon-rpg-container" data-testid="dungeon-rpg-container">
      {/* 상단 던전 헤더 HUD */}
      <header className="dungeon-hud">
        <div className="hud-left">
          <div className="stage-selector">
            <span className="dungeon-badge">🗡️ VIM ADVENTURES</span>
            <select
              className="stage-dropdown"
              value={currentStageIndex}
              onChange={(e) => loadStage(Number(e.target.value))}
              data-testid="stage-select-dropdown"
            >
              {DUNGEON_STAGES.map((s, idx) => {
                const isUnlocked = idx === 0 || idx < saveData.highestUnlockedStage;
                const rec = saveData.stageRecords[s.id];
                const stars = rec ? '⭐'.repeat(rec.stars) : '';
                return (
                  <option key={s.id} value={idx} disabled={!isUnlocked}>
                    {s.title} {stars} {!isUnlocked ? '🔒' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="hud-center">
          <div className="hud-metric stroke-metric">
            <span className="metric-label">{t('타수 (MANA)')}</span>
            <span
              className={`metric-val ${keystrokes <= stage.par ? 'good' : 'warning'}`}
              data-testid="dungeon-keystrokes"
            >
              {keystrokes} / {stage.par}
            </span>
          </div>

          <div className="hud-metric key-metric">
            <span className="metric-label">{t('열쇠')}</span>
            <span className="metric-val" data-testid="dungeon-key-status">
              {hasKey ? t('🗝️ 보유 중') : t('❌ 없음')}
            </span>
          </div>

          <div className="hud-metric door-metric">
            <span className="metric-label">{t('철문')}</span>
            <span className="metric-val" data-testid="dungeon-door-status">
              {doorOpen ? t('🔓 개방됨') : t('🔒 잠김')}
            </span>
          </div>
        </div>

        <div className="hud-right">
          <button
            className="dungeon-reset-btn"
            onClick={() => loadStage(currentStageIndex)}
            data-testid="dungeon-restart-btn"
          >
            {t('🔄 스테이지 재시작')}
          </button>
        </div>
      </header>

      {/* 미션 목표 안내 바 */}
      <div className="dungeon-objective-bar">
        <span className="objective-icon">🎯</span>
        <span className="objective-text" data-testid="dungeon-objective">
          {stage.objective}
        </span>
        <span className="objective-hint" title={stage.hint}>
          💡 {stage.hint}
        </span>
      </div>

      {/* 실시간 알림 토스트 */}
      {toastMessage && (
        <div className="dungeon-toast" data-testid="dungeon-toast">
          {toastMessage}
        </div>
      )}

      {/* 2D 타일맵 그리드 렌더러 */}
      <main className="dungeon-viewport" data-testid="dungeon-grid-viewport">
        <div className="dungeon-grid">
          {stage.tileMap.map((tileRow, rIdx) => {
            const lineText = editorState.lines[rIdx] || '';
            return (
              <div key={rIdx} className="dungeon-grid-row">
                {tileRow.split('').map((mapTile, cIdx) => {
                  const isPlayer =
                    editorState.cursor.line === rIdx && editorState.cursor.col === cIdx;
                  const charOnBoard = lineText[cIdx] || ' ';
                  const isWall = mapTile === '#';
                  const isWater = mapTile === '~';
                  const isGap = mapTile === '_';
                  const isDoor = mapTile === 'D';
                  const isExit = mapTile === 'E';
                  const isKey = mapTile === 'K' || charOnBoard === 'K';
                  const isBoss = stage.id === 5 && rIdx === 2 && cIdx >= 3 && cIdx <= 13;

                  let tileClass = 'tile-floor';
                  if (isWall) tileClass = 'tile-wall';
                  else if (isWater) tileClass = 'tile-water';
                  else if (isGap) tileClass = lineText.includes('BRIDGE') ? 'tile-bridge' : 'tile-gap';
                  else if (isDoor) tileClass = doorOpen ? 'tile-door-open' : 'tile-door-closed';
                  else if (isExit) tileClass = 'tile-exit';

                  return (
                    <div
                      key={cIdx}
                      className={`dungeon-tile ${tileClass} ${isPlayer ? 'player-tile' : ''}`}
                      data-testid={`tile-${rIdx}-${cIdx}`}
                    >
                      {/* 타일별 아이콘 / 스프라이트 */}
                      {isPlayer ? (
                        <div className="player-avatar" data-testid="player-avatar">
                          🧙‍♂️
                        </div>
                      ) : isKey && !hasKey ? (
                        <span className="entity-key">🗝️</span>
                      ) : isDoor ? (
                        <span className="entity-door">{doorOpen ? '🚪' : '🔒'}</span>
                      ) : isExit ? (
                        <span className="entity-exit">✨</span>
                      ) : isWater ? (
                        <span className="water-wave">{charOnBoard !== '~' ? charOnBoard : '≋'}</span>
                      ) : isBoss && charOnBoard !== ' ' ? (
                        <span className="entity-boss">{charOnBoard}</span>
                      ) : (
                        <span className="tile-char">{charOnBoard}</span>
                      )}

                      {/* 타격 이펙트 */}
                      {slashEffect &&
                        slashEffect.line === rIdx &&
                        slashEffect.col === cIdx && (
                          <div className="slash-animation">{slashEffect.label}</div>
                        )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </main>

      {/* 하단: 보유한 Vim 스킬 인벤토리 바 */}
      <footer className="dungeon-skills-bar" data-testid="dungeon-skills-bar">
        <span className="skills-bar-title">🎒 VIM SKILLS</span>
        <div className="skills-slots">
          {Object.values(DUNGEON_SKILLS).map((skill) => {
            const isUnlocked = saveData.unlockedSkillIds.includes(skill.id);
            return (
              <div
                key={skill.id}
                className={`skill-slot ${isUnlocked ? 'unlocked' : 'locked'}`}
                title={`${skill.name}: ${skill.description}`}
                data-testid={`skill-slot-${skill.id}`}
              >
                <span className="skill-icon">{isUnlocked ? skill.icon : '🔒'}</span>
                <span className="skill-keys">[{skill.keys[0]}]</span>
                <span className="skill-name">{skill.name}</span>
              </div>
            );
          })}
        </div>
      </footer>

      {/* 클리어 & 신규 스킬 해금 모달 */}
      {isCompleted && (
        <div className="dungeon-modal-overlay" data-testid="dungeon-clear-modal">
          <div className="dungeon-clear-dialog">
            <span className="dialog-trophy">🎉</span>
            <h2 className="clear-title">{t('{title} 클리어!', { title: stage.title })}</h2>
            <div className="clear-stars">
              {'⭐'.repeat(starsEarned)}{' '}
              {starsEarned === 3 ? t('(마스터 Par 달성!)') : ''}
            </div>

            <p className="clear-stat">
              {t('소모 마나(타수):')} <strong>{t('{n}타', { n: keystrokes })}</strong> {t('(Par 기준: {n}타)', { n: stage.par })}
            </p>

            {unlockedSkill && (
              <div className="unlocked-skill-card" data-testid="unlocked-skill-card">
                <span className="scroll-tag">{t('📜 신규 Vim 스킬 스크롤 획득!')}</span>
                <div className="skill-detail">
                  <span className="detail-icon">{unlockedSkill.icon}</span>
                  <div>
                    <h4>{unlockedSkill.name}</h4>
                    <p>{unlockedSkill.description}</p>
                  </div>
                </div>
              </div>
            )}

            {newBadge && (
              <div className="new-badge-banner" data-testid="new-badge-banner">
                <span>{newBadge}</span>
              </div>
            )}

            <div className="clear-actions">
              {currentStageIndex < DUNGEON_STAGES.length - 1 ? (
                <button
                  className="next-stage-btn"
                  onClick={() => loadStage(currentStageIndex + 1)}
                  data-testid="next-stage-btn"
                >
                  {t('다음 스테이지로 진입 (Enter) >')}
                </button>
              ) : (
                <button
                  className="next-stage-btn"
                  onClick={() => loadStage(0)}
                  data-testid="restart-from-first-btn"
                >
                  {t('🏆 전설 달성! 첫 스테이지로 >')}
                </button>
              )}
              <button
                className="retry-stage-btn"
                onClick={() => loadStage(currentStageIndex)}
              >
                {t('더 적은 타수로 재도전')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
