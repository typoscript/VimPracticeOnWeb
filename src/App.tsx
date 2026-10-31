import { useEffect, useState } from 'react';
import { Editor } from './components/Editor/Editor';
import { StatusBar } from './components/StatusBar/StatusBar';
import { VimEditorState } from './types/vim';
import { handleKey } from './engine/vimEngine';
import './App.css';

const INITIAL_TEXT = [
  'Welcome to VimPracticeOnWeb!',
  '',
  'Practice your Vim motions and commands directly in the browser.',
  'Navigate lines using h, j, k, l, switch modes, and edit buffers.',
  '',
  'Try the following motions now:',
  '  - h / j / k / l : Move left, down, up, right',
  '  - w / b / e     : Next word, previous word, word end',
  '  - 0 / $ / ^     : Line start, line end, first non-blank char',
  '  - gg / G        : Top of buffer, bottom of buffer',
  '',
  'Happy Vimming!'
];

export function App() {
  const [editorState, setEditorState] = useState<VimEditorState>({
    lines: INITIAL_TEXT,
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
  });

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
        <p className="header-desc">NORMAL &amp; INSERT modes enabled</p>
      </header>

      <section className="key-cheatsheet" aria-label="Keyboard Shortcuts">
        <span className="cheat-item"><code>h j k l</code> 이동</span>
        <span className="cheat-item"><code>w b e</code> 단어 이동</span>
        <span className="cheat-item"><code>0 $ ^</code> 줄 이동</span>
        <span className="cheat-item"><code>gg G</code> 파일 이동</span>
        <span className="cheat-item"><code>i a</code> 입력 진입</span>
        <span className="cheat-item"><code>Esc</code> 일반 모드</span>
        <span className="cheat-item"><code>x</code> 글자 삭제</span>
      </section>

      <main className="editor-wrapper">
        <Editor
          lines={editorState.lines}
          cursor={editorState.cursor}
          mode={editorState.mode}
        />
        <StatusBar
          mode={editorState.mode}
          cursor={editorState.cursor}
          pendingKeys={editorState.pendingKeys}
        />
      </main>

      <footer className="app-footer">
        <span>Press i/a to edit • Esc to return to NORMAL • x to delete char</span>
      </footer>
    </div>
  );
}

export default App;
