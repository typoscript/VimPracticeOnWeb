import {
  VimEditorState,
  executeLuaChunk,
  executeCommandLine,
  handleKey,
} from '../vim-engine';
import {
  STORAGE_KEYS,
  readStorageJson,
  writeStorageJson,
} from './localStorageClient';
import { i18nKey, t } from '../i18n';

export type UserInitFormat = 'lua' | 'vimrc';

export interface UserInitConfig {
  format: UserInitFormat;
  code: string;
  enabled: boolean;
}

export interface UserInitPreset {
  id: string;
  label: string;
  format: UserInitFormat;
  code: string;
}

export const DEFAULT_USER_INIT_CONFIG: UserInitConfig = {
  format: 'lua',
  code: '',
  enabled: true,
};

export const USER_INIT_PRESETS: ReadonlyArray<UserInitPreset> = [
  {
    id: 'lazyvim',
    label: i18nKey('LazyVim 기본 (Lua)'),
    format: 'lua',
    code: [
      '-- LazyVim style Neovim init.lua',
      'vim.g.mapleader = " "',
      'vim.opt.relativenumber = true',
      'vim.opt.shiftwidth = 2',
      'vim.opt.ignorecase = true',
      'vim.opt.smartcase = true',
      'vim.opt.autopairs = true',
      'vim.opt.cmdlinepopup = true',
      'vim.keymap.set("i", "jk", "<Esc>")',
      'vim.keymap.set("n", "<leader>w", ":w<CR>")',
      'vim.keymap.set("n", "<leader>f", ":Files<CR>")',
      'vim.keymap.set("n", "<leader>g", ":LiveGrep<CR>")',
      'vim.keymap.set("n", "<leader>o", ":Oil<CR>")',
      'vim.keymap.set("n", "<leader>G", ":Git<CR>")',
      'vim.snippets.add("todo", { "// TODO(${1:owner}): ${2:task}$0" }, "TODO comment")',
    ].join('\n'),
  },
  {
    id: 'snippetsPro',
    label: i18nKey('커스텀 스니펫 · 모던 IDE (Lua)'),
    format: 'lua',
    code: [
      '-- Modern IDE + Custom LuaSnip Snippets (Ctrl-Space / <Tab>)',
      'vim.g.mapleader = " "',
      'vim.opt.autopairs = true',
      'vim.opt.cmdlinepopup = true',
      'vim.opt.relativenumber = true',
      'vim.snippets.add("rfc", {',
      '  "export function ${1:Component}() {",',
      '  "  return <div>${2:hello}</div>;",',
      '  "}$0",',
      '}, "React functional component")',
      'vim.snippets.add("todo", { "// TODO(${1:dev}): ${2:follow up}$0" }, "TODO tag")',
      'vim.snippets.add("err", { "throw new Error(\\"${1:message}\\");$0" }, "throw Error")',
    ].join('\n'),
  },
  {
    id: 'minimal',
    label: i18nKey('미니멀 프로 (Lua)'),
    format: 'lua',
    code: [
      '-- Minimal Pro init.lua',
      'vim.opt.number = true',
      'vim.opt.shiftwidth = 4',
      'vim.opt.expandtab = true',
      'vim.opt.incsearch = true',
      'vim.keymap.set("n", "H", "^")',
      'vim.keymap.set("n", "L", "$")',
      'vim.keymap.set("n", "<leader>h", ":nohlsearch<CR>")',
    ].join('\n'),
  },
  {
    id: 'classicVimrc',
    label: i18nKey('클래식 .vimrc (Vimscript)'),
    format: 'vimrc',
    code: [
      '" Classic .vimrc configuration',
      'let mapleader = " "',
      'set relativenumber',
      'set shiftwidth=2',
      'set ignorecase smartcase',
      'inoremap jk <Esc>',
      'nnoremap <leader>w :w<CR>',
      'nnoremap <leader>e :Explore<CR>',
    ].join('\n'),
  },
];

export function loadUserInitConfig(): UserInitConfig {
  const raw = readStorageJson<Partial<UserInitConfig> | null>(
    STORAGE_KEYS.USER_INIT_CONFIG,
    null
  );
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_USER_INIT_CONFIG };
  const format: UserInitFormat = raw.format === 'vimrc' ? 'vimrc' : 'lua';
  const code = typeof raw.code === 'string' ? raw.code : '';
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : true;
  return { format, code, enabled };
}

export function saveUserInitConfig(config: UserInitConfig): void {
  writeStorageJson(STORAGE_KEYS.USER_INIT_CONFIG, {
    format: config.format === 'vimrc' ? 'vimrc' : 'lua',
    code: config.code,
    enabled: Boolean(config.enabled),
  });
}

export interface ApplyUserInitResult {
  state: VimEditorState;
  ok: boolean;
  message: string;
}

/**
 * 사용자의 영구 init.lua / .vimrc 설정을 VimEditorState 에 안전하게 적용합니다.
 * 에디터 버퍼 본문(lines)·커서·모드·Undo 스택은 보존하고 옵션·키맵·리더키·변수·명령만 반영합니다.
 */
export function applyUserInitConfigToState(
  state: VimEditorState,
  config: UserInitConfig
): ApplyUserInitResult {
  if (!config.enabled || !config.code.trim()) {
    return {
      state,
      ok: true,
      message: t('설정이 저장되었습니다 (현재 비활성화 또는 빈 스크립트)'),
    };
  }

  const runEx = (s: VimEditorState, cmd: string) => executeCommandLine(s, cmd, handleKey);
  let next: VimEditorState;

  if (config.format === 'lua') {
    next = executeLuaChunk(state, config.code, runEx);
    if (next.bell) {
      return {
        state,
        ok: false,
        message: t('스크립트 실행 오류: {err}', { err: next.commandMessage || 'Lua error' }),
      };
    }
  } else {
    let cur = state;
    const rawLines = config.code.replace(/\r\n/g, '\n').split('\n');
    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('"')) continue;
      const cmd = trimmed.startsWith(':') ? trimmed : `:${trimmed}`;
      const res = runEx(cur, cmd);
      if (res.bell) {
        return {
          state,
          ok: false,
          message: t('스크립트 실행 오류: {err}', { err: res.commandMessage || trimmed }),
        };
      }
      cur = res;
    }
    next = cur;
  }

  const appliedState: VimEditorState = {
    ...next,
    lines: state.lines,
    cursor: state.cursor,
    mode: state.mode,
    undoStack: state.undoStack,
    redoStack: state.redoStack,
    bell: undefined,
  };

  const leaderDisplay =
    (appliedState.leaderKey ?? ' ') === ' ' ? '<Space>' : (appliedState.leaderKey ?? '\\');
  const mapCount = Object.keys(appliedState.userKeymaps ?? {}).length;
  const snippetCount = appliedState.customSnippets?.length ?? 0;

  return {
    state: appliedState,
    ok: true,
    message:
      snippetCount > 0
        ? t(
            '설정이 저장되고 에디터에 즉시 적용되었습니다 (키맵 {maps}개 · 커스텀 스니펫 {snippets}개 · 리더키 {leader})',
            { maps: mapCount, snippets: snippetCount, leader: leaderDisplay }
          )
        : t('설정이 저장되고 에디터에 즉시 적용되었습니다 (키맵 {maps}개 · 리더키 {leader})', {
            maps: mapCount,
            leader: leaderDisplay,
          }),
  };
}
