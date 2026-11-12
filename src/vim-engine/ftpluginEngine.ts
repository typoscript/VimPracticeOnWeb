import { VimEditorState } from './types';
import { msg } from './messages';
import { detectFiletype } from './syntaxEngine';
import { getOptions } from './setEngine';

export interface FiletypeIndentConfig {
  shiftwidth: number;
  tabstop: number;
  expandtab: boolean;
}

export const FILETYPE_INDENT_PRESETS: Record<string, FiletypeIndentConfig> = {
  python: { shiftwidth: 4, tabstop: 4, expandtab: true },
  py: { shiftwidth: 4, tabstop: 4, expandtab: true },
  rust: { shiftwidth: 4, tabstop: 4, expandtab: true },
  rs: { shiftwidth: 4, tabstop: 4, expandtab: true },
  c: { shiftwidth: 4, tabstop: 4, expandtab: true },
  cpp: { shiftwidth: 4, tabstop: 4, expandtab: true },
  java: { shiftwidth: 4, tabstop: 4, expandtab: true },
  go: { shiftwidth: 8, tabstop: 8, expandtab: false },
  javascript: { shiftwidth: 2, tabstop: 2, expandtab: true },
  js: { shiftwidth: 2, tabstop: 2, expandtab: true },
  typescript: { shiftwidth: 2, tabstop: 2, expandtab: true },
  ts: { shiftwidth: 2, tabstop: 2, expandtab: true },
  html: { shiftwidth: 2, tabstop: 2, expandtab: true },
  css: { shiftwidth: 2, tabstop: 2, expandtab: true },
  json: { shiftwidth: 2, tabstop: 2, expandtab: true },
  bash: { shiftwidth: 2, tabstop: 2, expandtab: true },
  sh: { shiftwidth: 2, tabstop: 2, expandtab: true },
  vim: { shiftwidth: 2, tabstop: 2, expandtab: true },
  markdown: { shiftwidth: 2, tabstop: 2, expandtab: true },
  md: { shiftwidth: 2, tabstop: 2, expandtab: true },
  yaml: { shiftwidth: 2, tabstop: 2, expandtab: true },
};

/**
 * 특정 언어의 표준 들여쓰기 프리셋을 조회합니다.
 */
export function getFiletypeIndentPreset(filetype: string): FiletypeIndentConfig | undefined {
  if (!filetype) return undefined;
  const clean = filetype.toLowerCase().trim();
  return FILETYPE_INDENT_PRESETS[clean];
}

/**
 * 파일타입에 맞는 들여쓰기 설정을 현재 버퍼의 로컬 옵션으로 적용합니다.
 */
export function applyFiletypeIndent(state: VimEditorState, filetype: string): VimEditorState {
  const isIndentActive = state.filetypeSettings?.indent !== false;
  if (!isIndentActive) return state;

  const preset = getFiletypeIndentPreset(filetype);
  if (!preset) return state;

  const curId = state.currentBufferId ?? 1;
  const curLocal = state.bufferLocalOptions?.[curId] ?? {};

  const updatedLocal = {
    ...curLocal,
    shiftwidth: preset.shiftwidth,
    tabstop: preset.tabstop,
    expandtab: preset.expandtab,
    filetype,
  };

  const nextBufferLocalOptions = {
    ...(state.bufferLocalOptions ?? {}),
    [curId]: updatedLocal,
  };

  const nextOptions = {
    ...getOptions(state),
    ...updatedLocal,
  };

  const nextBuffers = state.buffers
    ? state.buffers.map((b) =>
        b.id === curId ? { ...b, localOptions: updatedLocal, filetype } : b
      )
    : undefined;

  return {
    ...state,
    options: nextOptions,
    bufferLocalOptions: nextBufferLocalOptions,
    buffers: nextBuffers,
  };
}

/**
 * :filetype 명령어 핸들러
 * (:filetype, :filetype on, :filetype plugin indent on, :filetype indent on 등)
 */
