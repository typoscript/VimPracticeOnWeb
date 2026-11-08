import '@testing-library/jest-dom';
import { configureVimEngine } from '../vim-engine';
import { setLocale } from '../i18n';
import { DEMO_VIMRC, DEMO_WORKSPACE_FILES } from '../data/demoWorkspace';

// 테스트에서는 불변성 검사를 켜고, 앱과 같은 데모 워크스페이스를 사용합니다
configureVimEngine({ devChecks: true, workspaceFiles: DEMO_WORKSPACE_FILES, vimrc: DEMO_VIMRC });

// 기존 테스트는 한국어 화면을 기준으로 작성되어 있으므로 항상 한국어로 시작합니다 (브라우저 언어와 무관)
setLocale('ko', { persist: false });
