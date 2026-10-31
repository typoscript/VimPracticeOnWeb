import { useEffect, useState, useCallback, useRef } from 'react';
import { Editor } from './components/Editor/Editor';
import { StatusBar } from './components/StatusBar/StatusBar';
import { MissionPanel, calculateStars } from './components/MissionPanel/MissionPanel';
import { Keycaster } from './components/Keycaster/Keycaster';
import { CoachingToast } from './components/CoachingToast/CoachingToast';
import { LessonSelectModal } from './components/LessonSelectModal/LessonSelectModal';
import { VimEditorState } from './types/vim';
import { handleKey } from './engine/vimEngine';
import { MISSIONS } from './data/missions';
import { SANDBOX_INITIAL_LINES } from './data/sandbox';
import {
  loadProgress,
  saveLessonRecord,
  loadRelativeLineSetting,
  saveRelativeLineSetting,
  LessonProgress,
} from './utils/storage';
import './App.css';

const REPEATED_MOTION_KEYS = ['h', 'j', 'k', 'l', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

export function App() {
  const [currentTab, setCurrentTab] = useState<'course' | 'sandbox'>('course');
  const [currentMissionIndex, setCurrentMissionIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [progress, setProgress] = useState<LessonProgress>(() => loadProgress());
  const [relativeLineNumbers, setRelativeLineNumbers] = useState<boolean>(() => loadRelativeLineSetting());

  const currentMission = MISSIONS[currentMissionIndex];

  // 총 입력 타수 및 최근 키 입력 히스토리
  const [keystrokeCount, setKeystrokeCount] = useState(0);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);

  // 안티 패턴 감지 코칭 메시지
  const [coachingMessage, setCoachingMessage] = useState<string | null>(null);
  const consecutiveMotionRef = useRef(0);

  const [editorState, setEditorState] = useState<VimEditorState>({
    lines: currentMission.initialLines,
    cursor: currentMission.initialCursor,
    mode: 'NORMAL',
    undoStack: currentMission.initialUndoStack ? [...currentMission.initialUndoStack] : [],
    redoStack: [],
    clipboard: currentMission.initialClipboard,
  });

  const isCompleted = currentTab === 'course' && currentMission.checkComplete(editorState);

  // 미션 클리어 시 최고 기록 및 별점 영구 저장
  useEffect(() => {
    if (currentTab === 'course' && isCompleted) {
      const rating = calculateStars(keystrokeCount, currentMission.par);
      const updated = saveLessonRecord(currentMission.id, rating.starCount, keystrokeCount);
      setProgress(updated);
    }
  }, [currentTab, isCompleted, currentMission.id, currentMission.par, keystrokeCount]);

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
    setCoachingMessage(null);
    consecutiveMotionRef.current = 0;
  }, []);

  const handleSwitchTab = useCallback((tab: 'course' | 'sandbox') => {
    setCurrentTab(tab);
    if (tab === 'sandbox') {
      handleResetSandbox();
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
      setCoachingMessage(null);
      consecutiveMotionRef.current = 0;
    }
  }, [currentMissionIndex, handleResetSandbox]);

  const handleToggleRelativeLine = useCallback(() => {
    setRelativeLineNumbers((prev) => {
      const next = !prev;
      saveRelativeLineSetting(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 모달이 열려 있을 때는 에디터 키 입력을 차단
      if (isModalOpen) {
        return;
      }

      // 단독 메타/보조 키(Shift, Control, Alt, Meta, CapsLock)는 타수 및 Vim 엔진 전달 제외
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }

      // Ctrl+r 또는 Cmd+r: Redo 실행 취소 취소
      if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        setKeystrokeCount((prev) => prev + 1);
        setRecentKeys((prev) => [...prev.slice(-7), 'Ctrl-r']);
        consecutiveMotionRef.current = 0;
        setEditorState((prevState) => handleKey(prevState, 'Ctrl-r'));
        return;
      }

      // 그 외 메타 키(Command, Ctrl, Alt) 조합은 브라우저 기본 단축키 허용
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // 브라우저 기본 스크롤, 포커스 이동, 검색창, 엔터(버튼 재클릭 방지), 뒤로가기 방지
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Backspace', 'Tab', '/', 'Enter'].includes(e.key)) {
        e.preventDefault();
      }

      // 이전에 클릭한 UI 버튼에 남아 있는 포커스를 해제하여 Enter 입력 시 버튼이 재실행되는 버그 방지
      if (
        document.activeElement &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement.tagName !== 'BODY'
      ) {
        document.activeElement.blur();
      }

      // 한글 입력기(IME) 상태 감지 코칭 안내
      if (e.key === 'Process' || /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(e.key)) {
        setCoachingMessage('⚠️ 현재 한글 입력 상태입니다. 원활한 Vim 명령어 입력을 위해 [한/영] 키를 눌러 영문 모드로 전환해 주세요!');
      }

      // 타수 증가 및 키캐스터 등록
      setKeystrokeCount((prev) => prev + 1);
      setRecentKeys((prev) => [...prev.slice(-7), e.key]);

      // 안티 패턴 감지: 단일 이동 키 5회 이상 연속 연타
      if (REPEATED_MOTION_KEYS.includes(e.key)) {
        consecutiveMotionRef.current += 1;
        if (consecutiveMotionRef.current >= 5) {
          setCoachingMessage('이동 키를 연타하는 대신 w, b 또는 숫자+이동(예: 5j)을 사용해 보세요!');
        }
      } else {
        consecutiveMotionRef.current = 0;
      }

      setEditorState((prevState) => handleKey(prevState, e.key));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen]);

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

        {currentTab === 'course' ? (
          <MissionPanel
            mission={currentMission}
            missionIndex={currentMissionIndex}
            totalMissions={MISSIONS.length}
            isCompleted={isCompleted}
            keystrokeCount={keystrokeCount}
            onSelectMission={handleSelectMission}
            onResetMission={handleResetMission}
          />
        ) : (
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

        <Editor
          lines={editorState.lines}
          cursor={editorState.cursor}
          mode={editorState.mode}
          targetPosition={currentTab === 'course' ? currentMission.targetCursor : undefined}
          visualAnchor={editorState.visualAnchor}
          relativeLineNumbers={relativeLineNumbers}
          searchQuery={
            editorState.mode === 'SEARCH'
              ? editorState.commandBuffer
              : editorState.lastSearchQuery
          }
        />
        <Keycaster recentKeys={recentKeys} />
        <StatusBar
          mode={editorState.mode}
          cursor={editorState.cursor}
          filename={currentTab === 'course' ? `lesson_${currentMission.id}.txt` : 'sandbox.ts'}
          pendingKeys={editorState.pendingKeys}
          commandType={editorState.commandType}
          commandBuffer={editorState.commandBuffer}
          commandMessage={editorState.commandMessage}
        />
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
