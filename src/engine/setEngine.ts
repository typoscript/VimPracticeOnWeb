import { VimEditorState, VimOptions } from '../types/vim';

export const DEFAULT_VIM_OPTIONS: VimOptions = {
  number: true,
  relativenumber: false,
  ignorecase: false,
  smartcase: false,
  hlsearch: true,
  wrap: true,
  cursorline: true,
  tabstop: 2,
  shiftwidth: 2,
  expandtab: true,
  list: false,
};

export const OPTION_ALIASES: Record<string, keyof VimOptions> = {
  nu: 'number',
  number: 'number',
  rnu: 'relativenumber',
  relativenumber: 'relativenumber',
  ic: 'ignorecase',
  ignorecase: 'ignorecase',
  scs: 'smartcase',
  smartcase: 'smartcase',
  hls: 'hlsearch',
  hlsearch: 'hlsearch',
  wrap: 'wrap',
  cul: 'cursorline',
  cursorline: 'cursorline',
  ts: 'tabstop',
  tabstop: 'tabstop',
  sw: 'shiftwidth',
  shiftwidth: 'shiftwidth',
  et: 'expandtab',
  expandtab: 'expandtab',
  list: 'list',
};

/**
 * 상태 객체에서 유효한 VimOptions를 조회합니다. (미지정 시 기본값 반환)
 */
export function getOptions(state: VimEditorState): VimOptions {
  return {
    ...DEFAULT_VIM_OPTIONS,
    ...(state.options ?? {}),
  };
}

/**
 * 옵션 상태를 순정 Vim 포맷으로 출력합니다 (:set, :set all).
 */
export function formatOptionsList(options: VimOptions, showAll = false): string {
  const booleanKeys: (keyof VimOptions)[] = [
    'number',
    'relativenumber',
    'ignorecase',
    'smartcase',
    'hlsearch',
    'wrap',
    'cursorline',
    'list',
    'expandtab',
  ];

  const numericKeys: (keyof VimOptions)[] = ['tabstop', 'shiftwidth'];

  const displayedItems: string[] = [];

  for (const k of booleanKeys) {
    const val = options[k] as boolean;
    const def = DEFAULT_VIM_OPTIONS[k] as boolean;
    if (showAll || val !== def) {
      displayedItems.push(val ? (k as string) : `no${k}`);
    }
  }

  for (const k of numericKeys) {
    const val = options[k] as number;
    const def = DEFAULT_VIM_OPTIONS[k] as number;
    if (showAll || val !== def) {
      displayedItems.push(`${k}=${val}`);
    }
  }

  const header = showAll ? '--- All Options ---' : '--- Modified Options ---';
  if (displayedItems.length === 0) {
    return `${header}\n(기본값과 다른 설정이 없습니다)`;
  }

  return `${header}\n  ${displayedItems.join('  ')}`;
}

/**
 * :set 커맨드를 파싱하여 상태의 options를 갱신합니다.
 * (:set nu, :set nonu, :set rnu!, :set ts=4, :set nu?, :set all 등)
 */
export function executeSetCommand(state: VimEditorState, rawArgs: string): VimEditorState {
  const trimmed = rawArgs.trim();

  // 1. :set all
  if (trimmed === 'all') {
    const curOpts = getOptions(state);
    return {
      ...state,
      commandMessage: formatOptionsList(curOpts, true),
    };
  }

  // 2. :set (인자 없음) -> 변경된 옵션 목록 표시
  if (trimmed === '') {
    const curOpts = getOptions(state);
    return {
      ...state,
      commandMessage: formatOptionsList(curOpts, false),
    };
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  let nextOptions = { ...getOptions(state) };
  const queryMessages: string[] = [];
  const appliedList: string[] = [];

  for (const token of tokens) {
    // 3. 옵션 상태 조회 (:set opt?)
    if (token.endsWith('?')) {
      const queryName = token.slice(0, -1);
      const optKey = OPTION_ALIASES[queryName];
      if (!optKey) {
        return {
          ...state,
          commandMessage: `E518: 알 수 없는 옵션: ${queryName}`,
        };
      }
      const val = nextOptions[optKey];
      if (typeof val === 'boolean') {
        queryMessages.push(val ? (optKey as string) : `no${optKey}`);
      } else {
        queryMessages.push(`${optKey}=${val}`);
      }
      continue;
    }

    // 4. 숫자/값 할당 옵션 (:set ts=4, :set sw=2)
    if (token.includes('=')) {
      const [rawKey, rawVal] = token.split('=');
      const optKey = OPTION_ALIASES[rawKey];
      if (!optKey || (optKey !== 'tabstop' && optKey !== 'shiftwidth')) {
        return {
          ...state,
          commandMessage: `E518: 알 수 없는 옵션: ${rawKey}`,
        };
      }
      const numVal = parseInt(rawVal, 10);
      if (isNaN(numVal) || numVal < 1) {
        return {
          ...state,
          commandMessage: `E521: 잘못된 숫자 인수: ${token}`,
        };
      }
      nextOptions = { ...nextOptions, [optKey]: numVal };
      appliedList.push(`${optKey}=${numVal}`);
      continue;
    }

    // 5. 토글 옵션 (:set nu!, :set rnu!)
    if (token.endsWith('!')) {
      const rawKey = token.slice(0, -1);
      const optKey = OPTION_ALIASES[rawKey];
      if (!optKey) {
        return {
          ...state,
          commandMessage: `E518: 알 수 없는 옵션: ${rawKey}`,
        };
      }
      const curVal = nextOptions[optKey];
      if (typeof curVal === 'boolean') {
        const nextVal = !curVal;
        nextOptions = { ...nextOptions, [optKey]: nextVal };
        appliedList.push(nextVal ? (optKey as string) : `no${optKey}`);
        continue;
      }
    }

    // 6. 옵션 비활성화 (:set nonu, :set nornu, :set noic)
    if (token.startsWith('no')) {
      const rawKey = token.slice(2);
      const optKey = OPTION_ALIASES[rawKey];
      if (!optKey) {
        return {
          ...state,
          commandMessage: `E518: 알 수 없는 옵션: ${token}`,
        };
      }
      if (typeof nextOptions[optKey] === 'boolean') {
        nextOptions = { ...nextOptions, [optKey]: false };
        appliedList.push(`no${optKey}`);
        continue;
      }
    }

    // 7. 옵션 활성화 (:set nu, :set rnu, :set ic, :set wrap)
    const optKey = OPTION_ALIASES[token];
    if (!optKey) {
      return {
        ...state,
        commandMessage: `E518: 알 수 없는 옵션: ${token}`,
      };
    }
    if (typeof nextOptions[optKey] === 'boolean') {
      nextOptions = { ...nextOptions, [optKey]: true };
      appliedList.push(optKey as string);
      continue;
    }
  }

  // 메시지 결정
  let message: string | undefined = undefined;
  if (queryMessages.length > 0) {
    message = queryMessages.join('  ');
  } else if (appliedList.length > 0) {
    message = `[Option] ${appliedList.join(' ')}`;
  }

  return {
    ...state,
    options: nextOptions,
    commandMessage: message,
  };
}
