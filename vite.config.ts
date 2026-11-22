/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite/Rollup 프로덕션 번들의 엔진 청크 계층 정의 (하위 → 상위 단방향 비순환).
 * 어떤 계층도 자신보다 뒤(상위) 계층의 파일을 import 하지 않습니다.
 */
export const ENGINE_CHUNK_LAYERS: ReadonlyArray<{ name: string; files: readonly string[] }> = [
  {
    name: 'vim-engine-data',
    files: ['spellData.ts', 'helpData.ts', 'messagesEn.ts', 'wildmenuCatalog.ts'],
  },
  {
    name: 'vim-engine-core',
    files: [
      'config.ts',
      'types.ts',
      'messages.ts',
      'cursor.ts',
      'vimRegex.ts',
      'vimscriptValues.ts',
      'vimscriptEditorBuiltins.ts',
      'vimscriptBuiltinsExtra.ts',
      'vimscriptBuiltins.ts',
      'vimscriptLexer.ts',
      'vimscriptEval.ts',
      'vimscriptFunctions.ts',
      'vimscriptEngine.ts',
      'operators.ts',
      'undoTreeEngine.ts',
      'expressionParser.ts',
      'digraphs.ts',
      'invariants.ts',
      'bracketMatch.ts',
      'wordMotion.ts',
      'vfs.ts',
      'setOptionsCore.ts',
      'windowTree.ts',
    ],
  },
  {
    name: 'vim-engine-services',
    files: [
      'syntaxEngine.ts',
      'ftpluginEngine.ts',
      'setOptionAssigners.ts',
      'setEngine.ts',
      'registers.ts',
      'bufferEngine.ts',
      'bufferLifecycle.ts',
      'tabEngine.ts',
      'splitWindowCore.ts',
      'splitWindow.ts',
      'sessionEngine.ts',
      'argEngine.ts',
      'errorformat.ts',
      'errorListCore.ts',
      'quickfixEngine.ts',
      'locationListEngine.ts',
      'keymapEngine.ts',
      'abbrevEngine.ts',
      'userCommandEngine.ts',
      'sourceEngine.ts',
      'autocmdEngine.ts',
      'completion.ts',
      'helpEngine.ts',
    ],
  },
  {
    name: 'vim-engine-editing',
    files: [
      'motions.ts',
      'findChar.ts',
      'search.ts',
      'visual.ts',
      'visualUtilities.ts',
      'marks.ts',
      'advancedMotions.ts',
      'tagEngine.ts',
      'gotoFileEngine.ts',
      'viewport.ts',
      'dialEngine.ts',
      'abolishEngine.ts',
      'numberOperators.ts',
      'lineOperators.ts',
      'textObjectsExtended.ts',
      'treesitterTextObjects.ts',
      'miniAiTextObjects.ts',
      'miniMoveEngine.ts',
      'tagTextObject.ts',
      'textObjects.ts',
      'extraMotions.ts',
      'operatorMotion.ts',
      'commentEngine.ts',
      'formatEngine.ts',
      'foldingDetection.ts',
      'folding.ts',
      'engineHelpers.ts',
      'surroundEngine.ts',
    ],
  },
  {
    name: 'vim-engine-neovim',
    files: [
      'diffEngine.ts',
      'gitSignsEngine.ts',
      'oilEngine.ts',
      'harpoonEngine.ts',
      'yankRingEngine.ts',
      'spectreEngine.ts',
      'troubleEngine.ts',
      'lspEngine.ts',
      'lspRefactorEngine.ts',
      'flashJumpEngine.ts',
      'multiCursorEngine.ts',
      'treesjEngine.ts',
      'luaEngine.ts',
      'fuzzyFinder.ts',
    ],
  },
  {
    name: 'vim-engine-ex',
    files: [
      'netrwEngine.ts',
      'spellEngine.ts',
      'cmdlineWindow.ts',
      'exSubstitute.ts',
      'exRange.ts',
      'exRangeOps.ts',
      'shellBuiltins.ts',
      'shellStreamFilters.ts',
      'shellEngine.ts',
      'terminalEngine.ts',
      'exBufferOps.ts',
      'exWorkspaceCommands.ts',
      'exBatchAndUndoCommands.ts',
      'exQuickfixCommands.ts',
      'exListAndToolCommands.ts',
      'commandLine.ts',
    ],
  },
];

const ENGINE_FILE_TO_CHUNK = new Map<string, string>(
  ENGINE_CHUNK_LAYERS.flatMap((layer) => layer.files.map((file) => [file, layer.name] as const))
);

/**
 * Vite/Rollup 프로덕션 번들의 청크 분리 규칙.
 * 대용량 정적 데이터('vim-engine-data'), 순수 코어('vim-engine-core'),
 * 작업공간/옵션 서비스('vim-engine-services'), 모션·편집·텍스트 객체('vim-engine-editing'),
 * 모던 Neovim 확장('vim-engine-neovim'), Ex·셸 명령('vim-engine-ex'),
 * 최상위 모드 디스패처('vim-engine')를 순환 참조 없이 160 kB 미만의 청크로 분리합니다.
 */
export function resolveManualChunk(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/');
  if (/node_modules\/(react|react-dom|scheduler)\//.test(normalized)) return 'react-vendor';

  const engineMatch = normalized.match(/\/src\/vim-engine\/([^/]+\.ts)$/);
  if (engineMatch) {
    return ENGINE_FILE_TO_CHUNK.get(engineMatch[1]) ?? 'vim-engine';
  }
  if (normalized.includes('/src/vim-engine/')) return 'vim-engine';

  // 영어 사전은 UI 사전(i18n-en-ui)과 레슨/콘텐츠 사전(i18n-en-content)으로 분리해 300 kB 상한 여유를 유지합니다
  if (/\/src\/i18n\/en\.ts$/.test(normalized)) return 'i18n-en-ui';
  if (/\/src\/i18n\/enContent\.ts$/.test(normalized)) return 'i18n-en-content';
  // 레슨 커리큘럼 데이터는 앱 로직과 별도 캐시 청크로 분리합니다
  if (/\/src\/data\/missions(?:\/.*)?\.ts$/.test(normalized)) return 'curriculum';
  return undefined;
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // 프로덕션 빌드(GitHub Pages 배포) 시 '/VimPracticeOnWeb/', 로컬 개발/테스트 시에는 '/' 사용
  base: mode === 'production' ? '/VimPracticeOnWeb/' : '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // React·엔진 계층별 서브청크·커리큘럼·영문 사전을 장기 캐시용 청크로 분리합니다
        manualChunks: resolveManualChunk,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
}));
