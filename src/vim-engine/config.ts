/**
 * Vim 엔진 전역 설정
 *
 * 엔진은 브라우저·Node·빌드 도구 종류와 무관하게 동작하도록 환경 변수에 직접 의존하지 않습니다.
 * 사용하는 쪽에서 시작할 때 한 번 configureVimEngine() 으로 필요한 값만 지정하세요.
 *
 * - devChecks: true 이면 handleKey 마다 상태를 deepFreeze 하고 불변 조건(assertValidVimState)을 검사합니다.
 *   개발·테스트용이며 느리므로 배포 환경에서는 끄세요. 기본값은 Node 의 NODE_ENV 가 development / test 일 때만 true.
 * - workspaceFiles: :e, :Explore, ctags, 파일 이름 자동완성이 보여줄 가상 파일들 { '경로': ['줄', ...] }
 * - vimrc: :e ~/.vimrc 로 열리는 기본 .vimrc 내용
 */
export interface VimEngineConfig {
  devChecks: boolean;
  workspaceFiles: Record<string, string[]>;
  vimrc: string[];
}

/** process 가 없는 환경(브라우저)에서도 에러 없이 NODE_ENV 를 읽습니다. */
function detectDevChecks(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV;
  return env === 'development' || env === 'test';
}

let config: VimEngineConfig = {
  devChecks: detectDevChecks(),
  workspaceFiles: {},
  vimrc: [],
};

/** 엔진 설정을 바꿉니다. 지정한 항목만 덮어씁니다. */
export function configureVimEngine(partial: Partial<VimEngineConfig>): void {
  config = { ...config, ...partial };
}

/** 현재 엔진 설정 */
export function getVimEngineConfig(): Readonly<VimEngineConfig> {
  return config;
}
