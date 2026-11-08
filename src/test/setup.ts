import '@testing-library/jest-dom';
import { configureVimEngine } from '../vim-engine';
import { DEMO_VIMRC, DEMO_WORKSPACE_FILES } from '../data/demoWorkspace';

// 테스트에서는 불변성 검사를 켜고, 앱과 같은 데모 워크스페이스를 사용합니다
configureVimEngine({ devChecks: true, workspaceFiles: DEMO_WORKSPACE_FILES, vimrc: DEMO_VIMRC });
