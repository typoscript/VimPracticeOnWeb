import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { configureVimEngine } from '../vim-engine';
import { setLocale, registerEnglishDictionaries } from '../i18n';
import { EN } from '../i18n/en';
import { EN_CONTENT } from '../i18n/enContent';
import { DEMO_VIMRC, DEMO_WORKSPACE_FILES } from '../data/demoWorkspace';

registerEnglishDictionaries(EN, EN_CONTENT);

// 테스트에서는 불변성 검사를 켜고, 앱과 같은 데모 워크스페이스를 사용합니다
configureVimEngine({ devChecks: true, workspaceFiles: DEMO_WORKSPACE_FILES, vimrc: DEMO_VIMRC });

// 기존 테스트는 한국어 화면을 기준으로 작성되어 있으므로 항상 한국어로 시작합니다 (브라우저 언어와 무관)
setLocale('ko', { persist: false });

// 지연 로딩(React.lazy) 화면을 기다리는 findBy*/waitFor 기본 대기 시간은 1초라서, CI 나 여러 테스트가 동시에 돌아
// 컴퓨터가 바쁠 때 화면이 늦게 뜨면 테스트가 가끔 실패했습니다. 대기 상한만 늘리며, 빨리 뜨면 바로 통과합니다.
configure({ asyncUtilTimeout: 5000 });
