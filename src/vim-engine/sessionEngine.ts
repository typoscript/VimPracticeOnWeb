import {
  VimEditorState,
  VimBuffer,
  SplitPaneState,
  VimTabPage,
  MarkPosition,
  RegisterEntry,
  VimOptions,
} from './types';
import { msg } from './messages';
import { buildVfsMap } from './vfs';
import { getOptions } from './setEngine';
import { syncActivePane } from './splitWindow';

export interface SessionMetadata {
  version: 1;
  filename: string;
  primaryFilename: string;
  currentBufferId?: number;
  alternateBufferId?: number;
  buffers: Array<{
    id: number;
    name: string;
    lines: string[];
    cursor: { line: number; col: number };
  }>;
  splitDirection: 'none' | 'horizontal' | 'vertical';
  splitPanes?: [SplitPaneState, SplitPaneState];
  activePaneIndex?: number;
  splitRatio?: number;
  tabPages?: Array<{
    id: number;
    filename: string;
    lines: string[];
    cursor: { line: number; col: number };
  }>;
  currentTabId?: number;
  options?: Partial<VimOptions>;
  marks?: Record<string, MarkPosition>;
  registers?: Record<string, RegisterEntry>;
  virtualFiles?: Record<string, string[]>;
}

/**
 * 주어진 스크립트 줄들이 Vim 세션 파일인지 판별합니다.
 */
export function isSessionScript(lines: string[]): boolean {
  return lines.some(
    (l) =>
      l.includes('v:this_session') ||
      l.includes('SessionLoad') ||
      l.includes('[SESSION_METADATA_START]')
  );
}

/**
 * 현재 에디터 상태를 Neovim/Vim과 100% 호환되는 순정 Vim 세션 스크립트 라인들로 직렬화합니다.
 */
