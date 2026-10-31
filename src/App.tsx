import { useEffect, useState, useCallback } from 'react';
import { Editor } from './components/Editor/Editor';
import { StatusBar } from './components/StatusBar/StatusBar';
import { MissionPanel } from './components/MissionPanel/MissionPanel';
import { VimEditorState } from './types/vim';
import { handleKey } from './engine/vimEngine';
import { MISSIONS } from './data/missions';
import './App.css';

export function App() {
  const [currentMissionIndex, setCurrentMissionIndex] = useState(0);
  const currentMission = MISSIONS[currentMissionIndex];

  const [editorState, setEditorState] = useState<VimEditorState>({
    lines: currentMission.initialLines,
    cursor: currentMission.initialCursor,
    mode: 'NORMAL',
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
      });
    }
  }, []);

  const handleResetMission = useCallback(() => {
    setEditorState({
      lines: currentMission.initialLines,
      cursor: currentMission.initialCursor,
      mode: 'NORMAL',
    });
  }, [currentMission]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 메타 키(Command, Ctrl, Alt) 조합은 브라우저 기본 단축키 허용
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // 브라우저 기본 스크롤, 포커스 이동 및 뒤로가기 방지
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Backspace', 'Tab'].includes(e.key)) {
        e.preventDefault();
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
        <span className="cheat-item"><code>i a</code> 입력 진입</span>
        <span className="cheat-item"><code>Esc</code> 일반 모드</span>
        <span className="cheat-item"><code>x</code> 글자 삭제</span>
      </section>

      <main className="editor-wrapper">
        <MissionPanel
          mission={currentMission}
          missionIndex={currentMissionIndex}
          totalMissions={MISSIONS.length}
          isCompleted={isCompleted}
          onSelectMission={handleSelectMission}
          onResetMission={handleResetMission}
        />
        <Editor
          lines={editorState.lines}
          cursor={editorState.cursor}
          mode={editorState.mode}
          targetPosition={currentMission.targetCursor}
        />
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
