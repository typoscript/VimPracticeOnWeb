import { useEffect, useState, useCallback, useRef } from 'react';
import { Editor } from './components/Editor/Editor';
import { StatusBar } from './components/StatusBar/StatusBar';
import { MissionPanel, calculateStars } from './components/MissionPanel/MissionPanel';
import { Keycaster } from './components/Keycaster/Keycaster';
import { CoachingToast } from './components/CoachingToast/CoachingToast';
import { LessonSelectModal } from './components/LessonSelectModal/LessonSelectModal';
import { DiffViewer } from './components/DiffViewer/DiffViewer';
import { VirtualKeyboard } from './components/VirtualKeyboard/VirtualKeyboard';
import { SpeedrunPanel } from './components/SpeedrunPanel/SpeedrunPanel';
import { VimEditorState } from './types/vim';
import { Mission } from './types/mission';
import { handleKey } from './engine/vimEngine';
import { MISSIONS } from './data/missions';
import { SANDBOX_INITIAL_LINES } from './data/sandbox';
import {
  loadProgress,
  saveLessonRecord,
  loadRelativeLineSetting,
  saveRelativeLineSetting,
  loadVirtualKeyboardSetting,
  saveVirtualKeyboardSetting,
  loadDiffViewSetting,
  saveDiffViewSetting,
  loadSpeedrunRecord,
  saveSpeedrunRecord,
  SpeedrunRecord,
  LessonProgress,
} from './utils/storage';
import { normalizeImeKey } from './utils/imeHelper';
import './App.css';

const REPEATED_MOTION_KEYS = ['h', 'j', 'k', 'l', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

/** 스피드런 챌린지 후보 미션 ID 목록 (리팩토링/편집 미션) */
export const SPEEDRUN_CANDIDATE_IDS = [4, 6, 7, 9, 10, 11, 12, 13, 14, 15, 17];

export function generateSpeedrunStages(): Mission[] {
  const candidates = MISSIONS.filter((m) => SPEEDRUN_CANDIDATE_IDS.includes(m.id));
  const shuffled = [...candidates].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 5);
}