export function generateSessionScript(state: VimEditorState, sessionFile: string): string[] {
  const lines: string[] = [];
  lines.push('" Vim session script created by VimPracticeOnWeb');
  lines.push('" https://github.com/typoscript/VimPracticeOnWeb');
  lines.push('let SessionLoad = 1');
  lines.push(`let v:this_session = "${sessionFile}"`);
  lines.push('silent only');
  lines.push('silent tabonly');

  // 1. 순정 Vim 환경 설정 옵션 직렬화 (:set ...)
  const opts = getOptions(state);
  if (opts.number !== undefined) lines.push(opts.number ? 'set nu' : 'set nonu');
  if (opts.relativenumber !== undefined) lines.push(opts.relativenumber ? 'set rnu' : 'set nornu');
  if (opts.ignorecase !== undefined) lines.push(opts.ignorecase ? 'set ic' : 'set noic');
  if (opts.smartcase !== undefined) lines.push(opts.smartcase ? 'set scs' : 'set noscs');
  if (opts.expandtab !== undefined) lines.push(opts.expandtab ? 'set et' : 'set noet');
  if (opts.hlsearch !== undefined) lines.push(opts.hlsearch ? 'set hls' : 'set nohls');
  if (opts.spell !== undefined) lines.push(opts.spell ? 'set spell' : 'set nospell');
  if (opts.wrap !== undefined) lines.push(opts.wrap ? 'set wrap' : 'set nowrap');
  if (opts.tabstop) lines.push(`set ts=${opts.tabstop}`);
  if (opts.shiftwidth) lines.push(`set sw=${opts.shiftwidth}`);

  // 2. 버퍼 목록 직렬화 (badd)
  const buffers =
    state.buffers && state.buffers.length > 0
      ? state.buffers
      : [
          {
            id: 1,
            name: state.primaryFilename || 'practice.txt',
            lines: state.lines,
            cursor: state.cursor,
          },
        ];

  for (const b of buffers) {
    lines.push(`badd +${(b.cursor?.line ?? 0) + 1} ${b.name}`);
  }

  // 3. 윈도우 분할(Split) 및 활성 창 직렬화
  if (state.splitDirection && state.splitDirection !== 'none' && state.splitPanes) {
    const p0 = state.splitPanes[0];
    const p1 = state.splitPanes[1];
    lines.push(`edit ${p0.filename}`);
    lines.push(`keepjumps call cursor(${p0.cursor.line + 1}, ${p0.cursor.col + 1})`);
    lines.push(state.splitDirection === 'vertical' ? `vsplit ${p1.filename}` : `split ${p1.filename}`);
    lines.push(`keepjumps call cursor(${p1.cursor.line + 1}, ${p1.cursor.col + 1})`);
    lines.push(state.activePaneIndex === 0 ? '1wincmd w' : '2wincmd w');
  } else {
    const curFile = state.primaryFilename || 'practice.txt';
    lines.push(`edit ${curFile}`);
    lines.push(`keepjumps call cursor(${state.cursor.line + 1}, ${state.cursor.col + 1})`);
  }

  // 4. 탭 페이지 직렬화 (:tabnew, :tabnext)
  if (state.tabPages && state.tabPages.length > 1) {
    for (let i = 1; i < state.tabPages.length; i++) {
      const tab = state.tabPages[i];
      lines.push(`tabnew ${tab.filename}`);
      lines.push(`keepjumps call cursor(${tab.cursor.line + 1}, ${tab.cursor.col + 1})`);
    }
    const activeTabIdx = state.tabPages.findIndex((t) => t.id === state.currentTabId);
    if (activeTabIdx >= 0) {
      lines.push(`tabnext ${activeTabIdx + 1}`);
    }
  }

  // 5. 레지스터 직렬화 (let @a = "...")
  if (state.registers) {
    for (const [k, v] of Object.entries(state.registers)) {
      if (!v) continue;
      const content = Array.isArray(v.content) ? v.content.join('') : v.content;
      const escaped = content.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      lines.push(`let @${k} = "${escaped}"`);
    }
  }

  // 6. 무손실 정밀 복원을 위한 메타데이터 주석 블록
  const metadata: SessionMetadata = {
    version: 1,
    filename: sessionFile,
    primaryFilename: state.primaryFilename || 'practice.txt',
    currentBufferId: state.currentBufferId,
    alternateBufferId: state.alternateBufferId,
    buffers: buffers.map((b) => ({
      id: b.id,
      name: b.name,
      lines: [...b.lines],
      cursor: { ...b.cursor },
    })),
    splitDirection: state.splitDirection || 'none',
    splitPanes: state.splitPanes
      ? [
          {
            ...state.splitPanes[0],
            lines: [...state.splitPanes[0].lines],
            cursor: { ...state.splitPanes[0].cursor },
          },
          {
            ...state.splitPanes[1],
            lines: [...state.splitPanes[1].lines],
            cursor: { ...state.splitPanes[1].cursor },
          },
        ]
      : undefined,
    activePaneIndex: state.activePaneIndex,
    splitRatio: state.splitRatio,
    tabPages: state.tabPages?.map((t) => ({
      id: t.id,
      filename: t.filename,
      lines: [...t.lines],
      cursor: { ...t.cursor },
    })),
    currentTabId: state.currentTabId,
    options: state.options ? { ...state.options } : undefined,
    marks: state.marks ? { ...state.marks } : undefined,
    registers: state.registers ? { ...state.registers } : undefined,
    virtualFiles: state.virtualFiles ? { ...state.virtualFiles } : undefined,
  };

  lines.push('" [SESSION_METADATA_START]');
  lines.push(`" ${JSON.stringify(metadata)}`);
  lines.push('" [SESSION_METADATA_END]');
  lines.push('unlet SessionLoad');

  return lines;
}

/**
 * :mksession[!] [file] 명령을 실행하여 현재 편집 상태를 세션 파일로 저장합니다.
 */
export function executeMakeSession(
  state: VimEditorState,
  filename = 'Session.vim',
  bang = false
): VimEditorState {
  const targetState = syncActivePane(state);
  const targetName = filename.trim() || 'Session.vim';
  const existingFiles = buildVfsMap(targetState);

  // 덮어쓰기(!) 없이 기존 파일이 존재하는 경우 E139 에러
  if (!bang && existingFiles[targetName]) {
    return {
      ...targetState,
      bell: true,
      commandMessage: msg('E139: 파일이 이미 존재합니다 (!를 붙여 덮어쓰기: :mksession! {filename})', {
        filename: targetName,
      }),
    };
  }

  // 1. 현재 열려 있는 버퍼 내용들을 가상 파일 시스템에 최신 동기화
  const syncedBuffers = buildVfsMap(targetState);

  // 2. 세션 스크립트 생성
  const sessionLines = generateSessionScript(targetState, targetName);

  // 3. virtualFiles에 세션 파일 등록
  const newVirtualFiles = {
    ...syncedBuffers,
    [targetName]: sessionLines,
  };

  // 4. netrw 활성 시 파일 맵에도 반영
  const newNetrw = targetState.netrw
    ? {
        ...targetState.netrw,
        files: {
          ...(targetState.netrw.files ?? {}),
          [targetName]: sessionLines,
        },
      }
    : targetState.netrw;

  return {
    ...targetState,
    bell: false,
    virtualFiles: newVirtualFiles,
    netrw: newNetrw,
    globalVars: {
      ...(targetState.globalVars ?? {}),
      'v:this_session': targetName,
      this_session: targetName,
    },
    commandMessage: msg('"{filename}" 세션이 저장되었습니다', { filename: targetName }),
  };
}

