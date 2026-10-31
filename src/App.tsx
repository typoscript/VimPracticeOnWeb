import { useEffect, useState, useCallback, useRef } from 'react';
import { Editor } from './components/Editor/Editor';
import { StatusBar } from './components/StatusBar/StatusBar';
import { MissionPanel } from './components/MissionPanel/MissionPanel';
import { Keycaster } from './components/Keycaster/Keycaster';
import { CoachingToast } from './components/CoachingToast/CoachingToast';
import { VimEditorState } from './types/vim';
import { handleKey } from './engine/vimEngine';
import { MISSIONS } from './data/missions';
import './App.css';

const REPEATED_MOTION_KEYS = ['h', 'j', 'k', 'l', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

export function App() {
  const [currentMissionIndex, setCurrentMissionIndex] = useState(0);
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

  const isCompleted = currentMission.checkComplete(editorState);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

      // 브라우저 기본 스크롤, 포커스 이동 및 뒤로가기 방지
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Backspace', 'Tab'].includes(e.key)) {
        e.preventDefault();
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
  }, []);

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">⌨</span>
          <h1 className="brand-title">VimPracticeOnWeb</h1>
        </div>
        <p className="header-desc">인터랙티브 Vim 튜토리얼 &amp; 연습 코스</p>
      </header>

      <section className="key-cheatsheet" aria-label="Keyboard Shortcuts">
        <span className="cheat-item"><code>h j k l</code> 이동</span>
        <span className="cheat-item"><code>w b e</code> 단어 점프</span>
        <span className="cheat-item"><code>0 $ ^</code> 줄 이동</span>
        <span className="cheat-item"><code>i a I A o O</code> 입력 진입</span>
        <span className="cheat-item"><code>Esc</code> 일반 모드</span>
        <span className="cheat-item"><code>x</code> 글자 삭제</span>
        <span className="cheat-item"><code>cw cc C r</code> 수정/교체</span>
        <span className="cheat-item"><code>v / V</code> 영역 선택(비주얼)</span>
        <span className="cheat-item"><code>dd dw</code> 줄/단어 삭제</span>
        <span className="cheat-item"><code>p</code> 붙여넣기</span>
        <span className="cheat-item"><code>u / Ctrl-r</code> 실행취소/다시실행</span>
      </section>

      <main className="editor-wrapper">
        <CoachingToast
          message={coachingMessage}
          onDismiss={() => setCoachingMessage(null)}
        />
        <MissionPanel
          mission={currentMission}
          missionIndex={currentMissionIndex}
          totalMissions={MISSIONS.length}
          isCompleted={isCompleted}
          keystrokeCount={keystrokeCount}
          onSelectMission={handleSelectMission}
          onResetMission={handleResetMission}
        />
        <Editor
          lines={editorState.lines}
          cursor={editorState.cursor}
          mode={editorState.mode}
          targetPosition={currentMission.targetCursor}
          visualAnchor={editorState.visualAnchor}
        />
        <Keycaster recentKeys={recentKeys} />
        <StatusBar
          mode={editorState.mode}
          cursor={editorState.cursor}
          filename={`lesson_${currentMission.id}.txt`}
          pendingKeys={editorState.pendingKeys}
        />
      </main>

      <footer className="app-footer">
        <span>VimPracticeOnWeb • 키보드로 미션을 완료하며 자연스럽게 Vim을 마스터하세요</span>
      </footer>
    </div>
  );
}

export default App;
