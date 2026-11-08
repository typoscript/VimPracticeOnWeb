import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { configureVimEngine } from './vim-engine';
import { DEMO_VIMRC, DEMO_WORKSPACE_FILES } from './data/demoWorkspace';

// 개발 서버에서만 엔진 불변성 검사를 켜고, 데모 워크스페이스 파일을 엔진에 넘겨줍니다
configureVimEngine({ devChecks: import.meta.env.DEV, workspaceFiles: DEMO_WORKSPACE_FILES, vimrc: DEMO_VIMRC });

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