/**
 * 세션 스크립트 파일을 읽어 버퍼, 분할 창, 탭, 마크, 레지스터, 설정을 이전 상태로 완벽히 복원합니다.
 */
export function restoreSession(
  state: VimEditorState,
  lines: string[],
  filename: string,
  runEx?: (state: VimEditorState, command: string) => VimEditorState
): VimEditorState {
  // 1. 구조화된 메타데이터 주석이 존재하는 경우 무손실 정밀 복원
  const startIdx = lines.findIndex((l) => l.includes('[SESSION_METADATA_START]'));
  const endIdx = lines.findIndex((l) => l.includes('[SESSION_METADATA_END]'));

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx + 1) {
    try {
      const metaLine = lines[startIdx + 1].replace(/^"\s*/, '');
      const meta: SessionMetadata = JSON.parse(metaLine);

      const restoredBuffers: VimBuffer[] = meta.buffers.map((b) => ({
        id: b.id,
        name: b.name,
        lines: [...b.lines],
        cursor: { ...b.cursor },
        undoStack: [],
        redoStack: [],
        isModified: false,
      }));

      const activeBuf =
        restoredBuffers.find((b) => b.id === meta.currentBufferId) ||
        restoredBuffers.find((b) => b.name === meta.primaryFilename) ||
        restoredBuffers[0];

      let activeLines = activeBuf ? [...activeBuf.lines] : [...state.lines];
      let activeCursor = activeBuf ? { ...activeBuf.cursor } : { ...state.cursor };

      if (meta.splitPanes && meta.splitDirection !== 'none') {
        const activePane = meta.splitPanes[meta.activePaneIndex ?? 0];
        if (activePane) {
          activeLines = [...activePane.lines];
          activeCursor = { ...activePane.cursor };
        }
      }

      const mergedVirtualFiles = {
        ...(state.virtualFiles ?? {}),
        ...(meta.virtualFiles ?? {}),
      };
      for (const b of restoredBuffers) {
        mergedVirtualFiles[b.name] = [...b.lines];
      }

      const restoredTabPages: VimTabPage[] | undefined = meta.tabPages?.map((t) => ({
        id: t.id,
        filename: t.filename,
        lines: [...t.lines],
        cursor: { ...t.cursor },
        mode: 'NORMAL',
      }));

      const nextState: VimEditorState = {
        ...state,
        bell: false,
        buffers: restoredBuffers,
        currentBufferId: activeBuf?.id ?? 1,
        alternateBufferId: meta.alternateBufferId,
        primaryFilename: meta.primaryFilename,
        secondaryFilename: meta.splitPanes ? meta.splitPanes[1].filename : undefined,
        lines: activeLines,
        cursor: activeCursor,
        splitDirection: meta.splitDirection ?? 'none',
        splitPanes: meta.splitPanes
          ? [
              {
                ...meta.splitPanes[0],
                lines: [...meta.splitPanes[0].lines],
                cursor: { ...meta.splitPanes[0].cursor },
              },
              {
                ...meta.splitPanes[1],
                lines: [...meta.splitPanes[1].lines],
                cursor: { ...meta.splitPanes[1].cursor },
              },
            ]
          : undefined,
        activePaneIndex: meta.activePaneIndex ?? 0,
        splitRatio: meta.splitRatio,
        tabPages: restoredTabPages,
        currentTabId: meta.currentTabId,
        options: meta.options ? ({ ...getOptions(state), ...meta.options }) : state.options,
        marks: meta.marks ? { ...meta.marks } : state.marks,
        registers: meta.registers ? { ...meta.registers } : state.registers,
        virtualFiles: mergedVirtualFiles,
        globalVars: {
          ...(state.globalVars ?? {}),
          'v:this_session': filename,
          this_session: filename,
        },
        commandMessage: msg('"{filename}" 세션이 복원되었습니다', { filename }),
      };

      return nextState;
    } catch {
      // JSON 파싱 실패 시 아래 Ex 라인별 실행으로 폴백
    }
  }

  // 2. 외부 Neovim/Vim 등에서 생성된 일반 세션 파일인 경우 라인별 Ex 명령 순차 실행
  let curState = state;
  if (runEx) {
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('"')) continue;
      curState = runEx(curState, line);
    }
  }

  return {
    ...curState,
    bell: false,
    globalVars: {
      ...(curState.globalVars ?? {}),
      'v:this_session': filename,
      this_session: filename,
    },
    commandMessage: msg('"{filename}" 세션이 복원되었습니다', { filename }),
  };
}