export function executeFiletypeCommand(state: VimEditorState, args: string): VimEditorState {
  const trimmed = args.trim().toLowerCase();
  const currentSettings = {
    detect: true,
    plugin: true,
    indent: true,
    ...(state.filetypeSettings ?? {}),
  };

  // 1. :filetype (상태 조회)
  if (trimmed === '') {
    const detectStr = currentSettings.detect ? 'ON' : 'OFF';
    const pluginStr = currentSettings.plugin ? 'ON' : 'OFF';
    const indentStr = currentSettings.indent ? 'ON' : 'OFF';
    return {
      ...state,
      commandMessage: msg('파일타입 감지:{detect}  플러그인:{plugin}  들여쓰기:{indent}', {
        detect: detectStr,
        plugin: pluginStr,
        indent: indentStr,
      }),
    };
  }

  // 2. :filetype on / off
  if (trimmed === 'on') {
    return {
      ...state,
      filetypeSettings: { ...currentSettings, detect: true },
      commandMessage: msg('파일타입 감지가 활성화되었습니다'),
    };
  }

  if (trimmed === 'off') {
    return {
      ...state,
      filetypeSettings: { detect: false, plugin: false, indent: false },
      commandMessage: msg('파일타입 감지가 비활성화되었습니다'),
    };
  }

  // 3. :filetype plugin indent on / off
  if (
    trimmed === 'plugin indent on' ||
    trimmed === 'indent plugin on' ||
    trimmed === 'plugin on indent on'
  ) {
    let nextState: VimEditorState = {
      ...state,
      filetypeSettings: { detect: true, plugin: true, indent: true },
      commandMessage: msg('파일타입 감지, 플러그인, 들여쓰기가 모두 활성화되었습니다'),
    };
    const ft = state.options?.filetype || detectFiletype(state.primaryFilename);
    if (ft && ft !== 'text') {
      nextState = applyFiletypeIndent(nextState, ft);
    }
    return nextState;
  }

  if (
    trimmed === 'plugin indent off' ||
    trimmed === 'indent plugin off' ||
    trimmed === 'plugin off indent off'
  ) {
    return {
      ...state,
      filetypeSettings: { ...currentSettings, plugin: false, indent: false },
      commandMessage: msg('파일타입 플러그인 및 들여쓰기가 비활성화되었습니다'),
    };
  }

  // 4. :filetype plugin on / off
  if (trimmed === 'plugin on') {
    return {
      ...state,
      filetypeSettings: { ...currentSettings, detect: true, plugin: true },
      commandMessage: msg('파일타입 플러그인이 활성화되었습니다'),
    };
  }

  if (trimmed === 'plugin off') {
    return {
      ...state,
      filetypeSettings: { ...currentSettings, plugin: false },
      commandMessage: msg('파일타입 플러그인이 비활성화되었습니다'),
    };
  }

  // 5. :filetype indent on / off
  if (trimmed === 'indent on') {
    let nextState: VimEditorState = {
      ...state,
      filetypeSettings: { ...currentSettings, detect: true, indent: true },
      commandMessage: msg('파일타입 들여쓰기가 활성화되었습니다'),
    };
    const ft = state.options?.filetype || detectFiletype(state.primaryFilename);
    if (ft && ft !== 'text') {
      nextState = applyFiletypeIndent(nextState, ft);
    }
    return nextState;
  }

  if (trimmed === 'indent off') {
    return {
      ...state,
      filetypeSettings: { ...currentSettings, indent: false },
      commandMessage: msg('파일타입 들여쓰기가 비활성화되었습니다'),
    };
  }

  // 6. :filetype detect
  if (trimmed === 'detect') {
    const ft = detectFiletype(state.primaryFilename);
    let nextState = applyFiletypeIndent(state, ft);
    return {
      ...nextState,
      options: { ...getOptions(nextState), filetype: ft },
      commandMessage: msg('파일타입 감지가 활성화되었습니다'),
    };
  }

  return {
    ...state,
    bell: true,
    commandMessage: msg('E475: 잘못된 filetype 인수입니다: {arg}', { arg: args.trim() }),
  };
}