export function App() {
  const [currentTab, setCurrentTab] = useState<'course' | 'sandbox' | 'speedrun'>('course');
  const [currentMissionIndex, setCurrentMissionIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [progress, setProgress] = useState<LessonProgress>(() => loadProgress());
  const [relativeLineNumbers, setRelativeLineNumbers] = useState<boolean>(() => loadRelativeLineSetting());
  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState<boolean>(() => loadVirtualKeyboardSetting());
  const [showDiffView, setShowDiffView] = useState<boolean>(() => loadDiffViewSetting());
  const [isEditorFocused, setIsEditorFocused] = useState<boolean>(true);

  const currentMission = MISSIONS[currentMissionIndex];

  // 총 입력 타수 및 최근 키 입력 히스토리, 가상 키보드 프레스 상태
  const [keystrokeCount, setKeystrokeCount] = useState(0);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [lastPressedKey, setLastPressedKey] = useState<string | undefined>(undefined);

  // 안티 패턴 감지 코칭 메시지
  const [coachingMessage, setCoachingMessage] = useState<string | null>(null);
  const consecutiveMotionRef = useRef(0);

  // 스피드런 상태 관리
  const [speedrunStatus, setSpeedrunStatus] = useState<'ready' | 'running' | 'completed'>('ready');
  const [speedrunStages, setSpeedrunStages] = useState<Mission[]>(() => generateSpeedrunStages());
  const [speedrunCurrentStage, setSpeedrunCurrentStage] = useState(0);
  const [speedrunElapsedSeconds, setSpeedrunElapsedSeconds] = useState(0);
  const [speedrunKeystrokes, setSpeedrunKeystrokes] = useState(0);
  const [speedrunBestRecord, setSpeedrunBestRecord] = useState<SpeedrunRecord | null>(() => loadSpeedrunRecord());
  const [speedrunIsNewRecord, setSpeedrunIsNewRecord] = useState(false);

  const activeSpeedrunMission = speedrunStages[speedrunCurrentStage];

  const [editorState, setEditorState] = useState<VimEditorState>({
    lines: currentMission.initialLines,
    cursor: currentMission.initialCursor,
    mode: 'NORMAL',
    undoStack: currentMission.initialUndoStack ? [...currentMission.initialUndoStack] : [],
    redoStack: [],
    clipboard: currentMission.initialClipboard,
  });

  const isCompleted = currentTab === 'course' && currentMission.checkComplete(editorState);

  // 튜토리얼 코스 미션 클리어 시 최고 기록 및 별점 영구 저장
  useEffect(() => {
    if (currentTab === 'course' && isCompleted) {
      const rating = calculateStars(keystrokeCount, currentMission.par);
      const updated = saveLessonRecord(currentMission.id, rating.starCount, keystrokeCount);
      setProgress(updated);
    }
  }, [currentTab, isCompleted, currentMission.id, currentMission.par, keystrokeCount]);

  // 스피드런 타이머 연동 (100ms마다 0.1초 증가)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (currentTab === 'speedrun' && speedrunStatus === 'running') {
      interval = setInterval(() => {
        setSpeedrunElapsedSeconds((prev) => Number((prev + 0.1).toFixed(1)));
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentTab, speedrunStatus]);

  // 스피드런 스테이지 완료 및 다음 스테이지 자동 전이
  useEffect(() => {
    if (
      currentTab === 'speedrun' &&
      speedrunStatus === 'running' &&
      activeSpeedrunMission &&
      activeSpeedrunMission.checkComplete(editorState)
    ) {
      if (speedrunCurrentStage < speedrunStages.length - 1) {
        // 다음 스테이지로 즉시 이동
        const nextStageIdx = speedrunCurrentStage + 1;
        setSpeedrunCurrentStage(nextStageIdx);
        const nextMission = speedrunStages[nextStageIdx];
        setEditorState({
          lines: [...nextMission.initialLines],
          cursor: { ...nextMission.initialCursor },
          mode: 'NORMAL',
          undoStack: nextMission.initialUndoStack ? [...nextMission.initialUndoStack] : [],
          redoStack: [],
          clipboard: nextMission.initialClipboard,
        });
        setCoachingMessage(`🎉 스테이지 ${speedrunCurrentStage + 1} 돌파! 다음 목표로 이동합니다.`);
      } else {
        // 5개 스테이지 최종 완료!
        setSpeedrunStatus('completed');
        const saveRes = saveSpeedrunRecord(speedrunElapsedSeconds, speedrunKeystrokes);
        setSpeedrunBestRecord(saveRes.record);
        setSpeedrunIsNewRecord(saveRes.isNewRecord);
      }
    }
  }, [
    currentTab,
    speedrunStatus,
    activeSpeedrunMission,
    speedrunCurrentStage,
    speedrunStages,
    editorState,
    speedrunElapsedSeconds,
    speedrunKeystrokes,
  ]);

  const handleSelectMission = useCallback((index: number) => {
    if (index >= 0 && index < MISSIONS.length) {
      setCurrentMissionIndex(index);
      const nextMission = MISSIONS[index];
      setEditorState({
        lines: nextMission.initialLines,
        cursor: nextMission.initialCursor,
        mode: 'NORMAL',
        undoStack: nextMission.initialUndoStack ? [...nextMission.initialUndoStack] : [],
        redoStack: [],
        clipboard: nextMission.initialClipboard,
      });
      setKeystrokeCount(0);
      setRecentKeys([]);
      setLastPressedKey(undefined);
      setCoachingMessage(null);
      consecutiveMotionRef.current = 0;
    }
  }, []);

  const handleResetMission = useCallback(() => {
    setEditorState({
      lines: currentMission.initialLines,
      cursor: currentMission.initialCursor,
      mode: 'NORMAL',
      undoStack: currentMission.initialUndoStack ? [...currentMission.initialUndoStack] : [],
      redoStack: [],
      clipboard: currentMission.initialClipboard,
    });
    setKeystrokeCount(0);
    setRecentKeys([]);
    setLastPressedKey(undefined);
    setCoachingMessage(null);
    consecutiveMotionRef.current = 0;
  }, [currentMission]);

  const handleResetSandbox = useCallback(() => {
    setEditorState({
      lines: [...SANDBOX_INITIAL_LINES],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    });
    setKeystrokeCount(0);
    setRecentKeys([]);
    setLastPressedKey(undefined);
    setCoachingMessage(null);
    consecutiveMotionRef.current = 0;
  }, []);

  const handleStartSpeedrun = useCallback(() => {
    const newStages = generateSpeedrunStages();
    setSpeedrunStages(newStages);
    setSpeedrunCurrentStage(0);
    setSpeedrunElapsedSeconds(0);
    setSpeedrunKeystrokes(0);
    setSpeedrunIsNewRecord(false);
    setSpeedrunStatus('running');

    const first = newStages[0];
    setEditorState({
      lines: [...first.initialLines],
      cursor: { ...first.initialCursor },
      mode: 'NORMAL',
      undoStack: first.initialUndoStack ? [...first.initialUndoStack] : [],
      redoStack: [],
      clipboard: first.initialClipboard,
    });
    setRecentKeys([]);
    setLastPressedKey(undefined);
    setCoachingMessage(null);
  }, []);

  const handleSwitchTab = useCallback(
    (tab: 'course' | 'sandbox' | 'speedrun') => {
      setCurrentTab(tab);
      setLastPressedKey(undefined);
      setCoachingMessage(null);
      consecutiveMotionRef.current = 0;

      if (tab === 'sandbox') {
        handleResetSandbox();
      } else if (tab === 'speedrun') {
        setSpeedrunStatus('ready');
        setSpeedrunElapsedSeconds(0);
        setSpeedrunKeystrokes(0);
        setSpeedrunIsNewRecord(false);
      } else {
        const mission = MISSIONS[currentMissionIndex];
        setEditorState({
          lines: mission.initialLines,
          cursor: mission.initialCursor,
          mode: 'NORMAL',
          undoStack: mission.initialUndoStack ? [...mission.initialUndoStack] : [],
          redoStack: [],
          clipboard: mission.initialClipboard,
        });
        setKeystrokeCount(0);
        setRecentKeys([]);
      }
    },
    [currentMissionIndex, handleResetSandbox]
  );

  const handleToggleRelativeLine = useCallback(() => {
    setRelativeLineNumbers((prev) => {
      const next = !prev;
      saveRelativeLineSetting(next);
      return next;
    });
  }, []);

  const handleToggleVirtualKeyboard = useCallback(() => {
    setShowVirtualKeyboard((prev) => {
      const next = !prev;
      saveVirtualKeyboardSetting(next);
      return next;
    });
  }, []);

  const handleToggleDiffView = useCallback(() => {
    setShowDiffView((prev) => {
      const next = !prev;
      saveDiffViewSetting(next);
      return next;
    });
  }, []);

  // 실제 키 입력 또는 가상 키보드 클릭 시 공통 실행 함수
  const processKeyInput = useCallback(
    (key: string) => {
      // 단독 보조 키 필터링
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(key)) {
        return;
      }

      setLastPressedKey(key);
      setKeystrokeCount((prev) => prev + 1);
      setRecentKeys((prev) => [...prev.slice(-7), key]);

      if (currentTab === 'speedrun' && speedrunStatus === 'running') {
        setSpeedrunKeystrokes((prev) => prev + 1);
      }

      // 안티 패턴 감지: 단일 이동 키 5회 이상 연속 연타
      if (REPEATED_MOTION_KEYS.includes(key)) {
        consecutiveMotionRef.current += 1;
        if (consecutiveMotionRef.current >= 5) {
          setCoachingMessage('이동 키를 연타하는 대신 w, b 또는 숫자+이동(예: 5j)을 사용해 보세요!');
        }
      } else {
        consecutiveMotionRef.current = 0;
      }

      setEditorState((prevState) => handleKey(prevState, key));
    },
    [currentTab, speedrunStatus]
  );

  // 브라우저 윈도우 포커스/블러 감지
  useEffect(() => {
    const handleWindowFocus = () => setIsEditorFocused(true);
    const handleWindowBlur = () => setIsEditorFocused(false);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 모달이 열려 있을 때는 에디터 키 입력을 차단
      if (isModalOpen) {
        return;
      }

      // 키 입력 시 에디터 포커스 자동 활성화
      if (!isEditorFocused) {
        setIsEditorFocused(true);
      }

      // 단독 메타/보조 키는 타수 및 엔진 전달 제외
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }

      // Ctrl+r 또는 Cmd+r: Redo 실행 취소 취소 (브라우저 페이지 새로고침 완벽 차단)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        processKeyInput('Ctrl-r');
        return;
      }

      // Ctrl+f 또는 Cmd+f: 브라우저 찾기 대신 Vim 검색 모드(/) 진입 유도
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        processKeyInput('/');
        return;
      }

      // 그 외 메타 키 조합은 브라우저 기본 단축키 허용
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // 브라우저 기본 스크롤, 포커스 이동, 검색창, 엔터(버튼 재클릭 방지), 뒤로가기 방지
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          ' ',
          'Backspace',
          'Tab',
          '/',
          'Enter',
          'PageUp',
          'PageDown',
        ].includes(e.key)
      ) {
        e.preventDefault();
      }

      // 이전 UI 버튼에 남아 있는 HTML 포커스 해제
      if (
        document.activeElement &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement.tagName !== 'BODY'
      ) {
        document.activeElement.blur();
      }

      // 한/영 입력기(IME) 정규화: NORMAL/VISUAL 모드에서 물리 키코드(e.code)를 매핑해 한글 상태에서도 이동/명령 유지
      const { key: normalizedKey, isNormalized } = normalizeImeKey(e, editorState.mode);

      if (isNormalized) {
        setCoachingMessage(`💡 한글 입력이 감지되어 영문('${normalizedKey}')으로 자동 매핑되었습니다. 원활한 입력을 위해 [한/영] 전환을 권장합니다.`);
      } else if (e.key === 'Process' || /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(e.key)) {
        setCoachingMessage('⚠️ 현재 한글 입력 상태입니다. 원활한 Vim 명령어 입력을 위해 [한/영] 키를 눌러 영문 모드로 전환해 주세요!');
      }

      processKeyInput(normalizedKey);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen, isEditorFocused, editorState.mode, processKeyInput]);

  const activeMissionForDiff =
    currentTab === 'course'
      ? currentMission
      : currentTab === 'speedrun' && speedrunStatus === 'running'
      ? activeSpeedrunMission
      : undefined;

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">⌨</span>
          <h1 className="brand-title">VimPracticeOnWeb</h1>
        </div>
        <p className="header-desc">인터랙티브 Vim 튜토리얼 &amp; 연습 코스</p>
      </header>

      {/* 탭 전환 및 상단 툴바 */}
      <div className="app-nav-bar" data-testid="app-nav-bar">
        <div className="nav-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={currentTab === 'course'}
            className={`nav-tab-btn ${currentTab === 'course' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('course')}
            data-testid="tab-course-btn"
          >
            🎯 튜토리얼 코스
          </button>
          <button
            role="tab"
            aria-selected={currentTab === 'sandbox'}
            className={`nav-tab-btn ${currentTab === 'sandbox' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('sandbox')}
            data-testid="tab-sandbox-btn"
          >
            🧪 자유 연습장
          </button>
          <button
            role="tab"
            aria-selected={currentTab === 'speedrun'}
            className={`nav-tab-btn ${currentTab === 'speedrun' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('speedrun')}
            data-testid="tab-speedrun-btn"
          >
            ⚡ 스피드런
          </button>
        </div>

        <div className="nav-actions">
          {currentTab === 'course' && (
            <button
              className="toolbar-btn lesson-list-btn"
              onClick={() => setIsModalOpen(true)}
              data-testid="open-lesson-modal-btn"
            >
              📚 레슨 목록
            </button>
          )}

          {/* 목표 Diff 뷰 토글 버튼 */}
          {currentTab !== 'sandbox' && (
            <button
              className={`toolbar-btn diff-toggle-btn ${showDiffView ? 'active' : ''}`}
              onClick={handleToggleDiffView}
              data-testid="toggle-diff-view-btn"
              title="목표 텍스트 Diff 비교 뷰어 토글"
            >
              🎯 목표 Diff: {showDiffView ? 'ON' : 'OFF'}
            </button>
          )}

          {/* 가상 키보드 오버레이 토글 버튼 */}
          <button
            className={`toolbar-btn keyboard-toggle-btn ${showVirtualKeyboard ? 'active' : ''}`}
            onClick={handleToggleVirtualKeyboard}
            data-testid="toggle-virtual-keyboard-btn"
            title="반응형 인터랙티브 가상 키보드 패널 토글"
          >
            ⌨ 가상 키보드: {showVirtualKeyboard ? 'ON' : 'OFF'}
          </button>

          <button
            className={`toolbar-btn relativenumber-btn ${relativeLineNumbers ? 'active' : ''}`}
            onClick={handleToggleRelativeLine}
            data-testid="toggle-relativenumber-btn"
            title="상대 라인 번호 (relativenumber) 토글"
          >
            relativenumber: {relativeLineNumbers ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <section className="key-cheatsheet" aria-label="Keyboard Shortcuts">
        <span className="cheat-item"><code>h j k l</code> 이동</span>
        <span className="cheat-item"><code>w b e</code> 단어 점프</span>
        <span className="cheat-item"><code>f F t T</code> 문자 탐색</span>
        <span className="cheat-item"><code>/ n N *</code> 키워드 검색</span>
        <span className="cheat-item"><code>: [숫자] / :s</code> 커맨드라인</span>
        <span className="cheat-item"><code>0 $ ^</code> 줄 이동</span>
        <span className="cheat-item"><code>i a I A o O</code> 입력 진입</span>
        <span className="cheat-item"><code>Esc</code> 일반 모드</span>
        <span className="cheat-item"><code>x</code> 글자 삭제</span>
        <span className="cheat-item"><code>cw cc C r</code> 수정/교체</span>
        <span className="cheat-item"><code>iw i" i(</code> 텍스트 객체</span>
        <span className="cheat-item"><code>v / V</code> 영역 선택</span>
        <span className="cheat-item"><code>dd dw</code> 줄/단어 삭제</span>
        <span className="cheat-item"><code>.</code> 직전 변경 반복</span>
        <span className="cheat-item"><code>p</code> 붙여넣기</span>
        <span className="cheat-item"><code>u / Ctrl-r</code> 실행취소/다시실행</span>
      </section>

      <main className="editor-wrapper">
        <CoachingToast
          message={coachingMessage}
          onDismiss={() => setCoachingMessage(null)}
        />

        {currentTab === 'course' && (
          <MissionPanel
            mission={currentMission}
            missionIndex={currentMissionIndex}
            totalMissions={MISSIONS.length}
            isCompleted={isCompleted}
            keystrokeCount={keystrokeCount}
            onSelectMission={handleSelectMission}
            onResetMission={handleResetMission}
          />
        )}

        {currentTab === 'sandbox' && (
          <div className="sandbox-panel" data-testid="sandbox-panel">
            <div className="sandbox-info">
              <span className="sandbox-badge">🧪 SANDBOX</span>
              <span className="sandbox-desc">
                미션 제약 없이 모든 Vim 키보드 명령어를 자유롭게 실험해 볼 수 있습니다.
              </span>
            </div>
            <button
              className="sandbox-reset-btn"
              onClick={handleResetSandbox}
              data-testid="sandbox-reset-btn"
            >
              🔄 코드 초기화
            </button>
          </div>
        )}

        {currentTab === 'speedrun' && (
          <SpeedrunPanel
            status={speedrunStatus}
            currentStageIndex={speedrunCurrentStage}
            totalStages={speedrunStages.length}
            currentMissionTitle={activeSpeedrunMission?.title}
            elapsedSeconds={speedrunElapsedSeconds}
            totalKeystrokes={speedrunKeystrokes}
            bestRecord={speedrunBestRecord}
            isNewRecord={speedrunIsNewRecord}
            onStart={handleStartSpeedrun}
            onRestart={handleStartSpeedrun}
          />
        )}

        <Editor
          lines={editorState.lines}
          cursor={editorState.cursor}
          mode={editorState.mode}
          targetPosition={currentTab === 'course' ? currentMission.targetCursor : activeSpeedrunMission?.targetCursor}
          visualAnchor={editorState.visualAnchor}
          relativeLineNumbers={relativeLineNumbers}
          searchQuery={
            editorState.mode === 'SEARCH'
              ? editorState.commandBuffer
              : editorState.lastSearchQuery
          }
          isFocused={isEditorFocused}
          onFocus={() => setIsEditorFocused(true)}
        />
        <Keycaster recentKeys={recentKeys} />
        <StatusBar
          mode={editorState.mode}
          cursor={editorState.cursor}
          filename={
            currentTab === 'course'
              ? `lesson_${currentMission.id}.txt`
              : currentTab === 'speedrun'
              ? `speedrun_stage_${speedrunCurrentStage + 1}.txt`
              : 'sandbox.ts'
          }
          pendingKeys={editorState.pendingKeys}
          commandType={editorState.commandType}
          commandBuffer={editorState.commandBuffer}
          commandMessage={editorState.commandMessage}
        />

        {/* 목표 상태 Diff 비교 하이라이트 뷰 */}
        {showDiffView && activeMissionForDiff && (
          <DiffViewer
            currentLines={editorState.lines}
            targetLines={activeMissionForDiff.targetLines}
            isCompleted={currentTab === 'course' ? isCompleted : false}
          />
        )}

        {/* 반응형 인터랙티브 가상 키보드 패널 */}
        {showVirtualKeyboard && (
          <VirtualKeyboard
            mode={editorState.mode}
            lastPressedKey={lastPressedKey}
            onKeyPress={processKeyInput}
          />
        )}
      </main>

      <footer className="app-footer">
        <span>VimPracticeOnWeb • 키보드로 미션을 완료하며 자연스럽게 Vim을 마스터하세요</span>
      </footer>

      <LessonSelectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        missions={MISSIONS}
        currentMissionId={currentMission.id}
        progress={progress}
        onSelectLesson={(missionId) => {
          const idx = MISSIONS.findIndex((m) => m.id === missionId);
          if (idx !== -1) {
            handleSelectMission(idx);
            setCurrentTab('course');
          }
        }}
      />
    </div>
  );
}

export default App;
